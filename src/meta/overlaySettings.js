// meta/overlaySettings.js
export const overlaySettingsMeta = {
  _header_visibility: {
    type: "header",
    text: "Overlay Visibility Settings",
  },
  completed: {
    type: "toggle",
    text: "Completed",
    tooltip: "Show overlay for completed threads",
    config: "overlaySettings.completed",
    effects: {
      reapply: "overlay",
      toast: (v) => `Completed ${v ? "enabled" : "disabled"}`,
    },
  },

  onhold: {
    type: "toggle",
    text: "On Hold",
    tooltip: "Show overlay for threads on hold",
    config: "overlaySettings.onhold",
    effects: {
      reapply: "overlay",
      toast: (v) => `On Hold ${v ? "enabled" : "disabled"}`,
    },
  },

  abandoned: {
    type: "toggle",
    text: "Abandoned",
    tooltip: "Show overlay for abandoned threads",
    config: "overlaySettings.abandoned",
    effects: {
      reapply: "overlay",
      toast: (v) => `Abandoned ${v ? "enabled" : "disabled"}`,
    },
  },

  highVersion: {
    type: "toggle",
    text: "High Version tag",
    tooltip: "Show overlay for game threads with higher version than your set minimum",
    config: "overlaySettings.highVersion",
    effects: {
      reapply: "overlay",
      toast: (v) => `High Version ${v ? "enabled" : "disabled"}`,
    },
  },

  invalidVersion: {
    type: "toggle",
    text: "Invalid Version tag",
    tooltip: "Show overlay for threads with invalid version format",
    config: "overlaySettings.invalidVersion",
    effects: {
      reapply: "overlay",
      toast: (v) => `Invalid Version ${v ? "enabled" : "disabled"}`,
    },
  },

  preferred: {
    type: "toggle",
    text: "Preferred",
    tooltip: "Show overlay for threads you've marked as preferred",
    config: "overlaySettings.preferred",
    effects: {
      reapply: "overlay",
      toast: (v) => `Preferred ${v ? "enabled" : "disabled"}`,
    },
  },

  excluded: {
    type: "toggle",
    text: "Excluded",
    tooltip: "Show overlay for threads you've marked as excluded",
    config: "overlaySettings.excluded",
    effects: {
      reapply: "overlay",
      toast: (v) => `Excluded ${v ? "enabled" : "disabled"}`,
    },
  },

  overlayText: {
    type: "toggle",
    text: "Text overlay on tiles",
    tooltip: "Display status text directly over the thread thumbnail",
    config: "overlaySettings.overlayText",
    effects: {
      reapply: "overlay",
      toast: (v) => `Overlay Text ${v ? "enabled" : "disabled"}`,
    },
  },

  tileText: {
    type: "toggle",
    text: "Show status text on tiles",
    tooltip: "Show status labels on thread tiles (corner badges, etc.)",
    config: "overlaySettings.tileText",
    effects: {
      reapply: "overlay",
      toast: (v) => `Tile Text ${v ? "enabled" : "disabled"}`,
    },
  },
};
