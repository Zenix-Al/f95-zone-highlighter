import { createCancellableScheduler } from "./scheduler.js";

function stableOriginalUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    url.searchParams.delete("site_repair_retry");
    return url.href;
  } catch {
    return String(value || "").split(/[?#]site_repair_retry=/)[0];
  }
}

export function isImageAttachmentRepairApplicable(locationLike = location) {
  return String(locationLike?.hostname || "").includes("f95zone.to") &&
    String(locationLike?.pathname || "").startsWith("/threads/");
}

export function createImageAttachmentRepair({
  imageHost,
  retryDelayMs = 4000,
  maxAttempts = 10,
  scheduler = createCancellableScheduler(),
  onProgress = () => {},
  onSuccess = () => {},
  onExhausted = () => {},
} = {}) {
  const records = new Map();
  let enabled = false;
  let sequence = 0;
  let configuredRetryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
  let configuredMaxAttempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));

  function detach(record) {
    record.image.removeEventListener("error", record.onError);
    scheduler.cancel(record.timerId);
    records.delete(record.image);
  }
  function finish(record, result) {
    detach(record);
    if (result === "success") onSuccess(record.image, record.attempt);
    else onExhausted(record.image, record.attempt);
    onProgress(records.size);
  }
  function inspect(record) {
    if (!enabled || !record.image.isConnected) {
      detach(record);
      onProgress(records.size);
      return;
    }
    if (record.image.complete && record.image.naturalWidth > 0) {
      finish(record, "success");
      return;
    }
    if (record.attempt >= configuredMaxAttempts) {
      finish(record, "exhausted");
      return;
    }
    retry(record);
  }
  function retry(record) {
    if (!enabled || !record.image.isConnected) return detach(record);
    if (record.attempt >= configuredMaxAttempts) {
      finish(record, "exhausted");
      return;
    }
    record.attempt += 1;
    const url = new URL(record.originalUrl);
    url.searchParams.set("site_repair_retry", String(Date.now()));
    record.image.src = url.href;
    scheduler.schedule(record.timerId, () => inspect(record), configuredRetryDelayMs);
    onProgress(records.size);
  }
  function attach(image) {
    if (!enabled || !image || records.has(image)) return false;
    const originalUrl = stableOriginalUrl(image.dataset.siteRepairOriginalSrc || image.currentSrc || image.src);
    if (!originalUrl.startsWith(imageHost)) return false;
    image.dataset.siteRepairOriginalSrc = originalUrl;
    const record = { image, originalUrl, attempt: 0, timerId: `image:${++sequence}`, onError: null };
    record.onError = () => retry(record);
    records.set(image, record);
    image.addEventListener("error", record.onError);
    if (image.complete && image.naturalWidth === 0) retry(record);
    return true;
  }
  function start(root = document) {
    enabled = true;
    root.querySelectorAll?.("img").forEach(attach);
  }
  function stop() {
    enabled = false;
    scheduler.invalidate();
    for (const record of [...records.values()]) detach(record);
    onProgress(0);
  }
  function configure({ retryDelayMs: nextDelay, maxAttempts: nextAttempts } = {}) {
    if (Number.isFinite(Number(nextDelay))) {
      configuredRetryDelayMs = Math.max(0, Number(nextDelay));
    }
    if (Number.isFinite(Number(nextAttempts))) {
      configuredMaxAttempts = Math.max(1, Math.floor(Number(nextAttempts)));
    }
  }
  return {
    start, stop, attach, configure,
    getSnapshot: () => ({ enabled, pending: records.size, timers: scheduler.getSnapshot(), originals: [...records.values()].map((r) => r.originalUrl) }),
  };
}

export { stableOriginalUrl };
