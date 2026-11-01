import { coerceDirectDownloadPackages } from "../hosts/metadata.js";
import { normalizeDownloadCloseDelay } from "../shared/downloadCloseDelay.js";

// Keep the existing key/wire shape so upgrades and older installed copies retain
// their choices. Legacy names are confined to this storage boundary.
export const AUTOMATION_SETTINGS_KEY = "f95ue.addon.maskedDirect.standaloneAutomationPolicy";
const defaults = () => ({
  enabled: true,
  automateRegardless: true,
  skipMaskedPage: true,
  autoCloseTabs: true,
  downloadPageCloseDelayMs: normalizeDownloadCloseDelay(),
  directDownloadPackages: coerceDirectDownloadPackages(),
  needsSettingsRefresh: false,
});
const blocked = () => ({ ...defaults(), enabled: false, automateRegardless: false });

export function createAutomationSettingsRepository({ GMApi } = {}) {
  async function read() {
    if (typeof GMApi?.getValue !== "function") return blocked();
    try {
      const raw = await GMApi.getValue(AUTOMATION_SETTINGS_KEY, null);
      if (raw == null) return defaults();
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        ![1, 2].includes(raw.version) ||
        typeof raw.userPreference !== "boolean" ||
        (raw.version === 2 &&
          (typeof raw.enabled !== "boolean" || typeof raw.autoCloseTabs !== "boolean"))
      )
        return blocked();
      return {
        ...defaults(),
        enabled: raw.enabled !== false,
        automateRegardless: raw.userPreference,
        skipMaskedPage: raw.skipMaskedPage !== false,
        autoCloseTabs: raw.autoCloseTabs !== false,
        downloadPageCloseDelayMs: normalizeDownloadCloseDelay(raw.downloadPageCloseDelayMs),
        directDownloadPackages: coerceDirectDownloadPackages(raw.directDownloadPackages),
        // v1 did not mirror enabled/host switches; require a full settings read.
        needsSettingsRefresh: raw.version === 1 || raw.needsSettingsRefresh === true,
      };
    } catch {
      return blocked();
    }
  }

  async function updateSettings(changes = {}) {
    const current = await read();
    const next = { ...current };
    for (const key of ["enabled", "automateRegardless", "skipMaskedPage", "autoCloseTabs"]) {
      if (typeof changes[key] === "boolean") next[key] = changes[key];
    }
    if (changes.downloadPageCloseDelayMs !== undefined)
      next.downloadPageCloseDelayMs = normalizeDownloadCloseDelay(changes.downloadPageCloseDelayMs);
    if (
      changes.directDownloadPackages &&
      typeof changes.directDownloadPackages === "object" &&
      !Array.isArray(changes.directDownloadPackages)
    )
      next.directDownloadPackages = coerceDirectDownloadPackages(changes.directDownloadPackages);
    if (
      typeof changes.enabled === "boolean" &&
      typeof changes.automateRegardless === "boolean" &&
      changes.directDownloadPackages &&
      typeof changes.directDownloadPackages === "object" &&
      !Array.isArray(changes.directDownloadPackages)
    )
      next.needsSettingsRefresh = false;
    if (typeof GMApi?.setValue !== "function") return current;
    try {
      await GMApi.setValue(AUTOMATION_SETTINGS_KEY, {
        version: 2,
        enabled: next.enabled,
        userPreference: next.automateRegardless,
        skipMaskedPage: next.skipMaskedPage,
        autoCloseTabs: next.autoCloseTabs,
        downloadPageCloseDelayMs: next.downloadPageCloseDelayMs,
        directDownloadPackages: next.directDownloadPackages,
        ...(next.needsSettingsRefresh ? { needsSettingsRefresh: true } : {}),
      });
      return next;
    } catch {
      return current;
    }
  }
  return { read, updateSettings };
}
