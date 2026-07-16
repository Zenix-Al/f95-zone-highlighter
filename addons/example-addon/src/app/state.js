import {
  EXAMPLE_IDB_DB_NAME,
  EXAMPLE_IDB_PRIMARY_KEY,
  EXAMPLE_IDB_STORE_NAME,
} from "../constants.js";

export function createInitialState() {
  return {
    enabled: true,
    lastAction: "bootstrap",
    lastResult: "starting...",
    logs: [],
    meta: { access: null, throttle: null },
    storage: { value: null, usage: null, tagPrefsSummary: null },
    idb: {
      lastRecord: null,
      rows: [],
      count: 0,
      bulkImport: {
        status: "idle",
        processed: 0,
        total: 0,
        completedBatches: 0,
        totalBatches: 0,
        failed: 0,
        cancelled: false,
      },
    },
    observer: { isWatching: false, eventCount: 0, lastBatchSize: 0, lastNodeTags: [] },
    ui: {
      styleRegistered: false,
      dockLauncherMounted: false,
      panelOpen: false,
      extraMountActive: false,
      extraMountRevision: 0,
      dockButtonsActive: false,
      dialogOpen: false,
      lastConfirm: "",
    },
  };
}

const MAX_PANEL_RESULT_CHARS = 12_000;

export function compactResultForPanel(result, maxChars = MAX_PANEL_RESULT_CHARS) {
  let serialized;
  try {
    serialized = JSON.stringify(result ?? null);
  } catch {
    return { ok: false, reason: "result_not_serializable" };
  }
  if (serialized.length <= maxChars) return result;
  return {
    ok: result?.ok,
    reason: result?.reason,
    value: `[large result omitted from panel (${serialized.length} characters)]`,
  };
}

export function buildIdbPayload(extra = {}) {
  return {
    dbName: EXAMPLE_IDB_DB_NAME,
    storeName: EXAMPLE_IDB_STORE_NAME,
    keyPath: "id",
    indexes: [{ name: "updatedAt", keyPath: "updatedAt" }],
    ...extra,
  };
}

export function createIdbBulkDeletePayload(keys) {
  return buildIdbPayload({ keys });
}

export function createIdbRowsPreview(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const value = row?.value && typeof row.value === "object" ? row.value : row;
    if (!value || typeof value !== "object" || typeof value.body !== "string") return row;
    const previewValue = { ...value, body: `${value.body.slice(0, 80)}... [${value.body.length} characters]` };
    return row?.value && typeof row.value === "object" ? { ...row, value: previewValue } : previewValue;
  });
}

export function createPrimaryRecord() {
  return {
    id: EXAMPLE_IDB_PRIMARY_KEY,
    label: "Hello from idb.put",
    updatedAt: Date.now(),
  };
}

export function summarizeTagPrefs(value) {
  if (!value || typeof value !== "object") return null;
  return {
    tags: Array.isArray(value.tags) ? value.tags.length : 0,
    preferredTags: Array.isArray(value.preferredTags) ? value.preferredTags.length : 0,
    excludedTags: Array.isArray(value.excludedTags) ? value.excludedTags.length : 0,
    markedTags: Array.isArray(value.markedTags) ? value.markedTags.length : 0,
    colorKeys: value.color && typeof value.color === "object" ? Object.keys(value.color).length : 0,
  };
}
