const DIRECT_DOWNLOAD_TRIGGER_KEY = "f95ue.addon.maskedDirect.processingDownload";
const DIRECT_DOWNLOAD_TRIGGER_TTL_MS = 2 * 60 * 1000;

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

  if (!Number.isFinite(trigger.createdAt) || trigger.createdAt <= 0) trigger.createdAt = 0;
  if (!Number.isFinite(trigger.expiresAt) || trigger.expiresAt <= 0) trigger.expiresAt = 0;

  if (!isProcessingDownloadTriggerActive(trigger)) {
    return fallback;
  }

  return trigger;
}

export function isProcessingDownloadTriggerActive(trigger) {
  return Boolean(trigger?.active && trigger.expiresAt > Date.now());
}

export async function readProcessingDownloadTrigger(GMApi) {
  if (!GMApi || typeof GMApi.getValue !== "function") {
    return createInactiveProcessingDownloadTrigger();
  }
  try {
    const raw = await GMApi.getValue(
      DIRECT_DOWNLOAD_TRIGGER_KEY,
      createInactiveProcessingDownloadTrigger(),
    );
    return normalizeProcessingDownloadTrigger(raw);
  } catch {
    return createInactiveProcessingDownloadTrigger();
  }
}

export async function clearProcessingDownloadTrigger(GMApi) {
  if (!GMApi || typeof GMApi.setValue !== "function") return;
  try {
    await GMApi.setValue(DIRECT_DOWNLOAD_TRIGGER_KEY, createInactiveProcessingDownloadTrigger());
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
    requestId: String(requestId || "").trim() || `${now}-${Math.random().toString(36).slice(2, 8)}`,
    ownerTabId: String(ownerTabId || "").trim(),
    host: String(host || "")
      .trim()
      .toLowerCase(),
    createdAt: now,
    expiresAt: now + DIRECT_DOWNLOAD_TRIGGER_TTL_MS,
    sourceUrl: String(sourceUrl || ""),
  };
  try {
    await GMApi.setValue(DIRECT_DOWNLOAD_TRIGGER_KEY, payload);
  } catch {
    // best effort
  }
}
