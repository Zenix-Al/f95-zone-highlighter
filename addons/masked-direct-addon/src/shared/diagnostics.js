const FIELD_LIMIT = 80;

function stableField(value, fallback = "unknown") {
  const normalized = String(value || "").toLowerCase().trim();
  if (!/^[a-z0-9._-]+$/.test(normalized)) return fallback;
  return normalized.slice(0, FIELD_LIMIT) || fallback;
}

export function createMaskedDirectDiagnostics(addonId = "masked-direct-addon") {
  function emit(level, reason, { host = "unknown", requestId = "unknown" } = {}) {
    console[level === "error" ? "error" : "warn"](
      `[${addonId}] ${stableField(reason, "operation_failed")}`,
      {
        host: stableField(host),
        requestId: stableField(requestId),
      },
    );
  }

  return {
    error: (reason, context) => emit("error", reason, context),
    warn: (reason, context) => emit("warn", reason, context),
  };
}
