const TRANSPORTS = new Set(["xhr", "fetch", "any"]);
const MODES = new Set(["latest", "oncePerRoute", "oncePerDocument"]);
import { FAST_CAPTURE_LIMITS } from "./limits.js";

/** Normalize declarative feature capture metadata; owned by fast-capture. */
export function normalizeFastCaptureConfig(value) {
  if (!value || typeof value !== "object") return null;
  const urlIncludes = (Array.isArray(value.urlIncludes) ? value.urlIncludes : [value.urlIncludes])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const dataPath = String(value.dataPath || "").trim();
  if (!urlIncludes.length || !dataPath) return null;
  return {
    urlIncludes,
    dataPath,
    transport: TRANSPORTS.has(value.transport) ? value.transport : "any",
    mode: MODES.has(value.mode) ? value.mode : value.once === false ? "latest" : "oncePerDocument",
    ttlMs: Math.min(
      FAST_CAPTURE_LIMITS.entryTtlMs,
      Math.max(0, Number(value.ttlMs) || FAST_CAPTURE_LIMITS.entryTtlMs),
    ),
  };
}

export function isCaptureTransport(value) {
  return value === "xhr" || value === "fetch";
}
