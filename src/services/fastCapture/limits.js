export const FAST_CAPTURE_LIMITS = Object.freeze({
  maxResponseBytes: 512 * 1024,
  maxPendingQueueItems: 20,
  maxRetainedBytes: 2 * 1024 * 1024,
  entryTtlMs: 30_000,
  maxEntriesPerKey: 1,
});

export function measureCaptureBytes(value) {
  if (typeof value === "string") {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).byteLength;
    return unescape(encodeURIComponent(value)).length;
  }
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Number.POSITIVE_INFINITY;
}
