import stateManager from "../../config.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { signatureCollapseFeature } from "../../features/signature-collapse/index.js";
import { debouncedProcessThreadTags } from "../../core/tasksRegistry";
import { wideForumFeature } from "../../features/wideForum/index.js";
import { openSettingsDialog } from "../components/dialog.js";
import { buildSettingsMap, createEnabledDisabledToast, createToggleSetting } from "./metaFactory";

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

function openThreadOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Thread Overlay Settings",
    description: "Configure thread overlay visibility and styles.",
    metaMap: threadOverlaySettingsMeta,
  });
}

const THREAD_SETTINGS_TOGGLE_DEFS = [
  {
    key: "isWide",
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction - makes thread use full screen width",
    config: "threadSettings.isWide",
    custom: () => wideForumFeature.toggle(wideForumFeature.isEnabled()),
    toastLabel: "Wide Thread",
  },
  {
    key: "collapseSignature",
    text: "Collapsable Signatures",
    tooltip: "Make user signatures collapsable in threads",
    config: "threadSettings.collapseSignature",
    custom: () => signatureCollapseFeature.toggle(signatureCollapseFeature.isEnabled()),
    toastLabel: "Collapsable Signatures",
  },
];

const THREAD_OVERLAY_TOGGLE_DEFS = [
  {
    key: "marked",
    text: "Show Marked overlay",
    tooltip: "Display marked tags overlay",
    config: "threadSettings.marked",
    toastLabel: "Marked",
  },
  {
    key: "preferred",
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    config: "threadSettings.preferred",
    toastLabel: "Preferred",
  },
  {
    key: "preferredShadow",
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    config: "threadSettings.preferredShadow",
    toastLabel: "Preferred Shadow",
  },
  {
    key: "excluded",
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    config: "threadSettings.excluded",
    toastLabel: "Excluded",
  },
  {
    key: "excludedShadow",
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    config: "threadSettings.excludedShadow",
    toastLabel: "Excluded Shadow",
  },
];

const threadSettingsToggleMeta = buildSettingsMap(
  THREAD_SETTINGS_TOGGLE_DEFS.map(({ key, text, tooltip, config, custom, toastLabel }) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config,
      custom,
      toast: createEnabledDisabledToast(toastLabel),
    }),
  ]),
);

const threadOverlayToggleMeta = buildSettingsMap(
  THREAD_OVERLAY_TOGGLE_DEFS.map(({ key, text, tooltip, config, toastLabel }) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config,
      custom: debouncedProcessThreadTags,
      toast: createEnabledDisabledToast(toastLabel),
    }),
  ]),
);

export const threadSettingsMeta = {
  ...threadSettingsToggleMeta,
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
  ...threadOverlayToggleMeta,
};
