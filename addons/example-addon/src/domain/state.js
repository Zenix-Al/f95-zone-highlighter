export function createInitialState() {
  return {
    enabled: true,
    settings: {
      showDockLauncher: true,
      panelLogLimit: 20,
    },
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
