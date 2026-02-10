// Re-export the page-specific handlers for the loader and main entry point
export * from "./page.js";
// Re-export the core hijacking logic for the loader and the toggle function
export * from "./hijacker.js";

import { config } from "../../config";
import { hijackMaskedLinks, disableHijackMaskedLink } from "./hijacker.js";

/**
 * Toggles the masked link hijacking feature based on the user's config.
 * This is the primary function used by the settings UI.
 */
export function toggleHijackMaskedLink() {
  if (config.threadSettings.skipMaskedLink) {
    hijackMaskedLinks();
  } else {
    disableHijackMaskedLink();
  }
}
