import { getAddonAccess } from "../api/meta.js";
import { createStorageAdapter } from "../api/storage.js";
import { showToast } from "../api/toast.js";
import { getPageContext } from "../api/page.js";
import { waitForElement } from "../api/observer.js";
import { closeDialog, confirmDialog, openDialog } from "../api/ui/dialog.js";
import { mountUi, unmountUi } from "../api/ui/mount.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import {
  DIALOG_ID,
  MAX_MOUNT_ATTEMPTS,
  MOUNT_ID,
  MOUNT_RETRY_DELAY_MS,
  ROOT_ID,
  STYLE_ID,
} from "../constants.js";
import { normalizePreset, normalizePresets, normalizeLatestUrl, isLatestPage, makePresetId, summarizeUrl, summarizeUrlParts } from "../domain/presets.js";
import { createLatestFiltersCommandController } from "./commands.js";
import { createLatestFiltersLifecycle } from "./lifecycle.js";
import { createLatestFiltersRepository } from "./repository.js";
import { createLatestFiltersState } from "./state.js";
import { createLatestFiltersRegistration } from "./registration.js";
import { createOperationTracker } from "./operationTracker.js";
import { createLatestFiltersBindings } from "../ui/bindings.js";
import {
  createDialogMarkup,
  createRootElement,
  createRootMarkup,
  ensureStyle,
  getStyleText,
  removeStyle,
  renderPanelContent,
  syncPanelVisibility,
} from "../ui/renderer.js";

export function createLatestFiltersApp({ core, runtime, gm = globalThis.GM } = {}) {
  const state = createLatestFiltersState();
  const storage = createStorageAdapter({ core, addonId: runtime.addonId, gm });
  const repository = createLatestFiltersRepository(storage);
  const operations = createOperationTracker(state);
  const registration = createLatestFiltersRegistration({ core, runtime, state });
  let lifecycle = null;
  let commandController = null;
  let presetWriteQueue = Promise.resolve();
  let settingsWriteQueue = Promise.resolve();
  let operationSequence = 0;

  function currentContext() {
    return state.currentContext;
  }

  function isCurrent(context = currentContext()) {
    return Boolean(context?.isCurrent?.()) && !state.terminal;
  }

  const beginPending = operations.begin;
  const cancelPendingWork = operations.cancelAll;
  const registerAddon = registration.register;
  const pushStatusUpdate = registration.publishStatus;

  function getCurrentPreset() {
    const currentUrl = normalizeLatestUrl(location.href);
    return state.presets.find((preset) => preset.normalizedUrl === currentUrl) || null;
  }

  function renderArgs() {
    const currentPreset = getCurrentPreset();
    return {
      presets: state.presets,
      state: { searchQuery: state.searchQuery },
      currentPresetId: currentPreset?.id ?? null,
      currentPresetName: currentPreset?.name ?? null,
      currentSummary: currentPreset ? currentPreset.summary : summarizeUrl(location.href),
      currentSummaryParts: currentPreset ? currentPreset.summaryParts : summarizeUrlParts(location.href),
      tagPrefs: state.tagPrefs,
    };
  }

  function repaintPanel() {
    if (!state.dialogEl || state.terminal) return;
    renderPanelContent(state.dialogEl, renderArgs());
    if (state.rootEl) syncPanelVisibility(state.rootEl, state.panelOpen);
  }

  function getAnchor() {
    return document.querySelector(".content-block_filter-title");
  }

  function localPageContext() {
    return {
      pageScopes: isLatestPage() ? ["latest"] : [],
      pageType: isLatestPage() ? "latest" : "unknown",
      routeGeneration: 0,
      url: String(location.href || ""),
    };
  }

  function hasLatestScope(context) {
    return Array.isArray(context?.pageScopes) ? context.pageScopes.includes("latest") : isLatestPage();
  }

  function cancelMountRetry() {
    if (state.mountTimer) {
      window.clearTimeout(state.mountTimer);
      state.mountTimer = 0;
    }
    lifecycle?.releaseResource?.("latest-mount-retry");
  }

  function bindRouteListeners() {
    if (state.routeListenersBound) return;
    const onRoute = () => {
      if (!state.enabled || state.terminal) return;
      cancelPendingWork();
      lifecycle.invalidate("route-change", { url: String(location.href || "") });
      void lifecycle.refresh({ reason: "route-change", routeContext: { url: String(location.href || "") } }).catch((error) => onCommandError("route-refresh", error));
    };
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("popstate", onRoute);
    state.routeCleanup = () => {
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("popstate", onRoute);
      state.routeListenersBound = false;
      state.routeCleanup = null;
    };
    state.routeListenersBound = true;
    lifecycle.registerResource("latest-route-listeners", state.routeCleanup, "listener");
  }

  function unbindRouteListeners() {
    state.routeCleanup?.();
    lifecycle?.releaseResource?.("latest-route-listeners");
  }

  function unbindBindings() {
    state.rootBindingsCleanup?.();
    state.dialogBindingsCleanup?.();
    state.rootBindingsCleanup = null;
    state.dialogBindingsCleanup = null;
    lifecycle?.releaseResource?.("latest-root-bindings");
    lifecycle?.releaseResource?.("latest-dialog-bindings");
    lifecycle?.releaseResource?.("latest-dialog-debounce");
  }

  function unbindDialogBindings() {
    state.dialogBindingsCleanup?.();
    state.dialogBindingsCleanup = null;
    lifecycle?.releaseResource?.("latest-dialog-bindings");
    lifecycle?.releaseResource?.("latest-dialog-debounce");
  }

  async function removePageUi(context, reason = "remove-root") {
    cancelMountRetry();
    unbindBindings();
    const hadUi = Boolean(state.rootEl || state.dialogEl || state.panelOpen || state.styleRegistered || state.fallbackStyleOwned);
    if (hadUi) {
      const closeOp = beginPending(context, `dialog-close:${++operationSequence}`, closeDialog(core, DIALOG_ID, reason), "dialog");
      await closeOp.promise.catch(() => {});
      const unmountOp = beginPending(context, `mount-remove:${++operationSequence}`, unmountUi(core, MOUNT_ID), "mount");
      await unmountOp.promise.catch(() => {});
    }
    if (state.rootEl?.parentNode) state.rootEl.parentNode.removeChild(state.rootEl);
    document.getElementById(ROOT_ID)?.remove?.();
    if (state.styleRegistered) {
      const styleOp = beginPending(context, `style-remove:${++operationSequence}`, unregisterStyle(core, STYLE_ID), "style");
      await styleOp.promise.catch(() => {});
    }
    if (state.fallbackStyleOwned) removeStyle(STYLE_ID);
    state.rootEl = null;
    state.dialogEl = null;
    state.panelOpen = false;
    state.styleRegistered = false;
    state.fallbackStyleOwned = false;
  }

  async function mountPageUi(context, forcePanelOnly = false) {
    if (!isCurrent(context) || !state.enabled || !hasLatestScope(localPageContext())) return false;
    if (!state.showPageButton && !forcePanelOnly) return false;
    const pageOp = beginPending(context, `page-context:${++operationSequence}`, getPageContext(core, localPageContext), "page");
    const pageContext = await pageOp.promise.catch(() => null);
    if (pageOp.cancelled() || !isCurrent(context) || !hasLatestScope(pageContext)) return false;

    const styleOp = beginPending(context, `style-register:${++operationSequence}`, registerStyle(core, STYLE_ID, getStyleText(ROOT_ID)), "style");
    const styleResult = await styleOp.promise.catch(() => null);
    if (styleOp.cancelled() || !isCurrent(context)) return false;
    if (styleResult?.ok) state.styleRegistered = true;
    else {
      ensureStyle(ROOT_ID, STYLE_ID);
      state.fallbackStyleOwned = true;
    }

    const panelOnly = forcePanelOnly || !state.showPageButton;
    const mountOp = beginPending(context, `mount:${++operationSequence}`, mountUi(core, {
      mountId: MOUNT_ID,
      slot: "latest.filters.after-title",
      position: "after",
      html: createRootMarkup(ROOT_ID, panelOnly),
    }), "mount");
    const mountResult = await mountOp.promise.catch(() => null);
    if (mountOp.cancelled() || !isCurrent(context)) {
      await removePageUi(context, "stale-mount");
      return false;
    }

    if (!mountResult?.ok) {
      const anchor = getAnchor();
      if (!anchor) return false;
      state.rootEl = createRootElement(ROOT_ID);
      if (panelOnly) state.rootEl.classList.add("is-panel-only");
      anchor.after(state.rootEl);
    } else {
      state.rootEl = document.getElementById(ROOT_ID);
      if (!state.rootEl) return false;
    }

    state.rootBindingsCleanup = createLatestFiltersBindings({
      rootEl: state.rootEl,
      onToggle: () => togglePanel(),
      registerResource: (id, cleanup, kind) => lifecycle.registerResource(`latest-${id}`, cleanup, kind),
    });
    lifecycle.registerResource("latest-root-bindings", state.rootBindingsCleanup, "listener");
    syncPanelVisibility(state.rootEl, state.panelOpen);
    return true;
  }

  function scheduleMount(context, forcePanelOnly = false) {
    cancelMountRetry();
    state.mountAttemptCount = 0;
    const tryMount = async () => {
      state.mountTimer = 0;
      lifecycle.releaseResource("latest-mount-retry");
      if (!isCurrent(context) || !state.enabled || (!state.showPageButton && !forcePanelOnly) || !hasLatestScope(localPageContext())) return;
      const pageOp = beginPending(context, `retry-page:${++operationSequence}`, getPageContext(core, localPageContext), "page");
      const pageContext = await pageOp.promise.catch(() => null);
      if (pageOp.cancelled() || !isCurrent(context) || !hasLatestScope(pageContext)) return;
      const waitOp = beginPending(context, `mount-wait:${++operationSequence}`, waitForElement(
        core,
        `${MOUNT_ID}-anchor`,
        ".content-block_filter-title",
        4000,
        () => ({ ok: false, reason: "unsupported_action" }),
      ), "observer");
      const waitResult = await waitOp.promise.catch(() => null);
      if (waitOp.cancelled() || !isCurrent(context) || !hasLatestScope(localPageContext())) return;
      if (waitResult?.ok || getAnchor()) {
        await mountPageUi(context, forcePanelOnly);
        return;
      }
      state.mountAttemptCount += 1;
      if (state.mountAttemptCount >= MAX_MOUNT_ATTEMPTS) return;
      state.mountTimer = window.setTimeout(tryMount, MOUNT_RETRY_DELAY_MS);
      lifecycle.registerResource("latest-mount-retry", () => {
        window.clearTimeout(state.mountTimer);
        state.mountTimer = 0;
      }, "timer");
    };
    void tryMount();
  }

  function bindDialog(context, dialogEl) {
    unbindDialogBindings();
    state.dialogEl = dialogEl;
    state.dialogBindingsCleanup = createLatestFiltersBindings({
      dialogEl,
      onClose: closePanel,
      onSave: () => saveCurrentFilter(context),
      onApply: (id) => applyPreset(id),
      onUpdate: (id) => updatePresetFromCurrent(context, id),
      onDelete: (id) => deletePreset(context, id),
      onSearch: (query) => { state.searchQuery = query; repaintPanel(); },
      onEnter: () => saveCurrentFilter(context),
      registerResource: (id, cleanup, kind) => lifecycle.registerResource(`latest-${id}`, cleanup, kind),
    });
    lifecycle.registerResource("latest-dialog-bindings", state.dialogBindingsCleanup, "listener");
    repaintPanel();
    dialogEl.querySelector("[data-role='search']")?.focus?.();
  }

  async function openPanel(context = currentContext()) {
    if (!state.rootEl || state.panelOpen || !isCurrent(context)) return;
    const op = beginPending(context, `dialog-open:${++operationSequence}`, openDialog(core, {
      dialogId: DIALOG_ID,
      title: "Saved Filters",
      html: createDialogMarkup(),
      closeOnBackdrop: true,
      closeOnEsc: true,
    }), "dialog");
    const result = await op.promise.catch(() => null);
    if (op.cancelled() || !isCurrent(context)) return;
    if (!result?.ok) {
      await showToast(core, `Saved Filters dialog failed to open (${result?.reason || "unknown"}).`).catch(() => {});
      return;
    }
    state.panelOpen = true;
    const contentId = String(result?.value?.contentId || "").trim();
    const dialogEl = contentId ? document.getElementById(contentId) : null;
    if (dialogEl) bindDialog(context, dialogEl);
    repaintPanel();
  }

  function closePanel() {
    if (!state.panelOpen && !state.dialogEl) return;
    void closeDialog(core, DIALOG_ID, "addon-close").catch(() => {});
  }

  function togglePanel() {
    if (state.panelOpen || state.dialogEl) closePanel();
    else void openPanel();
  }

  async function commitPresets(context, change) {
    const queueRun = presetWriteQueue.catch(() => {}).then(async () => {
      if (!isCurrent(context)) return null;
      const next = normalizePresets(change(state.presets));
      const op = beginPending(context, `preset-write:${++operationSequence}`, repository.savePresets(next), "storage");
      const saved = await op.promise.catch(() => null);
      if (op.cancelled() || !isCurrent(context) || !saved) return null;
      state.presets = saved;
      repaintPanel();
      return saved;
    });
    presetWriteQueue = queueRun.catch(() => {});
    return queueRun;
  }

  async function saveSettingsFlag(context, enabled) {
    const queueRun = settingsWriteQueue.catch(() => {}).then(async () => {
      if (context && !isCurrent(context)) return null;
      const op = beginPending(context, `settings-write:${++operationSequence}`, repository.saveSettings({ enabled }), "storage");
      return op.promise.catch(() => null);
    });
    settingsWriteQueue = queueRun.catch(() => {});
    return queueRun;
  }

  async function saveCurrentFilter(context) {
    if (!isCurrent(context)) return;
    const nameInput = state.dialogEl?.querySelector("[data-role='save-name']");
    const requestedName = String(nameInput?.value || "").trim();
    const currentUrl = String(location.href || "");
    if (!normalizeLatestUrl(currentUrl)) { await showToast(core, "Open the Latest Updates page before saving a filter.").catch(() => {}); return; }
    const currentPreset = getCurrentPreset();
    const willUpdate = state.presets.some((preset) => preset.name.toLowerCase() === (requestedName || currentPreset?.name || `Saved Filter ${state.presets.length + 1}`).toLowerCase());
    const nextName = requestedName || currentPreset?.name || `Saved Filter ${state.presets.length + 1}`;
    await commitPresets(context, (presets) => {
      const byName = presets.find((preset) => preset.name.toLowerCase() === nextName.toLowerCase());
      return byName
        ? presets.map((preset) => preset.id === byName.id ? normalizePreset({ ...preset, name: nextName, url: currentUrl, updatedAt: Date.now() }) : preset)
        : [normalizePreset({ id: makePresetId(), name: nextName, url: currentUrl, updatedAt: Date.now() }), ...presets];
    });
    if (isCurrent(context)) {
      if (nameInput) nameInput.value = "";
      await showToast(core, `${willUpdate ? "Updated" : "Saved"} ${nextName}.`).catch(() => {});
    }
  }

  async function updatePresetFromCurrent(context, presetId) {
    const preset = state.presets.find((entry) => entry.id === presetId);
    if (!preset || !isCurrent(context)) return;
    const currentUrl = String(location.href || "");
    if (!normalizeLatestUrl(currentUrl)) { await showToast(core, "Open the Latest Updates page before updating a saved filter.").catch(() => {}); return; }
    const confirmation = await confirmDialog(core, {
      title: "Update Saved Filter",
      description: `Replace saved filter '${preset.name}' with the current Latest Updates filters?`,
      confirmLabel: "Update",
      cancelLabel: "Cancel",
    });
    if (!confirmation?.ok || !confirmation.value?.confirmed || !isCurrent(context)) return;
    await commitPresets(context, (presets) => presets.map((entry) => entry.id === presetId ? normalizePreset({ ...entry, url: currentUrl, updatedAt: Date.now() }) : entry));
    if (isCurrent(context)) await showToast(core, `Updated ${preset.name}.`).catch(() => {});
  }

  async function deletePreset(context, presetId) {
    const preset = state.presets.find((entry) => entry.id === presetId);
    if (!preset || !isCurrent(context)) return;
    const confirmation = await confirmDialog(core, {
      title: "Delete Saved Filter",
      description: `Delete saved filter '${preset.name}'?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (!confirmation?.ok || !confirmation.value?.confirmed || !isCurrent(context)) return;
    await commitPresets(context, (presets) => presets.filter((entry) => entry.id !== presetId));
    if (isCurrent(context)) await showToast(core, `Deleted ${preset.name}.`).catch(() => {});
  }

  function applyPreset(presetId) {
    const preset = state.presets.find((entry) => entry.id === presetId);
    if (!preset || !isCurrent()) return;
    const targetUrl = String(preset.url || "").trim();
    if (!targetUrl || preset.normalizedUrl === normalizeLatestUrl(location.href)) return;
    const currentUrl = new URL(location.href, location.origin);
    const nextUrl = new URL(targetUrl, location.origin);
    if (currentUrl.origin === nextUrl.origin && currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search) {
      location.hash = nextUrl.hash;
      repaintPanel();
      return;
    }
    location.assign(nextUrl.href);
  }

  async function loadRuntimeData(context) {
    const settingsOp = beginPending(context, `settings-load:${++operationSequence}`, repository.loadSettings(), "storage");
    const presetsOp = beginPending(context, `presets-load:${++operationSequence}`, repository.loadPresets(), "storage");
    const tagsOp = beginPending(context, `tag-prefs-load:${++operationSequence}`, repository.loadTagPrefs(), "storage");
    const [settings, presets, tagPrefs] = await Promise.all([settingsOp.promise, presetsOp.promise, tagsOp.promise]);
    if (settingsOp.cancelled() || presetsOp.cancelled() || tagsOp.cancelled() || !isCurrent(context)) return false;
    state.enabled = settings.enabled !== false;
    state.showPageButton = settings.state.showPageButton !== false;
    state.presets = normalizePresets(presets);
    if (tagPrefs?.error) {
      state.tagPrefs = null;
      state.tagPrefsLoaded = false;
      state.tagPrefsError = tagPrefs.error;
    } else {
      state.tagPrefs = tagPrefs;
      state.tagPrefsLoaded = true;
      state.tagPrefsError = "";
    }
    return true;
  }

  async function refreshApp(context) {
    state.currentContext = context;
    if (!state.enabled) return { ok: false, reason: "disabled" };
    const loaded = await loadRuntimeData(context);
    if (!loaded || !isCurrent(context)) return { ok: false, reason: "refresh_superseded" };
    await removePageUi(context, "refresh");
    bindRouteListeners();
    if (state.showPageButton && isLatestPage()) scheduleMount(context);
    pushStatusUpdate();
    return { ok: true };
  }

  async function enableApp(context) {
    state.currentContext = context;
    state.terminal = false;
    const loaded = await loadRuntimeData(context);
    if (!loaded || !isCurrent(context)) return { ok: false, reason: "enable_superseded" };
    if (context.command === "enable") {
      state.enabled = true;
      await saveSettingsFlag(context, true);
    }
    bindRouteListeners();
    if (state.showPageButton && isLatestPage()) scheduleMount(context);
    pushStatusUpdate();
    return { ok: true };
  }

  async function disableApp(context) {
    state.currentContext = context;
    state.enabled = false;
    cancelPendingWork();
    cancelMountRetry();
    unbindRouteListeners();
    await removePageUi(context, "disable");
    if (context.command === "disable") await saveSettingsFlag(context, false);
    pushStatusUpdate();
    return { ok: true };
  }

  async function handleEvent(detail) {
    if (detail.command === "dialog-closed") {
      if (String(detail.dialogId || "") !== DIALOG_ID) return;
      unbindDialogBindings();
      state.panelOpen = false;
      state.dialogEl = null;
      repaintPanel();
      return;
    }
    if (detail.command === "toast") {
      await openFiltersFromPanel(currentContext());
      return;
    }
    if (detail.command === "panel-action" && String(detail.actionId || "") === "open-filters") {
      await openFiltersFromPanel(currentContext());
    }
  }

  async function openFiltersFromPanel(context) {
    if (!state.enabled) { await showToast(core, "Latest Filters add-on is disabled.").catch(() => {}); return; }
    if (!isLatestPage()) { await showToast(core, "Open the Latest Updates page to use Saved Filters.").catch(() => {}); return; }
    if (!state.rootEl) {
      const mounted = await mountPageUi(context, !state.showPageButton);
      if (!mounted) { scheduleMount(context, !state.showPageButton); await showToast(core, "Saved Filters is still mounting on the page.").catch(() => {}); return; }
    }
    await openPanel(context);
  }

  function onCommandError(action, error) {
    registration.publishBroken(`${action}: ${error?.message || "failed"}`);
  }

  commandController = createLatestFiltersCommandController({
    core,
    getLifecycle: () => lifecycle,
    onEvent: handleEvent,
    onBeforePageChange: () => cancelPendingWork(),
    onCommandError,
  });

  lifecycle = createLatestFiltersLifecycle({
    addonId: runtime.addonId,
    onEnable: enableApp,
    onDisable: disableApp,
    onRefresh: refreshApp,
    onTeardown: async (context) => {
      state.terminal = true;
      cancelPendingWork();
      unbindRouteListeners();
      await removePageUi(context, context.reason || "teardown");
      commandController.unbind();
      return { ok: true };
    },
    onTeardownAcknowledged: async (reason) =>
      registration.acknowledgeTeardown(reason),
  });

  async function bootstrap() {
    commandController.bind();
    registerAddon();
    const access = await getAddonAccess(core);
    if (!access?.ok || access.value?.blocked || access.value?.enabled === false) {
      await lifecycle.disable({ reason: access?.value?.blockReason || "access-denied" });
      return;
    }
    await lifecycle.enable({ reason: "bootstrap" });
  }

  return {
    bootstrap,
    getLifecycle: () => lifecycle,
    getState: () => ({ ...state, pendingCancellers: undefined }),
    getRuntimeSnapshot: () => lifecycle.getSnapshot(),
    getResourceSnapshot: () => lifecycle.getResourceSnapshot(),
    getPendingOperationSnapshot: () => lifecycle.getPendingOperationSnapshot(),
  };
}
