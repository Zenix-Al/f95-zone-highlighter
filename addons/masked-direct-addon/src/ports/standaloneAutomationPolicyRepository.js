import { coerceDirectDownloadPackages } from "../hosts/metadata.js";
import { normalizeDownloadCloseDelay } from "../shared/downloadCloseDelay.js";

export const STANDALONE_AUTOMATION_POLICY_KEY =
  "f95ue.addon.maskedDirect.standaloneAutomationPolicy";
export const STANDALONE_AUTOMATION_POLICY_VERSION = 2;

const defaults = () => ({
  version: 2,
  enabled: true,
  userPreference: true,
  skipMaskedPage: true,
  autoCloseTabs: true,
  downloadPageCloseDelayMs: normalizeDownloadCloseDelay(),
  directDownloadPackages: coerceDirectDownloadPackages(),
  observedAt: 0,
  needsSettingsRefresh: false,
});
const blocked = () => ({ ...defaults(), enabled: false, userPreference: false });

export function createStandaloneAutomationPolicyRepository({ GMApi, now = Date.now } = {}) {
  async function read() {
    if (typeof GMApi?.getValue !== "function") return blocked();
    try {
      const raw = await GMApi.getValue(STANDALONE_AUTOMATION_POLICY_KEY, null);
      if (raw === null || typeof raw === "undefined") return defaults();
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
      // Legacy core-probe/forcing fields never authorize the standalone pipeline.
      return {
        ...defaults(),
        // v1 never mirrored enabled/host switches: do not invent those choices.
        needsSettingsRefresh: raw.version === 1 || raw.needsSettingsRefresh === true,
        userPreference: raw.userPreference,
        skipMaskedPage: raw.skipMaskedPage !== false,
        enabled: raw.enabled !== false,
        autoCloseTabs: raw.autoCloseTabs !== false,
        downloadPageCloseDelayMs: normalizeDownloadCloseDelay(raw.downloadPageCloseDelayMs),
        directDownloadPackages: coerceDirectDownloadPackages(raw.directDownloadPackages),
        observedAt: Number(raw.observedAt) || 0,
      };
    } catch {
      return blocked();
    }
  }

  async function updateSettings(settings = {}) {
    const current = await read();
    const next = {
      ...current,
      version: 2,
      observedAt: now(),
      needsSettingsRefresh:
        current.needsSettingsRefresh &&
        !(typeof settings.automateRegardless === "boolean" && settings.directDownloadPackages),
      ...(typeof settings.enabled === "boolean" ? { enabled: settings.enabled } : {}),
      ...(typeof settings.skipMaskedPage === "boolean"
        ? { skipMaskedPage: settings.skipMaskedPage }
        : {}),
      ...(typeof settings.automateRegardless === "boolean"
        ? { userPreference: settings.automateRegardless }
        : {}),
      ...(typeof settings.autoCloseTabs === "boolean"
        ? { autoCloseTabs: settings.autoCloseTabs }
        : {}),
      ...(settings.downloadPageCloseDelayMs !== undefined
        ? {
            downloadPageCloseDelayMs: normalizeDownloadCloseDelay(
              settings.downloadPageCloseDelayMs,
            ),
          }
        : {}),
      ...(settings.directDownloadPackages
        ? { directDownloadPackages: coerceDirectDownloadPackages(settings.directDownloadPackages) }
        : {}),
    };
    if (typeof GMApi?.setValue !== "function") return current;
    try {
      await GMApi.setValue(STANDALONE_AUTOMATION_POLICY_KEY, next);
      return next;
    } catch {
      return current;
    }
  }

  async function getEffectivePolicy() {
    const policy = await read();
    return {
      ...policy,
      effectiveAutomateRegardless:
        policy.enabled && policy.userPreference && !policy.needsSettingsRefresh,
    };
  }
  return { read, updateSettings, getEffectivePolicy };
}
