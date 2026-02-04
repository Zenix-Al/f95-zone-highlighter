import { state } from "../../config";
import { injectImageRepair } from "../../services/imageService";
import { updateThreadUI } from ".";
import { checkOverlaySettings } from "../../services/safetyService";
import { signatureCollapse } from "../../services/threadService";
import { toggleDirectDownloadHijack } from "../../features/hijackDownloadLink";
import { toggleMsgEventHandler } from "../../features/msgHandler";
import { toggleHijackMaskedLink } from "../../features/maskedLinkSkipper";
import { queuedProcessThreadTags } from "../../core/tasksRegistry";
import { wideForum } from "../components/wideForum";

const effectOverlayToggle = () => {
  updateThreadUI();
  checkOverlaySettings();
  if (!state.isThread) return;
  queuedProcessThreadTags();
};
// meta/threadSettings.js
export const threadSettingsMeta = {
  skipMaskedLink: {
    type: "toggle",
    text: "Skip masked link page",
    tooltip:
      "Automatically bypass the masked link intermediary page when accessing masked links \n support with direct download features",
    config: "threadSettings.skipMaskedLink",
    effects: {
      custom: () => toggleHijackMaskedLink(),
      toast: (v) => `Skip Masked Link ${v ? "enabled" : "disabled"}`,
    },
  },
  directDownloadLinks: {
    type: "toggle",
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts \n works independently outside of masked links",
    config: "threadSettings.directDownloadLinks",
    effects: {
      custom: () => {
        toggleDirectDownloadHijack();
        toggleMsgEventHandler();
      },
      toast: (v) => `Direct Download Links ${v ? "enabled" : "disabled"}`,
    },
  },
  isWide: {
    type: "toggle",
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction — makes thread use full screen width",
    config: "threadSettings.isWide",
    effects: {
      custom: wideForum,
      toast: (v) => `Wide Thread ${v ? "enabled" : "disabled"}`,
    },
  },

  imgRetry: {
    type: "toggle",
    text: "Image Retry",
    tooltip: "Enable image retry for broken images in threads",
    config: "threadSettings.imgRetry",
    effects: {
      custom: injectImageRepair,
      toast: (v) => `Image Retry ${v ? "enabled" : "disabled"}`,
    },
  },
  collapseableSignatures: {
    type: "toggle",
    text: "Collapsable Signatures",
    tooltip: "Make user signatures collapsable in threads",
    config: "threadSettings.collapseSignature",
    effects: {
      custom: signatureCollapse,
      toast: (v) => `Collapsable Signatures ${v ? "enabled" : "disabled"}`,
    },
  },
  threadOverlayToggle: {
    type: "toggle",
    text: "Enable overlay",
    tooltip: "Show thread status overlay on thread pages",
    config: "threadSettings.threadOverlayToggle",
    effects: {
      custom: effectOverlayToggle,
      toast: (v) => `Thread overlay ${v ? "enabled" : "disabled"}`,
    },
  },
};

export const threadOverlaySettingsMeta = {
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
      custom: queuedProcessThreadTags,
      toast: (v) => `Neutral ${v ? "enabled" : "disabled"}`,
    },
  },

  preferred: {
    type: "toggle",
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    config: "threadSettings.preferred",
    effects: {
      custom: queuedProcessThreadTags,
      toast: (v) => `Preferred ${v ? "enabled" : "disabled"}`,
    },
  },

  preferredShadow: {
    type: "toggle",
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    config: "threadSettings.preferredShadow",
    effects: {
      custom: queuedProcessThreadTags,
      toast: (v) => `Preferred Shadow ${v ? "enabled" : "disabled"}`,
    },
  },

  excluded: {
    type: "toggle",
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    config: "threadSettings.excluded",
    effects: {
      custom: queuedProcessThreadTags,
      toast: (v) => `Excluded ${v ? "enabled" : "disabled"}`,
    },
  },

  excludedShadow: {
    type: "toggle",
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    config: "threadSettings.excludedShadow",
    effects: {
      custom: queuedProcessThreadTags,
      toast: (v) => `Excluded Shadow ${v ? "enabled" : "disabled"}`,
    },
  },
};

export const disabledThreadOverlayMeta = {
  _header_visibility: {
    type: "header",
    text: "Thread Overlay is disabled",
  },
};
