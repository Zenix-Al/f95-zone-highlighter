import { normalizeDirectDownloadHost } from "../hosts/metadata.js";

export const STANDALONE_RUN_GUARD_PREFIX =
  "f95ue.addon.maskedDirect.standaloneRun.";
export const STANDALONE_RUN_CLAIM_TTL_MS = 2 * 60 * 1000;

export function createStandaloneRunGuard({
  storage = sessionStorage,
  now = Date.now,
} = {}) {
  function getKey(host, url = location.href) {
    return getStandaloneRunGuardKey(host, url);
  }

  function claim(host, url = location.href) {
    const key = getKey(host, url);
    if (!key || !storage) return false;
    const timestamp = now();
    const current = readRecord(storage, key);
    if (current?.state === "complete") return false;
    if (
      current?.state === "running" &&
      timestamp - current.timestamp < STANDALONE_RUN_CLAIM_TTL_MS
    ) {
      return false;
    }
    return writeRecord(storage, key, { state: "running", timestamp });
  }

  function complete(host, url = location.href) {
    const key = getKey(host, url);
    return key
      ? writeRecord(storage, key, { state: "complete", timestamp: now() })
      : false;
  }

  function release(host, url = location.href) {
    const key = getKey(host, url);
    if (!key || !storage) return false;
    try {
      const current = readRecord(storage, key);
      if (current?.state !== "running") return false;
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  return { claim, complete, getKey, release };
}

export function getStandaloneRunGuardKey(host, url = location.href) {
  try {
    const parsed = new URL(url);
    const canonical =
      normalizeDirectDownloadHost(host || parsed.hostname) ||
      normalizeDirectDownloadHost(parsed.hostname);
    if (!canonical) return "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${STANDALONE_RUN_GUARD_PREFIX}${encodeURIComponent(
      `${canonical}:${pathname}`,
    )}`;
  } catch {
    return "";
  }
}

function readRecord(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    if (
      !parsed ||
      !["running", "complete"].includes(parsed.state) ||
      !Number.isFinite(Number(parsed.timestamp))
    ) {
      return null;
    }
    return { state: parsed.state, timestamp: Number(parsed.timestamp) };
  } catch {
    return null;
  }
}

function writeRecord(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
