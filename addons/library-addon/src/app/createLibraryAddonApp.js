import { configureToast, showToast } from "../ui/utils/showToast.js";
import { debugLog } from "../../../shared/debugLog.js";
import { LIBRARY_SETTINGS_DEFAULT, LIBRARY_STORAGE_KEY } from "../constants.js";
import { createLibraryLifecycle } from "./lifecycle.js";
import { createLibraryCommandBinding } from "./commands.js";
import { getPageContext } from "../api/page.js";
import { waitForElement } from "../api/observer.js";
import { getAddonAccess } from "../api/meta.js";
import { getStoredValue, setStoredValue } from "../api/storage.js";
import { mountUi, unmountUi } from "../api/ui/mount.js";
import { createLibraryService } from "../library/service.js";
import { getThreadSnapshot, isThreadPage } from "../thread/detector.js";
import { renderDockMarkup } from "../ui/components/dock/dockRenderer.js";
import {
  closeLibraryManager,
  handleLibraryManagerDialogClosed,
  openLibraryManager,
} from "../ui/manager/managerLauncher.js";
import {
  cancelActiveImport,
  configureImportProgress,
  handleImportProgressDialogClosed,
} from "../ui/application/importProgressController.js";

const LIBRARY_DOCK_MOUNT_ID = "library-dock-widget";

export function createLibraryAddonApp({ core: bridge, runtime }) {
configureToast(bridge);
configureImportProgress(bridge);

let isEnabled = true;
let showPageButtons = true;
let addonCommandHandlerBound = false;
let addonCommandHandler = null;
let currentSnapshot = null;
let currentSaved = false;
let dockMountClickHandler = null;
let dockMountToken = 0;

function isCurrentOperation(context) {
  return !context || typeof context.isCurrent !== "function" || context.isCurrent();
}

function getLocalPageContext() {
  const isF95 = location.hostname.includes("f95zone.to");
  const isThread = isThreadPage();
  return {
    pageScopes: isThread ? ["f95zone", "thread"] : isF95 ? ["f95zone"] : [],
    pageType: isThread ? "thread" : isF95 ? "f95zone" : "unknown",
    routeGeneration: 0,
    url: String(location.href || ""),
  };
}

async function storageGet(key, defaultValue = null) {
  return getStoredValue(bridge, key, defaultValue);
}

function storageSet(key, value) {
  return setStoredValue(bridge, key, value);
}

const library = createLibraryService(bridge, { get: storageGet, set: storageSet });

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
  bridge.registerAddon({
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
      requiresCore: runtime.requiresCore,
      // The Library button is intentionally available across F95Zone; thread
      // pages only add Save/Remove controls on top of that site-wide surface.
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
  });
}

function openManager() {
  if (!isEnabled) return;
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
  lifecycle.registerResource(
    "library-manager",
    () => { void closeLibraryManager("resource-release"); },
    "dialog",
  );
}

function pushStatusUpdate() {
  bridge.updateStatus(isEnabled ? "installed" : "disabled", statusMessage());
  registerAddon();
}

function unbindDockMountEvents() {
  if (!dockMountClickHandler) {
    return;
  }
  lifecycle.releaseResource("library-dock-listener");
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
  lifecycle.registerResource("library-dock-listener", () => {
    if (dockMountClickHandler) window.removeEventListener("click", dockMountClickHandler, true);
    dockMountClickHandler = null;
  }, "listener");
  debugLog(runtime.addonId, "Dock click listener bound.");
}

async function mountDockWidget({ showPrimaryButton, isSaved, context = null }) {
  if (!isEnabled || !isCurrentOperation(context)) return { ok: false, reason: "stale_mount" };
  const mountToken = ++dockMountToken;
  debugLog(runtime.addonId, "Dock mount requested.", { data: { showPrimaryButton, isSaved } });
  const result = await mountUi(bridge, {
    mountId: LIBRARY_DOCK_MOUNT_ID,
    slot: "page.dock",
    html: renderDockMarkup({ showPrimaryButton, isSaved }),
  });
  debugLog(runtime.addonId, "Dock mount settled.", { data: result });

  // A disable or route change may have superseded this request while the core
  // was waiting for the dock host. Do not bind a listener to a stale mount.
  // If no newer mount was requested, remove the late result as well.
  if (!isEnabled || !isCurrentOperation(context) || mountToken !== dockMountToken) {
    if (mountToken === dockMountToken) {
      await unmountUi(bridge, LIBRARY_DOCK_MOUNT_ID);
    }
    return { ok: false, reason: "stale_mount" };
  }

  if (!result?.ok) return result;
  bindDockMountEvents();
  return result;
}

async function mountQuickAddIfApplicable(context = null) {
  if (!isCurrentOperation(context)) return { ok: false, reason: "stale_mount" };
  debugLog(runtime.addonId, "Dock applicability refresh.", { data: { isEnabled, showPageButtons } });
  if (!isEnabled || !showPageButtons) {
    currentSnapshot = null;
    currentSaved = false;
    return unmountQuickAdd();
  }

  const pageContext = await getPageContext(bridge, getLocalPageContext);
  if (!isEnabled || !isCurrentOperation(context)) return { ok: false, reason: "stale_mount" };
  const threadPage = pageContext?.pageScopes?.includes("thread") || false;
  if (threadPage) {
    await waitForElement(
      bridge,
      "library-thread-title",
      "h1.p-title-value",
      2500,
      () => ({ ok: false, reason: "unsupported_action" }),
    );
    if (!isEnabled || !isCurrentOperation(context)) return { ok: false, reason: "stale_mount" };
  }

  const snapshot = threadPage ? getThreadSnapshot() : null;
  debugLog(runtime.addonId, "Thread snapshot resolved.", { data: snapshot });
  if (!snapshot?.threadId) {
    currentSnapshot = null;
    currentSaved = false;
    debugLog(runtime.addonId, "Mounting site-wide manager dock without thread controls.");
    return mountDockWidget({ showPrimaryButton: false, isSaved: false, context });
  }

  const saved = await library.isSaved(snapshot.threadId);
  if (!isEnabled || !isCurrentOperation(context)) return { ok: false, reason: "stale_mount" };
  currentSnapshot = snapshot;
  currentSaved = Boolean(saved);

  return mountDockWidget({ showPrimaryButton: true, isSaved: currentSaved, context });
}

async function unmountQuickAdd() {
  dockMountToken += 1;
  currentSnapshot = null;
  currentSaved = false;
  unbindDockMountEvents();
  await unmountUi(bridge, LIBRARY_DOCK_MOUNT_ID);
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

async function setEnabled(nextEnabled, context = null) {
  isEnabled = Boolean(nextEnabled);
  await saveSettings({ enabled: isEnabled });

  if (isEnabled) {
    await mountQuickAddIfApplicable(context);
  } else {
    await cancelActiveImport("disabled");
    await closeLibraryManager("disabled");
    lifecycle.releaseResource("library-manager");
    await unmountQuickAdd();
  }

  if (!isCurrentOperation(context)) return { ok: false, reason: "lifecycle_superseded" };
  pushStatusUpdate();
  return { ok: true };
}

async function refreshRuntimeState(context = null) {
  const settings = await loadSettings();
  if (!isCurrentOperation(context)) return { ok: false, reason: "refresh_superseded" };
  isEnabled = settings.enabled !== false;
  showPageButtons = settings.showPageButtons !== false;

  await unmountQuickAdd();
  if (!isCurrentOperation(context)) return { ok: false, reason: "refresh_superseded" };
  if (isEnabled) {
    await mountQuickAddIfApplicable(context);
  }

  if (!isCurrentOperation(context)) return { ok: false, reason: "refresh_superseded" };
  pushStatusUpdate();
  return { ok: true };
}

const lifecycle = createLibraryLifecycle({
  addonId: runtime.addonId,
  onEnable: async (context) => {
    const result = await setEnabled(true, context);
    return context.isCurrent() ? result : { ok: false, reason: "enable_superseded" };
  },
  onDisable: async (context) => {
    const result = await setEnabled(false, context);
    return context.isCurrent() ? result : { ok: false, reason: "disable_superseded" };
  },
  onRefresh: async (context) => {
    const result = await refreshRuntimeState(context);
    return context.isCurrent() ? result : { ok: false, reason: "refresh_superseded" };
  },
  onTeardown: async ({ reason }) => {
    isEnabled = false;
    await unmountQuickAdd();
    await closeLibraryManager(reason);
    unbindAddonCommandListener();
    return { ok: true };
  },
  onTeardownAcknowledged: async (reason) => {
    bridge.notifyTeardownComplete(reason);
  },
});

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
        void lifecycle.enable(detail);
        break;
      case "disable":
        void lifecycle.disable(detail);
        break;
      case "refresh":
        void lifecycle.refresh(detail);
        break;
      case "before-page-change":
        lifecycle.invalidate(String(detail.reason || "page-change"), detail.routeContext || null);
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
        void lifecycle.teardown(detail);
        break;
      default:
        break;
    }
  };

  commandBinding.bind();

  addonCommandHandlerBound = true;
}

function unbindAddonCommandListener() {
  if (!addonCommandHandlerBound || !addonCommandHandler) return;
  commandBinding.unbind();
  addonCommandHandler = null;
  addonCommandHandlerBound = false;
}

const commandBinding = createLibraryCommandBinding(bridge, (detail) => addonCommandHandler?.({ detail }));

function reportAddonBroken(err) {
  const message = err?.message
    ? String(err.message)
    : String(err ?? "Unknown initialization error");
  debugLog(runtime.addonId, "Fatal initialization error.", { level: "error", data: err });
  bridge.updateStatus("broken", `Failed to initialize: ${message}`);
}

async function bootstrap() {
  bindAddonCommandListener();
  registerAddon();

  try {
    const access = await getAddonAccess(bridge);
    if (!access?.ok || access.value?.blocked || access.value?.enabled === false) {
      isEnabled = false;
      pushStatusUpdate();
      return;
    }
    await library.runLegacyMigration();

    const settings = await loadSettings();
    isEnabled = settings.enabled !== false;
    showPageButtons = settings.showPageButtons !== false;

    if (isEnabled) {
      await lifecycle.enable();
    } else {
      pushStatusUpdate();
    }
  } catch (err) {
    reportAddonBroken(err);
  }
}

return {
  bootstrap,
  getRuntimeSnapshot: () => ({ enabled: isEnabled, showPageButtons }),
  getResourceSnapshot: () => lifecycle.getResourceSnapshot(),
  getPendingOperationSnapshot: () => lifecycle.getPendingOperationSnapshot(),
  getLifecycle: () => lifecycle,
};
}
