import {
  bindRuntimeCommands,
  notifyTeardownComplete,
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import { getAddonAccess, getCoreThrottle } from "../api/meta.js";
import { disableFeature, enableFeature, refreshFeature } from "../api/feature.js";
import {
  EXAMPLE_BULK_PROGRESS_DIALOG_ID,
  EXAMPLE_DIALOG_ID,
  EXAMPLE_DOCK_BUTTONS,
  EXAMPLE_DOCK_MOUNT_ID,
  EXAMPLE_DUMMY_BULK_TOTAL,
  EXAMPLE_EXTRA_MOUNT_ID,
  EXAMPLE_IDB_DB_NAME,
  EXAMPLE_IDB_PRIMARY_KEY,
  EXAMPLE_IDB_STORE_NAME,
  EXAMPLE_OBSERVER_ID,
  EXAMPLE_PANEL_DIALOG_ID,
  EXAMPLE_STORAGE_KEY,
  EXAMPLE_STYLE_ID,
} from "../constants.js";
import {
  bulkDeleteRecords,
  bulkPutRecords,
  countRecords,
  deleteRecord,
  getRecord,
  putRecord,
  queryRecords,
} from "../api/idb.js";
import { watchObserver, unwatchObserver } from "../api/observer.js";
import {
  getStoredValue,
  getStorageUsage,
  getTagPrefs,
  setStoredValue,
} from "../api/storage.js";
import { showCoreToast } from "../api/toast.js";
import { closeDialog, confirmDialog, openDialog } from "../api/ui/dialog.js";
import { removeDockButtons, setDockButtons } from "../api/ui/dock.js";
import { mountUi, unmountUi, updateUi } from "../api/ui/mount.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import exampleCssText from "../ui/example.css";
import {
  createBulkImportProgressMarkup,
  updateBulkImportProgressView,
} from "../ui/bulkImportProgressDialog.js";
import { renderExampleDialog } from "../ui/dialog.js";
import { renderDockMarkup } from "../ui/dockRenderer.js";
import { renderExtraMount } from "../ui/extraMount.js";
import { renderExamplePanel } from "../ui/panel.js";

const PAYLOAD_SIZE_ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const DEFAULT_IDB_PAYLOAD_LIMIT_BYTES = 128 * 1024;
const DEFAULT_IDB_BULK_ITEMS_LIMIT = 25;
const DEFAULT_CORE_ACTION_INTERVAL_MS = 80;
const BULK_IMPORT_RETRYABLE_REASONS = new Set(["rate_limited", "too_many_concurrent_requests"]);

function createInitialState() {
  return {
    enabled: true,
    lastAction: "bootstrap",
    lastResult: "starting...",
    logs: [],
    meta: {
      access: null,
      throttle: null,
    },
    storage: {
      value: null,
      usage: null,
      tagPrefsSummary: null,
    },
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
    observer: {
      isWatching: false,
      eventCount: 0,
      lastBatchSize: 0,
      lastNodeTags: [],
    },
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

function buildIdbPayload(extra = {}) {
  return {
    dbName: EXAMPLE_IDB_DB_NAME,
    storeName: EXAMPLE_IDB_STORE_NAME,
    keyPath: "id",
    indexes: [{ name: "updatedAt", keyPath: "updatedAt" }],
    ...extra,
  };
}

function createPrimaryRecord() {
  return {
    id: EXAMPLE_IDB_PRIMARY_KEY,
    label: "Hello from idb.put",
    updatedAt: Date.now(),
  };
}

export function createExampleAddonApp({ core, runtime }) {
  const state = createInitialState();
  let unbindAddonCommands = () => {};
  let panelClickHandler = null;
  let dockClickHandler = null;
  let activeBulkImport = null;

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function measurePayloadBytes(payload) {
    try {
      const json = JSON.stringify(payload ?? null);
      return PAYLOAD_SIZE_ENCODER ? PAYLOAD_SIZE_ENCODER.encode(json).length : json.length;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function resolveThrottleEnvelope(rawThrottle = null) {
    const source = rawThrottle && typeof rawThrottle === "object" ? rawThrottle : {};
    const coreAction = source.coreAction && typeof source.coreAction === "object" ? source.coreAction : {};
    const payloadLimits =
      source.payloadLimits && typeof source.payloadLimits === "object" ? source.payloadLimits : {};
    const idb = payloadLimits.idb && typeof payloadLimits.idb === "object" ? payloadLimits.idb : {};

    return {
      coreAction: {
        windowMs: Math.max(250, Number(coreAction.windowMs || 5000)),
        maxCount: Math.max(1, Number(coreAction.maxCount || 100)),
        maxConcurrent: Math.max(1, Number(coreAction.maxConcurrent || 1)),
        suggestedMinIntervalMs: Math.max(
          0,
          Number(coreAction.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS),
        ),
      },
      payloadLimits: {
        idb: {
          maxPayloadBytes: Math.max(
            4096,
            Number(idb.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES),
          ),
          maxBulkItems: Math.max(
            1,
            Number(idb.maxBulkItems || DEFAULT_IDB_BULK_ITEMS_LIMIT),
          ),
        },
      },
    };
  }

  function createDummyBulkRecords(throttleInfo) {
    const payloadLimit = Math.max(
      DEFAULT_IDB_PAYLOAD_LIMIT_BYTES,
      Number(throttleInfo?.payloadLimits?.idb?.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES),
    );
    const repeatedTextLength = Math.max(4096, Math.min(32768, Math.floor(payloadLimit / 4)));
    const repeatedText = "X".repeat(repeatedTextLength);
    const seed = Date.now();

    return Array.from({ length: EXAMPLE_DUMMY_BULK_TOTAL }, (_, index) => ({
      id: `dummy-bulk-${seed}-${index + 1}`,
      label: `Dummy Bulk Record ${index + 1}`,
      updatedAt: seed + index,
      bucket: `batch-${Math.floor(index / 6) + 1}`,
      body: repeatedText,
    }));
  }

  function createIdbBulkPayload(entries) {
    return buildIdbPayload({
      entries: entries.map((value) => ({ value })),
    });
  }

  function createIdbBulkDeletePayload(keys) {
    return buildIdbPayload({ keys });
  }

  function createIdbRowsPreview(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const value = row?.value && typeof row.value === "object" ? row.value : row;
      if (!value || typeof value !== "object" || typeof value.body !== "string") return row;
      const previewValue = {
        ...value,
        body: `${value.body.slice(0, 80)}... [${value.body.length} characters]`,
      };
      return row?.value && typeof row.value === "object" ? { ...row, value: previewValue } : previewValue;
    });
  }

  function buildIdbBulkBatches(records, throttleInfo) {
    const maxPayloadBytes = Math.max(
      4096,
      Number(throttleInfo?.payloadLimits?.idb?.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES),
    );
    const maxBulkItems = Math.max(
      1,
      Number(throttleInfo?.payloadLimits?.idb?.maxBulkItems || DEFAULT_IDB_BULK_ITEMS_LIMIT),
    );
    const payloadBudget = Math.max(1024, maxPayloadBytes - 1024);
    const batches = [];
    let currentBatch = [];

    for (const record of records) {
      const candidateBatch = [...currentBatch, record];
      const candidatePayload = createIdbBulkPayload(candidateBatch);
      const candidateBytes = measurePayloadBytes(candidatePayload);

      if (
        currentBatch.length > 0 &&
        (candidateBatch.length > maxBulkItems || candidateBytes > payloadBudget)
      ) {
        batches.push([...currentBatch]);
        currentBatch = [record];
        continue;
      }

      currentBatch = candidateBatch;
    }

    if (currentBatch.length > 0) {
      batches.push([...currentBatch]);
    }

    return batches;
  }

  function getDialogContentElement(dialogId) {
    return document.getElementById(
      `f95ue-addon-dialog-content-${runtime.addonId}-${String(dialogId || "").trim()}`,
    );
  }

  function updateOpenDialogContent(dialogId, html) {
    const contentEl = getDialogContentElement(dialogId);
    if (!contentEl) return false;
    contentEl.innerHTML = html;
    return true;
  }

  function updateBulkImportSummary(nextPatch = {}) {
    state.idb.bulkImport = {
      ...state.idb.bulkImport,
      ...nextPatch,
    };
  }

  function updateBulkImportProgressDialog(progress) {
    const root = getDialogContentElement(EXAMPLE_BULK_PROGRESS_DIALOG_ID);
    updateBulkImportProgressView(root, progress, activeBulkImport?.total || 0);
  }

  async function openBulkImportProgressDialog(progress, throttleInfo) {
    const result = await openDialog(core, {
      dialogId: EXAMPLE_BULK_PROGRESS_DIALOG_ID,
      title: "Dummy Bulk Import",
      html: createBulkImportProgressMarkup({
        total: progress.total,
        totalBatches: progress.totalBatches,
        throttle: throttleInfo,
      }),
      closeOnBackdrop: true,
      closeOnEsc: true,
      size: "sm",
    });
    if (!result?.ok) {
      throw new Error(`Progress dialog failed: ${result?.reason || "unknown"}`);
    }
    updateBulkImportProgressDialog(progress);
  }

  async function closeBulkImportProgressDialog(reason = "bulk-import-finished", cancelImport = false) {
    if (!activeBulkImport) return;
    if (cancelImport) {
      activeBulkImport.cancelled = true;
    }
    activeBulkImport.closing = true;
    await closeDialog(core, EXAMPLE_BULK_PROGRESS_DIALOG_ID, reason);
  }

  function requestBulkImportCancellation() {
    if (!activeBulkImport) return false;
    activeBulkImport.cancelled = true;
    updateBulkImportSummary({
      status: "cancelling",
      cancelled: true,
    });
    updateBulkImportProgressDialog({
      ...state.idb.bulkImport,
      cancelled: true,
    });
    return true;
  }

  async function invokeBulkPutWithRetry(payload, throttleInfo) {
    const minIntervalMs = Math.max(
      0,
      Number(throttleInfo?.coreAction?.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS),
    );
    let lastResult = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      lastResult = await bulkPutRecords(core, payload);
      if (lastResult?.ok || !BULK_IMPORT_RETRYABLE_REASONS.has(String(lastResult?.reason || ""))) {
        return lastResult;
      }
      await wait(Math.max(250, minIntervalMs * (attempt + 1)));
    }

    return lastResult;
  }

  async function runDummyBulkImport() {
    if (activeBulkImport) {
      return { ok: false, reason: "bulk_import_active" };
    }

    const throttleResult = await getCoreThrottle(core);
    const throttleInfo = resolveThrottleEnvelope(
      throttleResult?.ok ? throttleResult.value : state.meta.throttle,
    );

    if (throttleResult?.ok) {
      state.meta.throttle = throttleResult.value;
    }

    const records = createDummyBulkRecords(throttleInfo);
    const batches = buildIdbBulkBatches(records, throttleInfo);
    const progress = {
      status: "running",
      processed: 0,
      total: records.length,
      completedBatches: 0,
      totalBatches: batches.length,
      failed: 0,
      cancelled: false,
    };

    activeBulkImport = {
      cancelled: false,
      closing: false,
      total: records.length,
    };
    updateBulkImportSummary(progress);
    await openBulkImportProgressDialog(progress, throttleInfo);
    await syncPanel();

    const minIntervalMs = Math.max(
      0,
      Number(throttleInfo?.coreAction?.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS),
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      if (activeBulkImport?.cancelled) {
        break;
      }

      const batch = batches[batchIndex];
      const payload = createIdbBulkPayload(batch);
      const startedAt = Date.now();
      const result = await invokeBulkPutWithRetry(payload, throttleInfo);

      if (!result?.ok) {
        progress.failed += batch.length;
        progress.status = "failed";
        updateBulkImportSummary(progress);
        updateBulkImportProgressDialog(progress);
        await syncPanel();
        await closeBulkImportProgressDialog("bulk-import-failed", false);
        activeBulkImport = null;
        return result;
      }

      progress.processed += batch.length;
      progress.completedBatches += 1;
      updateBulkImportSummary(progress);
      updateBulkImportProgressDialog(progress);
      await syncPanel();

      const elapsedMs = Date.now() - startedAt;
      const waitMs = minIntervalMs - elapsedMs;
      if (waitMs > 0 && batchIndex < batches.length - 1) {
        await wait(waitMs);
      }
    }

    if (activeBulkImport?.cancelled) {
      progress.status = "cancelled";
      progress.cancelled = true;
    } else {
      progress.status = "completed";
    }

    updateBulkImportSummary(progress);
    updateBulkImportProgressDialog(progress);
    await wait(progress.cancelled ? 150 : 300);
    await closeBulkImportProgressDialog(
      progress.cancelled ? "bulk-import-cancelled" : "bulk-import-complete",
      false,
    );

    const countResult = await countRecords(core, buildIdbPayload({}));
    state.idb.count = countResult?.ok ? Number(countResult.value || 0) : state.idb.count;
    state.idb.lastRecord = {
      dummyImported: progress.processed,
      totalRequested: progress.total,
      totalBatches: progress.totalBatches,
      cancelled: progress.cancelled,
    };
    activeBulkImport = null;
    await syncPanel();

    return {
      ok: true,
      value: {
        processed: progress.processed,
        total: progress.total,
        totalBatches: progress.totalBatches,
        cancelled: progress.cancelled,
      },
    };
  }

  function appendLog(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${String(message || "")}`;
    state.logs.unshift(line);
    if (state.logs.length > 20) {
      state.logs.length = 20;
    }
  }

  function setLastResult(action, result) {
    state.lastAction = action;
    state.lastResult = result;
    appendLog(`${action}: ${typeof result === "string" ? result : JSON.stringify(result)}`);
  }

  function registerAddon() {
    registerAddonRuntime(core, {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: state.enabled ? "installed" : "disabled",
      statusMessage: state.enabled ? "API playground active." : "API playground disabled.",
      panelTitle: runtime.addonName,
      panelBody:
        "Core API playground demonstrating every current addon-facing action through the api folder.",
      capabilities: runtime.capabilities,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    });
  }

  function pushStatusUpdate() {
    updateAddonRuntimeStatus(
      core,
      state.enabled ? "installed" : "disabled",
      state.enabled ? "API playground active." : "API playground disabled.",
    );
    registerAddon();
  }

  async function syncPanel() {
    if (!state.enabled || !state.ui.panelOpen) return;

    const html = renderExamplePanel(state);
    if (updateOpenDialogContent(EXAMPLE_PANEL_DIALOG_ID, html)) {
      return;
    }

    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html,
      size: "lg",
    });

    if (!result?.ok) {
      throw new Error(`Panel sync failed: ${result?.reason || "unknown"}`);
    }
    state.ui.panelOpen = true;
  }

  async function ensureStyleRegistered() {
    const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
    if (!result?.ok) {
      throw new Error(`ui.style.register failed: ${result?.reason || "unknown"}`);
    }
    state.ui.styleRegistered = true;
    return result;
  }

  async function ensureDockButtons() {
    const result = await setDockButtons(core, EXAMPLE_DOCK_BUTTONS);
    if (result?.ok) {
      state.ui.dockButtonsActive = true;
    }
    return result;
  }

  async function mountDockLauncher() {
    const result = await mountUi(core, {
      mountId: EXAMPLE_DOCK_MOUNT_ID,
      slot: "page.dock",
      html: renderDockMarkup(),
    });
    if (!result?.ok) {
      throw new Error(`Dock launcher mount failed: ${result?.reason || "unknown"}`);
    }
    state.ui.dockLauncherMounted = true;
    bindDockMountEvents();
    return result;
  }

  async function unmountDockLauncher() {
    unbindDockMountEvents();
    const result = await unmountUi(core, EXAMPLE_DOCK_MOUNT_ID);
    if (result?.ok) {
      state.ui.dockLauncherMounted = false;
    }
    return result;
  }

  async function closeExampleDialog(reason = "example-close") {
    const result = await closeDialog(core, EXAMPLE_DIALOG_ID, reason);
    if (result?.ok) state.ui.dialogOpen = false;
    return result;
  }

  async function openExamplePanel() {
    if (state.ui.panelOpen) {
      await syncPanel();
      return { ok: true, value: { dialogId: EXAMPLE_PANEL_DIALOG_ID, updated: true } };
    }

    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html: renderExamplePanel(state),
      size: "lg",
    });
    if (!result?.ok) {
      throw new Error(`Panel open failed: ${result?.reason || "unknown"}`);
    }
    state.ui.panelOpen = true;
    return result;
  }

  async function closeExamplePanel(reason = "example-panel-close") {
    const result = await closeDialog(core, EXAMPLE_PANEL_DIALOG_ID, reason);
    if (result?.ok) state.ui.panelOpen = false;
    return result;
  }

  async function unmountExtra() {
    const result = await unmountUi(core, EXAMPLE_EXTRA_MOUNT_ID);
    if (result?.ok) {
      state.ui.extraMountActive = false;
    }
    return result;
  }

  async function disableUi(reason = "disable") {
    if (state.observer.isWatching) {
      await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
      state.observer.isWatching = false;
    }
    const dialogCloseResult = await closeExampleDialog(reason);
    const panelCloseResult = await closeExamplePanel(reason);
    await removeDockButtons(core);
    state.ui.dockButtonsActive = false;
    await unmountExtra();
    await unmountDockLauncher();
    if (dialogCloseResult?.ok && panelCloseResult?.ok) {
      const styleResult = await unregisterStyle(core, EXAMPLE_STYLE_ID);
      if (styleResult?.ok) state.ui.styleRegistered = false;
    }
  }

  async function enableUi() {
    await ensureStyleRegistered();
    await mountDockLauncher();
  }

  async function setEnabled(nextEnabled) {
    state.enabled = Boolean(nextEnabled);
    if (state.enabled) {
      await enableUi();
    } else {
      await disableUi("disable");
    }
    pushStatusUpdate();
    if (state.enabled) {
      await syncPanel();
    }
  }

  function summarizeTagPrefs(value) {
    if (!value || typeof value !== "object") return null;
    return {
      tags: Array.isArray(value.tags) ? value.tags.length : 0,
      preferredTags: Array.isArray(value.preferredTags) ? value.preferredTags.length : 0,
      excludedTags: Array.isArray(value.excludedTags) ? value.excludedTags.length : 0,
      markedTags: Array.isArray(value.markedTags) ? value.markedTags.length : 0,
      colorKeys:
        value.color && typeof value.color === "object" ? Object.keys(value.color).length : 0,
    };
  }

  function createObserverTestNode() {
    const node = document.createElement("div");
    node.textContent = `Observer test node ${Date.now()}`;
    node.style.display = "none";
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 1500);
  }

  async function refreshMetaSection() {
    const [accessResult, throttleResult] = await Promise.all([
      getAddonAccess(core),
      getCoreThrottle(core),
    ]);

    state.meta.access = accessResult?.ok
      ? accessResult.value
      : { error: accessResult?.reason || "unknown" };
    state.meta.throttle = throttleResult?.ok
      ? throttleResult.value
      : { error: throttleResult?.reason || "unknown" };
  }

  async function handleAction(action) {
    switch (action) {
      case "meta-access": {
        const result = await getAddonAccess(core);
        state.meta.access = result?.ok
          ? result.value
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "meta-throttle": {
        const result = await getCoreThrottle(core);
        state.meta.throttle = result?.ok
          ? result.value
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "panel-open": {
        const result = await openExamplePanel();
        setLastResult(action, result);
        break;
      }
      case "panel-close": {
        const result = await closeExamplePanel("panel-button");
        setLastResult(action, result);
        return;
      }
      case "toast-show": {
        const result = await showCoreToast(core, "Hello from Example Add-on", "info");
        setLastResult(action, result);
        break;
      }
      case "feature-enable": {
        const result = await enableFeature(core);
        setLastResult(action, result);
        break;
      }
      case "feature-refresh": {
        const result = await refreshFeature(core);
        setLastResult(action, result);
        break;
      }
      case "feature-disable": {
        const result = await disableFeature(core);
        setLastResult(action, result);
        return;
      }
      case "storage-set": {
        const value = {
          text: "Hello from storage.set",
          updatedAt: new Date().toISOString(),
        };
        const result = await setStoredValue(core, EXAMPLE_STORAGE_KEY, value);
        if (result?.ok) {
          state.storage.value = value;
        }
        setLastResult(action, result);
        break;
      }
      case "storage-get": {
        const result = await getStoredValue(core, EXAMPLE_STORAGE_KEY, null);
        state.storage.value = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "storage-usage": {
        const result = await getStorageUsage(core);
        state.storage.usage = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "storage-tags": {
        const result = await getTagPrefs(core);
        state.storage.tagPrefsSummary = result?.ok
          ? summarizeTagPrefs(result.value)
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "idb-put": {
        const record = createPrimaryRecord();
        const result = await putRecord(core, buildIdbPayload({ value: record }));
        if (result?.ok) {
          state.idb.lastRecord = record;
        }
        setLastResult(action, result);
        break;
      }
      case "idb-get": {
        const result = await getRecord(core, buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }));
        state.idb.lastRecord = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "idb-bulk-put": {
        const result = await runDummyBulkImport();
        setLastResult(action, result);
        break;
      }
      case "idb-bulk-delete": {
        const queryResult = await queryRecords(
          core,
          buildIdbPayload({ limit: 500, includeKeys: true }),
        );
        if (!queryResult?.ok) {
          setLastResult(action, queryResult);
          break;
        }
        const keys = (Array.isArray(queryResult.value) ? queryResult.value : [])
          .map((entry) => entry?.key)
          .filter((key) => String(key || "").startsWith("dummy-bulk-"));
        const result = await bulkDeleteRecords(core, createIdbBulkDeletePayload(keys));
        if (result?.ok) {
          state.idb.rows = [];
          const countResult = await countRecords(core, buildIdbPayload({}));
          state.idb.count = countResult?.ok ? Number(countResult.value || 0) : state.idb.count;
        }
        setLastResult(action, result);
        break;
      }
      case "bulk-import-cancel": {
        requestBulkImportCancellation();
        setLastResult(action, { ok: true, value: "cancellation requested" });
        return;
      }
      case "idb-query": {
        const result = await queryRecords(
          core,
          buildIdbPayload({
            index: "updatedAt",
            direction: "prev",
            limit: 10,
            includeKeys: true,
          }),
        );
        state.idb.rows = result?.ok
          ? createIdbRowsPreview(result.value)
          : [{ error: result?.reason || "unknown" }];
        setLastResult(action, result);
        break;
      }
      case "idb-count": {
        const result = await countRecords(core, buildIdbPayload({}));
        state.idb.count = result?.ok ? Number(result.value || 0) : -1;
        setLastResult(action, result);
        break;
      }
      case "idb-delete": {
        const result = await deleteRecord(core, buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }));
        if (result?.ok) {
          state.idb.lastRecord = null;
        }
        setLastResult(action, result);
        break;
      }
      case "observer-watch": {
        const result = await watchObserver(core, EXAMPLE_OBSERVER_ID);
        if (result?.ok) {
          state.observer.isWatching = true;
        }
        setLastResult(action, result);
        break;
      }
      case "observer-add-node": {
        createObserverTestNode();
        setLastResult(action, { ok: true, value: "observer test node appended" });
        break;
      }
      case "observer-unwatch": {
        const result = await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
        if (result?.ok) {
          state.observer.isWatching = false;
        }
        setLastResult(action, result);
        break;
      }
      case "style-register": {
        const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
        if (result?.ok) {
          state.ui.styleRegistered = true;
        }
        setLastResult(action, result);
        break;
      }
      case "style-unregister": {
        const result = await unregisterStyle(core, EXAMPLE_STYLE_ID);
        if (result?.ok) {
          state.ui.styleRegistered = false;
        }
        setLastResult(action, result);
        break;
      }
      case "mount-extra": {
        const nextRevision = state.ui.extraMountRevision + 1;
        const result = await mountUi(core, {
          mountId: EXAMPLE_EXTRA_MOUNT_ID,
          slot: "body",
          html: renderExtraMount(nextRevision),
        });
        if (result?.ok) {
          state.ui.extraMountActive = true;
          state.ui.extraMountRevision = nextRevision;
        }
        setLastResult(action, result);
        break;
      }
      case "update-extra": {
        const nextRevision = state.ui.extraMountRevision + 1;
        const result = await updateUi(core, {
          mountId: EXAMPLE_EXTRA_MOUNT_ID,
          html: renderExtraMount(nextRevision),
        });
        if (result?.ok) {
          state.ui.extraMountActive = true;
          state.ui.extraMountRevision = nextRevision;
        }
        setLastResult(action, result);
        break;
      }
      case "unmount-extra": {
        const result = await unmountExtra();
        setLastResult(action, result);
        break;
      }
      case "dialog-open": {
        const result = await openDialog(core, {
          dialogId: EXAMPLE_DIALOG_ID,
          title: "Example Add-on Dialog",
          html: renderExampleDialog(),
          size: "sm",
        });
        if (result?.ok) {
          state.ui.dialogOpen = true;
        }
        setLastResult(action, result);
        break;
      }
      case "dialog-confirm": {
        const result = await confirmDialog(core, {
          title: "ui.confirm example",
          description: "Did the example confirm dialog open correctly?",
          confirmLabel: "Yep",
          cancelLabel: "Nope",
        });
        state.ui.lastConfirm = result?.ok
          ? String(result?.value?.confirmed)
          : `error:${result?.reason || "unknown"}`;
        setLastResult(action, result);
        break;
      }
      case "dialog-close": {
        const result = await closeExampleDialog("example-button");
        setLastResult(action, result);
        break;
      }
      case "dock-set": {
        const result = await ensureDockButtons();
        setLastResult(action, result);
        break;
      }
      case "dock-remove": {
        const result = await removeDockButtons(core);
        if (result?.ok) {
          state.ui.dockButtonsActive = false;
        }
        setLastResult(action, result);
        break;
      }
      default:
        return;
    }

    await syncPanel();
  }

  function bindPanelClicks() {
    if (panelClickHandler) return;

    panelClickHandler = (event) => {
      const button = event.target?.closest?.("button[data-example-action]");
      if (!button) return;

      const action = String(button.dataset.exampleAction || "").trim();
      if (!action) return;

      event.preventDefault();
      void handleAction(action).catch((error) => {
        setLastResult(action, { ok: false, reason: error?.message || "unknown_error" });
        if (state.enabled) {
          void syncPanel();
        }
      });
    };

    document.addEventListener("click", panelClickHandler, true);
  }

  function unbindPanelClicks() {
    if (!panelClickHandler) return;
    document.removeEventListener("click", panelClickHandler, true);
    panelClickHandler = null;
  }

  function resolveDockActionButton(event) {
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    let inExampleDock = false;
    let actionEl = null;

    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;

      if (!inExampleDock) {
        const role = String(node.getAttribute?.("data-role") || "").trim();
        if (role === "exampleDock") {
          inExampleDock = true;
        }
      }

      if (!actionEl && typeof node.matches === "function" && node.matches("button[data-action]")) {
        actionEl = node;
      }

      if (inExampleDock && actionEl) break;
    }

    if (!inExampleDock || !actionEl) return null;
    return actionEl;
  }

  function bindDockMountEvents() {
    if (dockClickHandler) return;

    dockClickHandler = (event) => {
      if (!state.enabled) return;
      const actionEl = resolveDockActionButton(event);
      if (!actionEl) return;

      const action = String(actionEl.dataset.action || "").trim();
      if (!action) return;

      event.preventDefault();
      if (action === "open-example") {
        void handleAction("panel-open").catch((error) => {
          setLastResult("panel-open", { ok: false, reason: error?.message || "unknown_error" });
        });
      }
    };

    window.addEventListener("click", dockClickHandler, true);
  }

  function unbindDockMountEvents() {
    if (!dockClickHandler) return;
    window.removeEventListener("click", dockClickHandler, true);
    dockClickHandler = null;
  }

  async function handleDockAction(actionId) {
    if (actionId === "show-toast") {
      await handleAction("toast-show");
      return;
    }
    if (actionId === "open-panel") {
      await handleAction("panel-open");
      return;
    }
    if (actionId === "refresh-panel") {
      await handleAction("feature-refresh");
    }
  }

  function bindAddonCommands() {
    unbindAddonCommands = bindRuntimeCommands(core, (detail) => {
      const command = String(detail.command || "").trim();
      switch (command) {
        case "enable":
          void setEnabled(true);
          break;
        case "disable":
          void setEnabled(false);
          break;
        case "refresh":
          void refreshMetaSection()
            .then(() => syncPanel())
            .then(() => setLastResult("refresh-command", { ok: true }))
            .catch((error) =>
              setLastResult("refresh-command", {
                ok: false,
                reason: error?.message || "refresh_failed",
              }),
            );
          break;
        case "dock-action":
          void handleDockAction(String(detail.actionId || "").trim());
          break;
        case "dialog-closed":
          if (String(detail.dialogId || "").trim() === EXAMPLE_PANEL_DIALOG_ID) {
            state.ui.panelOpen = false;
            return;
          }
          if (String(detail.dialogId || "").trim() === EXAMPLE_BULK_PROGRESS_DIALOG_ID) {
            if (activeBulkImport && !activeBulkImport.closing) {
              activeBulkImport.cancelled = true;
              updateBulkImportSummary({
                status: "cancelling",
                cancelled: true,
              });
              if (state.enabled) void syncPanel();
            }
            return;
          }
          if (String(detail.dialogId || "").trim() === EXAMPLE_DIALOG_ID) {
            state.ui.dialogOpen = false;
            if (state.enabled) void syncPanel();
          }
          break;
        case "observer.nodes":
          if (String(detail.observerId || "").trim() === EXAMPLE_OBSERVER_ID) {
            state.observer.eventCount += 1;
            state.observer.lastBatchSize = Array.isArray(detail.nodes) ? detail.nodes.length : 0;
            state.observer.lastNodeTags = Array.isArray(detail.nodes)
              ? detail.nodes
                  .map((node) => String(node?.tagName || "").trim())
                  .filter(Boolean)
                  .slice(0, 5)
              : [];
            appendLog(
              `observer.nodes: batch=${state.observer.lastBatchSize}, tags=${state.observer.lastNodeTags.join(", ") || "-"}`,
            );
            if (state.enabled) void syncPanel();
          }
          break;
        case "teardown":
          void teardownAddon(String(detail.reason || "teardown"));
          break;
        default:
          break;
      }
    });
  }

  async function teardownAddon(reason = "teardown") {
    await disableUi(reason);
    if (reason !== "disable") {
      unbindAddonCommands();
      unbindPanelClicks();
      unbindDockMountEvents();
    }
    notifyTeardownComplete(core, reason);
  }

  async function bootstrap() {
    bindPanelClicks();
    bindAddonCommands();
    registerAddon();

    const access = await core.invokeCoreAction("addon.access", {});
    if (!access?.ok || access.value?.blocked) {
      state.enabled = false;
      pushStatusUpdate();
      return;
    }

    await enableUi();
    await refreshMetaSection();
    pushStatusUpdate();
    setLastResult("bootstrap", { ok: true, value: "example addon ready" });
  }

  return {
    bootstrap,
  };
}
