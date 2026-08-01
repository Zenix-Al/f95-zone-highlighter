import { config, defaultLatestSettings, defaultOverlaySettings } from "../../config.js";
import { checkOverlaySettings } from "../../services/safetyService.js";
import { updateConfig } from "../../services/settingsService.js";
import { openReorderDialog, openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";
import { reprocessLatestTilesAfterSettingsChange } from "../../ui/settingsRuntime/effectTasks.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";
import {
  getSettingsMetadataByOwner,
  registerSettingsMetadata,
} from "../../ui/settings/metaRegistry.js";
import { normalizeOverlayColorOrder } from "./overlayOrder.js";

const OVERLAY_KEY_LABELS = {
  excluded: "Excluded",
  preferred: "Preferred",
  completed: "Completed",
  onhold: "On Hold",
  abandoned: "Abandoned",
  highVersion: "High Version",
  invalidVersion: "Invalid Version",
};

let latestOverlaySettingsDialog = null;
let resetConfigConfirmUntil = 0;
let syncLatestOverlayFeature = null;

// Settings effects and actions

function reprocessTilesEffect() {
  // Resolve through the settings-effect owner to preserve its debounced lifecycle.
  reprocessLatestTilesAfterSettingsChange();
}

function toggleOverlayEffect() {
  checkOverlaySettings();
  syncLatestOverlayFeature();
}

function overlayStyleEffect(value, { notify = true } = {}) {
  reprocessTilesEffect();
  if (notify) showToast(`Overlay style saved: ${value}`);
}

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

  const persisted = await updateConfig((draft) => {
    draft.latestSettings.latestOverlayColorOrder = [...result];
  }, { origin: "latest-overlay:color-order" });
  if (!persisted.committed) return;
  showToast("Overlay color order updated.");
}

function openLatestOverlaySettingsDialog() {
  latestOverlaySettingsDialog = openSettingsDialog({
    title: "Latest Overlay Settings",
    description: "Configure overlay toggle, labels, filters, and color order.",
    metaMap: latestOverlaySettingsDialogMeta,
  });
}

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
  const persisted = await updateConfig((draft) => {
    draft.latestSettings = nextLatestSettings;
    draft.overlaySettings = { ...defaultOverlaySettings };
  }, { origin: "latest-overlay:reset" });
  if (!persisted.committed) return;
  latestOverlaySettingsDialog?.close();
  latestOverlaySettingsDialog = null;
  checkOverlaySettings();
  showToast("Latest overlay settings have been reset to default.");
}

// Shared overlay visibility metadata

const visibilityToggleDefinitions = [
  ["completed", "Completed", "Show overlay for completed threads", "Completed"],
  ["onhold", "On Hold", "Show overlay for threads on hold", "On Hold"],
  ["abandoned", "Abandoned", "Show overlay for abandoned threads", "Abandoned"],
  ["highVersion", "High Version tag", "Show overlay for game threads with higher version than your set minimum", "High Version"],
  ["invalidVersion", "Invalid Version tag", "Show overlay for threads with invalid version format", "Invalid Version"],
  ["preferred", "Preferred", "Show overlay for threads you've marked as preferred", "Preferred"],
  ["excluded", "Excluded", "Show overlay for threads you've marked as excluded", "Excluded"],
  ["overlayText", "Text overlay on tiles", "Display status text directly over the thread thumbnail", "Overlay Text"],
];

const highlightToggleDefinitions = [
  ["ratingHighlight", "Highlight rating", "Color-code thread ratings based on threshold (green = above, yellow = medium, red = low)", "Rating Highlight"],
  ["engagementHighlight", "Highlight engagement ratio", "Color-code engagement based on likes-to-views ratio (likes per 1000 views) using the threshold below", "Engagement Highlight"],
];

function buildOverlayToggles(definitions) {
  return Object.fromEntries(definitions.map(([key, text, tooltip, toast]) => [
    key,
    createToggleSetting({
      text,
      tooltip,
      config: `overlaySettings.${key}`,
      custom: reprocessTilesEffect,
      toast: createEnabledDisabledToast(toast),
    }),
  ]));
}

export const overlaySettingsMeta = {
  _header_visibility: {
    type: "header",
    text: "Overlay Visibility Settings",
  },
  ...buildOverlayToggles(visibilityToggleDefinitions),
  _header_engagement: {
    type: "header",
    text: "Rating & Engagement Highlights",
  },
  ...buildOverlayToggles(highlightToggleDefinitions),
};

// Latest Overlay dialog metadata

const latestOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on the Latest Updates page",
  config: "latestSettings.latestOverlayToggle",
  custom: toggleOverlayEffect,
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
    custom: reprocessTilesEffect,
    toast: (value) => `Min Version set to ${value}`,
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
    custom: reprocessTilesEffect,
    toast: (value) => `Rating threshold set to ${value}`,
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
    custom: reprocessTilesEffect,
    toast: (value) => `Engagement ratio threshold set to ${value}`,
  },
};

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
    custom: reprocessTilesEffect,
    toast: (value) => `Score weights ${value ? "enabled" : "disabled"}`,
  },
};

function createNumberSettings(path, input, definitions) {
  return definitions.map(([key, text, tooltip, toast]) => ({
    type: "number",
    text,
    tooltip,
    config: `latestSettings.${path}.${key}`,
    input,
    effects: {
      custom: reprocessTilesEffect,
      toast: (value) => `${toast}${value}`,
    },
  }));
}

export const [ratingWeightSetting, engagementWeightSetting, tagWeightSetting] =
  createNumberSettings("priorityWeights", { min: 0, step: 1 }, [
    ["rating", "Rating Pillar Weight", "Importance of Site Rating in the final 0-10 score calculation.", "Rating weight set to "],
    ["engagement", "Engagement Pillar Weight", "Importance of Community Engagement in the final 0-10 score calculation.", "Engagement weight set to "],
    ["tags", "Tags Pillar Weight", "Importance of Tag states (preferred, excluded, etc.) in the final 0-10 score calculation.", "Tags weight set to "],
  ]);

export const [
  modifierPreferredSetting,
  modifierCompletedSetting,
  modifierHighVersionSetting,
  modifierOnholdSetting,
  modifierAbandonedSetting,
  modifierExcludedSetting,
  modifierInvalidVersionSetting,
] = createNumberSettings("tagModifiers", { step: 0.1 }, [
  ["preferred", "Preferred Tag Modifier", "Score increase added for each matching preferred tag.", "Preferred modifier: "],
  ["completed", "Completed Tag Modifier", "Score increase added for each completed tag.", "Completed modifier: "],
  ["highVersion", "High Version Tag Modifier", "Score increase added for high version tags.", "High version modifier: "],
  ["onhold", "On-Hold Tag Modifier", "Score penalty added for on-hold tags.", "On-hold modifier: "],
  ["abandoned", "Abandoned Tag Modifier", "Score penalty added for abandoned tags.", "Abandoned modifier: "],
  ["excluded", "Excluded Tag Modifier", "Heavy score penalty added for excluded tags.", "Excluded modifier: "],
  ["invalidVersion", "Invalid Version Modifier", "Modifier for invalid versions (usually 0.0).", "Invalid version modifier: "],
]);

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
    custom: overlayStyleEffect,
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

const latestOverlayFeatureSettingsUi = {
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
};

// Metadata registration and feature integration

function registerLatestOverlaySettingsMetadata() {
  if (getSettingsMetadataByOwner("feature:latest-overlay-dialog").length === 0) {
    registerSettingsMetadata(
      "latest-overlay-dialog",
      Object.fromEntries(
        Object.entries(latestOverlaySettingsDialogMeta)
          .map(([key, meta]) => [`latestOverlay.${key}`, meta]),
      ),
      "feature:latest-overlay-dialog",
    );
  }

  if (getSettingsMetadataByOwner("feature:latest-overlay-runtime").length === 0) {
    registerSettingsMetadata(
      "latest-overlay-runtime",
      {
        latestOverlayColorOrderEffect: {
          config: "latestSettings.latestOverlayColorOrder",
          effects: { custom: reprocessTilesEffect },
        },
      },
      "feature:latest-overlay-runtime",
    );
  }
}

export function initializeLatestOverlaySettings({ syncFeature }) {
  syncLatestOverlayFeature = syncFeature;
  registerLatestOverlaySettingsMetadata();
  return latestOverlayFeatureSettingsUi;
}
