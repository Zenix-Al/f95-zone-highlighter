import { createStyledFeature } from "../../core/createStyledFeature.js";
import { stateManager, config, STATUS } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { isValidTag } from "../../utils/validators.js";
import featureCss from "./style.css";
import { resolveTagStatus } from "../../utils/resolveTagStatus.js";
import { openSettingsDialog } from "../../ui/components/dialog.js";
import {
  buildSettingsMap,
  createEnabledDisabledToast,
  createToggleSetting,
} from "../../ui/settings/metaFactory.js";
import { checkOverlaySettings } from "../../services/safetyService.js";
import { refreshThreadOverlayAfterSettingsChange } from "../../ui/settingsRuntime/effectTasks.js";

function processThreadTag(tagElement) {
  const tagName = String(tagElement.innerHTML || "").trim();
  if (!isValidTag(tagName)) return; // skip malformed tag text

  const tag = config.tags.find((t) => t.name === tagName);
  const status = tag ? resolveTagStatus(Number(tag.id)) : null;

  Object.values(STATUS).forEach((cls) => tagElement.classList.remove(cls));

  const { preferred, preferredShadow, excluded, excludedShadow, marked } = config.threadSettings;

  if (status === STATUS.PREFERRED && preferred) {
    tagElement.classList.add(STATUS.PREFERRED);
    if (preferredShadow) tagElement.classList.add(STATUS.PREFERRED_SHADOW);
  } else if (status === STATUS.EXCLUDED && excluded) {
    tagElement.classList.add(STATUS.EXCLUDED);
    if (excludedShadow) tagElement.classList.add(STATUS.EXCLUDED_SHADOW);
  } else if (status === STATUS.MARKED && marked) {
    tagElement.classList.add(STATUS.MARKED);
  }
}

function enableThreadOverlay() {
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) return;

  const tags = tagList.getElementsByClassName("tagItem");
  Array.from(tags).forEach(processThreadTag);
}

function disableThreadOverlay() {
  const tagList = document.querySelector(".js-tagList");
  if (!tagList) return;

  const tags = tagList.getElementsByClassName("tagItem");
  Array.from(tags).forEach((tag) => {
    Object.values(STATUS).forEach((cls) => {
      tag.classList.remove(cls);
    });
  });
  debugLog("Thread Overlay", "Disabled - tags returned to default style");
}
const effectOverlayToggle = () => {
  checkOverlaySettings();
  if (!stateManager.get("isThread")) return;
  refreshThreadOverlayAfterSettingsChange();
};
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
const threadOverlayToggleMeta = buildSettingsMap(
  THREAD_OVERLAY_TOGGLE_DEFS.map(({ key, text, tooltip, config, toastLabel }) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config,
      custom: refreshThreadOverlayAfterSettingsChange,
      toast: createEnabledDisabledToast(toastLabel),
    }),
  ]),
);
const threadOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on thread pages",
  config: "threadSettings.threadOverlayToggle",
  custom: effectOverlayToggle,
  toast: createEnabledDisabledToast("Thread overlay"),
});
export const threadOverlaySettingsMeta = {
  threadOverlayToggle: threadOverlayToggleSetting,
  ...threadOverlayToggleMeta,
};

function openThreadOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Thread Overlay Settings",
    description: "Configure thread overlay visibility and styles.",
    metaMap: threadOverlaySettingsMeta,
  });
}
export const threadOverlayFeature = createStyledFeature("Thread Overlay", {
  configPath: "threadSettings.threadOverlayToggle",
  pageScopes: ["isThread"],
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: enableThreadOverlay,
  disable: disableThreadOverlay,
  settingsUi: {
    id: "thread-overlay",
    sectionId: "thread",
    metaMaps: [
      {
        threadOverlaySettings: {
          type: "button",
          text: "Thread overlay settings",
          buttonText: "Open",
          tooltip: "Open thread-page overlay configuration",
          effects: {
            custom: openThreadOverlaySettingsDialog,
          },
        },
      },
    ],
  },
});
