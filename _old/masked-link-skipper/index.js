import { createFeature } from "../../core/featureFactory.js";
import { createStyledFeature } from "../../core/createStyledFeature.js";
import { config } from "../../config.js";
import { hijackMaskedLinks, disableHijackMaskedLink } from "./hijacker.js";
import { handleRecaptcha, skipMaskedPage } from "./page.js";
import featureCss from "./style.css";

/**
 * The core feature for injecting Resolve buttons next to masked links.
 * Active when either skipMaskedLink or directDownloadLinks is enabled.
 */
export const maskedLinkHijackerFeature = createStyledFeature("Masked Link Skipper", {
  isEnabled: () =>
    config.threadSettings.skipMaskedLink || config.threadSettings.directDownloadLinks,
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: hijackMaskedLinks,
  disable: disableHijackMaskedLink,
});

export const recaptchaFrameFeature = createFeature("Recaptcha Frame Handler", {
  isEnabled: () => true,
  isApplicable: ({ stateManager }) => Boolean(stateManager.get("isRecaptchaFrame")),
  enable: handleRecaptcha,
  disable: () => {},
});

export const maskedPageFeature = createFeature("Masked Page Skipper", {
  configPath: "threadSettings.skipMaskedLink",
  isApplicable: ({ stateManager }) => Boolean(stateManager.get("isMaskedLink")),
  enable: skipMaskedPage,
  disable: () => {},
});

// Re-export page-specific handlers for other parts of the app (loader, main.js)
export * from "./page.js";

/**
 * Toggles the masked-link resolve button feature based on the user's config.
 * This is used by settings UI to apply changes immediately.
 */
export function toggleMaskedLinkResolver() {
  maskedLinkHijackerFeature.sync();
}
