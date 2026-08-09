import { normalizeDirectDownloadHost } from "../hosts/metadata.js";
import { getSafeSessionStorage } from "./safeSessionStorage.js";

export const STANDALONE_CONTINUATION_PREFIX =
  "f95ue.addon.maskedDirect.standaloneContinuation.";
export const STANDALONE_CONTINUATION_TTL_MS = 2 * 60 * 1000;
const WINDOW_NAME_MARKER = "|f95ue-md-cont:";

export function createStandaloneContinuationStore({
  storage = getSafeSessionStorage(),
  now = Date.now,
  createNonce = defaultNonce,
  nameTransport = createWindowNameTransport(),
} = {}) {
  function claim({ host, identity, nextStage }) {
    const canonicalHost = normalizeDirectDownloadHost(host);
    const normalizedIdentity = normalizeIdentity(identity);
    const stage = normalizeStage(nextStage);
    if (!storage || !canonicalHost || !normalizedIdentity || !stage) return null;
    const createdAt = now();
    const key = getKey(canonicalHost);
    const existing = readRecord(storage, key);
    if (existing?.expiresAt > createdAt) {
      return existing.host === canonicalHost &&
        existing.identity === normalizedIdentity &&
        existing.nextStage === stage
        ? existing
        : null;
    }
    if (existing) remove(storage, key);
    const record = {
      host: canonicalHost,
      nonce: String(createNonce() || ""),
      identity: normalizedIdentity,
      nextStage: stage,
      createdAt,
      expiresAt: createdAt + STANDALONE_CONTINUATION_TTL_MS,
    };
    if (
      !record.nonce ||
      (!writeRecord(storage, key, record) && !nameTransport?.write(record))
    )
      return null;
    nameTransport?.write(record);
    return record;
  }

  function inspect({ host, identity = "", stage }) {
    const canonicalHost = normalizeDirectDownloadHost(host);
    const key = getKey(canonicalHost);
    if (!storage || !key) return null;
    const record =
      readRecord(storage, key) || normalizeRecord(nameTransport?.read());
    if (!record) {
      clearRecord(storage, key, nameTransport);
      return null;
    }
    if (
      record.host !== canonicalHost ||
      record.nextStage !== normalizeStage(stage) ||
      record.expiresAt <= now() ||
      (identity && record.identity !== normalizeIdentity(identity))
    ) {
      clearRecord(storage, key, nameTransport);
      return null;
    }
    return record;
  }

  function consume(criteria) {
    const record = inspect(criteria);
    if (!record) return null;
    clear(criteria.host);
    return record;
  }

  function clear(host) {
    const key = getKey(normalizeDirectDownloadHost(host));
    if (!key) return false;
    clearRecord(storage, key, nameTransport);
    return true;
  }

  return { claim, clear, consume, inspect };
}

function getKey(host) {
  return host
    ? `${STANDALONE_CONTINUATION_PREFIX}${encodeURIComponent(host)}`
    : "";
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStage(value) {
  return String(value || "").trim();
}

function defaultNonce() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function readRecord(storage, key) {
  try {
    return normalizeRecord(JSON.parse(storage.getItem(key) || "null"));
  } catch {
    return null;
  }
}

function normalizeRecord(value) {
  if (
    !value ||
    typeof value.host !== "string" ||
    typeof value.nonce !== "string" ||
    typeof value.identity !== "string" ||
    typeof value.nextStage !== "string" ||
    !Number.isFinite(value.createdAt) ||
    !Number.isFinite(value.expiresAt)
  ) return null;
  return value;
}

function writeRecord(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function clearRecord(storage, key, nameTransport) {
  remove(storage, key);
  nameTransport?.clear();
}

function createWindowNameTransport() {
  if (typeof window === "undefined") return null;
  return {
    read() {
      try {
        const value = String(window.name || "");
        const index = value.lastIndexOf(WINDOW_NAME_MARKER);
        if (index < 0) return null;
        return JSON.parse(decodeURIComponent(value.slice(index + WINDOW_NAME_MARKER.length)));
      } catch {
        return null;
      }
    },
    write(record) {
      try {
        const value = String(window.name || "");
        const index = value.lastIndexOf(WINDOW_NAME_MARKER);
        const base = index < 0 ? value : value.slice(0, index);
        window.name = `${base}${WINDOW_NAME_MARKER}${encodeURIComponent(JSON.stringify(record))}`;
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        const value = String(window.name || "");
        const index = value.lastIndexOf(WINDOW_NAME_MARKER);
        if (index >= 0) window.name = value.slice(0, index);
      } catch {
        // best effort
      }
    },
  };
}
