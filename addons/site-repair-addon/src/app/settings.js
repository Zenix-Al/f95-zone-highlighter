import { DEFAULT_SETTINGS } from "../constants.js";

export function normalizeSiteRepairSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const repairs = source.repairs && typeof source.repairs === "object" ? source.repairs : {};
  return {
    enabled: source.enabled !== false,
    repairs: {
      imageAttachments: { enabled: repairs.imageAttachments?.enabled !== false },
      latestAjax: { enabled: repairs.latestAjax?.enabled !== false },
    },
  };
}

export function getDefaultSiteRepairSettings() {
  return normalizeSiteRepairSettings(DEFAULT_SETTINGS);
}
