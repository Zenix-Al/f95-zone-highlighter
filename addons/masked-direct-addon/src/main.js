/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__, GM_openInTab, GM, GM_addValueChangeListener, GM_removeValueChangeListener, grecaptcha */
import { createCoreBridge } from "./coreBridge.js";
import { ADDON_COMMAND_EVENT, RESOLVE_BTN_CLASS } from "./constants.js";
import {
  createDebugLog,
  normalizeUrl,
  sleep,
  withAutomationMarker,
} from "./utils.js";
import { createAddonUi } from "./ui.js";
import { createDirectDownloadHostHandlers } from "./hosts/handlers.js";
import {
  coerceDirectDownloadPackages,
  createDirectDownloadPackageDefaults,
  createDirectDownloadPanelSettings,
  isDirectDownloadHostEnabled,
} from "./hosts/metadata.js";
import { createMaskedPageController } from "./maskedPageController.js";
import { createThreadPageController } from "./threadPageController.js";
import { createDirectDownloadAttentionController } from "./directDownloadAttention.js";
import { createDownloadPageController } from "./downloadPageController.js";
import { createDirectDownloadFlowController } from "./directDownloadFlowController.js";
import { getDownloadPageCloseDelay } from "./gmStorageHelper.js";

const runtime = {
  addonId:
    typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "masked-direct-addon",
  addonName:
    typeof __ADDON_NAME__ === "string"
      ? __ADDON_NAME__
      : "Masked + Direct Download Add-on",
  addonVersion:
    typeof __ADDON_VERSION__ === "string" ? __ADDON_VERSION__ : "0.1.0",
  addonDescription:
    typeof __ADDON_DESCRIPTION__ === "string"
      ? __ADDON_DESCRIPTION__
      : "Combines masked-link skipper with direct-download routing and host handlers.",
  capabilities: Array.isArray(__ADDON_CAPABILITIES__)
    ? __ADDON_CAPABILITIES__
    : [],
  requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  pageScopes: Array.isArray(__ADDON_PAGE_SCOPES__) ? __ADDON_PAGE_SCOPES__ : ["f95zone"],
  runtimeMode: typeof __ADDON_RUNTIME_MODE__ === "string" ? __ADDON_RUNTIME_MODE__ : "hybrid",
  matches: Array.isArray(__ADDON_MATCHES__)
    ? __ADDON_MATCHES__
    : ["*://f95zone.to/threads/*", "*://f95zone.to/masked/*"],
};

const bridge = createCoreBridge(runtime.addonId);
const debugLog = createDebugLog(runtime.addonId);

let isEnabled = true;
let isBlockedByCore = false;
let teardownFns = [];
let settingsCache = null;
let settingsCacheTs = 0;
let addonCommandHandlerBound = false;
let addonCommandHandler = null;
const ADDON_SETTINGS_KEY = "settings";
const ADDON_SETTINGS_DEFAULT = Object.freeze({
  skipMaskedLink: true,
  directDownloadLinks: true,
  downloadPageCloseDelayMs: 3500,
  directDownloadPackages: createDirectDownloadPackageDefaults(),
});
const ADDON_PANEL_SETTINGS = Object.freeze([
  {
    id: "skipMaskedLink",
    path: "skipMaskedLink",
    text: "Resolve button on masked links",
    tooltip:
      "Show a Resolve button next to masked links. Native clicks stay unchanged; Resolve performs masked-link resolution and direct-download routing.",
  },
  {
    id: "directDownloadLinks",
    path: "directDownloadLinks",
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts. Works independently outside of masked links.",
  },
  {
    id: "downloadPageCloseDelayMs",
    path: "downloadPageCloseDelayMs",
    text: "Download page close delay (ms)",
    tooltip:
      "Adjust the delay before closing download-host tabs. Increase if the download dialog doesn't appear before the tab closes (slow connection). Decrease on fast connections. Range: 500-10000ms.",
    type: "number",
    min: 500,
    max: 10000,
  },
  ...createDirectDownloadPanelSettings(),
]);

const managedDownloadTabs = new Map();

function registerManagedDownloadTab(requestId, tab) {
  const id = String(requestId || "").trim();
  if (!id || !tab || typeof tab.close !== "function") return;
  managedDownloadTabs.set(id, tab);
  try {
    const previousOnClose = tab.onclose;
    tab.onclose = (...args) => {
      managedDownloadTabs.delete(id);
      if (typeof previousOnClose === "function") {
        previousOnClose.apply(tab, args);
      }
    };
  } catch {
    // some userscript managers expose a read-only tab handle
  }
}

function closeManagedDownloadTab(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return false;
  const tab = managedDownloadTabs.get(id);
  if (!tab || typeof tab.close !== "function") return false;
  try {
    tab.close();
    managedDownloadTabs.delete(id);
    console.info("[DirectDownload] Closed managed tab:", id);
    return true;
  } catch (err) {
    console.warn("[DirectDownload] Failed to close managed tab:", err);
    return false;
  }
}

function addTeardown(fn) {
  if (typeof fn === "function") teardownFns.push(fn);
}

const ui = createAddonUi({
  addonId: runtime.addonId,
  buttonClass: RESOLVE_BTN_CLASS,
  addTeardown,
});
const maskedPageController = createMaskedPageController({
  addTeardown,
  readThreadFlags,
  normalizeUrl,
});
const directDownloadAttentionController =
  createDirectDownloadAttentionController({
    addTeardown,
    showToast,
    GMApi: GM,
    addValueChangeListener:
      typeof GM_addValueChangeListener === "function"
        ? GM_addValueChangeListener
        : null,
    removeValueChangeListener:
      typeof GM_removeValueChangeListener === "function"
        ? GM_removeValueChangeListener
        : null,
    closeManagedTab: closeManagedDownloadTab,
  });
let downloadPageController = null;
const directDownloadFlowController = createDirectDownloadFlowController({
  addonId: runtime.addonId,
  bridge,
  GMApi: GM,
  openInTab: GM_openInTab,
  normalizeUrl,
  withAutomationMarker,
  showToast,
  publishDirectDownloadAttention:
    directDownloadAttentionController.publishDirectDownloadAttention,
  publishDirectDownloadEvent:
    directDownloadAttentionController.publishDirectDownloadEvent,
  registerManagedTab: registerManagedDownloadTab,
  ownerTabId: directDownloadAttentionController.localAttentionTabId,
  originTabQueryKey: directDownloadAttentionController.originTabQueryKey,
  getDownloadHost: () => downloadPageController?.getDownloadHost?.() || "",
  getDownloadPageCloseDelayMs: () =>
    settingsCache?.downloadPageCloseDelayMs ??
    ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
});
const threadPageController = createThreadPageController({
  addTeardown,
  readThreadFlags,
  routeToDirectDownload: directDownloadFlowController.routeToDirectDownload,
  showToast,
  openLinkNormally: directDownloadFlowController.openLinkNormally,
  resolveMaskedLink: maskedPageController.resolveMaskedLink,
  isHostAllowedInSettings,
  ensureButtonStyle: () => ui.ensureLocalButtonStyle(),
  enableAttentionListener: () =>
    directDownloadAttentionController.enableDirectDownloadAttentionListener({
      shouldListen: isF95AddonPage,
    }),
});

function showToast(message, duration = 2600, type = "info") {
  // On f95zone pages the core is present — route through it so the toast uses
  // the same container and styling as the rest of the UI.
  // On download-host pages (gofile, pixeldrain, datanodes) the core is not
  // loaded, so fall back to the local addon toast.
  if (location.hostname.includes("f95zone.to")) {
    void bridge
      .invokeCoreAction("toast.show", { message, type })
      .then((result) => {
        if (!result?.ok) ui.showToast(message, duration);
      })
      .catch(() => ui.showToast(message, duration));
    return;
  }
  ui.showToast(message, duration);
}
downloadPageController = createDownloadPageController({
  addonId: runtime.addonId,
  debugLog,
  GMApi: GM,
  getIsBlockedByCore: () => isBlockedByCore,
  getIsEnabled: () => isEnabled,
  handlers: createDirectDownloadHostHandlers({
    debugLog,
    showToast,
    notifyMainFailure: directDownloadFlowController.notifyMainFailure,
    reportAddonHealthy,
    getSettings: () => settingsCache || {},
    getDownloadCloseDelay: getDownloadCloseDelayForHandler,
  }),
  originTabQueryKey: directDownloadAttentionController.originTabQueryKey,
});

function clearTeardowns() {
  for (const fn of teardownFns.splice(0)) {
    try {
      fn();
    } catch {
      // best effort
    }
  }
}

function isThreadPage() {
  return (
    location.hostname.includes("f95zone.to") &&
    location.pathname.startsWith("/threads")
  );
}

function isF95AddonPage() {
  return (
    location.hostname.includes("f95zone.to") &&
    !maskedPageController.isRecaptchaFrame()
  );
}

function isRelevantPage() {
  return Boolean(
    isThreadPage() ||
      maskedPageController.isMaskedPage() ||
      maskedPageController.isRecaptchaFrame() ||
      downloadPageController.getDownloadHost(),
  );
}

function isHostAllowedInSettings(hostname, flags) {
  return isDirectDownloadHostEnabled(hostname, flags?.directDownloadPackages);
}

function statusMessage() {
  return isEnabled
    ? "Masked-link skipper and direct-download routing are active."
    : "Masked/direct add-on is currently disabled.";
}

function reportAddonHealthy(options = {}) {
  directDownloadFlowController.reportAddonHealthy({
    isEnabled,
    statusMessage: statusMessage(),
    downloadPageCloseDelayMs:
      settingsCache?.downloadPageCloseDelayMs ??
      ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
    ...options,
  });
}

/**
 * Helper for handlers to get the download page close delay.
 * On download host pages (different domains), use GM storage instead of settingsCache.
 * @returns {Promise<number>} The close delay in milliseconds
 */
async function getDownloadCloseDelayForHandler() {
  // Try to get from settings cache first (origin tab)
  if (settingsCache?.downloadPageCloseDelayMs) {
    return settingsCache.downloadPageCloseDelayMs;
  }

  // Fallback: Try to get from GM storage (for download host pages on different domains)
  const gmDelay = await getDownloadPageCloseDelay(
    GM,
    ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
  );
  return gmDelay;
}

async function readThreadFlags(force = false) {
  const now = Date.now();
  if (!force && settingsCache && now - settingsCacheTs < 1500) {
    return settingsCache;
  }

  const result = await storageGet(ADDON_SETTINGS_KEY, ADDON_SETTINGS_DEFAULT);
  const parsed =
    result && typeof result === "object" ? result : ADDON_SETTINGS_DEFAULT;
  settingsCache = {
    skipMaskedLink: parsed.skipMaskedLink !== false,
    directDownloadLinks: parsed.directDownloadLinks !== false,
    downloadPageCloseDelayMs: Number.isFinite(parsed.downloadPageCloseDelayMs)
      ? Math.max(500, Math.min(10000, parsed.downloadPageCloseDelayMs))
      : ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
    directDownloadPackages: coerceDirectDownloadPackages(
      parsed.directDownloadPackages,
    ),
  };
  settingsCacheTs = now;
  return settingsCache;
}

function applyCurrentPageBehavior() {
  clearTeardowns();
  if (!isEnabled || isBlockedByCore) return;

  try {
    if (isF95AddonPage()) {
      directDownloadAttentionController.enableDirectDownloadAttentionListener({
        shouldListen: isF95AddonPage,
      });
    }

    if (isThreadPage()) {
      threadPageController.enableThreadHooks({
        isEnabled,
        isBlockedByCore,
      });
    }
    if (maskedPageController.isMaskedPage()) {
      maskedPageController.enableMaskedPageHooks({
        isEnabled,
        isBlockedByCore,
      });
    }
    if (maskedPageController.isRecaptchaFrame()) {
      maskedPageController.handleRecaptcha();
    }
  } catch (err) {
    const message = err?.message
      ? String(err.message)
      : String(err ?? "Unknown error");
    console.error(`[${runtime.addonId}] Page behavior setup error:`, err);
    bridge.dispatchCoreCommand("update-status", {
      addonId: runtime.addonId,
      status: "error",
      statusMessage: `Page behavior setup failed: ${message}`,
    });
    return;
  }

  void downloadPageController.runDownloadPageHooks().catch((error) => {
    void directDownloadFlowController.notifyMainFailure(
      downloadPageController.getDownloadHost() || "unknown",
      error?.message || String(error),
    );
  });
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
      panelBody:
        "This add-on provides masked-link Resolve buttons and direct-download page handling for supported hosts.",
      panelSettingsTitle: "Direct Download Settings",
      panelSettingsDescription:
        "Configure direct download toggle and supported host packages. Some toggles control grouped domains needed for one flow.",
      panelSettingsStorageKey: ADDON_SETTINGS_KEY,
      panelSettingsDefaults: ADDON_SETTINGS_DEFAULT,
      panelSettings: ADDON_PANEL_SETTINGS,
      capabilities: runtime.capabilities,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    },
  });
}

function pushStatusUpdate() {
  bridge.dispatchCoreCommand("update-status", {
    addonId: runtime.addonId,
    status: isEnabled ? "installed" : "disabled",
    statusMessage: statusMessage(),
  });
}

async function storageGet(key, defaultValue) {
  const result = await bridge.invokeCoreAction("storage.get", {
    key,
    defaultValue,
  });
  if (!result?.ok) return defaultValue;
  return typeof result.value === "undefined" ? defaultValue : result.value;
}

function storageSet(key, value) {
  return bridge.invokeCoreAction("storage.set", { key, value });
}

async function registerUiStyle() {
  try {
    const result = await bridge.invokeCoreAction("ui.style.register", {
      styleId: ui.styleId,
      cssText: ui.cssText,
    });
    if (!result?.ok) {
      console.warn(`[${runtime.addonId}] Failed to register UI style:`, result);
    }
  } catch (err) {
    console.warn(`[${runtime.addonId}] Error registering UI style:`, err);
  }
}

async function unregisterUiStyle() {
  try {
    const result = await bridge.invokeCoreAction("ui.style.unregister", {
      styleId: ui.styleId,
    });
    if (!result?.ok) {
      console.warn(
        `[${runtime.addonId}] Failed to unregister UI style:`,
        result,
      );
    }
  } catch (err) {
    console.warn(`[${runtime.addonId}] Error unregistering UI style:`, err);
  }
}

async function setEnabled(nextEnabled) {
  if (isBlockedByCore) {
    isEnabled = false;
    clearTeardowns();
    await unregisterUiStyle();
    pushStatusUpdate();
    return;
  }

  const shouldEnable = Boolean(nextEnabled);
  if (shouldEnable && !isEnabled) {
    // Enabling: register style first
    await registerUiStyle();
    isEnabled = true;
  } else if (!shouldEnable && isEnabled) {
    // Disabling: unregister style and clear hooks
    isEnabled = false;
    clearTeardowns();
    await unregisterUiStyle();
  } else {
    isEnabled = Boolean(nextEnabled);
  }

  await storageSet("enabled", isEnabled);
  pushStatusUpdate();
  applyCurrentPageBehavior();
}

function bindAddonCommands() {
  if (addonCommandHandlerBound) return;

  addonCommandHandler = (event) => {
    const detail = event?.detail || {};
    if (String(detail.addonId || "") !== runtime.addonId) return;

    const command = String(detail.command || "").trim();
    if (command === "enable") {
      void setEnabled(true);
    } else if (command === "disable") {
      void setEnabled(false);
    } else if (command === "refresh") {
      settingsCache = null;
      settingsCacheTs = 0;
      applyCurrentPageBehavior();
    } else if (command === "teardown") {
      void teardownAddon(String(detail.reason || "requested by core"));
    }
  };

  window.addEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);
  addonCommandHandlerBound = true;
}

function unbindAddonCommands() {
  if (!addonCommandHandlerBound || !addonCommandHandler) return;
  window.removeEventListener(ADDON_COMMAND_EVENT, addonCommandHandler);
  addonCommandHandler = null;
  addonCommandHandlerBound = false;
}

async function teardownAddon(reason) {
  console.info(`[${runtime.addonId}] Teardown requested: ${reason}`);
  isEnabled = false;
  clearTeardowns();
  await unregisterUiStyle();
  unbindAddonCommands();
  pushStatusUpdate();

  // Send teardown-complete to core
  try {
    bridge.dispatchCoreCommand("teardown-complete", {
      addonId: runtime.addonId,
      reason,
    });
  } catch {
    // best effort
  }
}

function installConsoleHelper() {
  window.__F95UE_MASKED_DIRECT_ADDON__ = {
    enable() {
      void setEnabled(true);
    },
    disable() {
      void setEnabled(false);
    },
    refresh() {
      settingsCache = null;
      applyCurrentPageBehavior();
    },
  };
}

async function refreshAccessState() {
  const access = await bridge.getAddonAccess();
  if (!access?.ok || !access.value) {
    isBlockedByCore = true;
    isEnabled = false;
    pushStatusUpdate();
    return false;
  }

  isBlockedByCore = Boolean(access.value.blocked);
  if (isBlockedByCore) {
    isEnabled = false;
    pushStatusUpdate();
    clearTeardowns();
    showToast("Add-on blocked by main settings.", 4200);
    return false;
  }

  return true;
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
  if (!isRelevantPage()) return;

  // Download-host pages (gofile, pixeldrain, datanodes) run outside the main
  // site context, so they should not require core ping.
  const downloadHost = downloadPageController.getDownloadHost();
  const recaptchaFrame = maskedPageController.isRecaptchaFrame();
  const pageContext = downloadHost || "unknown";
  console.info(
    `[${runtime.addonId}] Detected relevant page. Context: ${pageContext}. href=${location.href}`,
  );
  if (downloadHost) {
    console.info(
      `[${runtime.addonId}] Running download-host hooks without core ping. ${downloadHost}`,
    );
    void downloadPageController.runDownloadPageHooks().catch((error) => {
      void directDownloadFlowController.notifyMainFailure(
        downloadHost || "unknown",
        error?.message || String(error),
      );
    });
    return;
  }

  if (recaptchaFrame) {
    console.info(
      `[${runtime.addonId}] Running recaptcha iframe hooks without core ping.`,
    );
    applyCurrentPageBehavior();
    return;
  }

  // f95zone pages (thread, masked): require core.
  let ping = { ok: false, apiVersion: "" };
  for (let i = 0; i < 3; i += 1) {
    ping = await bridge.waitForCorePing(2200 + i * 600);
    if (ping.ok) break;
    await sleep(300 + i * 250);
  }

  const coreRequiredForPage = runtime.runtimeMode === "core-required" ||
    (runtime.runtimeMode === "hybrid" && !downloadHost && !recaptchaFrame);
  if (!ping.ok && coreRequiredForPage) {
    const accessProbe = await bridge.getAddonAccess();
    if (accessProbe?.ok) {
      ping = { ok: true, apiVersion: "probed" };
    }
  }

  if (!ping.ok && coreRequiredForPage) {
    console.info(
      `[${runtime.addonId}] F95UE core not detected; add-on skipped.`,
    );
    console.info(`status: ${JSON.stringify(ping)}`);
    return;
  }

  registerAddon();
  bindAddonCommands();

  try {
    const hasAccess = await refreshAccessState();
    if (!hasAccess) return;

    const storedEnabled = await storageGet("enabled", true);
    isEnabled = storedEnabled !== false && storedEnabled !== "false";

    installConsoleHelper();

    // If addon was previously enabled, register style before applying behavior
    if (isEnabled) {
      await registerUiStyle();
    }

    applyCurrentPageBehavior();
    pushStatusUpdate();
  } catch (err) {
    reportAddonBroken(err);
  }
}

void bootstrap();
