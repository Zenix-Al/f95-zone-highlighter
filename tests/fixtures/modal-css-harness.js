import { stateManager } from "../../src/config.js";
import {
  clearAllStyles,
  getStyleRegistrySnapshot,
} from "../../src/core/styleRegistry.js";
import {
  ensureModalCss,
  injectCSS,
} from "../../src/ui/helpers/cssInjector.js";

export function resetModalCssHarness(shadowRoot) {
  clearAllStyles();
  stateManager.set("shadowRoot", shadowRoot);
}

export {
  clearAllStyles,
  ensureModalCss,
  getStyleRegistrySnapshot,
  injectCSS,
};
