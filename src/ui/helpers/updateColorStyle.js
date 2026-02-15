import { config } from "../../config";
import { debugLog } from "../../core/logger";
import { isValidColor } from "../../utils/validators.js";

const COLOR_VAR_MAP = Object.freeze({
  completed: "--completed-color",
  onhold: "--onhold-color",
  abandoned: "--abandoned-color",
  highVersion: "--high-version-color",
  invalidVersion: "--invalid-version-color",
  tileInfo: "--tile-info-color",
  tileHeader: "--tile-header-color",
  preferred: "--preferred-color",
  preferredText: "--preferred-text-color",
  excluded: "--excluded-color",
  excludedText: "--excluded-text-color",
  neutral: "--neutral-color",
  neutralText: "--neutral-text-color",
});

function applyColorVar(key, value) {
  const varName = COLOR_VAR_MAP[key];
  if (!varName) {
    debugLog("updateColorStyle", `No CSS variable mapping for key: ${key}`);
    return;
  }

  if (isValidColor(value)) {
    document.documentElement.style.setProperty(varName, value);
    debugLog("updateColorStyle", `Updated color for key: ${key} to ${value}`);
  } else {
    debugLog("updateColorStyle", `Skipped invalid color for key: ${key} -> ${value}`);
  }
}

export function updateColorStyle(key) {
  if (typeof key === "string" && Object.prototype.hasOwnProperty.call(config.color, key)) {
    applyColorVar(key, config.color[key]);
  } else {
    for (const [k, value] of Object.entries(config.color)) {
      applyColorVar(k, value);
    }
  }

  const preferredShadow = config.threadSettings.preferredShadow ? "0 0 2px 1px white" : "none";
  const excludedShadow = config.threadSettings.excludedShadow ? "0 0 2px 1px white" : "none";

  document.documentElement.style.setProperty("--preferred-shadow", preferredShadow);
  document.documentElement.style.setProperty("--excluded-shadow", excludedShadow);
}
