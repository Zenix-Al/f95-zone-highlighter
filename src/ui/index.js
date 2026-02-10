import { injectButton, injectCSS } from "./components/modal";
import { updateColorStyle } from "./helpers/updateColorStyle";
import { state } from "../config";

function initShadowDOM() {
  if (state.shadowRoot) return; // Already initialized

  const shadowHost = document.createElement("div");
  shadowHost.id = "latest-highlighter-host";
  document.body.appendChild(shadowHost);

  state.shadowRoot = shadowHost.attachShadow({ mode: "open" });
}

export function initUI() {
  initShadowDOM();
  injectCSS();
  injectButton();
  updateColorStyle();
}
