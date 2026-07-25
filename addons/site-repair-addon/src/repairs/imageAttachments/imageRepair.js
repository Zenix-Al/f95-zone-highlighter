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

  function pendingCount() {
    let count = 0;
    for (const record of records.values()) {
      if (record.active) count += 1;
    }
    return count;
  }
  function detach(record) {
    record.image.removeEventListener("error", record.onError);
    record.image.removeEventListener("load", record.onLoad);
    scheduler.cancel(record.timerId);
    records.delete(record.image);
  }
  function finish(record, result) {
    detach(record);
    if (result === "success") onSuccess(record.image, record.attempt);
    else onExhausted(record.image, record.attempt);
    onProgress(pendingCount());
  }
  function inspect(record) {
    if (!enabled || !record.image.isConnected) {
      detach(record);
      onProgress(pendingCount());
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
    scheduleRetry(record);
  }
  function scheduleRetry(record) {
    if (!enabled || !record.image.isConnected) {
      detach(record);
      onProgress(pendingCount());
      return;
    }
    if (record.attempt >= configuredMaxAttempts) {
      finish(record, "exhausted");
      return;
    }
    record.active = true;
    scheduler.schedule(
      record.timerId,
      () => retry(record),
      configuredRetryDelayMs,
    );
    onProgress(pendingCount());
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
    onProgress(pendingCount());
  }
  function attach(image) {
    if (!enabled || !image || records.has(image)) return false;
    const originalUrl = stableOriginalUrl(image.dataset.siteRepairOriginalSrc || image.currentSrc || image.src);
    if (!originalUrl.startsWith(imageHost)) return false;
    image.dataset.siteRepairOriginalSrc = originalUrl;
    const record = {
      image,
      originalUrl,
      attempt: 0,
      active: false,
      timerId: `image:${++sequence}`,
      onError: null,
      onLoad: null,
    };
    record.onError = () => scheduleRetry(record);
    record.onLoad = () => {
      if (record.active) finish(record, "success");
      else detach(record);
    };
    records.set(image, record);
    image.addEventListener("error", record.onError);
    image.addEventListener("load", record.onLoad);
    if (image.complete && image.naturalWidth > 0) {
      detach(record);
    } else if (image.complete && image.naturalWidth === 0) {
      scheduleRetry(record);
    }
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
    getSnapshot: () => ({
      enabled,
      pending: pendingCount(),
      observed: records.size,
      timers: scheduler.getSnapshot(),
      originals: [...records.values()]
        .filter((record) => record.active)
        .map((record) => record.originalUrl),
    }),
  };
}

export { stableOriginalUrl };
