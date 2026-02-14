import { injectButton } from "./components/configButton";
import { injectCSS } from "./helpers/cssInjector";
import { updateColorStyle } from "./helpers/updateColorStyle";
import stateManager from "../config.js";

function initShadowDOM() {
  if (stateManager.get('shadowRoot')) return; // Already initialized

  const shadowHost = document.createElement("div");
  shadowHost.id = "latest-highlighter-host";
  document.body.appendChild(shadowHost);

  stateManager.set('shadowRoot', shadowHost.attachShadow({ mode: "open" }));
}

export function initUI() {
  initShadowDOM();
  injectCSS();
  injectButton();
  updateColorStyle();
}
