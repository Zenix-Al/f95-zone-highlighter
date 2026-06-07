import {
  ADDON_COMMAND_EVENT,
  FILTER_PRESETS_STORAGE_KEY,
  FILTER_SETTINGS_DEFAULT,
  FILTER_SETTINGS_STORAGE_KEY,
  getRuntimeConfig,
  state,
} from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";
import {
  isLatestPage,
  makePresetId,
  normalizeLatestUrl,
  normalizePreset,
  normalizePresets,
  summarizeUrl,
  summarizeUrlParts,
} from "./presets.js";
import {
  createDialogMarkup,
  createRootMarkup,
  createRootElement,
  ensureStyle,
  getStyleText,
  renderPanelContent,
  syncPanelVisibility,
} from "./renderer.js";
import { normalizeText } from "../../shared/htmlUtils.js";

const runtime = getRuntimeConfig();
const bridge = createCoreBridge(runtime.addonId);

const ROOT_ID = "f95ue-latest-filters-addon";
const STYLE_ID = "f95ue-latest-filters-addon-style";
const MOUNT_ID = "latest-filters-panel";
const DIALOG_ID = "latest-filters-manager";
const MAX_MOUNT_ATTEMPTS = 20;
const PRESETS_LOCAL_STORAGE_KEY = `addon:${runtime.addonId}:presets`;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageGet(key, defaultValue = null) {
  return bridge
    .invokeCoreAction("storage.get", { key, defaultValue })
    .then((result) => (result?.ok ? result.value : defaultValue));
}

function storageSet(key, value) {
  return bridge.invokeCoreAction("storage.set", { key, value });
}

function showToast(message) {
  return bridge.invokeCoreAction("toast.show", { message });
}

async function loadTagPrefs() {
  const result = await bridge.invokeCoreAction("config.getTagPrefs", {});
  if (!result?.ok) {
    state.tagPrefs = null;
    state.tagPrefsLoaded = false;
    state.tagPrefsError = String(result?.reason || "unknown");
    console.warn(`[${runtime.addonId}] Failed to load tag preferences:`, result);
    return null;
  }

  const value = result.value && typeof result.value === "object" ? result.value : {};
  state.tagPrefs = {
    tags: Array.isArray(value.tags) ? value.tags : [],
    preferredTags: Array.isArray(value.preferredTags) ? value.preferredTags : [],
    excludedTags: Array.isArray(value.excludedTags) ? value.excludedTags : [],
    markedTags: Array.isArray(value.markedTags) ? value.markedTags : [],
    color: value.color && typeof value.color === "object" ? value.color : {},
  };
  state.tagPrefsLoaded = true;
  state.tagPrefsError = "";
  console.debug(`[${runtime.addonId}] Loaded tag preferences.`, {
    tags: state.tagPrefs.tags.length,
    preferredTags: state.tagPrefs.preferredTags.length,
    excludedTags: state.tagPrefs.excludedTags.length,
    markedTags: state.tagPrefs.markedTags.length,
  });
  return state.tagPrefs;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceState = source.state && typeof source.state === "object" ? source.state : {};
  return {
    ...FILTER_SETTINGS_DEFAULT,
    ...source,
    enabled: source.enabled !== false,
    state: {
      ...FILTER_SETTINGS_DEFAULT.state,
      showPageButton: sourceState.showPageButton !== false,
    },
  };
}

async function loadSettings() {
  const stored = await storageGet(FILTER_SETTINGS_STORAGE_KEY, FILTER_SETTINGS_DEFAULT);
  return normalizeSettings(stored);
}

async function saveSettings(nextPartial = {}) {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...nextPartial });
  await storageSet(FILTER_SETTINGS_STORAGE_KEY, next);
  return next;
}

// ─── Presets state ────────────────────────────────────────────────────────────

async function loadPresets() {
  let stored = [];
  if (typeof GM !== "undefined" && typeof GM.getValue === "function") {
    try {
      stored = await GM.getValue(PRESETS_LOCAL_STORAGE_KEY, []);
    } catch {
      stored = [];
    }
  } else {
    stored = await storageGet(FILTER_PRESETS_STORAGE_KEY, []);
  }
  state.presetsState = normalizePresets(stored);
  return state.presetsState;
}

async function persistPresets(nextPresets) {
  state.presetsState = normalizePresets(nextPresets);
  if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
    try {
      await GM.setValue(PRESETS_LOCAL_STORAGE_KEY, state.presetsState);
    } catch {
      await storageSet(FILTER_PRESETS_STORAGE_KEY, state.presetsState);
    }
  } else {
    await storageSet(FILTER_PRESETS_STORAGE_KEY, state.presetsState);
  }
  return state.presetsState;
}

function getCurrentPreset() {
  const currentUrl = normalizeLatestUrl(location.href);
  return state.presetsState.find((preset) => preset.normalizedUrl === currentUrl) || null;
}

function handleLocationStateChange() {
  if (!state.isEnabled) return;

  if (!isLatestPage()) {
    removeRoot();
    return;
  }

  if (!state.rootEl && state.showPageButton) {
    scheduleMount();
    return;
  }

  repaintPanel();
}

function bindLocationStateListener() {
  if (state.locationListenerBound) return;
  window.addEventListener("hashchange", handleLocationStateChange);
  window.addEventListener("popstate", handleLocationStateChange);
  state.locationListenerBound = true;
}

function unbindLocationStateListener() {
  if (!state.locationListenerBound) return;
  window.removeEventListener("hashchange", handleLocationStateChange);
  window.removeEventListener("popstate", handleLocationStateChange);
  state.locationListenerBound = false;
}

// ─── Renderer adapter ─────────────────────────────────────────────────────────
// Collects current module state and passes it explicitly to the stateless renderer.

function getPanelRenderArgs() {
  const currentPreset = getCurrentPreset();
  return {
    presets: state.presetsState,
    state: {
      searchQuery: state.searchQuery,
    },
    currentPresetId: currentPreset?.id ?? null,
    currentPresetName: currentPreset?.name ?? null,
    currentSummary: currentPreset ? currentPreset.summary : summarizeUrl(location.href),
    currentSummaryParts: currentPreset
      ? currentPreset.summaryParts
      : summarizeUrlParts(location.href),
    tagPrefs: state.tagPrefs,
  };
}

function repaintPanel() {
  if (!state.dialogEl) return;
  renderPanelContent(state.dialogEl, getPanelRenderArgs());
}

function repaintVisibility() {
  if (!state.rootEl) return;
  syncPanelVisibility(state.rootEl, state.panelOpen);
}

// ─── Panel lifecycle ──────────────────────────────────────────────────────────

function getAnchor() {
  return document.querySelector(".content-block_filter-title");
}

function removeRoot() {
  if (state.mountTimer) {
    clearTimeout(state.mountTimer);
    state.mountTimer = 0;
  }

  void bridge.invokeCoreAction("ui.unmount", { mountId: MOUNT_ID });
  void bridge.invokeCoreAction("ui.dialog.close", { dialogId: DIALOG_ID, reason: "remove-root" });

  if (state.rootEl?.parentNode) state.rootEl.parentNode.removeChild(state.rootEl);
  const mountedRoot = document.getElementById(ROOT_ID);
  if (mountedRoot?.parentNode) mountedRoot.parentNode.removeChild(mountedRoot);

  state.rootEl = null;
  state.dialogEl = null;
  state.panelOpen = false;
}

async function mountPageUi(forcePanelOnly = false) {
  removeRoot();

  if (!state.isEnabled || !isLatestPage()) return false;
  if (!state.showPageButton && !forcePanelOnly) return false;

  const styleText = getStyleText(ROOT_ID);
  const styleRegisterResult = await bridge.invokeCoreAction("ui.style.register", {
    styleId: STYLE_ID,
    cssText: styleText,
  });
  if (!styleRegisterResult?.ok) {
    ensureStyle(ROOT_ID, STYLE_ID);
  }

  const panelOnly = forcePanelOnly || !state.showPageButton;
  const mountResult = await bridge.invokeCoreAction("ui.mount", {
    mountId: MOUNT_ID,
    slot: "latest.filters.after-title",
    position: "after",
    html: createRootMarkup(ROOT_ID, panelOnly),
  });

  if (!mountResult?.ok) {
    const anchor = getAnchor();
    if (!anchor) return false;

    state.rootEl = createstate.rootElement(ROOT_ID);
    if (panelOnly) {
      state.rootEl.classList.add("is-panel-only");
    }
    anchor.after(state.rootEl);
  } else {
    state.rootEl = document.getElementById(ROOT_ID);
    if (!state.rootEl) return false;
  }

  bindRootEvents();
  repaintPanel();
  repaintVisibility();
  return true;
}

function scheduleMount() {
  if (state.mountTimer) clearTimeout(state.mountTimer);
  state.mountAttemptCount = 0;

  const tryMount = async () => {
    const mounted = await mountPageUi();
    if (mounted) return;

    state.mountAttemptCount++;
    if (
      state.mountAttemptCount >= MAX_MOUNT_ATTEMPTS ||
      !state.isEnabled ||
      !state.showPageButton ||
      !isLatestPage()
    ) {
      return;
    }

    state.mountTimer = setTimeout(tryMount, 500);
  };

  void tryMount();
}

// ─── Panel state ──────────────────────────────────────────────────────────────

function openPanel() {
  if (!state.rootEl || state.panelOpen) return;

  bridge
    .invokeCoreAction("ui.dialog.open", {
      dialogId: DIALOG_ID,
      title: "Saved Filters",
      html: createDialogMarkup(),
      closeOnBackdrop: true,
      closeOnEsc: true,
    })
    .then((result) => {
      if (!result?.ok) {
        state.panelOpen = false;
        repaintVisibility();
        console.warn(`[${runtime.addonId}] ui.dialog.open failed:`, result);
        void showToast(`Saved Filters dialog failed to open (${result?.reason || "unknown"}).`);
        return;
      }

      state.panelOpen = true;
      repaintVisibility();

      const contentId = String(result?.value?.contentId || "").trim();
      state.dialogEl = contentId ? document.getElementById(contentId) : null;
      if (!state.dialogEl) return;

      bindDialogEvents();
      repaintPanel();
      state.dialogEl.querySelector("[data-role='search']")?.focus();
    });
}

function closePanel() {
  if (!state.panelOpen && !state.dialogEl) return;

  void bridge.invokeCoreAction("ui.dialog.close", {
    dialogId: DIALOG_ID,
    reason: "addon-close",
  });
}

function togglePanel() {
  if (state.panelOpen || state.dialogEl) {
    closePanel();
    return;
  }
  openPanel();
}

// ─── Preset actions ───────────────────────────────────────────────────────────

function getPresetById(presetId) {
  return state.presetsState.find((preset) => preset.id === presetId) || null;
}

function makeDefaultPresetName() {
  return `Saved Filter ${state.presetsState.length + 1}`;
}

async function saveCurrentFilter() {
  const nameInput = state.dialogEl?.querySelector("[data-role='save-name']");
  const requestedName = normalizeText(nameInput?.value);
  const currentUrl = location.href;
  const normalizedUrl = normalizeLatestUrl(currentUrl);

  if (!normalizedUrl) {
    await showToast("Open the Latest Updates page before saving a filter.");
    return;
  }

  const currentPreset = getCurrentPreset();
  const nextName = requestedName || currentPreset?.name || makeDefaultPresetName();
  const byName = state.presetsState.find(
    (preset) => preset.name.toLowerCase() === nextName.toLowerCase(),
  );

  let nextPresets;
  let message;
  if (byName) {
    nextPresets = state.presetsState.map((preset) =>
      preset.id === byName.id
        ? normalizePreset({ ...preset, name: nextName, url: currentUrl, updatedAt: Date.now() })
        : preset,
    );
    message = `Updated ${nextName}.`;
  } else {
    nextPresets = [
      normalizePreset({
        id: makePresetId(),
        name: nextName,
        url: currentUrl,
        updatedAt: Date.now(),
      }),
      ...state.presetsState,
    ];
    message = `Saved ${nextName}.`;
  }

  await persistPresets(nextPresets);
  if (nameInput) nameInput.value = "";
  repaintPanel();
  await showToast(message);
}

async function updatePresetFromCurrent(presetId) {
  const preset = getPresetById(presetId);
  if (!preset) return;

  const currentUrl = location.href;
  if (!normalizeLatestUrl(currentUrl)) {
    await showToast("Open the Latest Updates page before updating a saved filter.");
    return;
  }

  const confirmResult = await bridge.invokeCoreAction("ui.confirm", {
    title: "Update Saved Filter",
    description: `Replace saved filter '${preset.name}' with the current Latest Updates filters?`,
    confirmLabel: "Update",
    cancelLabel: "Cancel",
  });
  if (!confirmResult?.ok || !confirmResult?.value?.confirmed) return;

  const nextPresets = state.presetsState.map((entry) =>
    entry.id === presetId
      ? normalizePreset({ ...entry, url: currentUrl, updatedAt: Date.now() })
      : entry,
  );

  await persistPresets(nextPresets);
  repaintPanel();
  await showToast(`Updated ${preset.name}.`);
}

async function deletePreset(presetId) {
  const preset = getPresetById(presetId);
  if (!preset) return;

  const confirmResult = await bridge.invokeCoreAction("ui.confirm", {
    title: "Delete Saved Filter",
    description: `Delete saved filter '${preset.name}'?`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
  });
  if (!confirmResult?.ok || !confirmResult?.value?.confirmed) return;

  const nextPresets = state.presetsState.filter((entry) => entry.id !== presetId);
  await persistPresets(nextPresets);
  repaintPanel();
  await showToast(`Deleted ${preset.name}.`);
}

function applyPreset(presetId) {
  const preset = getPresetById(presetId);
  if (!preset) return;

  // Update panel state immediately for SPA/hash navigation paths that do not reload.
  repaintPanel();

  const targetUrl = String(preset.url || "").trim();
  if (!targetUrl) return;

  const currentNormalized = normalizeLatestUrl(location.href);
  if (preset.normalizedUrl && preset.normalizedUrl === currentNormalized) {
    return;
  }

  const currentUrl = new URL(location.href, location.origin);
  const nextUrl = new URL(targetUrl, location.origin);
  const samePageQuery =
    currentUrl.origin === nextUrl.origin &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search;

  if (samePageQuery && currentUrl.hash !== nextUrl.hash) {
    location.hash = nextUrl.hash;
    repaintPanel();
    return;
  }

  location.assign(nextUrl.href);
}

// ─── Event binding ────────────────────────────────────────────────────────────

function bindRootEvents() {
  state.rootEl.addEventListener("click", (event) => {
    const actionEl = event.target?.closest?.("[data-action]");
    if (!actionEl) return;

    const action = String(actionEl.dataset.action || "").trim();
    if (action === "toggle-panel") {
      event.preventDefault();
      togglePanel();
      return;
    }
  });
}

function bindDialogEvents() {
  if (!state.dialogEl) return;

  state.dialogEl.addEventListener("click", (event) => {
    const actionEl = event.target?.closest?.("[data-action]");
    if (!actionEl) return;

    const action = String(actionEl.dataset.action || "").trim();
    if (action === "close-panel") {
      event.preventDefault();
      closePanel();
      return;
    }
    if (action === "save-current") {
      event.preventDefault();
      void saveCurrentFilter();
      return;
    }

    const presetId = String(actionEl.dataset.presetId || "").trim();
    if (!presetId) return;

    if (action === "apply") {
      event.preventDefault();
      applyPreset(presetId);
      return;
    }
    if (action === "update") {
      event.preventDefault();
      void updatePresetFromCurrent(presetId);
      return;
    }
    if (action === "delete") {
      event.preventDefault();
      void deletePreset(presetId);
    }
  });

  let searchTimeout = null;
  state.dialogEl.addEventListener("input", (event) => {
    const input = event.target;
    if (input.dataset.role !== "search") return;

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = input.value.trim();
      repaintPanel();
    }, 180);
  });

  state.dialogEl.addEventListener("keydown", (event) => {
    const input = event.target;
    if (
      event.key === "Enter" &&
      input instanceof HTMLInputElement &&
      input.dataset.role === "save-name"
    ) {
      event.preventDefault();
      void saveCurrentFilter();
    }
  });
}

// ─── Core registration ────────────────────────────────────────────────────────

function statusMessage() {
  if (!state.isEnabled) return "Latest Filters add-on is installed but disabled.";
  if (!state.showPageButton)
    return "Saved filters are available from the add-on panel; the latest-page button is hidden.";
  return "One saved-filters button is available on Latest Updates pages.";
}

function getPanelBody() {
  return state.showPageButton
    ? "Use the Saved Filters button on Latest Updates to open a searchable list of saved presets, see the active preset, and save/apply/update/delete entries."
    : "The page button is hidden. Use the action below while on Latest Updates to open the saved-filters panel.";
}

function registerAddon() {
  bridge.dispatchCoreCommand("register", {
    addon: {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: state.isEnabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: runtime.addonName,
      panelBody: getPanelBody(),
      panelSettingsTitle: "Latest Filters Settings",
      panelSettingsDescription:
        "Keep a single Saved Filters button on Latest Updates pages, or hide the page button and use the panel action instead.",
      panelSettingsStorageKey: FILTER_SETTINGS_STORAGE_KEY,
      panelSettingsDefaults: FILTER_SETTINGS_DEFAULT,
      panelSettings: [
        {
          path: "state.showPageButton",
          text: "Show page button",
        },
      ],
      panelActions: [
        {
          id: "open-filters",
          label: "Open Saved Filters",
          requiresActivePage: false,
        },
      ],
      capabilities: runtime.capabilities,
      pageScopes: ["latest"],
    },
  });
}

function pushStatusUpdate() {
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: state.isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
  registerAddon();
}

// ─── Addon lifecycle ──────────────────────────────────────────────────────────

async function refreshRuntimeState() {
  const settings = await loadSettings();
  state.isEnabled = settings.enabled !== false;
  state.showPageButton = settings.state.showPageButton !== false;
  await Promise.all([loadPresets(), loadTagPrefs()]);

  removeRoot();
  if (state.isEnabled && state.showPageButton && isLatestPage()) {
    scheduleMount();
  }

  pushStatusUpdate();
}

function setEnabled(nextEnabled) {
  state.isEnabled = Boolean(nextEnabled);
  void saveSettings({ enabled: state.isEnabled });

  if (!state.isEnabled) {
    removeRoot();
  } else if (state.showPageButton && isLatestPage()) {
    scheduleMount();
  }

  pushStatusUpdate();
}

async function openFiltersFromPanel() {
  if (!state.isEnabled) {
    await showToast("Latest Filters add-on is disabled.");
    return;
  }
  if (!isLatestPage()) {
    await showToast("Open the Latest Updates page to use Saved Filters.");
    return;
  }
  await loadPresets();
  if (!state.rootEl) {
    const mounted = await mountPageUi(!state.showPageButton);
    if (!mounted) {
      scheduleMount();
      await showToast("Saved Filters is still mounting on the page.");
      return;
    }
  }
  if (state.rootEl) {
    repaintPanel();
    openPanel();
  }
}

function bindAddonCommandListener() {
  if (state.addonCommandHandlerBound) return;

  window.addEventListener(ADDON_COMMAND_EVENT, (event) => {
    const detail = event?.detail || {};
    if (String(detail.addonId || "") !== runtime.addonId) return;

    const command = String(detail.command || "").trim();
    if (command === "enable") {
      setEnabled(true);
      return;
    }
    if (command === "disable") {
      setEnabled(false);
      return;
    }
    if (command === "refresh") {
      void refreshRuntimeState();
      return;
    }
    if (command === "dialog-closed") {
      if (String(detail.dialogId || "") !== DIALOG_ID) return;
      state.panelOpen = false;
      state.dialogEl = null;
      repaintVisibility();
      return;
    }
    if (command === "teardown") {
      unbindLocationStateListener();
      removeRoot();
      bridge.dispatchCoreCommand("teardown-complete", {
        addonId: runtime.addonId,
        reason: String(detail.reason || ""),
      });
      return;
    }
    if (command === "toast") {
      void openFiltersFromPanel();
      return;
    }
    if (command === "panel-action") {
      if (String(detail.actionId || "").trim() === "open-filters") {
        void openFiltersFromPanel();
      }
    }
  });

  state.addonCommandHandlerBound = true;
}

function reportAddonBroken(error) {
  const message = error?.message
    ? String(error.message)
    : String(error ?? "Unknown initialization error");
  console.error(`[${runtime.addonId}] Fatal initialization error:`, error);
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: "broken",
    statusMessage: `Failed to initialize: ${message}`,
  });
}

async function bootstrap() {
  const ping = await bridge.waitForCorePing();
  if (!ping?.ok && runtime.requiresCore) {
    console.warn(`[${runtime.addonId}] Core not detected; exiting.`);
    return;
  }

  bindAddonCommandListener();
  bindLocationStateListener();

  // Register first so core storage actions are authorized during initial load.
  registerAddon();
  await refreshRuntimeState();
}

bootstrap().catch(reportAddonBroken);
