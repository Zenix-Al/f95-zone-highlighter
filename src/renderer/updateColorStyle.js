import { config, debug } from "../constants";

export function updateColorStyle() {
  // Update colors
  for (const [key, value] of Object.entries(config.color)) {
    const varName = `--${key}-color`;
    document.documentElement.style.setProperty(varName, value);
    debug && console.log(varName, value);
  }

  // Update shadows for preferred/excluded
  const preferredShadow = config.threadSettings.preferredShadow ? "0 0 2px 1px white" : "none";
  const excludedShadow = config.threadSettings.excludedShadow ? "0 0 2px 1px white" : "none";

  document.documentElement.style.setProperty("--preferred-shadow", preferredShadow);
  document.documentElement.style.setProperty("--excluded-shadow", excludedShadow);
}
