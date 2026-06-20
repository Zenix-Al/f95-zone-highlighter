const DEFAULT_IMPORT_CORE_ACTION_WINDOW_MS = 5000;
const DEFAULT_IMPORT_CORE_ACTION_MAX_COUNT = 25;
const DEFAULT_IMPORT_CORE_ACTION_MAX_CONCURRENT = 1;
const DEFAULT_IMPORT_IDB_MAX_PAYLOAD_BYTES = 256 * 1024;
const DEFAULT_IMPORT_IDB_MAX_BULK_ITEMS = 100;

export function resolveImportThrottleInfo(rawThrottle = null) {
  const source = rawThrottle && typeof rawThrottle === "object" ? rawThrottle : {};
  const coreAction =
    source.coreAction && typeof source.coreAction === "object" ? source.coreAction : {};
  const payloadLimits =
    source.payloadLimits && typeof source.payloadLimits === "object" ? source.payloadLimits : {};
  const idb = payloadLimits.idb && typeof payloadLimits.idb === "object" ? payloadLimits.idb : {};

  const windowMs = Math.max(250, Number(coreAction.windowMs || DEFAULT_IMPORT_CORE_ACTION_WINDOW_MS));
  const maxCount = Math.max(1, Number(coreAction.maxCount || DEFAULT_IMPORT_CORE_ACTION_MAX_COUNT));
  const maxConcurrent = Math.max(
    1,
    Number(coreAction.maxConcurrent || DEFAULT_IMPORT_CORE_ACTION_MAX_CONCURRENT),
  );
  const suggestedMinIntervalMs = Math.max(
    0,
    Number(coreAction.suggestedMinIntervalMs || Math.ceil(windowMs / maxCount)),
  );

  return {
    coreAction: {
      windowMs,
      maxCount,
      maxConcurrent,
      suggestedMinIntervalMs,
    },
    payloadLimits: {
      idb: {
        maxPayloadBytes: Math.max(
          4096,
          Number(idb.maxPayloadBytes || DEFAULT_IMPORT_IDB_MAX_PAYLOAD_BYTES),
        ),
        maxBulkItems: Math.max(1, Number(idb.maxBulkItems || DEFAULT_IMPORT_IDB_MAX_BULK_ITEMS)),
      },
    },
  };
}
