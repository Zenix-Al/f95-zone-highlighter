import {
  EXAMPLE_BULK_PROGRESS_DIALOG_ID,
  EXAMPLE_DUMMY_BULK_TOTAL,
} from "../constants.js";
import {
  bulkPutRecords,
  countRecords,
} from "../api/idb.js";
import { getCoreThrottle } from "../api/meta.js";
import { closeDialog, openDialog } from "../api/ui/dialog.js";
import {
  createBulkImportProgressMarkup,
  updateBulkImportProgressView,
} from "../ui/bulkImportProgressDialog.js";
import { buildIdbPayload } from "./state.js";

const DEFAULT_IDB_PAYLOAD_LIMIT_BYTES = 128 * 1024;
const DEFAULT_IDB_BULK_ITEMS_LIMIT = 25;
const DEFAULT_CORE_ACTION_INTERVAL_MS = 80;
const RETRYABLE_REASONS = new Set(["rate_limited", "too_many_concurrent_requests"]);
const PAYLOAD_SIZE_ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function createBulkImportController({ core, state, syncPanel, getDialogContentElement, wait }) {
  let active = null;

  function measurePayloadBytes(payload) {
    try {
      const json = JSON.stringify(payload ?? null);
      return PAYLOAD_SIZE_ENCODER ? PAYLOAD_SIZE_ENCODER.encode(json).length : json.length;
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function resolveThrottle(rawThrottle = null) {
    const source = rawThrottle && typeof rawThrottle === "object" ? rawThrottle : {};
    const coreAction = source.coreAction && typeof source.coreAction === "object" ? source.coreAction : {};
    const payloadLimits = source.payloadLimits && typeof source.payloadLimits === "object" ? source.payloadLimits : {};
    const idb = payloadLimits.idb && typeof payloadLimits.idb === "object" ? payloadLimits.idb : {};
    return {
      coreAction: {
        suggestedMinIntervalMs: Math.max(0, Number(coreAction.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS)),
      },
      payloadLimits: {
        idb: {
          maxPayloadBytes: Math.max(4096, Number(idb.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES)),
          maxBulkItems: Math.max(1, Number(idb.maxBulkItems || DEFAULT_IDB_BULK_ITEMS_LIMIT)),
        },
      },
    };
  }

  function createDummyRecords(throttle) {
    const payloadLimit = Math.max(
      DEFAULT_IDB_PAYLOAD_LIMIT_BYTES,
      Number(throttle?.payloadLimits?.idb?.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES),
    );
    const repeatedText = "X".repeat(Math.max(4096, Math.min(32768, Math.floor(payloadLimit / 4))));
    const seed = Date.now();
    return Array.from({ length: EXAMPLE_DUMMY_BULK_TOTAL }, (_, index) => ({
      id: `dummy-bulk-${seed}-${index + 1}`,
      label: `Dummy Bulk Record ${index + 1}`,
      updatedAt: seed + index,
      bucket: `batch-${Math.floor(index / 6) + 1}`,
      body: repeatedText,
    }));
  }

  function createBulkPayload(entries) {
    return buildIdbPayload({ entries: entries.map((value) => ({ value })) });
  }

  function buildBatches(records, throttle) {
    const maxPayloadBytes = Math.max(4096, Number(throttle?.payloadLimits?.idb?.maxPayloadBytes || DEFAULT_IDB_PAYLOAD_LIMIT_BYTES));
    const maxBulkItems = Math.max(1, Number(throttle?.payloadLimits?.idb?.maxBulkItems || DEFAULT_IDB_BULK_ITEMS_LIMIT));
    const budget = Math.max(1024, maxPayloadBytes - 1024);
    const batches = [];
    let current = [];
    for (const record of records) {
      const candidate = [...current, record];
      if (current.length > 0 && (candidate.length > maxBulkItems || measurePayloadBytes(createBulkPayload(candidate)) > budget)) {
        batches.push(current);
        current = [record];
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  function updateProgress(progress) {
    state.idb.bulkImport = { ...state.idb.bulkImport, ...progress };
    const root = getDialogContentElement(EXAMPLE_BULK_PROGRESS_DIALOG_ID);
    updateBulkImportProgressView(root, progress, active?.total || 0);
  }

  async function openProgress(progress, throttle) {
    const result = await openDialog(core, {
      dialogId: EXAMPLE_BULK_PROGRESS_DIALOG_ID,
      title: "Dummy Bulk Import",
      html: createBulkImportProgressMarkup({ total: progress.total, totalBatches: progress.totalBatches, throttle }),
      closeOnBackdrop: true,
      closeOnEsc: true,
      size: "sm",
    });
    if (!result?.ok) throw new Error(`Progress dialog failed: ${result?.reason || "unknown"}`);
    updateProgress(progress);
  }

  async function closeProgress(reason = "bulk-import-finished") {
    if (active) {
      active.closing = true;
    }
    await closeDialog(core, EXAMPLE_BULK_PROGRESS_DIALOG_ID, reason);
  }

  function requestCancellation() {
    if (!active) return false;
    active.cancelled = true;
    updateProgress({ status: "cancelling", cancelled: true });
    return true;
  }

  function handleDialogClosed() {
    if (!active || active.closing) return false;
    requestCancellation();
    return true;
  }

  async function putWithRetry(payload, throttle) {
    const interval = Math.max(0, Number(throttle?.coreAction?.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS));
    let result = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await bulkPutRecords(core, payload);
      if (result?.ok || !RETRYABLE_REASONS.has(String(result?.reason || ""))) return result;
      await wait(Math.max(250, interval * (attempt + 1)));
    }
    return result;
  }

  async function run() {
    if (active) return { ok: false, reason: "bulk_import_active" };
    const throttleResult = await getCoreThrottle(core);
    const throttle = resolveThrottle(throttleResult?.ok ? throttleResult.value : state.meta.throttle);
    if (throttleResult?.ok) state.meta.throttle = throttleResult.value;
    const records = createDummyRecords(throttle);
    const batches = buildBatches(records, throttle);
    const progress = { status: "running", processed: 0, total: records.length, completedBatches: 0, totalBatches: batches.length, failed: 0, cancelled: false };
    active = { cancelled: false, closing: false, total: records.length };
    try {
      updateProgress(progress);
      await openProgress(progress, throttle);
      await syncPanel();
      const interval = Math.max(0, Number(throttle?.coreAction?.suggestedMinIntervalMs || DEFAULT_CORE_ACTION_INTERVAL_MS));
      for (let index = 0; index < batches.length; index += 1) {
        if (active?.cancelled) break;
        const startedAt = Date.now();
        const result = await putWithRetry(createBulkPayload(batches[index]), throttle);
        if (!result?.ok) {
          progress.failed += batches[index].length;
          progress.status = "failed";
          updateProgress(progress);
          await syncPanel();
          await closeProgress("bulk-import-failed");
          return result;
        }
        progress.processed += batches[index].length;
        progress.completedBatches += 1;
        updateProgress(progress);
        await syncPanel();
        const remaining = interval - (Date.now() - startedAt);
        if (remaining > 0 && index < batches.length - 1) await wait(remaining);
      }
      progress.status = active?.cancelled ? "cancelled" : "completed";
      progress.cancelled = Boolean(active?.cancelled);
      updateProgress(progress);
      await wait(progress.cancelled ? 150 : 300);
      await closeProgress(progress.cancelled ? "bulk-import-cancelled" : "bulk-import-complete");
      const countResult = await countRecords(core, buildIdbPayload({}));
      state.idb.count = countResult?.ok ? Number(countResult.value || 0) : state.idb.count;
      state.idb.lastRecord = { dummyImported: progress.processed, totalRequested: progress.total, totalBatches: progress.totalBatches, cancelled: progress.cancelled };
      await syncPanel();
      return { ok: true, value: { processed: progress.processed, total: progress.total, totalBatches: progress.totalBatches, cancelled: progress.cancelled } };
    } finally {
      active = null;
    }
  }

  return {
    run,
    requestCancellation,
    handleDialogClosed,
    isActive: () => Boolean(active),
  };
}
