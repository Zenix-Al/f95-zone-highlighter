import {
  ADDON_COMMAND_EVENT,
  FILTER_PRESETS_STORAGE_KEY,
  FILTER_SETTINGS_DEFAULT,
  FILTER_SETTINGS_STORAGE_KEY,
  getRuntimeConfig,
} from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";
import {
  isLatestPage,
  makePresetId,
  normalizeLatestUrl,
  normalizePreset,
  normalizePresets,
  summarizeUrl,
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

// ─── Module state ─────────────────────────────────────────────────────────────

let isEnabled = true;
let showPageButton = true;
let addonCommandHandlerBound = false;
let rootEl = null;
let mountAttemptCount = 0;
let mountTimer = 0;
let presetsState = [];
let searchQuery = "";
let panelOpen = false;
let dialogEl = null;
let locationListenerBound = false;

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

// ─── Settings ─────────────────────────────────────────────────────────────────

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...FILTER_SETTINGS_DEFAULT,
    ...source,
    enabled: source.enabled !== false,
    showPageButton: source.showPageButton !== false,
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
  presetsState = normalizePresets(stored);
  return presetsState;
}

async function persistPresets(nextPresets) {
  presetsState = normalizePresets(nextPresets);
  if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
    try {
      await GM.setValue(PRESETS_LOCAL_STORAGE_KEY, presetsState);
    } catch {
      await storageSet(FILTER_PRESETS_STORAGE_KEY, presetsState);
    }
  } else {
    await storageSet(FILTER_PRESETS_STORAGE_KEY, presetsState);
  }
  return presetsState;
}

function getCurrentPreset() {
  const currentUrl = normalizeLatestUrl(location.href);
  return presetsState.find((preset) => preset.normalizedUrl === currentUrl) || null;
}

function handleLocationStateChange() {
  if (!isEnabled) return;

  if (!isLatestPage()) {
    removeRoot();
    return;
  }

  if (!rootEl && showPageButton) {
    scheduleMount();
    return;
  }

  repaintPanel();
}

function bindLocationStateListener() {
  if (locationListenerBound) return;
  window.addEventListener("hashchange", handleLocationStateChange);
  window.addEventListener("popstate", handleLocationStateChange);
  locationListenerBound = true;
}

function unbindLocationStateListener() {
  if (!locationListenerBound) return;
  window.removeEventListener("hashchange", handleLocationStateChange);
  window.removeEventListener("popstate", handleLocationStateChange);
  locationListenerBound = false;
}

// ─── Renderer adapter ─────────────────────────────────────────────────────────
// Collects current module state and passes it explicitly to the stateless renderer.

function getPanelRenderArgs() {
  const currentPreset = getCurrentPreset();
  return {
    presets: presetsState,
    searchQuery,
    currentPresetId: currentPreset?.id ?? null,
    currentPresetName: currentPreset?.name ?? null,
    currentSummary: currentPreset ? currentPreset.summary : summarizeUrl(location.href),
  };
}

function repaintPanel() {
  if (!dialogEl) return;
  renderPanelContent(dialogEl, getPanelRenderArgs());
}

function repaintVisibility() {
  if (!rootEl) return;
  syncPanelVisibility(rootEl, panelOpen);
}

// ─── Panel lifecycle ──────────────────────────────────────────────────────────

function getAnchor() {
  return document.querySelector(".content-block_filter-title");
}

function removeRoot() {
  if (mountTimer) {
    clearTimeout(mountTimer);
    mountTimer = 0;
  }

  void bridge.invokeCoreAction("ui.unmount", { mountId: MOUNT_ID });
  void bridge.invokeCoreAction("ui.dialog.close", { dialogId: DIALOG_ID, reason: "remove-root" });

  if (rootEl?.parentNode) rootEl.parentNode.removeChild(rootEl);
  const mountedRoot = document.getElementById(ROOT_ID);
  if (mountedRoot?.parentNode) mountedRoot.parentNode.removeChild(mountedRoot);

  rootEl = null;
  dialogEl = null;
  panelOpen = false;
}

async function mountPageUi(forcePanelOnly = false) {
  removeRoot();

  if (!isEnabled || !isLatestPage()) return false;
  if (!showPageButton && !forcePanelOnly) return false;

  const styleText = getStyleText(ROOT_ID);
  const styleRegisterResult = await bridge.invokeCoreAction("ui.style.register", {
    styleId: STYLE_ID,
    cssText: styleText,
  });
  if (!styleRegisterResult?.ok) {
    ensureStyle(ROOT_ID, STYLE_ID);
  }

  const panelOnly = forcePanelOnly || !showPageButton;
  const mountResult = await bridge.invokeCoreAction("ui.mount", {
    mountId: MOUNT_ID,
    slot: "latest.filters.after-title",
    position: "after",
    html: createRootMarkup(ROOT_ID, panelOnly),
  });

  if (!mountResult?.ok) {
    const anchor = getAnchor();
    if (!anchor) return false;

    rootEl = createRootElement(ROOT_ID);
    if (panelOnly) {
      rootEl.classList.add("is-panel-only");
    }
    anchor.after(rootEl);
  } else {
    rootEl = document.getElementById(ROOT_ID);
    if (!rootEl) return false;
  }

  bindRootEvents();
  repaintPanel();
  repaintVisibility();
  return true;
}

function scheduleMount() {
  if (mountTimer) {
    clearTimeout(mountTimer);
    mountTimer = 0;
  }

  mountAttemptCount = 0;

  const tryMount = async () => {
    const mounted = await mountPageUi();
    if (mounted) return;

    mountAttemptCount += 1;
    if (
      mountAttemptCount >= MAX_MOUNT_ATTEMPTS ||
      !isEnabled ||
      !showPageButton ||
      !isLatestPage()
    ) {
      return;
    }

    mountTimer = window.setTimeout(() => {
      mountTimer = 0;
      void tryMount();
    }, 500);
  };

  void tryMount();
}

// ─── Panel state ──────────────────────────────────────────────────────────────

function openPanel() {
  if (!rootEl || panelOpen) return;

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
        panelOpen = false;
        repaintVisibility();
        console.warn(`[${runtime.addonId}] ui.dialog.open failed:`, result);
        void showToast(`Saved Filters dialog failed to open (${result?.reason || "unknown"}).`);
        return;
      }

      panelOpen = true;
      repaintVisibility();

      const contentId = String(result?.value?.contentId || "").trim();
      dialogEl = contentId ? document.getElementById(contentId) : null;
      if (!dialogEl) return;

      bindDialogEvents();
      repaintPanel();
      dialogEl.querySelector("[data-role='search']")?.focus();
    });
}

function closePanel() {
  if (!panelOpen && !dialogEl) return;

  void bridge.invokeCoreAction("ui.dialog.close", {
    dialogId: DIALOG_ID,
    reason: "addon-close",
  });
}

function togglePanel() {
  if (panelOpen || dialogEl) {
    closePanel();
    return;
  }
  openPanel();
}

// ─── Preset actions ───────────────────────────────────────────────────────────

function getPresetById(presetId) {
  return presetsState.find((preset) => preset.id === presetId) || null;
}

function makeDefaultPresetName() {
  return `Saved Filter ${presetsState.length + 1}`;
}

async function saveCurrentFilter() {
  const nameInput = dialogEl?.querySelector("[data-role='save-name']");
  const requestedName = normalizeText(nameInput?.value);
  const currentUrl = location.href;
  const normalizedUrl = normalizeLatestUrl(currentUrl);

  if (!normalizedUrl) {
    await showToast("Open the Latest Updates page before saving a filter.");
    return;
  }

  const currentPreset = getCurrentPreset();
  const nextName = requestedName || currentPreset?.name || makeDefaultPresetName();
  const byName = presetsState.find(
    (preset) => preset.name.toLowerCase() === nextName.toLowerCase(),
  );

  let nextPresets;
  let message;
  if (byName) {
    nextPresets = presetsState.map((preset) =>
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
      ...presetsState,
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

  const nextPresets = presetsState.map((entry) =>
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

  const nextPresets = presetsState.filter((entry) => entry.id !== presetId);
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
  rootEl.addEventListener("click", (event) => {
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
  if (!dialogEl) return;

  dialogEl.addEventListener("click", (event) => {
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

  dialogEl.addEventListener("input", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.dataset.role === "search") {
      searchQuery = input.value.trim();
      repaintPanel();
    }
  });

  dialogEl.addEventListener("keydown", (event) => {
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
  if (!isEnabled) return "Latest Filters add-on is installed but disabled.";
  if (!showPageButton)
    return "Saved filters are available from the add-on panel; the latest-page button is hidden.";
  return "One saved-filters button is available on Latest Updates pages.";
}

function getPanelBody() {
  return showPageButton
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
      status: isEnabled ? "installed" : "disabled",
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
          path: "showPageButton",
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
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
  registerAddon();
}

// ─── Addon lifecycle ──────────────────────────────────────────────────────────

async function refreshRuntimeState() {
  const settings = await loadSettings();
  isEnabled = settings.enabled !== false;
  showPageButton = settings.showPageButton !== false;
  await loadPresets();

  removeRoot();
  if (isEnabled && showPageButton && isLatestPage()) {
    scheduleMount();
  }

  pushStatusUpdate();
}

function setEnabled(nextEnabled) {
  isEnabled = Boolean(nextEnabled);
  void saveSettings({ enabled: isEnabled });

  if (!isEnabled) {
    removeRoot();
  } else if (showPageButton && isLatestPage()) {
    scheduleMount();
  }

  pushStatusUpdate();
}

async function openFiltersFromPanel() {
  if (!isEnabled) {
    await showToast("Latest Filters add-on is disabled.");
    return;
  }
  if (!isLatestPage()) {
    await showToast("Open the Latest Updates page to use Saved Filters.");
    return;
  }
  await loadPresets();
  if (!rootEl) {
    const mounted = await mountPageUi(!showPageButton);
    if (!mounted) {
      scheduleMount();
      await showToast("Saved Filters is still mounting on the page.");
      return;
    }
  }
  if (rootEl) {
    repaintPanel();
    openPanel();
  }
}

function bindAddonCommandListener() {
  if (addonCommandHandlerBound) return;

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
      panelOpen = false;
      dialogEl = null;
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

  addonCommandHandlerBound = true;
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
