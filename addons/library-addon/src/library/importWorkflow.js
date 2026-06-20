const PAYLOAD_SIZE_ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function measurePayloadBytes(payload) {
  try {
    const json = JSON.stringify(payload ?? null);
    return PAYLOAD_SIZE_ENCODER ? PAYLOAD_SIZE_ENCODER.encode(json).length : json.length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function buildImportBatches(operations, throttleInfo, createEntriesPayload) {
  const list = Array.isArray(operations) ? operations : [];
  const maxPayloadBytes = Math.max(
    4096,
    Number(throttleInfo?.payloadLimits?.idb?.maxPayloadBytes || 4096),
  );
  const maxBulkItems = Math.max(1, Number(throttleInfo?.payloadLimits?.idb?.maxBulkItems || 1));
  const payloadBudget = Math.max(1024, maxPayloadBytes - 1024);
  const batches = [];
  let currentBatch = [];

  for (const operation of list) {
    const candidateBatch = [...currentBatch, operation];
    const candidatePayload = createEntriesPayload(candidateBatch.map((entry) => entry.value));
    const candidateBytes = measurePayloadBytes(candidatePayload);

    if (
      currentBatch.length > 0 &&
      (candidateBatch.length > maxBulkItems || candidateBytes > payloadBudget)
    ) {
      batches.push([...currentBatch]);
      currentBatch = [operation];
      continue;
    }

    currentBatch = candidateBatch;
  }

  if (currentBatch.length > 0) {
    batches.push([...currentBatch]);
  }

  return batches;
}

export function previewLibraryImport({
  records,
  conflictPolicy,
  existingEntries,
  throttleInfo,
  normalizeRecord,
  createEntriesPayload,
}) {
  const list = Array.isArray(records) ? records : [];
  const existingById = new Map(
    (Array.isArray(existingEntries) ? existingEntries : [])
      .map((entry) => normalizeRecord(entry))
      .filter((entry) => entry.threadId)
      .map((entry) => [entry.threadId, entry]),
  );

  const seenThreadIds = new Set();
  const operations = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;
  let skippedNotNewer = 0;
  let skippedDuplicateInFile = 0;

  for (const raw of list) {
    const next = normalizeRecord(raw);
    if (!next.threadId) {
      skipped += 1;
      skippedInvalid += 1;
      continue;
    }

    if (seenThreadIds.has(next.threadId)) {
      skipped += 1;
      skippedDuplicateInFile += 1;
      continue;
    }
    seenThreadIds.add(next.threadId);

    const existing = existingById.get(next.threadId);
    if (!existing) {
      operations.push({ mode: "add", value: next });
      added += 1;
      continue;
    }

    if (conflictPolicy === "skip") {
      skipped += 1;
      skippedExisting += 1;
      continue;
    }

    if (conflictPolicy === "newer") {
      const existingUpdatedAt = Number(existing.updatedAt || 0);
      const incomingUpdatedAt = Number(next.updatedAt || 0);
      if (incomingUpdatedAt <= existingUpdatedAt) {
        skipped += 1;
        skippedNotNewer += 1;
        continue;
      }
    }

    operations.push({
      mode: "update",
      value: { ...existing, ...next, createdAt: existing.createdAt },
    });
    updated += 1;
  }

  const batches = buildImportBatches(operations, throttleInfo, createEntriesPayload);

  return {
    records: list,
    conflictPolicy,
    throttleInfo,
    operations,
    batches,
    total: list.length,
    writeCount: operations.length,
    totalBatches: batches.length,
    added,
    updated,
    skipped,
    skippedInvalid,
    skippedExisting,
    skippedNotNewer,
    skippedDuplicateInFile,
  };
}

async function saveImportBatchIndividually(batch, shouldCancel, minIntervalMs, saveOperation) {
  const list = Array.isArray(batch) ? batch : [];
  const failureReasons = {};
  let added = 0;
  let updated = 0;
  let failed = 0;
  let processed = 0;
  let cancelled = false;

  function recordFailure(reason) {
    const normalizedReason = String(reason || "unknown");
    failureReasons[normalizedReason] = Number(failureReasons[normalizedReason] || 0) + 1;
    failed += 1;
  }

  for (let index = 0; index < list.length; index += 1) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const startedAt = Date.now();
    const operation = list[index];
    const result = await saveOperation(operation, shouldCancel);
    if (result?.reason === "cancelled") {
      cancelled = true;
      break;
    }

    if (result?.ok) {
      if (operation?.mode === "update") updated += 1;
      else added += 1;
    } else {
      recordFailure(result?.reason);
    }

    processed += 1;

    const elapsedMs = Date.now() - startedAt;
    const waitMs = Math.max(0, Number(minIntervalMs || 0) - elapsedMs);
    if (waitMs > 0 && index < list.length - 1) {
      await wait(waitMs);
    }
  }

  return {
    ok: failed === 0 && !cancelled,
    added,
    updated,
    failed,
    processed,
    cancelled,
    failureReasons,
  };
}

export async function executeLibraryImport({
  records,
  plan,
  shouldCancel,
  onProgress,
  bulkPutEntries,
  saveOperation,
}) {
  const list = Array.isArray(records) ? records : [];
  let added = 0;
  let updated = 0;
  let skipped = Number(plan.skipped || 0);
  const skippedInvalid = Number(plan.skippedInvalid || 0);
  const skippedExisting = Number(plan.skippedExisting || 0);
  const skippedNotNewer = Number(plan.skippedNotNewer || 0);
  const skippedDuplicateInFile = Number(plan.skippedDuplicateInFile || 0);
  let failed = 0;
  const failureReasons = {};
  let processed = skipped;
  let cancelled = false;
  let completedBatches = 0;
  const totalBatches = Number(plan.totalBatches || 0);
  const minIntervalMs = Math.max(
    0,
    Number(plan?.throttleInfo?.coreAction?.suggestedMinIntervalMs || 0),
  );

  function mergeFailureReasons(nextFailureReasons = {}) {
    for (const [reason, count] of Object.entries(nextFailureReasons)) {
      failureReasons[reason] = Number(failureReasons[reason] || 0) + Number(count || 0);
    }
  }

  function reportProgress(status = "running") {
    onProgress({
      status,
      processed,
      total: Number(plan.total || list.length),
      added,
      updated,
      skipped,
      failed,
      cancelled,
      completedBatches,
      totalBatches,
      skippedInvalid,
      skippedExisting,
      skippedNotNewer,
      skippedDuplicateInFile,
    });
  }

  reportProgress();

  for (let batchIndex = 0; batchIndex < plan.batches.length; batchIndex += 1) {
    if (shouldCancel()) {
      cancelled = true;
      break;
    }

    const batch = plan.batches[batchIndex];
    const startedAt = Date.now();
    const bulkResult = await bulkPutEntries(
      batch.map((entry) => entry.value),
      shouldCancel,
    );
    if (bulkResult?.reason === "cancelled") {
      cancelled = true;
      break;
    }

    let batchOutcome = null;
    if (bulkResult?.ok) {
      batchOutcome = {
        added: batch.filter((entry) => entry.mode === "add").length,
        updated: batch.filter((entry) => entry.mode === "update").length,
        failed: 0,
        processed: batch.length,
        cancelled: false,
        failureReasons: {},
      };
    } else {
      batchOutcome = await saveImportBatchIndividually(
        batch,
        shouldCancel,
        minIntervalMs,
        saveOperation,
      );
    }

    if (batchOutcome?.cancelled) {
      cancelled = true;
      break;
    }

    added += Number(batchOutcome?.added || 0);
    updated += Number(batchOutcome?.updated || 0);
    processed += Number(batchOutcome?.processed || 0);
    failed += Number(batchOutcome?.failed || 0);
    skipped += Number(batchOutcome?.failed || 0);
    mergeFailureReasons(batchOutcome?.failureReasons);
    completedBatches += 1;
    reportProgress();

    const elapsedMs = Date.now() - startedAt;
    const waitMs = Math.max(0, minIntervalMs - elapsedMs);
    if (waitMs > 0 && batchIndex < plan.batches.length - 1) {
      await wait(waitMs);
    }
  }

  reportProgress(cancelled ? "cancelled" : "completed");

  return {
    ok: failed === 0,
    imported: added + updated,
    added,
    updated,
    skipped,
    skippedInvalid,
    skippedExisting,
    skippedNotNewer,
    skippedDuplicateInFile,
    failed,
    failureReasons,
    cancelled,
    processed,
    total: Number(plan.total || list.length),
    completedBatches,
    totalBatches,
    throttleInfo: plan.throttleInfo,
  };
}
