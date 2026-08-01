import { stateManager } from "../../src/config.js";
import {
  formatFeatureHealthReport,
  showFeatureHealthBox,
  summarizeAddons,
  summarizeFeatureStatuses,
} from "../../src/ui/components/featureHealth/index.js";

export function setFeatureHealthRoot(root) {
  stateManager.set("shadowRoot", root);
}

export {
  formatFeatureHealthReport,
  showFeatureHealthBox,
  summarizeAddons,
  summarizeFeatureStatuses,
};
