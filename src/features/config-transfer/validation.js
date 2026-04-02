import {
  defaultColors,
  defaultDirectDownloadPackages,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
} from "../../config.js";
import { isValidColor, isValidTag, isValidVersion } from "../../utils/validators.js";
import { isValidOverlayColorOrder } from "../latest-overlay/overlayOrder.js";
import { EXPORTABLE_CONFIG_KEYS } from "./constants.js";
import { hasOnlyKnownKeys, isPlainObject, isPositiveInteger } from "./helpers.js";

function validateTagsSection(tags) {
  const seenIds = new Set();
  for (let i = 0; i < tags.length; i++) {
    const item = tags[i];
    if (!isPlainObject(item)) {
      return `tags[${i}] must be an object.`;
    }
    if (!isPositiveInteger(item.id)) {
      return `tags[${i}].id must be a positive integer.`;
    }
    if (!isValidTag(item.name)) {
      return `tags[${i}].name must be a non-empty string.`;
    }
    if (seenIds.has(item.id)) {
      return `tags contains duplicate id '${item.id}'.`;
    }
    seenIds.add(item.id);
  }
  return "";
}

function validateTagIdArray(key, ids) {
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!isPositiveInteger(id)) {
      return `${key}[${i}] must be a positive integer.`;
    }
    if (seen.has(id)) {
      return `${key} contains duplicate id '${id}'.`;
    }
    seen.add(id);
  }
  return "";
}

function validateColorSection(color) {
  const unknownKey = hasOnlyKnownKeys(color, Object.keys(defaultColors));
  if (unknownKey) return `color.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(color)) {
    if (!isValidColor(value)) {
      return `color.${key} must be a valid hex color.`;
    }
  }
  return "";
}

function validateOverlaySection(overlaySettings) {
  const unknownKey = hasOnlyKnownKeys(overlaySettings, Object.keys(defaultOverlaySettings));
  if (unknownKey) return `overlaySettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(overlaySettings)) {
    if (typeof value !== "boolean") {
      return `overlaySettings.${key} must be boolean.`;
    }
  }
  return "";
}

const DIRECT_DOWNLOAD_HEALTH_KEYS = [
  "failCount",
  "autoDisabled",
  "noticeDismissed",
  "lastError",
  "updatedAt",
];

function validateDirectDownloadPackages(value) {
  if (!isPlainObject(value)) {
    return "threadSettings.directDownloadPackages must be an object.";
  }

  const pkgUnknown = hasOnlyKnownKeys(value, Object.keys(defaultDirectDownloadPackages));
  if (pkgUnknown) {
    return `threadSettings.directDownloadPackages.${pkgUnknown} is not supported.`;
  }

  for (const [pkgKey, pkgEnabled] of Object.entries(value)) {
    if (typeof pkgEnabled !== "boolean") {
      return `threadSettings.directDownloadPackages.${pkgKey} must be boolean.`;
    }
  }

  return "";
}

function validateDirectDownloadHostHealth(pkgKey, hostHealth) {
  if (!isPlainObject(hostHealth)) {
    return `threadSettings.directDownloadHealth.${pkgKey} must be an object.`;
  }

  const hostUnknown = hasOnlyKnownKeys(hostHealth, DIRECT_DOWNLOAD_HEALTH_KEYS);
  if (hostUnknown) {
    return `threadSettings.directDownloadHealth.${pkgKey}.${hostUnknown} is not supported.`;
  }

  if (
    typeof hostHealth.failCount !== "number" ||
    !Number.isFinite(hostHealth.failCount) ||
    hostHealth.failCount < 0
  ) {
    return `threadSettings.directDownloadHealth.${pkgKey}.failCount must be a number >= 0.`;
  }

  if (typeof hostHealth.autoDisabled !== "boolean") {
    return `threadSettings.directDownloadHealth.${pkgKey}.autoDisabled must be boolean.`;
  }

  if (typeof hostHealth.noticeDismissed !== "boolean") {
    return `threadSettings.directDownloadHealth.${pkgKey}.noticeDismissed must be boolean.`;
  }

  if (typeof hostHealth.lastError !== "string") {
    return `threadSettings.directDownloadHealth.${pkgKey}.lastError must be string.`;
  }

  if (
    typeof hostHealth.updatedAt !== "number" ||
    !Number.isFinite(hostHealth.updatedAt) ||
    hostHealth.updatedAt < 0
  ) {
    return `threadSettings.directDownloadHealth.${pkgKey}.updatedAt must be a number >= 0.`;
  }

  return "";
}

function validateDirectDownloadHealth(value) {
  if (!isPlainObject(value)) {
    return "threadSettings.directDownloadHealth must be an object.";
  }

  const healthUnknown = hasOnlyKnownKeys(value, Object.keys(defaultDirectDownloadPackages));
  if (healthUnknown) {
    return `threadSettings.directDownloadHealth.${healthUnknown} is not supported.`;
  }

  for (const pkgKey of Object.keys(defaultDirectDownloadPackages)) {
    const hostHealth = value[pkgKey];
    if (typeof hostHealth === "undefined") continue;

    const hostError = validateDirectDownloadHostHealth(pkgKey, hostHealth);
    if (hostError) return hostError;
  }

  return "";
}

function validateThreadSettingEntry(key, value) {
  if (key === "directDownloadPackages") {
    return validateDirectDownloadPackages(value);
  }

  if (key === "directDownloadHealth") {
    return validateDirectDownloadHealth(value);
  }

  if (typeof value !== "boolean") {
    return `threadSettings.${key} must be boolean.`;
  }

  return "";
}

function validateThreadSection(threadSettings) {
  const unknownKey = hasOnlyKnownKeys(threadSettings, Object.keys(defaultThreadSetting));
  if (unknownKey) return `threadSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(threadSettings)) {
    const entryError = validateThreadSettingEntry(key, value);
    if (entryError) return entryError;
  }
  return "";
}

function validateGlobalSection(globalSettings) {
  const unknownKey = hasOnlyKnownKeys(globalSettings, Object.keys(defaultGlobalSettings));
  if (unknownKey) return `globalSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(globalSettings)) {
    if (typeof value !== "boolean") {
      return `globalSettings.${key} must be boolean.`;
    }
  }
  return "";
}

function validateLatestSection(latestSettings) {
  const unknownKey = hasOnlyKnownKeys(latestSettings, Object.keys(defaultLatestSettings));
  if (unknownKey) return `latestSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(latestSettings)) {
    if (key === "minVersion") {
      if (!isValidVersion(value)) {
        return "latestSettings.minVersion must be a number >= 0.";
      }
      continue;
    }
    if (key === "latestOverlayColorOrder") {
      if (!isValidOverlayColorOrder(value)) {
        return "latestSettings.latestOverlayColorOrder is invalid.";
      }
      continue;
    }
    if (typeof value !== "boolean") {
      return `latestSettings.${key} must be boolean.`;
    }
  }
  return "";
}

export function validateImportedPayload(payload) {
  if (!isPlainObject(payload)) {
    return "Imported JSON must be a plain object.";
  }

  const entries = Object.entries(payload).filter(([key]) => EXPORTABLE_CONFIG_KEYS.includes(key));
  if (entries.length === 0) {
    return "JSON does not contain supported settings keys.";
  }

  for (const [key, value] of entries) {
    if (key === "tags") {
      if (!Array.isArray(value)) return "'tags' must be an array.";
      const err = validateTagsSection(value);
      if (err) return err;
      continue;
    }

    if (key === "preferredTags" || key === "excludedTags") {
      if (!Array.isArray(value)) return `'${key}' must be an array.`;
      const err = validateTagIdArray(key, value);
      if (err) return err;
      continue;
    }

    if (key === "color") {
      if (!isPlainObject(value)) return "'color' must be an object.";
      const err = validateColorSection(value);
      if (err) return err;
      continue;
    }

    if (key === "overlaySettings") {
      if (!isPlainObject(value)) return "'overlaySettings' must be an object.";
      const err = validateOverlaySection(value);
      if (err) return err;
      continue;
    }

    if (key === "threadSettings") {
      if (!isPlainObject(value)) return "'threadSettings' must be an object.";
      const err = validateThreadSection(value);
      if (err) return err;
      continue;
    }

    if (key === "globalSettings") {
      if (!isPlainObject(value)) return "'globalSettings' must be an object.";
      const err = validateGlobalSection(value);
      if (err) return err;
      continue;
    }

    if (key === "latestSettings") {
      if (!isPlainObject(value)) return "'latestSettings' must be an object.";
      const err = validateLatestSection(value);
      if (err) return err;
      continue;
    }
  }

  return "";
}
