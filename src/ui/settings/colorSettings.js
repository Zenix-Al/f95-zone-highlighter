import { queuedProcessAllTilesReset, queuedProcessThreadTags } from "../../core/tasksRegistry";
import { updateColorStyle } from "./updateColorStyle";

const executeBothQueuedTasks = () => {
  queuedProcessAllTilesReset();
  queuedProcessThreadTags();
};
// Per-color effect functions
export function effectCompletedColor() {
  updateColorStyle("completedColor");
  executeBothQueuedTasks();
}

export function effectOnHoldColor() {
  updateColorStyle("onholdColor");
  executeBothQueuedTasks();
}

export function effectAbandonedColor() {
  updateColorStyle("abandonedColor");
  executeBothQueuedTasks();
}

export function effectHighVersionColor() {
  updateColorStyle("highVersionColor");
  executeBothQueuedTasks();
}

export function effectInvalidVersionColor() {
  updateColorStyle("invalidVersionColor");
  executeBothQueuedTasks();
}

export function effectTileInfoColor() {
  updateColorStyle("tileInfoColor");
  executeBothQueuedTasks();
}

export function effectTileHeaderColor() {
  updateColorStyle("tileHeaderColor");
  executeBothQueuedTasks();
}

export function effectPreferredColor() {
  updateColorStyle("preferredColor");
  executeBothQueuedTasks();
}

export function effectPreferredTextColor() {
  updateColorStyle("preferredTextColor");
  executeBothQueuedTasks();
}

export function effectExcludedColor() {
  updateColorStyle("excludedColor");
  executeBothQueuedTasks();
}

export function effectExcludedTextColor() {
  updateColorStyle("excludedTextColor");
  executeBothQueuedTasks();
}

export function effectNeutralColor() {
  updateColorStyle("neutralColor");
  executeBothQueuedTasks();
}

export function effectNeutralTextColor() {
  updateColorStyle("neutralTextColor");
  executeBothQueuedTasks();
}

export const colorSettingsMeta = {
  completedColor: {
    type: "color",
    text: "Completed",
    config: "color.completed",
    effects: {
      custom: effectCompletedColor,
      toast: () => "Completed color updated",
    },
  },

  onholdColor: {
    type: "color",
    text: "On Hold",
    config: "color.onhold",
    effects: {
      custom: effectOnHoldColor,
      toast: () => "On Hold color updated",
    },
  },

  abandonedColor: {
    type: "color",
    text: "Abandoned",
    config: "color.abandoned",
    effects: {
      custom: effectAbandonedColor,
      toast: () => "Abandoned color updated",
    },
  },

  highVersionColor: {
    type: "color",
    text: "High Version",
    config: "color.highVersion",
    effects: {
      custom: effectHighVersionColor,
      toast: () => "High Version color updated",
    },
  },

  invalidVersionColor: {
    type: "color",
    text: "Invalid Version",
    config: "color.invalidVersion",
    effects: {
      custom: effectInvalidVersionColor,
      toast: () => "Invalid Version color updated",
    },
  },

  tileInfoColor: {
    type: "color",
    text: "Tile Info",
    config: "color.tileInfo",
    effects: {
      custom: effectTileInfoColor,
      toast: () => "Tile Info color updated",
    },
  },

  tileHeaderColor: {
    type: "color",
    text: "Tile Header",
    config: "color.tileHeader",
    effects: {
      custom: effectTileHeaderColor,
      toast: () => "Tile Header color updated",
    },
  },

  preferredColor: {
    type: "color",
    text: "Preferred",
    config: "color.preferred",
    before: "hr",
    effects: {
      custom: effectPreferredColor,
      toast: () => "Preferred color updated",
    },
  },

  preferredTextColor: {
    type: "color",
    text: "Preferred Text",
    config: "color.preferredText",
    effects: {
      custom: effectPreferredTextColor,
      toast: () => "Preferred Text color updated",
    },
  },

  excludedColor: {
    type: "color",
    text: "Excluded",
    config: "color.excluded",
    effects: {
      custom: effectExcludedColor,
      toast: () => "Excluded color updated",
    },
  },

  excludedTextColor: {
    type: "color",
    text: "Excluded Text",
    config: "color.excludedText",
    effects: {
      custom: effectExcludedTextColor,
      toast: () => "Excluded Text color updated",
    },
  },

  neutralColor: {
    type: "color",
    text: "Neutral",
    config: "color.neutral",
    effects: {
      custom: effectNeutralColor,
      toast: () => "Neutral color updated",
    },
  },

  neutralTextColor: {
    type: "color",
    text: "Neutral Text",
    config: "color.neutralText",
    effects: {
      custom: effectNeutralTextColor,
      toast: () => "Neutral Text color updated",
    },
  },
};

export const colorSettingsDisabledMeta = {
  info: {
    type: "info",
    text: "Color settings are disabled because Overlay is turned off in Overall Settings.",
  },
};
