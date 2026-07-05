const DIRECT_DOWNLOAD_TRIGGER_KEY =
  "f95ue.addon.maskedDirect.processingDownload";
const DIRECT_DOWNLOAD_TRIGGER_TTL_MS = 2 * 60 * 1000;
const DIRECT_DOWNLOAD_TRIGGER_MAX_ITEMS = 20;

export function createInactiveProcessingDownloadTrigger() {
  return {
    active: false,
    requestId: "",
    ownerTabId: "",
    host: "",
    createdAt: 0,
    expiresAt: 0,
    sourceUrl: "",
  };
}

export function normalizeProcessingDownloadTrigger(raw) {
  const fallback = createInactiveProcessingDownloadTrigger();
  if (!raw || typeof raw !== "object") return fallback;

  const trigger = {
    active: raw.active === true,
    requestId: String(raw.requestId || "").trim(),
    ownerTabId: String(raw.ownerTabId || "").trim(),
    host: String(raw.host || "")
      .trim()
      .toLowerCase(),
    createdAt: Number(raw.createdAt || 0),
    expiresAt: Number(raw.expiresAt || 0),
    sourceUrl: String(raw.sourceUrl || "").trim(),
  };

  if (!Number.isFinite(trigger.createdAt) || trigger.createdAt <= 0)
    trigger.createdAt = 0;
  if (!Number.isFinite(trigger.expiresAt) || trigger.expiresAt <= 0)
    trigger.expiresAt = 0;

  if (!isProcessingDownloadTriggerActive(trigger)) {
    return fallback;
  }

  return trigger;
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
  const result = [];

  for (const item of source) {
    const trigger = normalizeProcessingDownloadTrigger(item);
    if (!isProcessingDownloadTriggerActive(trigger) || !trigger.requestId)
      continue;
    if (seen.has(trigger.requestId)) continue;
    seen.add(trigger.requestId);
    result.push(trigger);
  }

  return result
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-DIRECT_DOWNLOAD_TRIGGER_MAX_ITEMS);
}

export function isProcessingDownloadTriggerActive(trigger) {
  return Boolean(trigger?.active && trigger.expiresAt > Date.now());
}

export async function readProcessingDownloadTriggers(GMApi) {
  if (!GMApi || typeof GMApi.getValue !== "function") {
    return [];
  }
  try {
    const raw = await GMApi.getValue(DIRECT_DOWNLOAD_TRIGGER_KEY, {
      items: [],
    });
    return normalizeProcessingDownloadTriggers(raw);
  } catch {
    return [];
  }
}

export async function readProcessingDownloadTrigger(
  GMApi,
  { requestId = "" } = {},
) {
  const triggers = await readProcessingDownloadTriggers(GMApi);
  const requestedId = String(requestId || "").trim();
  if (requestedId) {
    return (
      triggers.find((trigger) => trigger.requestId === requestedId) ||
      createInactiveProcessingDownloadTrigger()
    );
  }
  return (
    triggers[triggers.length - 1] || createInactiveProcessingDownloadTrigger()
  );
}

export async function clearProcessingDownloadTrigger(
  GMApi,
  { requestId = "" } = {},
) {
  if (!GMApi || typeof GMApi.setValue !== "function") return;
  const requestedId = String(requestId || "").trim();
  try {
    if (!requestedId) {
      await GMApi.setValue(DIRECT_DOWNLOAD_TRIGGER_KEY, { items: [] });
      return;
    }

    const next = (await readProcessingDownloadTriggers(GMApi)).filter(
      (trigger) => trigger.requestId !== requestedId,
    );
    await GMApi.setValue(DIRECT_DOWNLOAD_TRIGGER_KEY, { items: next });
  } catch {
    // best effort
  }
}

export async function setProcessingDownloadTrigger(
  GMApi,
  { host = "", sourceUrl = "", ownerTabId = "", requestId = "" } = {},
) {
  if (!GMApi || typeof GMApi.setValue !== "function") return;
  const now = Date.now();
  const payload = {
    active: true,
    requestId:
      String(requestId || "").trim() ||
      `${now}-${Math.random().toString(36).slice(2, 8)}`,
    ownerTabId: String(ownerTabId || "").trim(),
    host: String(host || "")
      .trim()
      .toLowerCase(),
    createdAt: now,
    expiresAt: now + DIRECT_DOWNLOAD_TRIGGER_TTL_MS,
    sourceUrl: String(sourceUrl || ""),
  };
  try {
    const existing = await readProcessingDownloadTriggers(GMApi);
    const next = existing
      .filter((trigger) => !isSameTriggerScope(trigger, payload))
      .concat(payload)
      .slice(-DIRECT_DOWNLOAD_TRIGGER_MAX_ITEMS);
    await GMApi.setValue(DIRECT_DOWNLOAD_TRIGGER_KEY, { items: next });
  } catch {
    // best effort
  }
}

function isSameTriggerScope(left, right) {
  if (!left || !right) return false;
  if (left.requestId === right.requestId) return true;
  if (left.host !== right.host) return false;
  if (left.ownerTabId !== right.ownerTabId) return false;
  return getSourceKey(left.sourceUrl) === getSourceKey(right.sourceUrl);
}

function getSourceKey(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    for (const key of [
      "f95ue_dd",
      "f95ue_tab",
      "f95ue_dd_ts",
      "f95ue_dd_req",
    ]) {
      parsed.searchParams.delete(key);
    }
    return parsed.href;
  } catch {
    return String(sourceUrl || "").trim();
  }
}
