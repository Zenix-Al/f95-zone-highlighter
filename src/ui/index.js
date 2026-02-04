import { injectButton, injectCSS } from "./components/modal";
import { updateColorStyle } from "./settings/updateColorStyle";

export function initUI() {
  injectCSS();
  injectButton();
  updateColorStyle();
}
