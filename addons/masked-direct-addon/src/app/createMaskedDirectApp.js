/* global GM, GM_addValueChangeListener, GM_removeValueChangeListener */
import { createMaskedDirectCoreAdaptor } from "../core/adaptor.js";
import { classifyMaskedDirectContext } from "./context.js";
import { createDebugLog, sleep } from "../shared/utils.js";
import { createDirectDownloadHostHandlers } from "../hosts/handlers.js";
import { normalizeDirectDownloadHost } from "../hosts/metadata.js";
import { createDownloadPageController } from "./contexts/downloadPageController.js";
import { createDirectDownloadFlowController } from "../domain/directDownload/flowController.js";
import { createMaskedDirectRegistration } from "./registration.js";
import { createMaskedDirectRuntime } from "./runtime.js";
import { createMaskedDirectSettings } from "./settings.js";
import { createMaskedDirectPageBehavior } from "./pageBehavior.js";
import { createMaskedDirectLifecycle } from "./lifecycle.js";
import { createMaskedDirectDiagnostics } from "../shared/diagnostics.js";
import { createStandaloneAutomationPolicyRepository } from "../ports/standaloneAutomationPolicyRepository.js";
import { probeMaskedDirectCore } from "./coreAvailability.js";
import { createHostFeedback } from "../domain/directDownload/feedback.js";
import { showCoreToast } from "../api/toast.js";
import { createContinuePageController } from "./contexts/continuePageController.js";

const runtime = createMaskedDirectRuntime();
const bridge = createMaskedDirectCoreAdaptor(runtime.addonId);
const debugLog = createDebugLog(runtime.addonId);
const diagnostics = createMaskedDirectDiagnostics(runtime.addonId);
const standaloneAutomationPolicy = createStandaloneAutomationPolicyRepository({ GMApi: GM });
const state = { enabled: true, blockedByCore: false };
const feedback = createHostFeedback({
  GMApi: GM,
  addValueChangeListener:
    typeof GM_addValueChangeListener === "function" ? GM_addValueChangeListener : null,
  removeValueChangeListener:
    typeof GM_removeValueChangeListener === "function" ? GM_removeValueChangeListener : null,
  showToast: (message, type) => showCoreToast(bridge, message, type),
  isEnabled: () => state.enabled && !state.blockedByCore,
});
const settings = createMaskedDirectSettings({
  bridge,
  onSettingsRead: (flags) =>
    standaloneAutomationPolicy.updateSettings({ ...flags, enabled: state.enabled }),
  onEnabledChanged: (enabled) => standaloneAutomationPolicy.updateSettings({ enabled }),
});
const directDownloadFlowController = createDirectDownloadFlowController({
  addonId: runtime.addonId,
  diagnostics,
  getPolicy: () => standaloneAutomationPolicy.getEffectivePolicy(),
  publishFeedback: feedback.publish,
});
const createHostExecutionContext = directDownloadFlowController.createHostExecutionContext;
const downloadPageController = createDownloadPageController({
  addonId: runtime.addonId,
  debugLog,
  getIsEnabled: () => state.enabled,
  getStandalonePolicy: () => standaloneAutomationPolicy.getEffectivePolicy(),
  createHostExecutionContext,
  handlers: createDirectDownloadHostHandlers({
    debugLog,
    createHostExecutionContext,
    getSettings: () => settings.getSnapshot() || {},
  }),
});
const statusMessage = () =>
  state.enabled
    ? "Standalone host download automation is active; F95 download controls are retired."
    : "Download automation add-on is disabled.";
const registration = createMaskedDirectRegistration({
  bridge,
  runtime,
  getIsEnabled: () => state.enabled,
  getStatusMessage: statusMessage,
});
const pageBehavior = createMaskedDirectPageBehavior({
  clearOwnedResources: feedback.stop,
  feedback,
  getIsEnabled: () => state.enabled,
  getIsBlocked: () => state.blockedByCore,
});
const lifecycle = createMaskedDirectLifecycle({
  bridge,
  runtime,
  state,
  settings,
  registration,
  pageBehavior,
  diagnostics,
  clearOwnedResources: feedback.stop,
});

export async function bootstrapMaskedDirectAddon() {
  const context = classifyMaskedDirectContext(location, {
    isSupportedExternalHost: (hostname) => Boolean(normalizeDirectDownloadHost(hostname)),
  });
  if (context.kind === "unsupported") return;
  if (context.kind === "f95-continue") {
    await createContinuePageController({
      getPolicy: () => standaloneAutomationPolicy.getEffectivePolicy(),
    }).run();
    return;
  }
  if (context.kind === "external-standalone") {
    await downloadPageController.runDownloadPageHooks();
    return;
  }
  const ping = await probeMaskedDirectCore({ bridge, sleep });
  if (!ping.ok) return; // Core readiness belongs only to F95 settings integration.
  registration.register();
  lifecycle.bindCommands();
  try {
    if (!(await lifecycle.refreshAccess())) {
      await standaloneAutomationPolicy.updateSettings({ enabled: false });
      return;
    }
    await lifecycle.initializeEnabledState();
    await settings.read(true);
  } catch (error) {
    registration.publishBroken(error);
  }
}
