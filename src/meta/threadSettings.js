import { hijackMaskedLinks } from "../helper/maskedLinkSkipper";
import { wideForum } from "../ui/wideForum";

// meta/threadSettings.js
export const threadSettingsMeta = {
  skipMaskedLink: {
    type: "toggle",
    text: "Skip masked link page",
    tooltip: "Automatically bypass the masked link intermediary page when accessing masked links",
    config: "threadSettings.skipMaskedLink",
    effects: {
      custom: () => {
        hijackMaskedLinks();
      },
      toast: (v) => `Skip Masked Link ${v ? "enabled" : "disabled"}`,
    },
  },
  isWide: {
    type: "toggle",
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction — makes thread use full screen width",
    config: "threadSettings.isWide",
    effects: {
      custom: (v) => wideForum(v),
      toast: (v) => `Wide Thread ${v ? "enabled" : "disabled"}`,
    },
  },

  imgRetry: {
    type: "toggle",
    text: "Image Retry",
    tooltip: "Enable image retry for broken images in threads",
    config: "threadSettings.imgRetry",
    effects: {
      toast: (v) => `Image Retry ${v ? "enabled" : "disabled"}`,
    },
  },
  _header_visibility: {
    type: "header",
    text: "Thread Overlay Settings",
  },
  neutral: {
    type: "toggle",
    text: "Show Neutral overlay",
    tooltip: "Display neutral reaction buttons",
    config: "threadSettings.neutral",
    effects: {
      reapply: "overlay",
      toast: (v) => `Neutral ${v ? "enabled" : "disabled"}`,
    },
  },

  preferred: {
    type: "toggle",
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    config: "threadSettings.preferred",
    effects: {
      reapply: "overlay",
      toast: (v) => `Preferred ${v ? "enabled" : "disabled"}`,
    },
  },

  preferredShadow: {
    type: "toggle",
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    config: "threadSettings.preferredShadow",
    effects: {
      reapply: "overlay",
      toast: (v) => `Preferred Shadow ${v ? "enabled" : "disabled"}`,
    },
  },

  excluded: {
    type: "toggle",
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    config: "threadSettings.excluded",
    effects: {
      reapply: "overlay",
      toast: (v) => `Excluded ${v ? "enabled" : "disabled"}`,
    },
  },

  excludedShadow: {
    type: "toggle",
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    config: "threadSettings.excludedShadow",
    effects: {
      reapply: "overlay",
      toast: (v) => `Excluded Shadow ${v ? "enabled" : "disabled"}`,
    },
  },
};
