import { config, debug } from "../constants";

export function updateColorStyle(key) {
  if (key && config.color[key] !== undefined) {
    const varName = `--${key}-color`;
    document.documentElement.style.setProperty(varName, config.color[key]);
    debug && console.log(varName, config.color[key]);
  } else {
    // Fallback: update all if no key provided
    for (const [k, value] of Object.entries(config.color)) {
      const varName = `--${k}-color`;
      document.documentElement.style.setProperty(varName, value);
      debug && console.log(varName, value);
    }
  }

  // Update shadows only once (optional, keep as is)
  const preferredShadow = config.threadSettings.preferredShadow ? "0 0 2px 1px white" : "none";
  const excludedShadow = config.threadSettings.excludedShadow ? "0 0 2px 1px white" : "none";

  document.documentElement.style.setProperty("--preferred-shadow", preferredShadow);
  document.documentElement.style.setProperty("--excluded-shadow", excludedShadow);
}
