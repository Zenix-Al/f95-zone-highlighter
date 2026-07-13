import {
  config,
  defaultAddonsApiThrottleSettings,
} from "../../config.js";
import { openConfirmDialog, openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";
import {
  createEnabledDisabledToast,
  createToggleSetting,
} from "../../ui/settings/metaFactory.js";
import { contributeToSection } from "../../ui/settingsRuntime/sectionsRegistry.js";
import { saveConfigKeys } from "../settingsService.js";
import {
  disableAddonsService,
  initAddonsConsoleBridge,
  refreshAddonSecurityPolicies,
} from "../addonsService.js";

const serviceAccessHeader = {
  type: "header",
  text: "Service Access",
};

const bridgeApiThrottleHeader = {
  type: "header",
  text: "Bridge API Throttle",
};

const disableAddonsServiceSetting = createToggleSetting({
  text: "Disable add-ons service",
  tooltip:
    "Disable the add-ons bridge/API entirely. Running add-ons on this page may keep running until you refresh.",
  config: "globalSettings.disableAddonsService",
  beforeChange: async ({ previousValue, nextValue }) => {
    if (previousValue === true || nextValue !== true) {
      return true;
    }
    return openConfirmDialog({
      title: "Disable add-ons service?",
      description:
        "This disables the add-ons API/bridge. Add-ons already running on this page may need a refresh to fully stop.",
      confirmLabel: "Disable service",
      cancelLabel: "Cancel",
    });
  },
  custom: (value) => {
    if (value) {
      disableAddonsService();
      return;
    }
    initAddonsConsoleBridge();
  },
  toast: (value) =>
    value
      ? "Add-ons service disabled. Refresh the page to fully unload running add-ons."
      : "Add-ons service enabled. Refresh the page to load add-ons.",
});

const allowUntrustedAddonsSetting = createToggleSetting({
  text: "Allow untrusted add-ons",
  tooltip:
    "Allow unknown add-ons to access the add-ons API. Not recommended unless you fully trust the script.",
  config: "globalSettings.allowUntrustedAddons",
  beforeChange: async ({ previousValue, nextValue }) => {
    if (previousValue === true || nextValue !== true) {
      return true;
    }
    return openConfirmDialog({
      title: "Allow untrusted add-ons?",
      description:
        "This enables unknown scripts to access your add-ons API. Only continue if you fully trust the scripts you install.",
      confirmLabel: "I understand, enable",
      cancelLabel: "Cancel",
    });
  },
  custom: () => {
    refreshAddonSecurityPolicies();
  },
  toast: createEnabledDisabledToast("Untrusted add-ons", {
    enabled: "allowed with limited API",
    disabled: "blocked unless trusted",
  }),
});

const coreActionRateMaxSetting = {
  type: "number",
  text: "Core actions per window",
  tooltip:
    "Maximum add-on core API calls allowed per add-on within the window below. Higher values speed up bulk work such as library imports.",
  config: "addons.service.apiThrottle.coreActionRateMax",
  input: { min: 1, max: 1000, step: 1 },
  effects: {
    toast: (value) => `Core action rate limit set to ${value} requests per window`,
  },
};

const coreActionWindowMsSetting = {
  type: "number",
  text: "Core action window (ms)",
  tooltip:
    "Rolling time window used for the core action rate limit. Changes apply live to new add-on requests.",
  config: "addons.service.apiThrottle.coreActionWindowMs",
  input: { min: 250, max: 60000, step: 250 },
  effects: {
    toast: (value) => `Core action rate window set to ${value}ms`,
  },
};

const coreActionMaxConcurrentSetting = {
  type: "number",
  text: "Max concurrent core actions",
  tooltip:
    "Maximum simultaneous core API requests allowed per add-on before new requests are rejected as too many concurrent requests.",
  config: "addons.service.apiThrottle.coreActionMaxConcurrent",
  input: { min: 1, max: 100, step: 1 },
  effects: {
    toast: (value) => `Core action concurrency limit set to ${value}`,
  },
};

let resetThrottleConfirmUntil = 0;
let addonsServiceSettingsDialog = null;

async function resetAddonsApiThrottleDefaults() {
  const now = Date.now();
  if (now > resetThrottleConfirmUntil) {
    resetThrottleConfirmUntil = now + 3000;
    showToast("Press reset again within 3s to confirm.");
    return;
  }

  resetThrottleConfirmUntil = 0;
  const addons = JSON.parse(JSON.stringify(config.addons || {}));
  const serviceConfig = addons.service && typeof addons.service === "object" ? addons.service : {};
  addons.service = {
    ...serviceConfig,
    apiThrottle: { ...defaultAddonsApiThrottleSettings },
  };
  const persisted = await saveConfigKeys({ addons });
  if (!persisted.committed) return;
  addonsServiceSettingsDialog?.close();
  addonsServiceSettingsDialog = null;
  showToast("Add-ons API throttle settings reset to default.");
}

const resetAddonsApiThrottleSetting = {
  type: "button",
  text: "Reset API throttle defaults",
  buttonText: "Reset",
  tooltip: "Reset add-ons core API rate limiting back to its default values.",
  effects: {
    custom: resetAddonsApiThrottleDefaults,
  },
};

const addonsServiceSettingsDialogMeta = {
  _header_service_access: serviceAccessHeader,
  disableAddonsService: disableAddonsServiceSetting,
  allowUntrustedAddons: allowUntrustedAddonsSetting,
  _header_bridge_api_throttle: bridgeApiThrottleHeader,
  coreActionRateMax: coreActionRateMaxSetting,
  coreActionWindowMs: coreActionWindowMsSetting,
  coreActionMaxConcurrent: coreActionMaxConcurrentSetting,
  resetApiThrottle: resetAddonsApiThrottleSetting,
};

function openAddonsServiceSettingsDialog() {
  addonsServiceSettingsDialog = openSettingsDialog({
    title: "Add-ons Service Settings",
    description:
      "Configure add-on bridge access and the live core API throttle used by installed add-ons.",
    metaMap: addonsServiceSettingsDialogMeta,
  });
}

contributeToSection("global", {
  addonsServiceSettings: {
    type: "button",
    text: "Add-ons service settings",
    buttonText: "Open",
    tooltip: "Configure add-ons bridge access and request throttling",
    effects: {
      custom: openAddonsServiceSettingsDialog,
    },
  },
}, "addons:service-settings");
