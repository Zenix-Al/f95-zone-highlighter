import {
  config,
  createDefaultDirectDownloadHealth,
  defaultDirectDownloadPackages,
} from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { normalizeDirectDownloadHealthEntry } from "../../utils/normalization.js";
import { normalizeObject } from "../../utils/objectPath.js";

export const DIRECT_DOWNLOAD_BREAKER_THRESHOLD = 3;

export const DIRECT_DOWNLOAD_PACKAGE_LABELS = Object.freeze({
  buzzheavier: "Buzzheavier",
  gofile: "Gofile",
  pixeldrain: "Pixeldrain",
  datanodes: "Datanodes",
  workupload: "Workupload",
  qiwi: "Qiwi",
  krakenfiles: "Krakenfiles",
  mega: "Mega",
  mediafire: "Mediafire",
});

export function normalizeDirectDownloadHealth(health) {
  const defaults = createDefaultDirectDownloadHealth(defaultDirectDownloadPackages);
  const source = normalizeObject(health);
  const normalized = {};
  for (const key of Object.keys(defaults)) {
    normalized[key] = normalizeDirectDownloadHealthEntry(source[key], defaults[key]);
  }
  return normalized;
}

function ensureThreadDownloadHealth() {
  const normalized = normalizeDirectDownloadHealth(config.threadSettings?.directDownloadHealth);
  if (!config.threadSettings || typeof config.threadSettings !== "object") {
    config.threadSettings = {};
  }
  config.threadSettings.directDownloadHealth = normalized;
  if (!config.threadSettings.directDownloadPackages) {
    config.threadSettings.directDownloadPackages = { ...defaultDirectDownloadPackages };
  }
  return normalized;
}

export function getDirectDownloadHostLabel(packageKey) {
  return DIRECT_DOWNLOAD_PACKAGE_LABELS[packageKey] || packageKey;
}

export function getAutoDisabledDirectDownloadPackageKeys({ undismissedOnly = false } = {}) {
  const health = normalizeDirectDownloadHealth(config.threadSettings?.directDownloadHealth);
  return Object.keys(health).filter((key) => {
    const item = health[key];
    if (!item.autoDisabled) return false;
    if (undismissedOnly && item.noticeDismissed) return false;
    return true;
  });
}

export function getDirectDownloadHostHealth(packageKey) {
  if (!packageKey) return null;
  const health = normalizeDirectDownloadHealth(config.threadSettings?.directDownloadHealth);
  return health[packageKey] || null;
}

export async function markDirectDownloadHostFailure(packageKey, message = "") {
  if (
    !packageKey ||
    !Object.prototype.hasOwnProperty.call(defaultDirectDownloadPackages, packageKey)
  ) {
    return { changed: false, tripped: false, failCount: 0 };
  }
  const health = ensureThreadDownloadHealth();
  const current = health[packageKey];
  const nextFailCount = Math.max(0, current.failCount) + 1;
  const next = {
    ...current,
    failCount: nextFailCount,
    updatedAt: Date.now(),
    lastError: typeof message === "string" ? message.slice(0, 240) : "",
  };
  let tripped = false;
  if (next.failCount >= DIRECT_DOWNLOAD_BREAKER_THRESHOLD) {
    tripped = !current.autoDisabled;
    next.autoDisabled = true;
    next.noticeDismissed = false;
    if (config.threadSettings.directDownloadPackages[packageKey] !== false) {
      config.threadSettings.directDownloadPackages[packageKey] = false;
    }
  }
  health[packageKey] = next;
  config.threadSettings.directDownloadHealth = health;
  await saveConfigKeys({ threadSettings: config.threadSettings });
  return {
    changed: true,
    tripped,
    failCount: next.failCount,
    autoDisabled: next.autoDisabled,
  };
}

export async function markDirectDownloadHostSuccess(packageKey) {
  if (
    !packageKey ||
    !Object.prototype.hasOwnProperty.call(defaultDirectDownloadPackages, packageKey)
  ) {
    return { changed: false };
  }
  const health = ensureThreadDownloadHealth();
  const current = health[packageKey];
  const next = {
    ...current,
    failCount: 0,
    autoDisabled: false,
    noticeDismissed: false,
    lastError: "",
    updatedAt: Date.now(),
  };
  const changed =
    current.failCount !== next.failCount ||
    current.autoDisabled !== next.autoDisabled ||
    current.noticeDismissed !== next.noticeDismissed ||
    current.lastError !== next.lastError;
  if (!changed) return { changed: false };
  health[packageKey] = next;
  config.threadSettings.directDownloadHealth = health;
  await saveConfigKeys({ threadSettings: config.threadSettings });
  return { changed: true };
}

export async function resetDirectDownloadHostBreaker(packageKey) {
  if (
    !packageKey ||
    !Object.prototype.hasOwnProperty.call(defaultDirectDownloadPackages, packageKey)
  ) {
    return { changed: false };
  }
  const health = ensureThreadDownloadHealth();
  const current = health[packageKey];
  const next = {
    ...current,
    failCount: 0,
    autoDisabled: false,
    noticeDismissed: false,
    lastError: "",
    updatedAt: Date.now(),
  };
  const changed =
    current.failCount !== next.failCount ||
    current.autoDisabled !== next.autoDisabled ||
    current.noticeDismissed !== next.noticeDismissed ||
    current.lastError !== next.lastError;
  if (!changed) return { changed: false };
  health[packageKey] = next;
  config.threadSettings.directDownloadHealth = health;
  await saveConfigKeys({ threadSettings: config.threadSettings });
  return { changed: true };
}

export async function dismissDirectDownloadHostNotices(packageKeys = []) {
  if (!Array.isArray(packageKeys) || packageKeys.length === 0) {
    return { changed: false };
  }
  const health = ensureThreadDownloadHealth();
  let changed = false;
  for (const key of packageKeys) {
    if (!Object.prototype.hasOwnProperty.call(health, key)) continue;
    if (!health[key].autoDisabled) continue;
    if (health[key].noticeDismissed) continue;
    health[key] = {
      ...health[key],
      noticeDismissed: true,
      updatedAt: Date.now(),
    };
    changed = true;
  }
  if (!changed) return { changed: false };
  config.threadSettings.directDownloadHealth = health;
  await saveConfigKeys({ threadSettings: config.threadSettings });
  return { changed: true };
}
