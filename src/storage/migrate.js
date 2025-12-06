import { config, debug } from "../constants";
import { saveConfigKeys } from "../storage/save";

export function migrateLatestSettings() {
  let migrated = false;

  // 1. Old flat key → new nested object
  if (typeof config.minVersion !== "undefined" && !config.latestSettings) {
    config.latestSettings = {
      autoRefresh: false,
      webNotif: false,
      minVersion: Number(config.minVersion) || 0.5,
    };
    delete config.minVersion; // clean up old key
    migrated = true;
  }

  // 2. If latestSettings exists but missing minVersion (edge case)
  if (config.latestSettings && typeof config.latestSettings.minVersion === "undefined") {
    config.latestSettings.minVersion = 0.5;
    migrated = true;
  }

  // 3. If latestSettings exists but missing other keys (future-proof)
  const defaults = {
    autoRefresh: false,
    webNotif: false,
    minVersion: 0.5,
  };

  let needsSave = false;
  Object.keys(defaults).forEach((key) => {
    if (!(key in config.latestSettings)) {
      config.latestSettings[key] = defaults[key];
      needsSave = true;
    }
  });

  // Save only if something changed
  if (migrated || needsSave) {
    saveConfigKeys({ latestSettings: config.latestSettings });
    debug && console.log("Latest settings migrated successfully");
  }
}
