import stateManager, { config } from "../../config.js";
import { imageRepairFeature } from "../../features/image-repair/index.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { signatureCollapseFeature } from "../../features/signature-collapse/index.js";
import { directDownloadFeature } from "../../features/direct-download/index.js";
import { toggleHijackMaskedLink } from "../../features/masked-link-skipper/index.js";
import { debouncedProcessThreadTags } from "../../core/tasksRegistry";
import { wideForumFeature } from "../../features/wideForum/index.js";
import { openSettingsDialog } from "../components/dialog.js";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";

const effectOverlayToggle = () => {
  checkOverlaySettings();
  if (!stateManager.get("isThread")) return;
  debouncedProcessThreadTags();
};

const threadOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on thread pages",
  config: "threadSettings.threadOverlayToggle",
  custom: effectOverlayToggle,
  toast: createEnabledDisabledToast("Thread overlay"),
});

function syncDirectDownloadFeatureIfEnabled() {
  if (config.threadSettings.directDownloadLinks) {
    directDownloadFeature.toggle(directDownloadFeature.isEnabled());
  }
}

function createDirectDownloadPackageSetting({ packageKey, text, tooltip, toastLabel }) {
  return createToggleSetting({
    text,
    tooltip,
    config: `threadSettings.directDownloadPackages.${packageKey}`,
    custom: syncDirectDownloadFeatureIfEnabled,
    toast: createEnabledDisabledToast(toastLabel),
  });
}

function openThreadOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Thread Overlay Settings",
    description: "Configure thread overlay visibility and styles.",
    metaMap: threadOverlaySettingsMeta,
  });
}

function openDirectDownloadSettingsDialog() {
  openSettingsDialog({
    title: "Direct Download Settings",
    description:
      "Configure direct download toggle and supported host packages. Some toggles control grouped domains needed for one flow.",
    metaMap: directDownloadSettingsMeta,
  });
}

export const threadSettingsMeta = {
  isWide: createToggleSetting({
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction - makes thread use full screen width",
    config: "threadSettings.isWide",
    custom: () => wideForumFeature.toggle(wideForumFeature.isEnabled()),
    toast: createEnabledDisabledToast("Wide Thread"),
  }),
  imgRetry: createToggleSetting({
    text: "Image Retry",
    tooltip: "Enable image retry for broken images in threads",
    config: "threadSettings.imgRetry",
    custom: () => imageRepairFeature.toggle(imageRepairFeature.isEnabled()),
    toast: createEnabledDisabledToast("Image Retry"),
  }),
  collapseSignature: createToggleSetting({
    text: "Collapsable Signatures",
    tooltip: "Make user signatures collapsable in threads",
    config: "threadSettings.collapseSignature",
    custom: () => signatureCollapseFeature.toggle(signatureCollapseFeature.isEnabled()),
    toast: createEnabledDisabledToast("Collapsable Signatures"),
  }),
  skipMaskedLink: createToggleSetting({
    text: "Skip masked link page",
    tooltip:
      "Automatically bypass the masked link intermediary page when accessing masked links \n support with direct download features",
    config: "threadSettings.skipMaskedLink",
    custom: () => toggleHijackMaskedLink(),
    toast: createEnabledDisabledToast("Skip Masked Link"),
  }),
  directDownloadSettings: {
    type: "button",
    text: "Direct download settings",
    buttonText: "Open",
    tooltip: "Open per-host direct download package configuration",
    effects: {
      custom: openDirectDownloadSettingsDialog,
    },
  },
  threadOverlaySettings: {
    type: "button",
    text: "Thread overlay settings",
    buttonText: "Open",
    tooltip: "Open thread-page overlay configuration",
    effects: {
      custom: openThreadOverlaySettingsDialog,
    },
  },
};

export const threadOverlaySettingsMeta = {
  threadOverlayToggle: threadOverlayToggleSetting,
  neutral: createToggleSetting({
    text: "Show Neutral overlay",
    tooltip: "Display neutral reaction buttons",
    config: "threadSettings.neutral",
    custom: debouncedProcessThreadTags,
    toast: createEnabledDisabledToast("Neutral"),
  }),
  preferred: createToggleSetting({
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    config: "threadSettings.preferred",
    custom: debouncedProcessThreadTags,
    toast: createEnabledDisabledToast("Preferred"),
  }),
  preferredShadow: createToggleSetting({
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    config: "threadSettings.preferredShadow",
    custom: debouncedProcessThreadTags,
    toast: createEnabledDisabledToast("Preferred Shadow"),
  }),
  excluded: createToggleSetting({
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    config: "threadSettings.excluded",
    custom: debouncedProcessThreadTags,
    toast: createEnabledDisabledToast("Excluded"),
  }),
  excludedShadow: createToggleSetting({
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    config: "threadSettings.excludedShadow",
    custom: debouncedProcessThreadTags,
    toast: createEnabledDisabledToast("Excluded Shadow"),
  }),
};

export const directDownloadSettingsMeta = {
  directDownloadLinks: createToggleSetting({
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts \n works independently outside of masked links",
    config: "threadSettings.directDownloadLinks",
    custom: () => directDownloadFeature.toggle(directDownloadFeature.isEnabled()),
    toast: createEnabledDisabledToast("Direct Download Links"),
  }),
  buzzheavierPackage: createDirectDownloadPackageSetting({
    packageKey: "buzzheavier",
    text: "Buzzheavier package",
    tooltip: "Controls buzzheavier.com resolver + trashbytes.net direct link flow",
    toastLabel: "Buzzheavier package",
  }),
  gofilePackage: createDirectDownloadPackageSetting({
    packageKey: "gofile",
    text: "Gofile package",
    tooltip: "Controls gofile.io + api.gofile.com flow",
    toastLabel: "Gofile package",
  }),
  pixeldrainPackage: createDirectDownloadPackageSetting({
    packageKey: "pixeldrain",
    text: "Pixeldrain",
    tooltip: "Controls pixeldrain.com flow",
    toastLabel: "Pixeldrain",
  }),
  datanodesPackage: createDirectDownloadPackageSetting({
    packageKey: "datanodes",
    text: "Datanodes",
    tooltip: "Controls datanodes.to flow",
    toastLabel: "Datanodes",
  }),
};
