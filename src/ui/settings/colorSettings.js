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
      custom: createColorEffect("completed"),
      toast: () => "Completed color updated",
    },
  },

  onholdColor: {
    type: "color",
    text: "On Hold",
    config: "color.onhold",
    effects: {
      custom: createColorEffect("onhold"),
      toast: () => "On Hold color updated",
    },
  },

  abandonedColor: {
    type: "color",
    text: "Abandoned",
    config: "color.abandoned",
    effects: {
      custom: createColorEffect("abandoned"),
      toast: () => "Abandoned color updated",
    },
  },

  highVersionColor: {
    type: "color",
    text: "High Version",
    config: "color.highVersion",
    effects: {
      custom: createColorEffect("highVersion"),
      toast: () => "High Version color updated",
    },
  },

  invalidVersionColor: {
    type: "color",
    text: "Invalid Version",
    config: "color.invalidVersion",
    effects: {
      custom: createColorEffect("invalidVersion"),
      toast: () => "Invalid Version color updated",
    },
  },

  tileInfoColor: {
    type: "color",
    text: "Tile Info",
    config: "color.tileInfo",
    effects: {
      custom: createColorEffect("tileInfo"),
      toast: () => "Tile Info color updated",
    },
  },

  tileHeaderColor: {
    type: "color",
    text: "Tile Header",
    config: "color.tileHeader",
    effects: {
      custom: createColorEffect("tileHeader"),
      toast: () => "Tile Header color updated",
    },
  },

  preferredColor: {
    type: "color",
    text: "Preferred",
    config: "color.preferred",
    before: "hr",
    effects: {
      custom: createColorEffect("preferred"),
      toast: () => "Preferred color updated",
    },
  },

  preferredTextColor: {
    type: "color",
    text: "Preferred Text",
    config: "color.preferredText",
    effects: {
      custom: createColorEffect("preferredText"),
      toast: () => "Preferred Text color updated",
    },
  },

  excludedColor: {
    type: "color",
    text: "Excluded",
    config: "color.excluded",
    effects: {
      custom: createColorEffect("excluded"),
      toast: () => "Excluded color updated",
    },
  },

  excludedTextColor: {
    type: "color",
    text: "Excluded Text",
    config: "color.excludedText",
    effects: {
      custom: createColorEffect("excludedText"),
      toast: () => "Excluded Text color updated",
    },
  },

  neutralColor: {
    type: "color",
    text: "Neutral",
    config: "color.neutral",
    effects: {
      custom: createColorEffect("neutral"),
      toast: () => "Neutral color updated",
    },
  },

  neutralTextColor: {
    type: "color",
    text: "Neutral Text",
    config: "color.neutralText",
    effects: {
      custom: createColorEffect("neutralText"),
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
