import { createFeature } from "../../core/featureFactory.js";
import { enableImageRepair, disableImageRepair } from "./handler.js";
import { injectUI, destroyInjectedUI } from "./ui.js";

/**
 * Feature module for retrying failed images on the forum.
 * This feature injects a UI to manually retry images and can automatically retry them.
 */
export const imageRepairFeature = createFeature("Image Repair", {
  configPath: "threadSettings.imgRetry",
  enable: () => {
    injectUI();
    enableImageRepair();
  },
  disable: () => {
    disableImageRepair();
    destroyInjectedUI();
  },
});
