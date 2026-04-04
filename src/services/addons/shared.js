export const VALID_ADDON_STATUSES = new Set([
  "installed",
  "disabled",
  "needs-update",
  "error",
  "broken",
]);
export const VALID_ADDON_CAPABILITIES = new Set([
  "toast",
  "feature",
  "storage",
  "observer",
  "routing",
  "idb",
  "ui",
]);
export const UNTRUSTED_ALLOWED_CAPABILITIES = new Set(["toast", "feature", "storage"]);

export const MAX_OBSERVER_SUBSCRIPTIONS_PER_ADDON = 4;

export const ADDON_COMMAND_EVENT = "f95ue:addon-command";
export const ADDONS_DEV_BRIDGE_MARKER = "f95ue_addons_dev_bridge_installed";
export const ADDONS_DEV_COMMAND_EVENT = "f95ue:addons-dev-command";
export const ADDONS_API_VERSION = "0.1.0";

export function sanitizeAddonId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function sanitizeObserverSubscriptionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function sanitizeAddonCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || "").trim()))].filter((entry) =>
    VALID_ADDON_CAPABILITIES.has(entry),
  );
}

export function sanitizeAddonIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => sanitizeAddonId(entry)).filter(Boolean))];
}
