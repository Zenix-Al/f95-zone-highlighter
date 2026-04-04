import {
  ADDON_COMMAND_EVENT,
  getRuntimeConfig,
  LIBRARY_SETTINGS_DEFAULT,
  LIBRARY_STORAGE_KEY,
} from "./constants.js";
import { createCoreBridge } from "./coreBridge.js";
import { createLibraryService } from "./library/service.js";
import { getThreadSnapshot, isThreadPage } from "./thread/detector.js";
import { openLibraryManager } from "./ui/managerLauncher.js";

const runtime = getRuntimeConfig();
const bridge = createCoreBridge(runtime.addonId);
const library = createLibraryService(bridge);

let isEnabled = true;
let showPageButtons = true;
let addonCommandHandlerBound = false;
let currentSnapshot = null;
let currentSaved = false;

async function storageGet(key, defaultValue = null) {
  const result = await bridge.invokeCoreAction("storage.get", { key, defaultValue });
  return result?.ok ? result.value : defaultValue;
}

function storageSet(key, value) {
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
      name: "Library Add-on",
      version: "0.1.0",
      description:
        "Save thread snapshots into a personal library with quick page controls and a dedicated manager.",
      status: isEnabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: "Library Add-on",
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
    },
  });
}

function openManager() {
  openLibraryManager({
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

async function mountQuickAddIfApplicable() {
  if (!isEnabled || !showPageButtons) {
    currentSnapshot = null;
    currentSaved = false;
    await bridge.invokeCoreAction("ui.dock.removeButtons");
    return;
  }

  const snapshot = isThreadPage() ? getThreadSnapshot() : null;
  if (!snapshot?.threadId) {
    currentSnapshot = null;
    currentSaved = false;
    await bridge.invokeCoreAction("ui.dock.setButtons", {
      buttons: [
        {
          id: "open-library",
          label: "Library",
          variant: "secondary",
        },
      ],
    });
    return;
  }

  const saved = await library.isSaved(snapshot.threadId);
  currentSnapshot = snapshot;
  currentSaved = Boolean(saved);

  await bridge.invokeCoreAction("ui.dock.setButtons", {
    buttons: [
      {
        id: "toggle-thread",
        label: currentSaved ? "Remove from Library" : "Save to Library",
        variant: currentSaved ? "saved" : "primary",
      },
      {
        id: "open-library",
        label: "Library",
        variant: "secondary",
      },
    ],
  });
}

async function unmountQuickAdd() {
  currentSnapshot = null;
  currentSaved = false;
  await bridge.invokeCoreAction("ui.dock.removeButtons");
}

async function toggleCurrentThreadFromDock() {
  const snapshot = currentSnapshot || getThreadSnapshot();
  if (!snapshot?.threadId) {
    await bridge.invokeCoreAction("toast.show", {
      message: "Open a thread page to save it into the library.",
    });
    return;
  }

  const isSavedNow = await library.isSaved(snapshot.threadId);
  if (isSavedNow) {
    const removeResult = await library.removeEntry(snapshot.threadId);
    await bridge.invokeCoreAction("toast.show", {
      message: removeResult?.ok ? "Removed from library." : "Failed to remove entry.",
    });
  } else {
    const saveResult = await library.saveEntry(snapshot);
    await bridge.invokeCoreAction("toast.show", {
      message: saveResult?.ok ? "Saved to library." : "Failed to save entry.",
    });
  }

  await mountQuickAddIfApplicable();
}

function setEnabled(nextEnabled) {
  isEnabled = Boolean(nextEnabled);
  void saveSettings({ enabled: isEnabled });

  if (isEnabled) {
    void mountQuickAddIfApplicable();
  } else {
    void unmountQuickAdd();
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
    await bridge.invokeCoreAction("toast.show", { message: "Library add-on is disabled." });
    return;
  }

  const snapshot = getThreadSnapshot();
  if (!snapshot?.threadId) {
    await bridge.invokeCoreAction("toast.show", {
      message: "Open a thread page to save it into the library.",
    });
    return;
  }

  const saveResult = await library.saveEntry(snapshot);
  await bridge.invokeCoreAction("toast.show", {
    message: saveResult?.ok ? "Current thread saved to library." : "Failed to save current thread.",
  });

  if (saveResult?.ok) {
    await refreshRuntimeState();
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

    if (command === "toast") {
      openManager();
      return;
    }

    if (command === "panel-action") {
      const actionId = String(detail.actionId || "").trim();
      if (actionId === "open-library") {
        openManager();
        return;
      }

      if (actionId === "save-current-thread") {
        void saveCurrentThreadFromPanel();
      }
      return;
    }

    if (command === "dock-action") {
      const actionId = String(detail.actionId || "").trim();
      if (actionId === "open-library") {
        openManager();
        return;
      }
      if (actionId === "toggle-thread") {
        void toggleCurrentThreadFromDock();
      }
    }
  });

  addonCommandHandlerBound = true;
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
  const ping = await bridge.waitForCorePing();
  if (!ping.ok && runtime.requiresCore) {
    console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
    return;
  }

  registerAddon();

  try {
    await library.runLegacyMigration();

    const settings = await loadSettings();
    isEnabled = settings.enabled !== false;
    showPageButtons = settings.showPageButtons !== false;

    bindAddonCommandListener();

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
