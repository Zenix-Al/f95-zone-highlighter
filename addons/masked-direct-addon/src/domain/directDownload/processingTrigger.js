import { normalizeDownloadCloseDelay } from "../../shared/downloadCloseDelay.js";

const LEGACY_TRIGGER_KEY = "f95ue.addon.maskedDirect.processingDownload";
const REQUEST_KEY_PREFIX = "f95ue.addon.maskedDirect.request.";
const SOURCE_KEY_PREFIX = "f95ue.addon.maskedDirect.source.";
const REQUEST_TTL_MS = 2 * 60 * 1000;
const LEGACY_MAX_ITEMS = 20;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

export function createInactiveProcessingDownloadTrigger() {
  return {
    active: false,
    requestId: "",
    ownerTabId: "",
    host: "",
    sourceIdentity: "",
    createdAt: 0,
    expiresAt: 0,
    closeDelayMs: 0,
    status: "",
    sourceUrl: "",
  };
}

export function normalizeProcessingDownloadTrigger(raw) {
  const fallback = createInactiveProcessingDownloadTrigger();
  if (!raw || typeof raw !== "object") return fallback;

  const requestId = normalizeRequestId(raw.requestId);
  const trigger = {
    active: raw.active === true,
    requestId,
    ownerTabId: String(raw.ownerTabId || "").trim().slice(0, 120),
    host: String(raw.host || "").trim().toLowerCase().slice(0, 120),
    sourceIdentity: String(raw.sourceIdentity || getSourceIdentity(raw.sourceUrl))
      .trim()
      .slice(0, 500),
    createdAt: Number(raw.createdAt || 0),
    expiresAt: Number(raw.expiresAt || 0),
    closeDelayMs: normalizeCloseDelay(raw.closeDelayMs),
    status: normalizeStatus(raw.status),
    sourceUrl: String(raw.sourceUrl || "").trim().slice(0, 4096),
  };

  if (!requestId || !Number.isFinite(trigger.createdAt) || trigger.createdAt <= 0)
    return fallback;
  if (!Number.isFinite(trigger.expiresAt) || trigger.expiresAt <= 0)
    return fallback;
  return isProcessingDownloadTriggerActive(trigger) ? trigger : fallback;
}

export function normalizeProcessingDownloadTriggers(raw) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : raw?.active
        ? [raw]
        : [];
  const seen = new Set();
  return source
    .map(normalizeProcessingDownloadTrigger)
    .filter((trigger) => {
      if (!trigger.active || seen.has(trigger.requestId)) return false;
      seen.add(trigger.requestId);
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-LEGACY_MAX_ITEMS);
}

export function isProcessingDownloadTriggerActive(trigger) {
  return Boolean(trigger?.active && trigger.expiresAt > Date.now());
}

export async function readProcessingDownloadTriggers(GMApi) {
  if (!GMApi?.getValue) return [];
  try {
    return normalizeProcessingDownloadTriggers(
      await GMApi.getValue(LEGACY_TRIGGER_KEY, { items: [] }),
    );
  } catch {
    return [];
  }
}

export async function readProcessingDownloadTrigger(
  GMApi,
  { requestId = "" } = {},
) {
  const requestedId = normalizeRequestId(requestId);
  if (!requestedId || !GMApi?.getValue) {
    return createInactiveProcessingDownloadTrigger();
  }

  try {
    const requestKey = getRequestKey(requestedId);
    const rawCurrent = await GMApi.getValue(requestKey, null);
    const current = normalizeProcessingDownloadTrigger(rawCurrent);
    if (current.active && current.requestId === requestedId) return current;
    if (
      rawCurrent &&
      String(rawCurrent.requestId || "").trim() === requestedId &&
      Number(rawCurrent.expiresAt || 0) <= Date.now()
    ) {
      if (typeof GMApi.deleteValue === "function") {
        await GMApi.deleteValue(requestKey);
      } else if (typeof GMApi.setValue === "function") {
        await GMApi.setValue(requestKey, null);
      }
    }

    // Bounded compatibility for a flow opened by the preceding release.
    return (
      (await readProcessingDownloadTriggers(GMApi)).find(
        (trigger) => trigger.requestId === requestedId,
      ) || createInactiveProcessingDownloadTrigger()
    );
  } catch {
    return createInactiveProcessingDownloadTrigger();
  }
}

export async function clearProcessingDownloadTrigger(
  GMApi,
  { requestId = "" } = {},
) {
  const requestedId = normalizeRequestId(requestId);
  if (!requestedId || !GMApi) return false;
  try {
    const current = await readProcessingDownloadTrigger(GMApi, {
      requestId: requestedId,
    });
    const key = getRequestKey(requestedId);
    if (typeof GMApi.deleteValue === "function") {
      await GMApi.deleteValue(key);
    } else if (typeof GMApi.setValue === "function") {
      await GMApi.setValue(key, null);
    }
    if (current.active) {
      await removeSourceLookup(GMApi, current);
    }
    return true;
  } catch {
    return false;
  }
}

export async function setProcessingDownloadTrigger(
  GMApi,
  {
    host = "",
    sourceUrl = "",
    ownerTabId = "",
    requestId = "",
    closeDelayMs = 3500,
    status = "active",
  } = {},
) {
  if (!GMApi?.setValue) return createInactiveProcessingDownloadTrigger();
  const now = Date.now();
  const resolvedRequestId =
    normalizeRequestId(requestId) ||
    `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = normalizeProcessingDownloadTrigger({
    active: true,
    requestId: resolvedRequestId,
    ownerTabId,
    host,
    sourceIdentity: getSourceIdentity(sourceUrl),
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS,
    closeDelayMs,
    status,
    sourceUrl,
  });
  if (!payload.active) return payload;
  try {
    await GMApi.setValue(getRequestKey(resolvedRequestId), payload);
    await addSourceLookup(GMApi, payload);
    return payload;
  } catch {
    return createInactiveProcessingDownloadTrigger();
  }
}

export async function readProcessingDownloadTriggerBySource(
  GMApi,
  { host = "", sourceIdentifier = "" } = {},
) {
  const normalizedHost = String(host || "").trim().toLowerCase();
  const normalizedIdentifier = normalizeSourceIdentifier(sourceIdentifier);
  if (
    !["datanodes.to", "download.gg", "drive.google.com"].includes(
      normalizedHost,
    ) ||
    !normalizedIdentifier ||
    !GMApi?.getValue
  ) {
    return createInactiveProcessingDownloadTrigger();
  }

  try {
    const entries = normalizeSourceLookupEntries(
      await GMApi.getValue(
        getSourceKey(getSourceLookupIdentifier(normalizedHost, normalizedIdentifier)),
        [],
      ),
    );
    const live = [];
    for (const entry of entries) {
      const trigger = await readProcessingDownloadTrigger(GMApi, {
        requestId: entry.requestId,
      });
      if (
        trigger.active &&
        trigger.host === normalizedHost &&
        getSourceIdentifier(trigger.sourceUrl, normalizedHost) ===
          normalizedIdentifier
      ) {
        live.push(trigger);
      }
    }
    return live.length === 1
      ? live[0]
      : createInactiveProcessingDownloadTrigger();
  } catch {
    return createInactiveProcessingDownloadTrigger();
  }
}

export async function updateProcessingDownloadTrigger(
  GMApi,
  requestId,
  updates = {},
) {
  const current = await readProcessingDownloadTrigger(GMApi, { requestId });
  if (!current.active || !GMApi?.setValue) return current;
  const next = normalizeProcessingDownloadTrigger({
    ...current,
    status: updates.status ?? current.status,
    expiresAt: updates.expiresAt ?? current.expiresAt,
  });
  if (!next.active) return createInactiveProcessingDownloadTrigger();
  await GMApi.setValue(getRequestKey(next.requestId), next);
  return next;
}

function getRequestKey(requestId) {
  return `${REQUEST_KEY_PREFIX}${requestId}`;
}

async function addSourceLookup(GMApi, trigger) {
  const identifier = getSourceIdentifier(trigger.sourceUrl, trigger.host);
  if (
    !["datanodes.to", "download.gg", "drive.google.com"].includes(
      trigger.host,
    ) ||
    !identifier
  )
    return;
  const key = getSourceKey(getSourceLookupIdentifier(trigger.host, identifier));
  try {
    const current = normalizeSourceLookupEntries(
      await GMApi.getValue(key, []),
    ).filter((entry) => entry.expiresAt > Date.now());
    const entries = [];
    for (const entry of current) {
      if (entry.requestId === trigger.requestId) continue;
      const existing = await readProcessingDownloadTrigger(GMApi, {
        requestId: entry.requestId,
      });
      if (
        existing.active &&
        trigger.ownerTabId &&
        existing.ownerTabId === trigger.ownerTabId
      ) {
        if (typeof GMApi.deleteValue === "function") {
          await GMApi.deleteValue(getRequestKey(existing.requestId));
        } else {
          await GMApi.setValue(getRequestKey(existing.requestId), null);
        }
        continue;
      }
      entries.push(entry);
    }
    entries.push({
      requestId: trigger.requestId,
      expiresAt: trigger.expiresAt,
    });
    await GMApi.setValue(key, entries.slice(-4));
  } catch {
    // The request record remains authoritative; markerless recovery is optional.
  }
}

async function removeSourceLookup(GMApi, trigger) {
  const identifier = getSourceIdentifier(trigger.sourceUrl, trigger.host);
  if (
    !["datanodes.to", "download.gg", "drive.google.com"].includes(
      trigger.host,
    ) ||
    !identifier ||
    !GMApi?.getValue
  )
    return;
  const key = getSourceKey(getSourceLookupIdentifier(trigger.host, identifier));
  try {
    const remaining = normalizeSourceLookupEntries(
      await GMApi.getValue(key, []),
    ).filter(
      (entry) =>
        entry.requestId !== trigger.requestId && entry.expiresAt > Date.now(),
    );
    if (remaining.length) {
      await GMApi.setValue(key, remaining);
    } else if (typeof GMApi.deleteValue === "function") {
      await GMApi.deleteValue(key);
    } else if (typeof GMApi.setValue === "function") {
      await GMApi.setValue(key, null);
    }
  } catch {
    // TTL validation prevents stale lookup entries from authorizing automation.
  }
}

function normalizeSourceLookupEntries(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  return source
    .map((entry) => ({
      requestId: normalizeRequestId(entry?.requestId),
      expiresAt: Number(entry?.expiresAt || 0),
    }))
    .filter((entry) => {
      if (
        !entry.requestId ||
        !Number.isFinite(entry.expiresAt) ||
        entry.expiresAt <= 0 ||
        seen.has(entry.requestId)
      ) {
        return false;
      }
      seen.add(entry.requestId);
      return true;
    })
    .slice(-4);
}

function getSourceKey(identifier) {
  return `${SOURCE_KEY_PREFIX}${encodeURIComponent(identifier).slice(0, 500)}`;
}

function getSourceFileIdentifier(sourceUrl) {
  try {
    const parsed = new URL(String(sourceUrl || ""));
    const segments = parsed.pathname.split("/").filter(Boolean);
    return normalizeSourceIdentifier(
      decodeURIComponent((segments.at(-1) || "").replace(/\+/g, " ")),
    );
  } catch {
    return "";
  }
}

function getSourceIdentifier(sourceUrl, host) {
  if (host === "download.gg") {
    try {
      return normalizeSourceIdentifier(
        new URL(String(sourceUrl || "")).pathname.replace(/\/+$/, ""),
      );
    } catch {
      return "";
    }
  }
  if (host === "drive.google.com") {
    try {
      const parsed = new URL(String(sourceUrl || ""));
      const pathMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
      return normalizeSourceIdentifier(
        pathMatch?.[1] || parsed.searchParams.get("id") || "",
      );
    } catch {
      return "";
    }
  }
  return getSourceFileIdentifier(sourceUrl);
}

function getSourceLookupIdentifier(host, identifier) {
  return host === "datanodes.to" ? identifier : `${host}:${identifier}`;
}

function normalizeSourceIdentifier(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeRequestId(value) {
  const id = String(value || "").trim();
  return REQUEST_ID_PATTERN.test(id) ? id : "";
}

function normalizeCloseDelay(value) {
  return normalizeDownloadCloseDelay(value);
}

function normalizeStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return ["active", "completed", "failed", "timed-out"].includes(status)
    ? status
    : "active";
}

function getSourceIdentity(sourceUrl) {
  try {
    const parsed = new URL(String(sourceUrl || ""));
    parsed.hash = "";
    for (const key of ["f95ue_dd", "f95ue_tab", "f95ue_dd_ts", "f95ue_dd_req"]) {
      parsed.searchParams.delete(key);
    }
    return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch {
    return "";
  }
}

export const __processingDownloadTestInternals = {
  getSourceFileIdentifier,
  getSourceIdentifier,
  getSourceKey,
  getRequestKey,
  legacyKey: LEGACY_TRIGGER_KEY,
  requestKeyPrefix: REQUEST_KEY_PREFIX,
  sourceKeyPrefix: SOURCE_KEY_PREFIX,
};
