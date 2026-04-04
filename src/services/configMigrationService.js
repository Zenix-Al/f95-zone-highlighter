import { normalizeObject } from "../utils/objectPath.js";

const LEGACY_THREAD_SETTINGS_KEYS = Object.freeze([
  "skipMaskedLink",
  "directDownloadLinks",
  "directDownloadPackages",
  "directDownloadHealth",
]);

export const LEGACY_STORAGE_KEYS = Object.freeze(["processingDownload", "minVersion"]);

function dropLegacyThreadSettings(threadSettings) {
  const source = normalizeObject(threadSettings);
  const next = { ...source };
  let changed = false;

  for (const key of LEGACY_THREAD_SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    delete next[key];
    changed = true;
  }

  return { changed, next };
}

export async function migrateLegacyConfigPayload(parsed) {
  const source = normalizeObject(parsed);
  const next = { ...source };
  const writes = [];
  const deletes = [];

  const threadSettingsResult = dropLegacyThreadSettings(source.threadSettings);
  if (threadSettingsResult.changed) {
    next.threadSettings = threadSettingsResult.next;
    writes.push(["threadSettings", threadSettingsResult.next]);
  }

  if (Object.prototype.hasOwnProperty.call(source, "processingDownload")) {
    delete next.processingDownload;
    deletes.push("processingDownload");
  }

  if (typeof source.minVersion === "number") {
    const latestSettings = normalizeObject(source.latestSettings);
    if (typeof latestSettings.minVersion === "undefined") {
      const migratedLatest = { ...latestSettings, minVersion: source.minVersion };
      next.latestSettings = migratedLatest;
      writes.push(["latestSettings", migratedLatest]);
    }
    delete next.minVersion;
    deletes.push("minVersion");
  }

  for (const [key, value] of writes) {
    try {
      await GM.setValue(key, value);
    } catch {
      // best effort migration write
    }
  }

  for (const key of deletes) {
    try {
      if (typeof GM.deleteValue === "function") {
        await GM.deleteValue(key);
      }
    } catch {
      // best effort migration cleanup
    }
  }

  return next;
}
