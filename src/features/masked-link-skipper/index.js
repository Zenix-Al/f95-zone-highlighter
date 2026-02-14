import { createFeature } from "../../core/featureFactory.js";
import { config } from "../../config.js";
import { hijackMaskedLinks, disableHijackMaskedLink } from "./hijacker.js";

/**
 * The core feature for hijacking masked links on thread pages.
 */
export const maskedLinkHijackerFeature = createFeature("Masked Link Skipper", {
  configPath: "threadSettings.skipMaskedLink",
  enable: hijackMaskedLinks,
  disable: disableHijackMaskedLink,
});

// Re-export page-specific handlers for other parts of the app (loader, main.js)
export * from "./page.js";

/**
 * Toggles the masked link hijacking feature based on the user's config.
 * This is the primary function used by the settings UI to apply changes.
 * It reads the current config state and calls the appropriate feature method.
 */
export function toggleHijackMaskedLink() {
  if (config.threadSettings.skipMaskedLink) {
    maskedLinkHijackerFeature.enable();
  } else {
    maskedLinkHijackerFeature.disable();
  }
}
