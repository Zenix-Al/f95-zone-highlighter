/**
 * GM Storage Helper
 * Provides cross-domain access to settings via GM (GreaseMonkey) storage.
 * This allows download pages (different domains) to access settings from the origin page.
 */

const GM_STORAGE_PREFIX = "f95ue_dd_";
const GM_STORAGE_DELAY_KEY = "downloadPageCloseDelayMs";
const GM_STORAGE_TIMEOUT_MS = 2000; // Cache duration

/**
 * Store the download page close delay in GM storage
 * @param {GMApi} GMApi - GreaseMonkey API object (GM)
 * @param {number} delayMs - Delay in milliseconds
 */
export async function storeDownloadPageCloseDelay(GMApi, delayMs) {
  if (!GMApi?.setValue) return;

  try {
    const key = GM_STORAGE_PREFIX + GM_STORAGE_DELAY_KEY;
    const value = {
      delayMs: Number.isFinite(delayMs) ? delayMs : 3500,
      timestamp: Date.now(),
    };
    await GMApi.setValue(key, JSON.stringify(value));
    console.info("[Download Delay] Stored delay:", delayMs, "ms");
  } catch (err) {
    console.warn("[Download Delay] Failed to store delay:", err);
  }
}

/**
 * Retrieve the download page close delay from GM storage
 * @param {GMApi} GMApi - GreaseMonkey API object (GM)
 * @param {number} defaultValue - Default delay if not found
 * @returns {Promise<number>} - Delay in milliseconds
 */
export async function getDownloadPageCloseDelay(GMApi, defaultValue = 3500) {
  if (!GMApi?.getValue) return defaultValue;

  try {
    const key = GM_STORAGE_PREFIX + GM_STORAGE_DELAY_KEY;
    const stored = await GMApi.getValue(key);

    if (!stored) {
      console.info("[Download Delay] No stored delay found, using default:", defaultValue);
      return defaultValue;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.delayMs !== "number") {
      console.warn("[Download Delay] Invalid stored delay format, using default");
      return defaultValue;
    }

    // Check if cache is still valid (not older than timeout)
    const age = Date.now() - (parsed.timestamp || 0);
    if (age > GM_STORAGE_TIMEOUT_MS) {
      console.info("[Download Delay] Stored delay expired, using default");
      return defaultValue;
    }

    console.info("[Download Delay] Retrieved delay:", parsed.delayMs, "ms (age:", age, "ms)");
    return parsed.delayMs;
  } catch (err) {
    console.warn("[Download Delay] Failed to retrieve delay:", err);
    return defaultValue;
  }
}

/**
 * Clear the stored delay from GM storage
 * @param {GMApi} GMApi - GreaseMonkey API object (GM)
 */
export async function clearDownloadPageCloseDelay(GMApi) {
  if (!GMApi?.deleteValue) return;

  try {
    const key = GM_STORAGE_PREFIX + GM_STORAGE_DELAY_KEY;
    await GMApi.deleteValue(key);
    console.info("[Download Delay] Cleared stored delay");
  } catch (err) {
    console.warn("[Download Delay] Failed to clear delay:", err);
  }
}
