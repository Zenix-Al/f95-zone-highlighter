export const AUTO_UPDATE_CYCLE_STORE = "update-cycles";
export const AUTO_UPDATE_QUEUE_STORE = "update-queue";
export const ACTIVE_AUTO_UPDATE_CYCLE_ID = "active";

const CYCLE_STATUSES = new Set([
  "preparing",
  "running",
  "paused",
  "waiting",
  "recovering",
  "completed",
]);
const QUEUE_STATUSES = new Set([
  "pending",
  "processing",
  "retry",
  "completed",
  "failed",
]);
const MAX_COUNT = Number.MAX_SAFE_INTEGER;
const MAX_TEXT = 160;
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

function text(value, max = MAX_TEXT) {
  return String(value || "").trim().slice(0, max);
}

function integer(value, fallback = 0, min = 0, max = MAX_COUNT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function status(value, allowed, fallback) {
  const normalized = text(value, 32).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function only(value) {
  return { kind: "only", value };
}

function bound(lower, upper) {
  return { kind: "bound", lower, upper };
}

function coreFailure(result, fallback = "idb_error") {
  return { ok: false, reason: text(result?.reason || fallback, 80) || fallback };
}

export function normalizeAutoUpdateCycle(value = {}, options = {}) {
  const fallbackStatus = options.status || "preparing";
  return {
    id: text(value.id || ACTIVE_AUTO_UPDATE_CYCLE_ID, 80),
    cycleId: text(value.cycleId, 128),
    status: status(value.status, CYCLE_STATUSES, fallbackStatus),
    scheduledFor: integer(value.scheduledFor),
    createdAt: integer(value.createdAt),
    startedAt: integer(value.startedAt),
    completedAt: integer(value.completedAt),
    updatedAt: integer(value.updatedAt),
    total: integer(value.total),
    attempted: integer(value.attempted),
    completed: integer(value.completed),
    failed: integer(value.failed),
    retryPending: integer(value.retryPending),
    current: integer(value.current),
    changed: integer(value.changed),
    skipped: integer(value.skipped),
    networkRetries: integer(value.networkRetries),
    currentThreadId: text(value.currentThreadId, 128),
    currentPosition: integer(value.currentPosition),
    dailyKey: text(value.dailyKey, 16),
    dailyAttempted: integer(value.dailyAttempted),
    dailyBonusAllowance: integer(value.dailyBonusAllowance, 0, 0, 100_000),
    checksPerDay: integer(value.checksPerDay, 100, 1, 100_000),
    nextRunAt: integer(value.nextRunAt),
  };
}

export function createAutoUpdateQueueItem(cycleId, threadId, position, value = {}) {
  const normalizedCycleId = text(cycleId, 128);
  const normalizedThreadId = text(threadId, 128);
  return normalizeAutoUpdateQueueItem({
    ...value,
    id: `${normalizedCycleId}:${normalizedThreadId}`,
    cycleId: normalizedCycleId,
    threadId: normalizedThreadId,
    position,
  });
}

export function normalizeAutoUpdateQueueItem(value = {}) {
  const cycleId = text(value.cycleId, 128);
  const threadId = text(value.threadId, 128);
  return {
    id: text(value.id || `${cycleId}:${threadId}`, 300),
    cycleId,
    threadId,
    position: integer(value.position, 0, 1),
    status: status(value.status, QUEUE_STATUSES, "pending"),
    attempts: integer(value.attempts, 0, 0, 100),
    attemptedDayKey: text(value.attemptedDayKey, 16),
    claimedBy: text(value.claimedBy, 160),
    claimExpiresAt: integer(value.claimExpiresAt),
    lastAttemptAt: integer(value.lastAttemptAt),
    nextAttemptAt: integer(value.nextAttemptAt),
    completedAt: integer(value.completedAt),
    lastErrorCode: text(value.lastErrorCode, 120),
  };
}

export function createAutoUpdateQueueRepository(api, { now = Date.now } = {}) {
  async function getCycle(id = ACTIVE_AUTO_UPDATE_CYCLE_ID) {
    const result = await api.getStoreValue(AUTO_UPDATE_CYCLE_STORE, text(id, 80));
    return result?.ok && result.value ? normalizeAutoUpdateCycle(result.value) : null;
  }

  async function putCycle(value) {
    const cycle = normalizeAutoUpdateCycle(value);
    if (!cycle.id || !cycle.cycleId) return { ok: false, reason: "cycle_identity_required" };
    const result = await api.putStoreValue(AUTO_UPDATE_CYCLE_STORE, cycle);
    return result?.ok ? { ...result, value: cycle } : coreFailure(result);
  }

  async function getQueueItem(id) {
    const result = await api.getStoreValue(AUTO_UPDATE_QUEUE_STORE, text(id, 300));
    return result?.ok && result.value ? normalizeAutoUpdateQueueItem(result.value) : null;
  }

  async function putQueueItem(value) {
    const item = normalizeAutoUpdateQueueItem(value);
    if (!item.id || !item.cycleId || !item.threadId || item.position < 1) {
      return { ok: false, reason: "queue_item_invalid" };
    }
    const result = await api.putStoreValue(AUTO_UPDATE_QUEUE_STORE, item);
    return result?.ok ? { ...result, value: item } : coreFailure(result);
  }

  async function putQueueItems(values, batchSize = DEFAULT_BATCH_SIZE) {
    const items = (Array.isArray(values) ? values : []).map(normalizeAutoUpdateQueueItem);
    if (items.some((item) => !item.id || !item.cycleId || !item.threadId || item.position < 1)) {
      return { ok: false, reason: "queue_item_invalid", written: 0 };
    }
    const size = integer(batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
    let written = 0;
    for (let index = 0; index < items.length; index += size) {
      const batch = items.slice(index, index + size);
      const result = await api.bulkPutStoreValues(AUTO_UPDATE_QUEUE_STORE, batch);
      if (!result?.ok) return { ...coreFailure(result), written };
      written += batch.length;
    }
    return { ok: true, written };
  }

  async function countCycleItems(cycleId, queueStatus = "") {
    const normalizedCycleId = text(cycleId, 128);
    const normalizedStatus = text(queueStatus, 32).toLowerCase();
    const query = normalizedStatus
      ? {
          index: "cycleStatusPosition",
          query: bound(
            [normalizedCycleId, normalizedStatus, 0],
            [normalizedCycleId, normalizedStatus, MAX_COUNT],
          ),
        }
      : { index: "cycleId", query: only(normalizedCycleId) };
    const result = await api.countStore(AUTO_UPDATE_QUEUE_STORE, query);
    return result?.ok ? integer(result.value) : null;
  }

  async function queryCycleItems({ cycleId, queueStatus = "", limit = 100, cursor = null } = {}) {
    const normalizedCycleId = text(cycleId, 128);
    const normalizedStatus = text(queueStatus, 32).toLowerCase();
    const index = normalizedStatus ? "cycleStatusPosition" : "cycleId";
    const query = normalizedStatus
      ? bound(
          [normalizedCycleId, normalizedStatus, 0],
          [normalizedCycleId, normalizedStatus, MAX_COUNT],
        )
      : only(normalizedCycleId);
    const result = await api.queryStore(AUTO_UPDATE_QUEUE_STORE, {
      index,
      query,
      direction: "next",
      limit: integer(limit, 100, 1, 500),
      cursor,
      pagination: "keyset",
      includeCursor: true,
    });
    if (!result?.ok) return coreFailure(result);
    const page = result.value || {};
    return {
      ok: true,
      items: (Array.isArray(page.items) ? page.items : []).map((entry) => ({
        cursor: entry?.cursor || null,
        value: normalizeAutoUpdateQueueItem(entry?.value || entry),
      })),
      nextCursor: page.nextCursor || null,
      hasMore: Boolean(page.hasMore),
    };
  }

  async function getCycleStatusCounts(cycleId) {
    const counts = {};
    for (const queueStatus of QUEUE_STATUSES) {
      const count = await countCycleItems(cycleId, queueStatus);
      if (count === null) return { ok: false, reason: "queue_count_failed" };
      counts[queueStatus] = count;
    }
    return { ok: true, counts };
  }

  async function getNextActionableItem(cycleId, currentTime = now()) {
    const normalizedCycleId = text(cycleId, 128);
    const [pendingPage, retryResult, nextRetryResult] = await Promise.all([
      queryCycleItems({ cycleId, queueStatus: "pending", limit: 1 }),
      api.queryStore(AUTO_UPDATE_QUEUE_STORE, {
        index: "cycleStatusNextAttempt",
        query: bound(
          [normalizedCycleId, "retry", 0],
          [normalizedCycleId, "retry", integer(currentTime)],
        ),
        direction: "next",
        limit: 1,
      }),
      api.queryStore(AUTO_UPDATE_QUEUE_STORE, {
        index: "cycleStatusNextAttempt",
        query: bound(
          [normalizedCycleId, "retry", 0],
          [normalizedCycleId, "retry", MAX_COUNT],
        ),
        direction: "next",
        limit: 1,
      }),
    ]);
    if (!pendingPage.ok) return pendingPage;
    if (!retryResult?.ok) return coreFailure(retryResult);
    if (!nextRetryResult?.ok) return coreFailure(nextRetryResult);
    const pending = pendingPage.items[0]?.value || null;
    const eligibleRetry = Array.isArray(retryResult.value) && retryResult.value[0]
      ? normalizeAutoUpdateQueueItem(retryResult.value[0])
      : null;
    const nextRetry = Array.isArray(nextRetryResult.value) && nextRetryResult.value[0]
      ? normalizeAutoUpdateQueueItem(nextRetryResult.value[0])
      : null;
    const item = !pending
      ? eligibleRetry
      : !eligibleRetry
        ? pending
        : eligibleRetry.position < pending.position
          ? eligibleRetry
          : pending;
    return {
      ok: true,
      item,
      waitingForRetryAt: !item && nextRetry ? nextRetry.nextAttemptAt : 0,
    };
  }

  async function rolloverDailyAllowance(value, dailyKey) {
    const cycle = normalizeAutoUpdateCycle(value);
    const normalizedDay = text(dailyKey, 16);
    if (!normalizedDay || cycle.dailyKey === normalizedDay) {
      return { ok: true, value: cycle, unchanged: true };
    }
    return putCycle({
      ...cycle,
      dailyKey: normalizedDay,
      dailyAttempted: 0,
      dailyBonusAllowance: 0,
      updatedAt: now(),
    });
  }

  async function claimQueueItem(value, { owner, expiresAt, dailyKey = "" } = {}) {
    const item = normalizeAutoUpdateQueueItem(value);
    if (!item.id || !item.cycleId || !item.threadId) {
      return { ok: false, reason: "queue_item_invalid" };
    }
    if (!["pending", "retry"].includes(item.status)) {
      return { ok: false, reason: "queue_item_not_claimable" };
    }
    return putQueueItem({
      ...item,
      status: "processing",
      attempts: item.attempts + 1,
      attemptedDayKey: text(dailyKey || item.attemptedDayKey, 16),
      claimedBy: text(owner, 160),
      claimExpiresAt: integer(expiresAt),
      lastAttemptAt: now(),
    });
  }

  async function grantDailyBonus(value, amount) {
    const cycle = normalizeAutoUpdateCycle(value);
    return putCycle({
      ...cycle,
      dailyBonusAllowance: Math.min(
        100_000,
        cycle.dailyBonusAllowance + integer(amount, cycle.checksPerDay, 1, 100_000),
      ),
      updatedAt: now(),
    });
  }

  async function ownsQueueItem(id, owner, currentTime = now()) {
    const item = await getQueueItem(id);
    return Boolean(
      item &&
      item.status === "processing" &&
      item.claimedBy === text(owner, 160) &&
      item.claimExpiresAt > integer(currentTime),
    );
  }

  async function renewQueueItemClaim(id, owner, expiresAt) {
    const item = await getQueueItem(id);
    if (
      !item ||
      item.status !== "processing" ||
      item.claimedBy !== text(owner, 160) ||
      item.claimExpiresAt <= now()
    ) {
      return { ok: false, reason: "queue_claim_lost" };
    }
    return putQueueItem({ ...item, claimExpiresAt: integer(expiresAt) });
  }

  async function settleQueueItem(value, settlement = {}) {
    const item = normalizeAutoUpdateQueueItem(value);
    if (settlement.owner) {
      const current = await getQueueItem(item.id);
      if (
        !current ||
        current.status !== "processing" ||
        current.claimedBy !== text(settlement.owner, 160) ||
        current.claimExpiresAt <= now()
      ) {
        return { ok: false, reason: "queue_claim_lost" };
      }
    }
    const nextStatus = status(settlement.status, QUEUE_STATUSES, "retry");
    if (!["pending", "retry", "completed", "failed"].includes(nextStatus)) {
      return { ok: false, reason: "queue_settlement_status_invalid" };
    }
    return putQueueItem({
      ...item,
      status: nextStatus,
      claimedBy: "",
      claimExpiresAt: 0,
      nextAttemptAt: integer(settlement.nextAttemptAt),
      attempts: Object.hasOwn(settlement, "attempts")
        ? integer(settlement.attempts, item.attempts, 0, 100)
        : item.attempts,
      completedAt: nextStatus === "completed" ? integer(settlement.completedAt, now()) : 0,
      lastErrorCode: text(settlement.lastErrorCode, 120),
    });
  }

  async function recoverStaleProcessing(cycleId, currentTime = now()) {
    let cursor = null;
    let recovered = 0;
    do {
      const page = await queryCycleItems({
        cycleId,
        queueStatus: "processing",
        limit: 500,
        cursor,
      });
      if (!page.ok) return { ...page, recovered };
      const stale = page.items
        .map(({ value }) => value)
        .filter((item) => item.claimExpiresAt <= currentTime)
        .map((item) => ({
          ...item,
          status: item.attempts > 0 ? "retry" : "pending",
          claimedBy: "",
          claimExpiresAt: 0,
          nextAttemptAt: Math.min(item.nextAttemptAt || currentTime, currentTime),
        }));
      if (stale.length > 0) {
        const written = await putQueueItems(stale);
        if (!written.ok) return { ...written, recovered };
        recovered += stale.length;
      }
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);
    return { ok: true, recovered };
  }

  async function deleteCycleItems(cycleId) {
    const normalizedCycleId = text(cycleId, 128);
    let removed = 0;
    while (normalizedCycleId) {
      const page = await queryCycleItems({ cycleId: normalizedCycleId, limit: 500 });
      if (!page.ok) return { ...page, removed };
      const keys = page.items.map(({ value }) => value.id).filter(Boolean);
      if (keys.length === 0) break;
      const result = await api.bulkDeleteStoreValues(AUTO_UPDATE_QUEUE_STORE, keys);
      if (!result?.ok) return { ...coreFailure(result), removed };
      removed += keys.length;
    }
    return { ok: true, removed };
  }

  async function verifyPreparedCycle(cycleId, expectedTotal) {
    const count = await countCycleItems(cycleId);
    if (count === null) return { ok: false, reason: "queue_count_failed" };
    const expected = integer(expectedTotal);
    return count === expected
      ? { ok: true, count }
      : { ok: false, reason: "queue_prepare_incomplete", count, expected };
  }

  async function publishPreparedCycle(cycle) {
    const prepared = normalizeAutoUpdateCycle(cycle, { status: "preparing" });
    const verified = await verifyPreparedCycle(prepared.cycleId, prepared.total);
    if (!verified.ok) return verified;
    return putCycle({
      ...prepared,
      status: "running",
      startedAt: prepared.startedAt || now(),
      updatedAt: now(),
    });
  }

  async function beginCyclePreparation(cycle = {}) {
    const createdAt = integer(cycle.createdAt) || now();
    return putCycle({
      ...cycle,
      id: ACTIVE_AUTO_UPDATE_CYCLE_ID,
      status: "preparing",
      createdAt,
      updatedAt: createdAt,
      startedAt: 0,
      completedAt: 0,
      total: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      retryPending: 0,
      current: 0,
      changed: 0,
      skipped: 0,
      networkRetries: 0,
      currentThreadId: "",
      currentPosition: 0,
    });
  }

  async function appendPreparedItems(cycleId, values, startPosition = 1, batchSize) {
    const normalizedCycleId = text(cycleId, 128);
    const position = integer(startPosition, 1, 1);
    const items = (Array.isArray(values) ? values : []).map((value, index) =>
      createAutoUpdateQueueItem(
        normalizedCycleId,
        value?.threadId || value,
        position + index,
        value,
      ),
    );
    return putQueueItems(items, batchSize);
  }

  async function finalizeCyclePreparation(cycle, total) {
    const prepared = normalizeAutoUpdateCycle({
      ...cycle,
      status: "preparing",
      total: integer(total),
      updatedAt: now(),
    });
    const master = await putCycle(prepared);
    if (!master.ok) return master;
    return publishPreparedCycle(prepared);
  }

  async function prepareCycle({ cycle = {}, items = [], batchSize = DEFAULT_BATCH_SIZE } = {}) {
    const prepared = normalizeAutoUpdateCycle({
      ...cycle,
      total: Array.isArray(items) ? items.length : 0,
    }, { status: "preparing" });
    if (!prepared.cycleId) return { ok: false, reason: "cycle_identity_required" };
    const seen = new Set();
    const queue = [];
    for (let index = 0; index < prepared.total; index += 1) {
      const source = items[index] || {};
      const threadId = text(source.threadId || source, 128);
      if (!threadId || seen.has(threadId)) {
        return { ok: false, reason: threadId ? "duplicate_thread_id" : "thread_id_required" };
      }
      seen.add(threadId);
      queue.push(createAutoUpdateQueueItem(prepared.cycleId, threadId, index + 1, source));
    }
    const masterWrite = await beginCyclePreparation(prepared);
    if (!masterWrite.ok) return masterWrite;
    const queueWrite = await putQueueItems(queue, batchSize);
    if (!queueWrite.ok) return { ...queueWrite, cycle: prepared };
    const published = await finalizeCyclePreparation(prepared, queue.length);
    return published.ok
      ? { ok: true, cycle: published.value, written: queueWrite.written }
      : { ...published, cycle: prepared, written: queueWrite.written };
  }

  async function discardCycle(cycleId) {
    const active = await getCycle();
    if (!active || active.cycleId !== text(cycleId, 128)) {
      return { ok: false, reason: "cycle_identity_mismatch", removed: 0 };
    }
    const removed = await deleteCycleItems(cycleId);
    if (!removed.ok) return removed;
    const result = await api.deleteStoreValue(
      AUTO_UPDATE_CYCLE_STORE,
      ACTIVE_AUTO_UPDATE_CYCLE_ID,
    );
    if (!result?.ok) return { ...coreFailure(result), removed: removed.removed };
    return removed;
  }

  return {
    getCycle,
    putCycle,
    getQueueItem,
    putQueueItem,
    putQueueItems,
    countCycleItems,
    queryCycleItems,
    getCycleStatusCounts,
    getNextActionableItem,
    rolloverDailyAllowance,
    claimQueueItem,
    grantDailyBonus,
    ownsQueueItem,
    renewQueueItemClaim,
    settleQueueItem,
    recoverStaleProcessing,
    deleteCycleItems,
    verifyPreparedCycle,
    publishPreparedCycle,
    beginCyclePreparation,
    appendPreparedItems,
    finalizeCyclePreparation,
    prepareCycle,
    discardCycle,
  };
}
