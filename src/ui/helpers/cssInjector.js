import modal_css from "../assets/css.css";
import document_css from "../assets/document.css";
import startup_css from "../assets/startup.css";
import { acquireStyle, getStyleRegistrySnapshot } from "../../core/styleRegistry.js";

const BASE_UI_STYLE_ID = "base-ui";
const BASE_MODAL_UI_STYLE_ID = "base-modal-ui";
const BASE_DOCUMENT_STYLE_ID = "base-document";

export function injectCSS() {
  acquireStyle(BASE_UI_STYLE_ID, startup_css, "shadow");
  acquireStyle(BASE_DOCUMENT_STYLE_ID, document_css, "document");
}

export function ensureModalCss() {
  if (getStyleRegistrySnapshot()[BASE_MODAL_UI_STYLE_ID]?.attached) return true;
  return Boolean(acquireStyle(BASE_MODAL_UI_STYLE_ID, modal_css, "shadow"));
}
