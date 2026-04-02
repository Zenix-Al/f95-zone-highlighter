import stateManager from "../config.js";

export function getShadowRoot() {
  return stateManager.get("shadowRoot");
}

export default getShadowRoot;
