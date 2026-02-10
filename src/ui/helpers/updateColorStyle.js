import { config } from "../../config";
import { debugLog } from "../../core/logger";

export function updateColorStyle(key) {
  if (key && config.color[key] !== undefined) {
    const varName = `--${key}-color`;
    document.documentElement.style.setProperty(varName, config.color[key]);
    debugLog("updateColorStyle", `Updated color for key: ${key} to ${config.color[key]}`);
  } else {
    // Fallback: update all if no key provided
    for (const [k, value] of Object.entries(config.color)) {
      const varName = `--${k}-color`;
      document.documentElement.style.setProperty(varName, value);
      debugLog("updateColorStyle", `Updated color for key: ${k} to ${value}`);
    }
  }

  // Update shadows only once (optional, keep as is)
  const preferredShadow = config.threadSettings.preferredShadow ? "0 0 2px 1px white" : "none";
  const excludedShadow = config.threadSettings.excludedShadow ? "0 0 2px 1px white" : "none";

  document.documentElement.style.setProperty("--preferred-shadow", preferredShadow);
  document.documentElement.style.setProperty("--excluded-shadow", excludedShadow);
}
