import stateManager from "../../config.js";
import ui_css from "../assets/css.css";
import web_css from "../assets/web.css";

export function injectCSS() {
  // Inject UI-specific styles into the Shadow DOM for encapsulation
  const uiStyle = document.createElement("style");
  uiStyle.textContent = ui_css;
  stateManager.get('shadowRoot').appendChild(uiStyle);

  // Inject styles that affect the main page into the document's head
  const webStyle = document.createElement("style");
  webStyle.textContent = web_css;
  document.head.appendChild(webStyle);
}
