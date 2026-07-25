/* global GM_openInTab, GM, GM_addValueChangeListener, GM_removeValueChangeListener */
import { createMaskedDirectCoreAdaptor } from "../core/adaptor.js";
import { RESOLVE_BTN_CLASS } from "../constants.js";
import { classifyMaskedDirectContext } from "./context.js";
import {
  createDebugLog,
  normalizeUrl,
  sleep,
  withAutomationMarker,
} from "../shared/utils.js";
import { createAddonUi } from "../ui/controller.js";
import { createDirectDownloadHostHandlers } from "../hosts/handlers.js";
import {
  isDirectDownloadHostEnabled,
  normalizeDirectDownloadHost,
} from "../hosts/metadata.js";
import { createMaskedPageController } from "./contexts/maskedPageController.js";
import { createThreadPageController } from "./contexts/threadPageController.js";
import { createDirectDownloadAttentionController } from "../domain/directDownload/attention.js";
import { createDownloadPageController } from "./contexts/downloadPageController.js";
import { createDirectDownloadFlowController } from "../domain/directDownload/flowController.js";
import { createManagedDownloadTabs } from "./managedTabs.js";
import { createMaskedDirectRegistration } from "./registration.js";
import { createMaskedDirectRuntime } from "./runtime.js";
import {
  ADDON_SETTINGS_DEFAULT,
  createMaskedDirectSettings,
} from "./settings.js";
import { createMaskedDirectStyleController } from "./styleController.js";
import { createMaskedDirectPageBehavior } from "./pageBehavior.js";
import { createMaskedDirectLifecycle } from "./lifecycle.js";

const runtime = createMaskedDirectRuntime();
const bridge = createMaskedDirectCoreAdaptor(runtime.addonId);
const debugLog = createDebugLog(runtime.addonId);
const settings = createMaskedDirectSettings({ bridge, GMApi: GM });
const managedDownloadTabs = createManagedDownloadTabs();

const state = { enabled: true, blockedByCore: false };
let teardownFns = [];

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
  readThreadFlags: settings.read,
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
    closeManagedTab: managedDownloadTabs.close,
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
  registerManagedTab: managedDownloadTabs.register,
  ownerTabId: directDownloadAttentionController.localAttentionTabId,
  originTabQueryKey: directDownloadAttentionController.originTabQueryKey,
  getDownloadHost: () => downloadPageController?.getDownloadHost?.() || "",
  getDownloadPageCloseDelayMs: () =>
    settings.getSnapshot()?.downloadPageCloseDelayMs ??
    ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
});
const threadPageController = createThreadPageController({
  addTeardown,
  readThreadFlags: settings.read,
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
  getIsBlockedByCore: () => state.blockedByCore,
  getIsEnabled: () => state.enabled,
  handlers: createDirectDownloadHostHandlers({
    debugLog,
    showToast,
    notifyMainFailure: directDownloadFlowController.notifyMainFailure,
    reportAddonHealthy,
    getSettings: () => settings.getSnapshot() || {},
    getDownloadCloseDelay: settings.getDownloadCloseDelay,
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

function isHostAllowedInSettings(hostname, flags) {
  return isDirectDownloadHostEnabled(hostname, flags?.directDownloadPackages);
}

function statusMessage() {
  return state.enabled
    ? "Masked-link skipper and direct-download routing are active."
    : "Masked/direct add-on is currently disabled.";
}

function reportAddonHealthy(options = {}) {
  directDownloadFlowController.reportAddonHealthy({
    isEnabled: state.enabled,
    statusMessage: statusMessage(),
    downloadPageCloseDelayMs:
      settings.getSnapshot()?.downloadPageCloseDelayMs ??
      ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
    ...options,
  });
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

const registration = createMaskedDirectRegistration({
  bridge,
  runtime,
  getIsEnabled: () => state.enabled,
  getStatusMessage: statusMessage,
});
const styles = createMaskedDirectStyleController({ bridge, runtime, ui });
const pageBehavior = createMaskedDirectPageBehavior({
  bridge,
  runtime,
  clearOwnedResources: clearTeardowns,
  getIsEnabled: () => state.enabled,
  getIsBlocked: () => state.blockedByCore,
  getLocalPageContext,
  isF95AddonPage,
  directDownloadAttentionController,
  threadPageController,
  maskedPageController,
  downloadPageController,
  directDownloadFlowController,
});

const lifecycle = createMaskedDirectLifecycle({
  bridge,
  runtime,
  state,
  settings,
  styles,
  registration,
  pageBehavior,
  clearOwnedResources: clearTeardowns,
  showToast,
});

export async function bootstrapMaskedDirectAddon() {
  const context = classifyMaskedDirectContext(location, {
    isSupportedExternalHost: (hostname) =>
      Boolean(normalizeDirectDownloadHostForContext(hostname)),
  });
  if (context.kind === "unsupported") return;

  // Download-host pages (gofile, pixeldrain, datanodes) run outside the main
  // site context, so they should not require core ping.
  const downloadHost = downloadPageController.getDownloadHost();
  const pageContext = downloadHost || "unknown";
  console.info(
    `[${runtime.addonId}] Detected relevant page. Context: ${pageContext}. href=${location.href}`,
  );
  if (context.kind === "external-standalone") {
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

  // Only matched F95 thread and /masked routes reach this core branch.
  let ping = { ok: false, apiVersion: "" };
  for (let i = 0; i < 3; i += 1) {
    ping = await bridge.waitForCorePing(2200 + i * 600);
    if (ping.ok) break;
    await sleep(300 + i * 250);
  }

  const coreRequiredForPage = runtime.runtimeMode === "core-required" ||
    (runtime.runtimeMode === "hybrid" && !downloadHost);
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

  registration.register();
  lifecycle.bindCommands();

  try {
    const hasAccess = await lifecycle.refreshAccess();
    if (!hasAccess) return;
    await lifecycle.initializeEnabledState();
  } catch (err) {
    registration.publishBroken(err);
  }
}

function normalizeDirectDownloadHostForContext(hostname) {
  return normalizeDirectDownloadHost(hostname);
}
