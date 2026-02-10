import {
  debouncedProcessAllTilesReset,
  debouncedProcessThreadTags,
} from "../../core/tasksRegistry";
import { updateColorStyle } from "../helpers/updateColorStyle";

const executeBothQueuedTasks = () => {
  debouncedProcessAllTilesReset();
  debouncedProcessThreadTags();
};

const createColorEffect = (colorName) => () => {
  updateColorStyle(colorName);
  executeBothQueuedTasks();
};

export const colorSettingsMeta = {
  completedColor: {
    type: "color",
    text: "Completed",
    config: "color.completed",
    effects: {
      custom: createColorEffect("completedColor"),
      toast: () => "Completed color updated",
    },
  },

  onholdColor: {
    type: "color",
    text: "On Hold",
    config: "color.onhold",
    effects: {
      custom: createColorEffect("onholdColor"),
      toast: () => "On Hold color updated",
    },
  },

  abandonedColor: {
    type: "color",
    text: "Abandoned",
    config: "color.abandoned",
    effects: {
      custom: createColorEffect("abandonedColor"),
      toast: () => "Abandoned color updated",
    },
  },

  highVersionColor: {
    type: "color",
    text: "High Version",
    config: "color.highVersion",
    effects: {
      custom: createColorEffect("highVersionColor"),
      toast: () => "High Version color updated",
    },
  },

  invalidVersionColor: {
    type: "color",
    text: "Invalid Version",
    config: "color.invalidVersion",
    effects: {
      custom: createColorEffect("invalidVersionColor"),
      toast: () => "Invalid Version color updated",
    },
  },

  tileInfoColor: {
    type: "color",
    text: "Tile Info",
    config: "color.tileInfo",
    effects: {
      custom: createColorEffect("tileInfoColor"),
      toast: () => "Tile Info color updated",
    },
  },

  tileHeaderColor: {
    type: "color",
    text: "Tile Header",
    config: "color.tileHeader",
    effects: {
      custom: createColorEffect("tileHeaderColor"),
      toast: () => "Tile Header color updated",
    },
  },

  preferredColor: {
    type: "color",
    text: "Preferred",
    config: "color.preferred",
    before: "hr",
    effects: {
      custom: createColorEffect("preferredColor"),
      toast: () => "Preferred color updated",
    },
  },

  preferredTextColor: {
    type: "color",
    text: "Preferred Text",
    config: "color.preferredText",
    effects: {
      custom: createColorEffect("preferredTextColor"),
      toast: () => "Preferred Text color updated",
    },
  },

  excludedColor: {
    type: "color",
    text: "Excluded",
    config: "color.excluded",
    effects: {
      custom: createColorEffect("excludedColor"),
      toast: () => "Excluded color updated",
    },
  },

  excludedTextColor: {
    type: "color",
    text: "Excluded Text",
    config: "color.excludedText",
    effects: {
      custom: createColorEffect("excludedTextColor"),
      toast: () => "Excluded Text color updated",
    },
  },

  neutralColor: {
    type: "color",
    text: "Neutral",
    config: "color.neutral",
    effects: {
      custom: createColorEffect("neutralColor"),
      toast: () => "Neutral color updated",
    },
  },

  neutralTextColor: {
    type: "color",
    text: "Neutral Text",
    config: "color.neutralText",
    effects: {
      custom: createColorEffect("neutralTextColor"),
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
