import {
  getFailureDelay,
  getLocalDayKey,
  getNextLocalDayAt,
  getNextScheduledAt,
} from "./autoUpdatePolicy.js";

const TERMINAL_FAILURES = new Set(["http_404", "thread_not_found", "entry_not_found"]);

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, Number(ms) || 0));
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function createAutoUpdateQueueWorker({
  repository,
  getRecord,
  checkRecords,
  commitResults,
  now = Date.now,
  waitFor = wait,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  async function run({
    owner,
    config,
    signal = null,
    stillOwn = async () => true,
    renewOwnership = async () => true,
    onCycleChange = () => {},
  }) {
    let cycle = await repository.getCycle();
    if (!cycle) return { ok: false, reason: "cycle_missing" };
    if (cycle.status === "paused") return { ok: false, reason: "paused", cycle };
    if (cycle.status === "completed") return { ok: true, cycle };

    async function updateCycle(patch) {
      const result = await repository.putCycle({
        ...cycle,
        ...patch,
        updatedAt: now(),
      });
      if (result?.ok) cycle = result.value;
      if (result?.ok) onCycleChange(cycle);
      return result;
    }

    async function owned(threadId = "") {
      return !signal?.aborted && Boolean(await stillOwn(threadId));
    }

    async function ownsClaim(item) {
      return await owned(item.threadId) &&
        repository.ownsQueueItem(item.id, owner, now());
    }

    if (!(await owned())) return { ok: false, reason: "lease_lost", cycle };
    await updateCycle({ status: "recovering" });
    const recovered = await repository.recoverStaleProcessing(cycle.cycleId, now());
    if (!recovered?.ok) return { ...recovered, cycle };

    async function settleSkipped(item, reason) {
      const claimed = await repository.claimQueueItem(item, {
        owner,
        expiresAt: now() + config.leaseTtlMs,
      });
      if (!claimed?.ok) return claimed;
      const settled = await repository.settleQueueItem(claimed.value, {
        owner,
        status: "completed",
        completedAt: now(),
        lastErrorCode: reason,
      });
      if (!settled?.ok) return settled;
      return updateCycle({
        attempted: cycle.attempted + 1,
        completed: cycle.completed + 1,
        skipped: cycle.skipped + 1,
        currentThreadId: "",
        currentPosition: item.position,
      });
    }

    async function withHeartbeat(item, task) {
      let activeItem = item;
      let heartbeatBusy = false;
      let claimLost = false;
      const heartbeatMs = Math.max(5_000, Math.floor(config.leaseTtlMs / 3));
      const heartbeat = async () => {
        if (heartbeatBusy || signal?.aborted) return;
        heartbeatBusy = true;
        try {
          await renewOwnership(activeItem.threadId);
          const refreshed = await repository.renewQueueItemClaim(
            activeItem.id,
            owner,
            now() + config.leaseTtlMs,
          );
          if (refreshed?.ok) activeItem = refreshed.value;
          else claimLost = true;
        } finally {
          heartbeatBusy = false;
        }
      };
      const timer = setIntervalFn(() => void heartbeat(), heartbeatMs);
      timer?.unref?.();
      try {
        const value = await task(() => activeItem);
        return { value, item: activeItem, claimLost };
      } finally {
        clearIntervalFn(timer);
      }
    }

    const initialDayKey = getLocalDayKey(now());
    const rolled = await repository.rolloverDailyAllowance(cycle, initialDayKey);
    if (!rolled?.ok) return { ...rolled, cycle };
    cycle = rolled.value;
    await updateCycle({ status: "running", checksPerDay: config.checksPerDay || cycle.checksPerDay });
    for (;;) {
      if (!(await owned())) {
        await updateCycle({ status: signal?.aborted ? "paused" : "waiting" });
        return { ok: false, reason: signal?.aborted ? "cancelled" : "lease_lost", cycle };
      }
      const next = await repository.getNextActionableItem(cycle.cycleId, now());
      if (!next?.ok) return { ...next, cycle };
      if (!next.item) {
        const counts = await repository.getCycleStatusCounts(cycle.cycleId);
        if (!counts?.ok) return { ...counts, cycle };
        const unfinished = counts.counts.pending + counts.counts.processing + counts.counts.retry;
        const status = unfinished === 0 ? "completed" : "waiting";
        const nextRunAt = status === "completed"
          ? getNextScheduledAt(now(), config.intervalMs, config.runHour)
          : next.waitingForRetryAt || cycle.nextRunAt;
        const updated = await updateCycle({
          status,
          completedAt: status === "completed" ? now() : 0,
          retryPending: counts.counts.retry,
          failed: counts.counts.failed,
          currentThreadId: "",
          nextRunAt,
        });
        return updated?.ok
          ? { ok: true, cycle, waiting: status === "waiting" }
          : { ...updated, cycle };
      }

      const item = next.item;
      const record = await getRecord(item.threadId);
      if (!record) {
        const skipped = await settleSkipped(item, "entry_removed");
        if (!skipped?.ok) return { ...skipped, cycle };
        continue;
      }
      if (record.updateCheck?.enabled === false) {
        const skipped = await settleSkipped(item, "auto_update_disabled");
        if (!skipped?.ok) return { ...skipped, cycle };
        continue;
      }

      const dayKey = getLocalDayKey(now());
      if (cycle.dailyKey !== dayKey) {
        const daily = await repository.rolloverDailyAllowance(cycle, dayKey);
        if (!daily?.ok) return { ...daily, cycle };
        cycle = daily.value;
      }
      const consumesAllowance = item.attemptedDayKey !== dayKey;
      const dailyLimit = cycle.checksPerDay + cycle.dailyBonusAllowance;
      if (consumesAllowance && cycle.dailyAttempted >= dailyLimit) {
        const waiting = await updateCycle({
          status: "waiting",
          currentThreadId: "",
          nextRunAt: getNextLocalDayAt(now()),
        });
        return waiting?.ok
          ? { ok: true, cycle, waiting: true, reason: "daily_allowance_exhausted" }
          : { ...waiting, cycle };
      }

      const claim = await repository.claimQueueItem(item, {
        owner,
        expiresAt: now() + config.leaseTtlMs,
        dailyKey: dayKey,
      });
      if (!claim?.ok) return { ...claim, cycle };
      const claimedCycle = await updateCycle({
        dailyAttempted: cycle.dailyAttempted + (consumesAllowance ? 1 : 0),
        currentThreadId: item.threadId,
        currentPosition: item.position,
      });
      if (!claimedCycle?.ok) return { ...claimedCycle, cycle };

      const checked = await withHeartbeat(claim.value, () =>
        checkRecords([item.threadId], {
          signal,
          spacingMs: config.spacingMs,
          jitterMs: config.jitterMs,
          timeoutMs: config.timeoutMs,
          retryLimit: config.retryLimit,
          maxRecords: 1,
        }),
      );
      const preview = checked.value;
      const activeClaim = checked.item;
      const check = preview?.results?.[0] || null;
      if (checked.claimLost || !(await ownsClaim(activeClaim))) {
        await updateCycle({ status: signal?.aborted ? "paused" : "waiting" });
        return { ok: false, reason: signal?.aborted ? "cancelled" : "lease_lost", cycle };
      }
      const latest = await getRecord(item.threadId);
      if (!latest || latest.updateCheck?.enabled === false) {
        const settled = await repository.settleQueueItem(activeClaim, {
          owner,
          status: "completed",
          completedAt: now(),
          attempts: claim.value.attempts + Math.max(0, Number(check?.attempts || 1) - 1),
          lastErrorCode: latest ? "auto_update_disabled" : "entry_removed",
        });
        if (!settled?.ok) return { ...settled, cycle };
        await updateCycle({
          attempted: cycle.attempted + 1,
          completed: cycle.completed + 1,
          skipped: cycle.skipped + 1,
          networkRetries: cycle.networkRetries + Math.max(0, Number(check?.attempts || 1) - 1),
          currentThreadId: "",
        });
        continue;
      }
      if (!check) {
        await updateCycle({ status: "paused", currentThreadId: "" });
        return { ok: false, reason: "check_result_missing", cycle };
      }

      if (!(await ownsClaim(activeClaim))) {
        await updateCycle({ status: "waiting", currentThreadId: "" });
        return { ok: false, reason: "lease_lost", cycle };
      }
      const committed = await commitResults(preview, {
        shouldCancel: () => Boolean(signal?.aborted),
        scheduleIntervalMs: config.intervalMs,
        nextCheckAt: cycle.nextRunAt,
      });
      if (signal?.aborted || committed?.cancelled || !(await owned(item.threadId))) {
        await updateCycle({ status: "paused", currentThreadId: "" });
        return { ok: false, reason: "cancelled", cycle };
      }

      const requestAttempts = Math.max(1, Number(check.attempts || 1));
      const totalAttempts = claim.value.attempts + requestAttempts - 1;
      const wasRetry = item.status === "retry";
      if (!check.ok) {
        const terminal = TERMINAL_FAILURES.has(check.reason);
        const settled = await repository.settleQueueItem(activeClaim, {
          owner,
          status: terminal ? "failed" : "retry",
          attempts: totalAttempts,
          nextAttemptAt: terminal
            ? 0
            : now() + getFailureDelay(config.intervalMs, totalAttempts),
          lastErrorCode: check.reason || "unknown_error",
        });
        if (!settled?.ok) return { ...settled, cycle };
        await updateCycle({
          attempted: cycle.attempted + 1,
          failed: cycle.failed + (terminal ? 1 : 0),
          retryPending: Math.max(
            0,
            cycle.retryPending + (wasRetry ? 0 : 1) - (terminal && wasRetry ? 1 : 0),
          ),
          networkRetries: cycle.networkRetries + requestAttempts - 1,
          currentThreadId: "",
        });
      } else {
        const settled = await repository.settleQueueItem(activeClaim, {
          owner,
          status: "completed",
          completedAt: now(),
          attempts: totalAttempts,
          lastErrorCode: "",
        });
        if (!settled?.ok) return { ...settled, cycle };
        await updateCycle({
          attempted: cycle.attempted + 1,
          completed: cycle.completed + 1,
          current: cycle.current + Number(committed.current || 0),
          changed: cycle.changed + Number(committed.changed || 0),
          retryPending: Math.max(0, cycle.retryPending - (wasRetry ? 1 : 0)),
          networkRetries: cycle.networkRetries + requestAttempts - 1,
          currentThreadId: "",
        });
      }
      await renewOwnership(item.threadId);
      await waitFor(config.spacingMs, signal);
    }
  }

  return { run };
}
