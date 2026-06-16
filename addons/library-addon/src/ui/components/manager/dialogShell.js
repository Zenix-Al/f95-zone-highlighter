import { createEl } from "../../../../../shared/createEl";
import managerCssTemplate from "../../assets/manager.css";
import managerHtmlTemplate from "../../assets/manager.html";

function buildCss(rootSelector = ".f95ue-library-manager-root") {
  return managerCssTemplate.replaceAll("__ROOT__", rootSelector);
}

export function getManagerStyleText(rootSelector = ".f95ue-library-manager-root") {
  return buildCss(rootSelector);
}

export function ensureManagerStyle(styleId, rootSelector = ".f95ue-library-manager-root") {
  if (document.getElementById(styleId)) return;
  const style = createEl("style", "", "", styleId);
  style.textContent = buildCss(rootSelector);
  document.head.append(style);
}

export function createManagerDialogMarkup() {
  return managerHtmlTemplate;
}
