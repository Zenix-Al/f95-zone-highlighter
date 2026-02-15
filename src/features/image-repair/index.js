import { createFeature } from "../../core/featureFactory.js";
import { enableImageRepair, disableImageRepair } from "./handler.js";
import { injectUI, destroyInjectedUI } from "./ui.js";
import featureCss from "./style.css";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";

const IMAGE_REPAIR_STYLE_ID = "feature-image-repair";

/**
 * Feature module for retrying failed images on the forum.
 * This feature injects a UI to manually retry images and can automatically retry them.
 */
export const imageRepairFeature = createFeature("Image Repair", {
  configPath: "threadSettings.imgRetry",
  enable: () => {
    acquireStyle(IMAGE_REPAIR_STYLE_ID, featureCss, "document");
    injectUI();
    enableImageRepair();
  },
  disable: () => {
    disableImageRepair();
    destroyInjectedUI();
    removeStyle(IMAGE_REPAIR_STYLE_ID);
  },
});
