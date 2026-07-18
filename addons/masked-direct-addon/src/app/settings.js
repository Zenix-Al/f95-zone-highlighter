import {
  coerceDirectDownloadPackages,
  createDirectDownloadPackageDefaults,
  createDirectDownloadPanelSettings,
} from "../hosts/metadata.js";
import { getDownloadPageCloseDelay } from "../ports/downloadSettingsRepository.js";

export const ADDON_SETTINGS_KEY = "settings";
export const ADDON_SETTINGS_DEFAULT = Object.freeze({
  skipMaskedLink: true,
  directDownloadLinks: true,
  downloadPageCloseDelayMs: 3500,
  directDownloadPackages: createDirectDownloadPackageDefaults(),
});
export const ADDON_PANEL_SETTINGS = Object.freeze([
  {
    id: "skipMaskedLink",
    path: "skipMaskedLink",
    text: "Resolve button on masked links",
    tooltip:
      "Show a Resolve button next to masked links. Native clicks stay unchanged; Resolve performs masked-link resolution and direct-download routing.",
  },
  {
    id: "directDownloadLinks",
    path: "directDownloadLinks",
    text: "Direct Download Links",
    tooltip:
      "Enable direct download links for supported file hosts. Works independently outside of masked links.",
  },
  {
    id: "downloadPageCloseDelayMs",
    path: "downloadPageCloseDelayMs",
    text: "Download page close delay (ms)",
    tooltip:
      "Adjust the delay before closing download-host tabs. Increase if the download dialog doesn't appear before the tab closes (slow connection). Decrease on fast connections. Range: 500-10000ms.",
    type: "number",
    min: 500,
    max: 10000,
  },
  ...createDirectDownloadPanelSettings(),
]);

export function createMaskedDirectSettings({ bridge, GMApi }) {
  let cache = null;
  let cacheTimestamp = 0;

  async function storageGet(key, defaultValue) {
    const result = await bridge.invokeCoreAction("storage.get", {
      key,
      defaultValue,
    });
    if (!result?.ok) return defaultValue;
    return typeof result.value === "undefined" ? defaultValue : result.value;
  }

  function storageSet(key, value) {
    return bridge.invokeCoreAction("storage.set", { key, value });
  }

  async function read(force = false) {
    const now = Date.now();
    if (!force && cache && now - cacheTimestamp < 1500) return cache;

    const result = await storageGet(ADDON_SETTINGS_KEY, ADDON_SETTINGS_DEFAULT);
    const parsed =
      result && typeof result === "object" ? result : ADDON_SETTINGS_DEFAULT;
    cache = {
      skipMaskedLink: parsed.skipMaskedLink !== false,
      directDownloadLinks: parsed.directDownloadLinks !== false,
      downloadPageCloseDelayMs: Number.isFinite(parsed.downloadPageCloseDelayMs)
        ? Math.max(500, Math.min(10000, parsed.downloadPageCloseDelayMs))
        : ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
      directDownloadPackages: coerceDirectDownloadPackages(
        parsed.directDownloadPackages,
      ),
    };
    cacheTimestamp = now;
    return cache;
  }

  async function getDownloadCloseDelay() {
    if (cache?.downloadPageCloseDelayMs) {
      return cache.downloadPageCloseDelayMs;
    }
    return getDownloadPageCloseDelay(
      GMApi,
      ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
    );
  }

  return {
    read,
    invalidate() {
      cache = null;
      cacheTimestamp = 0;
    },
    getSnapshot: () => cache,
    getDownloadCloseDelay,
    storageGet,
    storageSet,
  };
}
