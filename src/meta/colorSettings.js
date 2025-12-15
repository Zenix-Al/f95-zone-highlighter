import { updateColorStyle } from "../renderer/updateColorStyle";

export const colorSettingsMeta = {
  completedColor: {
    type: "color",
    text: "Completed",
    config: "color.completed",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  onholdColor: {
    type: "color",
    text: "On Hold",
    config: "color.onhold",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  abandonedColor: {
    type: "color",
    text: "Abandoned",
    config: "color.abandoned",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  highVersionColor: {
    type: "color",
    text: "High Version",
    config: "color.highVersion",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  invalidVersionColor: {
    type: "color",
    text: "Invalid Version",
    config: "color.invalidVersion",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  tileInfoColor: {
    type: "color",
    text: "Tile Info",
    config: "color.tileInfo",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  tileHeaderColor: {
    type: "color",
    text: "Tile Header",
    config: "color.tileHeader",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  preferredColor: {
    type: "color",
    text: "Preferred",
    config: "color.preferred",
    before: "hr",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  preferredTextColor: {
    type: "color",
    text: "Preferred Text",
    config: "color.preferredText",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  excludedColor: {
    type: "color",
    text: "Excluded",
    config: "color.excluded",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  excludedTextColor: {
    type: "color",
    text: "Excluded Text",
    config: "color.excludedText",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  neutralColor: {
    type: "color",
    text: "Neutral",
    config: "color.neutral",
    effects: {
      custom: () => updateColorStyle(),
    },
  },

  neutralTextColor: {
    type: "color",
    text: "Neutral Text",
    config: "color.neutralText",
    effects: {
      custom: () => updateColorStyle(),
    },
  },
};
