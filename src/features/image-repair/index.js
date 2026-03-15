import { createStyledFeature } from "../../core/createStyledFeature.js";
import { enableImageRepair, disableImageRepair } from "./handler.js";
import { injectUI, destroyInjectedUI } from "./ui.js";
import featureCss from "./style.css";

/**
 * Feature module for retrying failed images on the forum.
 * This feature injects a UI to manually retry images and can automatically retry them.
 */
export const imageRepairFeature = createStyledFeature("Image Repair", {
  configPath: "threadSettings.imgRetry",
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  styleCss: featureCss,
  enable: () => {
    injectUI();
    enableImageRepair();
  },
  disable: () => {
    disableImageRepair();
    destroyInjectedUI();
  },
});
