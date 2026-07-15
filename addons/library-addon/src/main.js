import { showToast } from "./ui/utils/showToast.js";
import { debugLog } from "../../shared/debugLog.js";
import {
  ADDON_COMMAND_EVENT,
  getRuntimeConfig,
  LIBRARY_SETTINGS_DEFAULT,
  LIBRARY_STORAGE_KEY,
} from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";
import { createLibraryService } from "./library/service.js";
import { getThreadSnapshot, isThreadPage } from "./thread/detector.js";
import { renderDockMarkup } from "./ui/components/dock/dockRenderer.js";
import {
  closeLibraryManager,
  handleLibraryManagerDialogClosed,
  openLibraryManager,
} from "./ui/manager/managerLauncher.js";
import {
  configureImportProgress,
  handleImportProgressDialogClosed,
} from "./ui/application/importProgressController.js";

const runtime = getRuntimeConfig();
debugLog(`[library-addon] Runtime config:`, runtime);
export const bridge = createCoreBridge(runtime.addonId);
configureImportProgress(bridge);
const library = createLibraryService(bridge);
const LIBRARY_DOCK_MOUNT_ID = "library-dock-widget";

let isEnabled = true;
let showPageButtons = true;
let addonCommandHandlerBound = false;
let addonCommandHandler = null;
let currentSnapshot = null;
let currentSaved = false;
let dockMountClickHandler = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCoreReady() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ping = await bridge.waitForCorePing(1800 + attempt * 500);
    if (ping.ok) return ping;
    await wait(250 + attempt * 250);
  }
  return { ok: false, apiVersion: "" };
}

export async function storageGet(key, defaultValue = null) {
  const result = await bridge.invokeCoreAction("storage.get", { key, defaultValue });
  return result?.ok ? result.value : defaultValue;
}

export function storageSet(key, value) {
  return bridge.invokeCoreAction("storage.set", { key, value });
}

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...LIBRARY_SETTINGS_DEFAULT,
    ...source,
    enabled: source.enabled !== false,
    showPageButtons: source.showPageButtons !== false,
  };
}

async function loadSettings() {
  const stored = await storageGet(LIBRARY_STORAGE_KEY, LIBRARY_SETTINGS_DEFAULT);
  return normalizeSettings(stored);
}

async function saveSettings(nextPartial = {}) {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...nextPartial });
  await storageSet(LIBRARY_STORAGE_KEY, next);
  return next;
}

function statusMessage() {
  return isEnabled
    ? showPageButtons
      ? "Library button is available site-wide; quick add is active on thread pages."
      : "Library controls are available in the add-on panel."
    : "Library add-on is installed but disabled.";
}

function getPanelBody() {
  return showPageButtons
    ? "Use the bottom-left page dock to open Library anywhere on F95. Save/Remove appears when you are on a thread page."
    : "Page buttons are hidden. Use the actions below to save the current thread or open the library manager.";
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
      panelSettingsTitle: "Library Settings",
      panelSettingsDescription:
        "Control whether the page dock shows library buttons while keeping the manager available in this panel.",
      panelSettingsStorageKey: LIBRARY_STORAGE_KEY,
      panelSettingsDefaults: LIBRARY_SETTINGS_DEFAULT,
      panelSettings: [
        {
          path: "showPageButtons",
          text: "Show page dock buttons",
          tooltip:
            "Show the Library dock button across F95 pages. Save/Remove only appears on thread pages.",
        },
      ],
      panelActions: [
        { id: "save-current-thread", label: "Save Current Thread" },
        {
          id: "open-library",
          label: "Open Library",
          variant: "secondary",
          requiresActivePage: false,
        },
      ],
      capabilities: runtime.capabilities,
      // The Library button is intentionally available across F95Zone; thread
      // pages only add Save/Remove controls on top of that site-wide surface.
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    },
  });
}

function openManager() {
  openLibraryManager({
    bridge,
    addonId: runtime.addonId,
    library,
    getCurrentThreadSnapshot: () => getThreadSnapshot(),
    onMutated: () => {
      if (!isEnabled) return;
      void mountQuickAddIfApplicable();
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

function unbindDockMountEvents() {
  if (!dockMountClickHandler) {
    return;
  }
  window.removeEventListener("click", dockMountClickHandler, true);
  dockMountClickHandler = null;
}

function resolveDockActionButton(event) {
  const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
  let inLibraryDock = false;
  let actionEl = null;

  for (const node of path) {
    if (!node || node.nodeType !== 1) continue;

    if (!inLibraryDock) {
      const role = String(node.getAttribute?.("data-role") || "").trim();
      if (role === "libraryDock") {
        inLibraryDock = true;
      }
    }

    if (!actionEl && typeof node.matches === "function" && node.matches("button[data-action]")) {
      actionEl = node;
    }

    if (inLibraryDock && actionEl) break;
  }

  if (!inLibraryDock || !actionEl) return null;
  return actionEl;
}

function bindDockMountEvents() {
  if (dockMountClickHandler) {
    return;
  }

  dockMountClickHandler = (event) => {
    if (!isEnabled) return;
    const actionEl = resolveDockActionButton(event);
    if (!actionEl) return;

    const action = String(actionEl.dataset.action || "").trim();
    if (action === "open-library") {
      openManager();
    } else if (action === "toggle-thread") {
      void toggleCurrentThreadFromDock();
    } else if (action === "update-thread") {
      void updateCurrentThreadFromDock();
    }
  };

  window.addEventListener("click", dockMountClickHandler, true);
  debugLog(`[library-addon] dock click listener bound globally`);
}

async function mountDockWidget({ showPrimaryButton, isSaved }) {
  debugLog(
    `[library-addon] mountDockWidget called with showPrimaryButton=${showPrimaryButton}, isSaved=${isSaved}`,
  );
  const result = await bridge.invokeCoreAction("ui.mount", {
    mountId: LIBRARY_DOCK_MOUNT_ID,
    slot: "page.dock",
    html: renderDockMarkup({ showPrimaryButton, isSaved }),
  });
  debugLog(`[library-addon] ui.mount result:`, result);
  debugLog(
    `[library-addon] Expected element ID: f95ue-addon-mount-${runtime.addonId}-${LIBRARY_DOCK_MOUNT_ID}`,
  );
  bindDockMountEvents();
}

async function mountQuickAddIfApplicable() {
  debugLog(
    `[library-addon] mountQuickAddIfApplicable called: isEnabled=${isEnabled}, showPageButtons=${showPageButtons}`,
  );
  if (!isEnabled || !showPageButtons) {
    currentSnapshot = null;
    currentSaved = false;
    await unmountQuickAdd();
    return;
  }

  const snapshot = isThreadPage() ? getThreadSnapshot() : null;
  console.debug(`[library-addon] page snapshot:`, snapshot);
  if (!snapshot?.threadId) {
    currentSnapshot = null;
    currentSaved = false;
    debugLog(`[library-addon] mounting dock widget without primary button (not thread page)`);
    await mountDockWidget({ showPrimaryButton: false, isSaved: false });
    return;
  }

  const saved = await library.isSaved(snapshot.threadId);
  currentSnapshot = snapshot;
  currentSaved = Boolean(saved);

  await mountDockWidget({ showPrimaryButton: true, isSaved: currentSaved });
}

async function unmountQuickAdd() {
  currentSnapshot = null;
  currentSaved = false;
  unbindDockMountEvents();
  await bridge.invokeCoreAction("ui.unmount", { mountId: LIBRARY_DOCK_MOUNT_ID });
}

async function toggleCurrentThreadFromDock() {
  const snapshot = currentSnapshot || getThreadSnapshot();
  if (!snapshot?.threadId) {
    showToast("Open a thread page to save it into the library.", "error");

    return;
  }

  const isSavedNow = await library.isSaved(snapshot.threadId);
  if (isSavedNow) {
    const removeResult = await library.removeEntry(snapshot.threadId);
    showToast(
      removeResult?.ok ? "Removed from library." : "Failed to remove entry.",
      removeResult?.ok ? "success" : "error",
    );
  } else {
    const saveResult = await library.saveEntry(snapshot);
    showToast(
      saveResult?.ok ? "Saved to library." : "Failed to save entry.",
      saveResult?.ok ? "success" : "error",
    );
  }

  await mountQuickAddIfApplicable();
}

async function updateCurrentThreadFromDock() {
  const snapshot = currentSnapshot || getThreadSnapshot();
  if (!snapshot?.threadId) {
    showToast("Open a thread page to update it from the library.", "error");
    return;
  }

  const isSavedNow = await library.isSaved(snapshot.threadId);
  if (!isSavedNow) {
    showToast("Save this thread first before updating.", "error");
    return;
  }

  const result = await library.patchEntry(snapshot.threadId, {
    url: String(snapshot.url || "").trim(),
    title: String(snapshot.title || "").trim(),
    canonicalTitle: String(snapshot.canonicalTitle || snapshot.title || "").trim(),
    titleNormalized: String(snapshot.titleNormalized || snapshot.title || "")
      .trim()
      .toLowerCase(),
    prefix: String(snapshot.prefix || "").trim(),
    gameVersion: String(snapshot.gameVersion || "").trim(),
    prefixes: Array.isArray(snapshot.prefixes) ? snapshot.prefixes : [],
    developer: String(snapshot.developer || "").trim(),
    threadRating: Number.isFinite(Number(snapshot.threadRating))
      ? Number(snapshot.threadRating)
      : null,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    sourcePage: "thread",
  });

  showToast(
    result?.ok ? "Updated from this thread." : `Failed to update: ${result?.reason || "unknown"}`,
    result?.ok ? "success" : "error",
  );

  await mountQuickAddIfApplicable();
}

async function setEnabled(nextEnabled) {
  isEnabled = Boolean(nextEnabled);
  await saveSettings({ enabled: isEnabled });

  if (isEnabled) {
    await mountQuickAddIfApplicable();
  } else {
    await unmountQuickAdd();
    await closeLibraryManager("disabled");
  }

  pushStatusUpdate();
}

async function refreshRuntimeState() {
  const settings = await loadSettings();
  isEnabled = settings.enabled !== false;
  showPageButtons = settings.showPageButtons !== false;

  await unmountQuickAdd();
  if (isEnabled) {
    await mountQuickAddIfApplicable();
  }

  pushStatusUpdate();
}

async function saveCurrentThreadFromPanel() {
  if (!isEnabled) {
    showToast("Library add-on is disabled.", "error");
    return;
  }

  const snapshot = getThreadSnapshot();
  if (!snapshot?.threadId) {
    showToast("Open a thread page to save it into the library.", "error");
    return;
  }

  const saveResult = await library.saveEntry(snapshot);
  showToast(
    saveResult?.ok ? "Current thread saved to library." : "Failed to save current thread.",
    saveResult?.ok ? "success" : "error",
  );

  if (saveResult?.ok) {
    await refreshRuntimeState();
  }
}

function bindAddonCommandListener() {
  if (addonCommandHandlerBound) return;

  addonCommandHandler = (event) => {
    const detail = event?.detail || {};
    if (String(detail.addonId || "") !== runtime.addonId) return;

    const command = String(detail.command || "").trim();
    switch (command) {
      case "enable":
        void setEnabled(true);
        break;
      case "disable":
        void setEnabled(false);
        break;
      case "refresh":
        void refreshRuntimeState();
        break;
      case "toast":
        openManager();
        break;
      case "dialog-closed":
        handleLibraryManagerDialogClosed(detail);
        handleImportProgressDialogClosed(detail);
        break;
      case "panel-action": {
        const actionId = String(detail.actionId || "").trim();
        if (actionId === "open-library") {
          if (isEnabled) openManager();
        } else if (actionId === "save-current-thread") {
          void saveCurrentThreadFromPanel();
        }
        break;
      }
      case "teardown":
        void teardownAddon(String(detail.reason || "requested by core"));
        break;
      default:
        break;
    }
  };

  window.addEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);

  addonCommandHandlerBound = true;
}

function unbindAddonCommandListener() {
  if (!addonCommandHandlerBound || !addonCommandHandler) return;
  window.removeEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);
  addonCommandHandler = null;
  addonCommandHandlerBound = false;
}

async function teardownAddon(reason) {
  await unmountQuickAdd();
  await closeLibraryManager(reason);
  if (reason !== "disable") {
    unbindAddonCommandListener();
  }
  bridge.dispatchCoreCommand("teardown-complete", {
    addonId: runtime.addonId,
    reason,
  });
}

function reportAddonBroken(err) {
  const message = err?.message
    ? String(err.message)
    : String(err ?? "Unknown initialization error");
  console.error(`[${runtime.addonId}] Fatal initialization error:`, err);
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: "broken",
    statusMessage: `Failed to initialize: ${message}`,
  });
}

async function bootstrap() {
  const ping = await waitForCoreReady();
  if (!ping.ok && runtime.runtimeMode === "core-required") {
    console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
    return;
  }

  bindAddonCommandListener();
  registerAddon();

  try {
    const access = await bridge.invokeCoreAction("addon.access", {});
    if (!access?.ok || access.value?.blocked) {
      isEnabled = false;
      pushStatusUpdate();
      return;
    }
    await library.runLegacyMigration();

    const settings = await loadSettings();
    isEnabled = settings.enabled !== false;
    showPageButtons = settings.showPageButtons !== false;

    if (isEnabled) {
      await mountQuickAddIfApplicable();
    } else {
      pushStatusUpdate();
    }
  } catch (err) {
    reportAddonBroken(err);
  }
}

void bootstrap();
