import { config, defaultLatestSettings, defaultOverlaySettings } from "../../config.js";
import { createStyledFeature } from "../../core/createStyledFeature.js";
import { reprocessLatestTilesAfterSettingsChange } from "../../ui/settingsRuntime/effectTasks.js";
import { checkOverlaySettings } from "../../services/safetyService.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { openReorderDialog, openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";
import {
  enableLatestOverlay,
  disableLatestOverlay,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";
import { normalizeOverlayColorOrder } from "./overlayOrder.js";
import featureCss from "./style.css";

function effectReprocessAllTiles() {
  // Avoid capturing an undefined function reference during module init if there’s
  // a circular load between the settings-effect module and this feature.
  reprocessLatestTilesAfterSettingsChange();
}

function runEnableLatestOverlay() {
  enableLatestOverlay();
}

function runDisableLatestOverlay() {
  disableLatestOverlay();
}
export const overlaySettingsMeta = {
  _header_visibility: {
    type: "header",
    text: "Overlay Visibility Settings",
  },
  completed: createToggleSetting({
    text: "Completed",
    tooltip: "Show overlay for completed threads",
    config: "overlaySettings.completed",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Completed"),
  }),
  onhold: createToggleSetting({
    text: "On Hold",
    tooltip: "Show overlay for threads on hold",
    config: "overlaySettings.onhold",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("On Hold"),
  }),
  abandoned: createToggleSetting({
    text: "Abandoned",
    tooltip: "Show overlay for abandoned threads",
    config: "overlaySettings.abandoned",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Abandoned"),
  }),
  highVersion: createToggleSetting({
    text: "High Version tag",
    tooltip: "Show overlay for game threads with higher version than your set minimum",
    config: "overlaySettings.highVersion",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("High Version"),
  }),
  invalidVersion: createToggleSetting({
    text: "Invalid Version tag",
    tooltip: "Show overlay for threads with invalid version format",
    config: "overlaySettings.invalidVersion",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Invalid Version"),
  }),
  preferred: createToggleSetting({
    text: "Preferred",
    tooltip: "Show overlay for threads you've marked as preferred",
    config: "overlaySettings.preferred",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Preferred"),
  }),
  excluded: createToggleSetting({
    text: "Excluded",
    tooltip: "Show overlay for threads you've marked as excluded",
    config: "overlaySettings.excluded",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Excluded"),
  }),
  overlayText: createToggleSetting({
    text: "Text overlay on tiles",
    tooltip: "Display status text directly over the thread thumbnail",
    config: "overlaySettings.overlayText",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Overlay Text"),
  }),
  _header_engagement: {
    type: "header",
    text: "Rating & Engagement Highlights",
  },
  ratingHighlight: createToggleSetting({
    text: "Highlight rating",
    tooltip:
      "Color-code thread ratings based on threshold (green = above, yellow = medium, red = low)",
    config: "overlaySettings.ratingHighlight",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Rating Highlight"),
  }),
  engagementHighlight: createToggleSetting({
    text: "Highlight engagement ratio",
    tooltip:
      "Color-code engagement based on likes-to-views ratio (likes per 1000 views) using the threshold below",
    config: "overlaySettings.engagementHighlight",
    custom: effectReprocessAllTiles,
    toast: createEnabledDisabledToast("Engagement Highlight"),
  }),
};
const OVERLAY_KEY_LABELS = {
  excluded: "Excluded",
  preferred: "Preferred",
  completed: "Completed",
  onhold: "On Hold",
  abandoned: "Abandoned",
  highVersion: "High Version",
  invalidVersion: "Invalid Version",
};

async function openOverlayColorOrderEditor() {
  const currentOrder = normalizeOverlayColorOrder(config.latestSettings.latestOverlayColorOrder);
  const items = currentOrder.map((key) => ({ key, label: OVERLAY_KEY_LABELS[key] || key }));

  const result = await openReorderDialog({
    title: "Overlay Color Order",
    description: "Drag or use arrows to set overlay color priority (top = highest priority).",
    items,
    submitLabel: "Save",
    cancelLabel: "Cancel",
  });

  if (result === null) return;

  const persisted = await saveConfigKeys({
    latestSettings: { ...config.latestSettings, latestOverlayColorOrder: [...result] },
  });
  if (!persisted.committed) return;
  effectReprocessAllTiles();
  showToast("Overlay color order updated.");
}

const effectOverlayToggle = () => {
  checkOverlaySettings();
  latestOverlayFeature.sync();
};
const latestOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on the Latest Updates page",
  config: "latestSettings.latestOverlayToggle",
  custom: effectOverlayToggle,
  toast: createEnabledDisabledToast("Latest page overlay"),
});

const minVersionSetting = {
  type: "number",
  text: "Minimum version overlay",
  tooltip: "Show overlay if thread version is below this value (e.g., 0.5 = version 0.5)",
  config: "latestSettings.minVersion",
  input: {
    min: 0,
    step: 0.1,
  },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Min Version set to ${v}`,
  },
};
const latestOverlayColorOrderSetting = {
  type: "button",
  text: "Overlay color order",
  buttonText: "Edit",
  tooltip: "Choose the stacking order for multi-status overlay colors",
  effects: {
    custom: openOverlayColorOrderEditor,
  },
};
const othersOverlaySettingsHeader = {
  type: "header",
  text: "Other Overlay Settings",
};
const ratingThresholdSetting = {
  type: "number",
  text: "Rating highlight threshold",
  tooltip:
    "Rating values above this are green, above half are yellow, below are red (e.g., 4 = above 4 is green, above 2 is yellow)",
  config: "latestSettings.ratingHighlightThreshold",
  input: {
    min: 0.5,
    step: 0.5,
  },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Rating threshold set to ${v}`,
  },
};
const engagementRatioThresholdSetting = {
  type: "number",
  text: "Engagement ratio threshold",
  tooltip:
    "Engagement ratio (likes per 1000 views) above this is green, above half is yellow, below is red (e.g., 6 = above 6 is green, above 3 is yellow)",
  config: "latestSettings.engagementRatioThreshold",
  input: {
    min: 0.5,
    step: 0.5,
  },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Engagement ratio threshold set to ${v}`,
  },
};

// Score weight settings for each overlay type
const scoringWeightsHeader = {
  type: "header",
  text: "Scoring Weights",
};
const tagWeightsHeader = {
  type: "header",
  text: "Tags Weights",
};

const enableScoreWeights = {
  type: "toggle",
  text: "Enable score weights",
  tooltip: "Apply custom weights to how different tags affect the tile score",
  config: "latestSettings.enableScoreWeights",
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Score weights ${v ? "enabled" : "disabled"}`,
  },
};
export const ratingWeightSetting = {
  type: "number",
  text: "Rating Pillar Weight",
  tooltip: "Importance of Site Rating in the final 0-10 score calculation.",
  config: "latestSettings.priorityWeights.rating",
  input: { min: 0, step: 1 },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Rating weight set to ${v}`,
  },
};

export const engagementWeightSetting = {
  type: "number",
  text: "Engagement Pillar Weight",
  tooltip: "Importance of Community Engagement in the final 0-10 score calculation.",
  config: "latestSettings.priorityWeights.engagement",
  input: { min: 0, step: 1 },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Engagement weight set to ${v}`,
  },
};

export const tagWeightSetting = {
  type: "number",
  text: "Tags Pillar Weight",
  tooltip:
    "Importance of Tag states (preferred, excluded, etc.) in the final 0-10 score calculation.",
  config: "latestSettings.priorityWeights.tags",
  input: { min: 0, step: 1 },
  effects: {
    custom: effectReprocessAllTiles,
    toast: (v) => `Tags weight set to ${v}`,
  },
};
export const modifierPreferredSetting = {
  type: "number",
  text: "Preferred Tag Modifier",
  tooltip: "Score increase added for each matching preferred tag.",
  config: "latestSettings.tagModifiers.preferred",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `Preferred modifier: ${v}` },
};

export const modifierCompletedSetting = {
  type: "number",
  text: "Completed Tag Modifier",
  tooltip: "Score increase added for each completed tag.",
  config: "latestSettings.tagModifiers.completed",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `Completed modifier: ${v}` },
};

export const modifierHighVersionSetting = {
  type: "number",
  text: "High Version Tag Modifier",
  tooltip: "Score increase added for high version tags.",
  config: "latestSettings.tagModifiers.highVersion",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `High version modifier: ${v}` },
};
export const modifierOnholdSetting = {
  type: "number",
  text: "On-Hold Tag Modifier",
  tooltip: "Score penalty added for on-hold tags.",
  config: "latestSettings.tagModifiers.onhold",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `On-hold modifier: ${v}` },
};

export const modifierAbandonedSetting = {
  type: "number",
  text: "Abandoned Tag Modifier",
  tooltip: "Score penalty added for abandoned tags.",
  config: "latestSettings.tagModifiers.abandoned",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `Abandoned modifier: ${v}` },
};

export const modifierExcludedSetting = {
  type: "number",
  text: "Excluded Tag Modifier",
  tooltip: "Heavy score penalty added for excluded tags.",
  config: "latestSettings.tagModifiers.excluded",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `Excluded modifier: ${v}` },
};

export const modifierInvalidVersionSetting = {
  type: "number",
  text: "Invalid Version Modifier",
  tooltip: "Modifier for invalid versions (usually 0.0).",
  config: "latestSettings.tagModifiers.invalidVersion",
  input: { step: 0.1 },
  effects: { custom: effectReprocessAllTiles, toast: (v) => `Invalid version modifier: ${v}` },
};
export const resetLatestOverlaySettingsButton = {
  type: "button",
  text: "Reset to defaults",
  buttonText: "Reset",
  tooltip: "Reset all latest overlay settings to default values",
  effects: {
    custom: resetConfigToDefaults,
  },
};
export const overlayStyleSetting = {
  type: "select",
  text: "Overlay style",
  tooltip: "Choose how overlay colors are applied to tiles (strip or border)",
  config: "latestSettings.latestOverlayStyle",
  options: [
    { key: "strip", label: "Bottom strip" },
    { key: "border", label: "Colored border" },
  ],
  effects: {
    custom: (v) => {
      effectReprocessAllTiles();
      showToast(`Overlay style saved: ${v}`);
    },
  },
};
const latestOverlaySettingsDialogMeta = {
  latestOverlayToggle: latestOverlayToggleSetting,
  _header_visibility: overlaySettingsMeta._header_visibility,
  completed: overlaySettingsMeta.completed,
  onhold: overlaySettingsMeta.onhold,
  abandoned: overlaySettingsMeta.abandoned,
  highVersion: overlaySettingsMeta.highVersion,
  invalidVersion: overlaySettingsMeta.invalidVersion,
  preferred: overlaySettingsMeta.preferred,
  excluded: overlaySettingsMeta.excluded,
  overlayText: overlaySettingsMeta.overlayText,
  _header_engagement: overlaySettingsMeta._header_engagement,
  ratingHighlight: overlaySettingsMeta.ratingHighlight,
  ratingThreshold: ratingThresholdSetting,
  engagementHighlight: overlaySettingsMeta.engagementHighlight,
  engagementRatioThreshold: engagementRatioThresholdSetting,
  _header_weights: scoringWeightsHeader,
  enableScoreWeights: enableScoreWeights,
  ratingWeight: ratingWeightSetting,
  engagementWeight: engagementWeightSetting,
  tagWeight: tagWeightSetting,
  _header_tag_weights: tagWeightsHeader,
  modifierPreferred: modifierPreferredSetting,
  modifierCompleted: modifierCompletedSetting,
  modifierHighVersion: modifierHighVersionSetting,
  modifierOnhold: modifierOnholdSetting,
  modifierAbandoned: modifierAbandonedSetting,
  modifierExcluded: modifierExcludedSetting,
  modifierInvalidVersion: modifierInvalidVersionSetting,
  _header_others: othersOverlaySettingsHeader,
  minVersion: minVersionSetting,
  latestOverlayColorOrder: latestOverlayColorOrderSetting,
  overlayStyle: overlayStyleSetting,
  resetButton: resetLatestOverlaySettingsButton,
};
let latestOverlaySettingsDialog = null;

function openLatestOverlaySettingsDialog() {
  latestOverlaySettingsDialog = openSettingsDialog({
    title: "Latest Overlay Settings",
    description: "Configure overlay toggle, labels, filters, and color order.",
    metaMap: latestOverlaySettingsDialogMeta,
  });
}
export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  id: "latest-raw-capture",
  configPath: "latestSettings.latestOverlayToggle",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  bootstrapMode: "fast",
  fastCapture: {
    urlIncludes: "latest_data.php",
    dataPath: "msg.data",
    transport: "any",
    mode: "latest",
    ttlMs: 30000,
  },
  styleCss: featureCss,
  enable: runEnableLatestOverlay,
  disable: runDisableLatestOverlay,
  settingsUi: {
    id: "latest-overlay",
    sectionId: "latest",
    metaMaps: [
      {
        latestOverlaySettings: {
          type: "button",
          text: "Latest overlay settings",
          buttonText: "Open",
          tooltip: "Open latest-page overlay configuration",
          effects: {
            custom: openLatestOverlaySettingsDialog,
          },
        },
      },
    ],
  },
});

// Re-export helpers and lifecycle functions for other parts of the app
export { reprocessAllTiles, resetTile, processTile };

let resetConfigConfirmUntil = 0;
async function resetConfigToDefaults() {
  const now = Date.now();
  if (now > resetConfigConfirmUntil) {
    resetConfigConfirmUntil = now + 3000;
    showToast("Press reset again within 3s to confirm.");
    return;
  }
  resetConfigConfirmUntil = 0;

  const nextLatestSettings = {
    ...config.latestSettings,
    latestOverlayToggle: defaultLatestSettings.latestOverlayToggle,
    minVersion: defaultLatestSettings.minVersion,
    latestOverlayColorOrder: [...defaultLatestSettings.latestOverlayColorOrder],
    latestOverlayStyle: defaultLatestSettings.latestOverlayStyle,
    ratingHighlightThreshold: defaultLatestSettings.ratingHighlightThreshold,
    engagementRatioThreshold: defaultLatestSettings.engagementRatioThreshold,
    enableScoreWeights: defaultLatestSettings.enableScoreWeights,
    priorityWeights: { ...defaultLatestSettings.priorityWeights },
    tagModifiers: { ...defaultLatestSettings.tagModifiers },
  };
  const persisted = await saveConfigKeys({
    latestSettings: nextLatestSettings,
    overlaySettings: { ...defaultOverlaySettings },
  });
  if (!persisted.committed) return;
  latestOverlaySettingsDialog?.close();
  latestOverlaySettingsDialog = null;
  checkOverlaySettings();
  effectReprocessAllTiles();
  showToast("Latest overlay settings have been reset to default.");
}
