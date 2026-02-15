import ui_css from "../assets/css.css";
import web_css from "../assets/web.css";
import { acquireStyle } from "../../core/styleRegistry.js";

const BASE_UI_STYLE_ID = "base-ui";
const BASE_WEB_STYLE_ID = "base-web";

export function injectCSS() {
  acquireStyle(BASE_UI_STYLE_ID, ui_css, "shadow");
  acquireStyle(BASE_WEB_STYLE_ID, web_css, "document");
}
