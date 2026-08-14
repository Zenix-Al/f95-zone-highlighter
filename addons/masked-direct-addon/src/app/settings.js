import {
  coerceDirectDownloadPackages,
  createDirectDownloadPackageDefaults,
  createDirectDownloadPanelSettings,
} from "../hosts/metadata.js";
import { getDownloadPageCloseDelay } from "../ports/downloadSettingsRepository.js";
import {
  DEFAULT_DOWNLOAD_CLOSE_DELAY_MS,
  MIN_DOWNLOAD_CLOSE_DELAY_MS,
  normalizeDownloadCloseDelay,
} from "../shared/downloadCloseDelay.js";

export const ADDON_SETTINGS_KEY = "settings";
export const ADDON_SETTINGS_DEFAULT = Object.freeze({
  skipMaskedLink: true,
  directDownloadLinks: true,
  automateRegardless: false,
  downloadPageCloseDelayMs: DEFAULT_DOWNLOAD_CLOSE_DELAY_MS,
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
    id: "automateRegardless",
    path: "automateRegardless",
    text: "Automate supported hosts regardless of F95 request",
    tooltip:
      "Automatically trigger downloads on approved direct host file pages even when they were opened manually. Manually opened tabs remain open. This saved preference stays off by default; a confirmed missing core may temporarily force the effective behavior without changing it.",
  },
  {
    id: "downloadPageCloseDelayMs",
    path: "downloadPageCloseDelayMs",
    text: "Managed download tab close delay (ms)",
    tooltip:
      "Wait this long after a host triggers its final download action, then close the managed tab. This does not limit host automation. Minimum: 3000ms.",
    type: "number",
    min: MIN_DOWNLOAD_CLOSE_DELAY_MS,
  },
  ...createDirectDownloadPanelSettings(),
]);

export function createMaskedDirectSettings({ bridge, GMApi, onSettingsRead }) {
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
      automateRegardless: parsed.automateRegardless === true,
      downloadPageCloseDelayMs: normalizeDownloadCloseDelay(
        parsed.downloadPageCloseDelayMs,
        ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
      ),
      directDownloadPackages: coerceDirectDownloadPackages(
        parsed.directDownloadPackages,
      ),
    };
    cacheTimestamp = now;
    if (typeof onSettingsRead === "function") await onSettingsRead(cache);
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
