import {
  coerceDirectDownloadPackages,
  createDirectDownloadPackageDefaults,
  createDirectDownloadPanelSettings,
} from "../hosts/metadata.js";
import {
  DEFAULT_DOWNLOAD_CLOSE_DELAY_MS,
  MIN_DOWNLOAD_CLOSE_DELAY_MS,
  normalizeDownloadCloseDelay,
} from "../shared/downloadCloseDelay.js";

export const ADDON_SETTINGS_KEY = "settings";
export const ADDON_SETTINGS_DEFAULT = Object.freeze({
  automateRegardless: true,
  skipMaskedPage: true,
  autoCloseTabs: true,
  downloadPageCloseDelayMs: DEFAULT_DOWNLOAD_CLOSE_DELAY_MS,
  directDownloadPackages: createDirectDownloadPackageDefaults(),
});
export const ADDON_PANEL_SETTINGS = Object.freeze([
  {
    id: "skipMaskedPage",
    path: "skipMaskedPage",
    text: "Skip the F95 download countdown",
    tooltip: "Click Continue 250ms after its button is ready. Turn off to leave the native countdown alone. Never closes this intermediate page.",
  },
  {
    id: "automateRegardless",
    path: "automateRegardless",
    text: "Automate supported host pages",
    tooltip:
      "Automate approved host routes regardless of where the tab came from. Enabled by default for new installs; saved choices and host switches are respected.",
  },
  {
    id: "autoCloseTabs",
    path: "autoCloseTabs",
    text: "Close download tabs after the final download action",
    tooltip:
      "Enabled by default, including manually opened tabs. Waits the configured delay after a validated final action; the browser may refuse to close a tab. This does not detect when the file finishes saving.",
  },
  {
    id: "downloadPageCloseDelayMs",
    path: "downloadPageCloseDelayMs",
    text: "Download tab close delay (ms)",
    tooltip:
      "Wait after a validated final download action before trying to close this tab. Minimum: 3000ms. Disabled when automatic closing is off.",
    type: "number",
    min: MIN_DOWNLOAD_CLOSE_DELAY_MS,
  },
  ...createDirectDownloadPanelSettings(),
]);

export function createMaskedDirectSettings({ bridge, onSettingsRead, onEnabledChanged }) {
  let cache = null;
  let cacheTimestamp = 0;
  let lastReadSucceeded = false;

  async function storageGet(key, defaultValue) {
    lastReadSucceeded = false;
    const result = await bridge.invokeCoreAction("storage.get", {
      key,
      defaultValue,
    });
    if (!result?.ok) return defaultValue;
    lastReadSucceeded = true;
    return typeof result.value === "undefined" ? defaultValue : result.value;
  }

  async function storageSet(key, value) {
    const result = await bridge.invokeCoreAction("storage.set", { key, value });
    if (result?.ok && key === "enabled") await onEnabledChanged?.(value !== false);
    return result;
  }

  async function read(force = false) {
    const now = Date.now();
    if (!force && cache && now - cacheTimestamp < 1500) return cache;

    const result = await storageGet(ADDON_SETTINGS_KEY, ADDON_SETTINGS_DEFAULT);
    const parsed = result && typeof result === "object" ? result : ADDON_SETTINGS_DEFAULT;
    cache = {
      automateRegardless: parsed.automateRegardless !== false,
      skipMaskedPage: parsed.skipMaskedPage !== false,
      autoCloseTabs: parsed.autoCloseTabs !== false,
      downloadPageCloseDelayMs: normalizeDownloadCloseDelay(
        parsed.downloadPageCloseDelayMs,
        ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
      ),
      directDownloadPackages: coerceDirectDownloadPackages(parsed.directDownloadPackages),
    };
    cacheTimestamp = now;
    if (lastReadSucceeded && typeof onSettingsRead === "function") await onSettingsRead(cache);
    return cache;
  }

  return {
    read,
    invalidate() {
      cache = null;
      cacheTimestamp = 0;
    },
    getSnapshot: () => cache,
    storageGet,
    storageSet,
  };
}
