import ui_css from "../assets/css.css";
import document_css from "../assets/document.css";
import { acquireStyle } from "../../core/styleRegistry.js";

const BASE_UI_STYLE_ID = "base-ui";
const BASE_DOCUMENT_STYLE_ID = "base-document";

export function injectCSS() {
  acquireStyle(BASE_UI_STYLE_ID, ui_css, "shadow");
  acquireStyle(BASE_DOCUMENT_STYLE_ID, document_css, "document");
}
