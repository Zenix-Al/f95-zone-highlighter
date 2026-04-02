import { injectButton } from "./components/configButton";
import { updateButtonVisibility } from "./components/configButton";
import { injectCSS } from "./helpers/cssInjector";
import { updateColorStyle } from "./helpers/updateColorStyle";
import stateManager, { config } from "../config.js";
import { crossTabSyncFeature } from "../services/syncService";
import { createEl } from "../core/dom.js";

function initShadowDOM() {
  if (stateManager.get("shadowRoot")) return; // Already initialized
  const shadowHost = createEl("div", { id: "latest-highlighter-host", mount: document.body });

  stateManager.set("shadowRoot", shadowHost.attachShadow({ mode: "open" }));
}

export function initUiPhaseIfApplicable() {
  if (!stateManager.get("isF95Zone")) return false;

  initShadowDOM();
  injectCSS();
  injectButton();
  updateColorStyle();
  updateButtonVisibility();
  crossTabSyncFeature.toggle(crossTabSyncFeature.isEnabled());
  return true;
}
