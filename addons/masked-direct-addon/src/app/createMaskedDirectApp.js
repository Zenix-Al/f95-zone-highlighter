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
import { createMaskedDirectDiagnostics } from "../shared/diagnostics.js";
import { createStandaloneAutomationPolicyRepository } from "../ports/standaloneAutomationPolicyRepository.js";
import { probeMaskedDirectCore } from "./coreAvailability.js";
import { createMaskedDestinationDelivery } from "./maskedDestinationDelivery.js";
import { showCoreToast } from "../api/toast.js";
import { watchElements, unwatchElements } from "../api/observer.js";

const runtime = createMaskedDirectRuntime();
const bridge = createMaskedDirectCoreAdaptor(runtime.addonId);
const debugLog = createDebugLog(runtime.addonId);
const diagnostics = createMaskedDirectDiagnostics(runtime.addonId);
const standaloneAutomationPolicy =
  createStandaloneAutomationPolicyRepository({ GMApi: GM });
const settings = createMaskedDirectSettings({
  bridge,
  GMApi: GM,
  onSettingsRead: (flags) =>
    standaloneAutomationPolicy.recordCoreAvailable({
      userPreference: flags.automateRegardless,
      skipMaskedLink: flags.skipMaskedLink,
    }),
});
const managedDownloadTabs = createManagedDownloadTabs();

const state = { enabled: true, blockedByCore: false };
let maskedStandaloneMode = false;
let teardownFns = [];

function addTeardown(fn) {
  if (typeof fn === "function") teardownFns.push(fn);
}

const ui = createAddonUi({
  addonId: runtime.addonId,
  buttonClass: RESOLVE_BTN_CLASS,
  addTeardown,
});
const directDownloadAttentionController =
  createDirectDownloadAttentionController({
    addTeardown,
    diagnostics,
    showCoreToast: (message, type) => showCoreToast(bridge, message, type),
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
    debugLog,
  });
let downloadPageController = null;
const directDownloadFlowController = createDirectDownloadFlowController({
  addonId: runtime.addonId,
  bridge,
  GMApi: GM,
  openInTab: GM_openInTab,
  normalizeUrl,
  withAutomationMarker,
  diagnostics,
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
const deliverMaskedDestination = createMaskedDestinationDelivery({
  getIsStandalone: () => maskedStandaloneMode,
  routeManagedDestination:
    directDownloadFlowController.routeToDirectDownload,
  navigate: (url) => {
    location.href = url;
  },
});
const maskedPageController = createMaskedPageController({
  addTeardown,
  readThreadFlags: (force) =>
    maskedStandaloneMode
      ? standaloneAutomationPolicy.read()
      : settings.read(force),
  normalizeUrl,
  deliverDestination: deliverMaskedDestination,
});
const threadPageController = createThreadPageController({
  addTeardown,
  readThreadFlags: settings.read,
  routeToDirectDownload: directDownloadFlowController.routeToDirectDownload,
  diagnostics,
  openLinkNormally: directDownloadFlowController.openLinkNormally,
  resolveMaskedLink: maskedPageController.resolveMaskedLink,
  isHostAllowedInSettings,
  ensureButtonStyle: () => ui.ensureLocalButtonStyle(),
  enableAttentionListener: () =>
    directDownloadAttentionController.enableDirectDownloadAttentionListener({
      shouldListen: isF95AddonPage,
    }),
  watchElements: (observerId) => watchElements(bridge, observerId),
  unwatchElements: (observerId) => unwatchElements(bridge, observerId),
});

downloadPageController = createDownloadPageController({
  addonId: runtime.addonId,
  debugLog,
  GMApi: GM,
  getIsBlockedByCore: () => state.blockedByCore,
  getIsEnabled: () => state.enabled,
  onManagedRequestResolved:
    directDownloadFlowController.setActiveManagedRequest,
  getStandalonePolicy: () =>
    standaloneAutomationPolicy.getEffectivePolicy(),
  createHostExecutionContext,
  handlers: createDirectDownloadHostHandlers({
    debugLog,
    createHostExecutionContext,
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

function createHostExecutionContext(decision, standaloneHooks = {}) {
  return directDownloadFlowController.createHostExecutionContext(decision, {
    isEnabled: state.enabled,
    statusMessage: statusMessage(),
    downloadPageCloseDelayMs:
      settings.getSnapshot()?.downloadPageCloseDelayMs ??
      ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
    ...standaloneHooks,
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
  diagnostics,
});

export async function bootstrapMaskedDirectAddon() {
  const context = classifyMaskedDirectContext(location, {
    isSupportedExternalHost: (hostname) =>
      Boolean(normalizeDirectDownloadHostForContext(hostname)),
  });
  if (context.kind === "unsupported") return;

  if (context.route === "recaptcha-frame") {
    console.info(
      `[${runtime.addonId}] Running masked-link reCAPTCHA frame fallback.`,
    );
    maskedPageController.handleRecaptcha();
    return;
  }

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

  // Only matched F95 thread and /masked routes reach this ownership probe.
  const coreRequiredForPage = runtime.runtimeMode === "core-required" ||
    (runtime.runtimeMode === "hybrid" && !downloadHost);
  const coreOwnershipPromise = (async () => {
    await standaloneAutomationPolicy.recordCoreProbing();
    const ping = await probeMaskedDirectCore({ bridge, sleep });
    return {
      state: ping.ok ? "available" : "confirmed-missing",
      ping,
    };
  })();
  const ownership = await coreOwnershipPromise;
  const { ping } = ownership;

  if (ownership.state === "confirmed-missing" && coreRequiredForPage) {
    await standaloneAutomationPolicy.recordMissingCore();
    console.info(
      `[${runtime.addonId}] Missing-core fallback is temporarily forcing approved standalone host automation; the saved preference is unchanged.`,
    );
    console.info(
      `[${runtime.addonId}] F95UE core not detected.`,
    );
    console.info(`status: ${JSON.stringify(ping)}`);
    if (context.route === "masked") {
      maskedStandaloneMode = true;
      console.info(
        `[${runtime.addonId}] Running bare masked redirect without core.`,
      );
      maskedPageController.enableMaskedPageHooks({
        isEnabled: true,
        isBlockedByCore: false,
      });
      return;
    }
    console.info(`[${runtime.addonId}] Add-on skipped on F95 thread route.`);
    return;
  }

  await standaloneAutomationPolicy.recordCoreAvailable();

  registration.register();
  lifecycle.bindCommands();

  try {
    const hasAccess = await lifecycle.refreshAccess();
    if (!hasAccess) return;
    await lifecycle.initializeEnabledState();
    await settings.read(true);
  } catch (err) {
    registration.publishBroken(err);
  }
}

function normalizeDirectDownloadHostForContext(hostname) {
  return normalizeDirectDownloadHost(hostname);
}
