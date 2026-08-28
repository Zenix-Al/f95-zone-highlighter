import { getClaimJitter, getLocalDayKey, getNextScheduledAt } from "./autoUpdatePolicy.js";
import { debugLog } from "../../../shared/debugLog.js";

const DEBUG_OWNER = "library-addon:auto-update";

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function owned(value, owner, generation, now) {
  return value?.owner === owner && value?.generation === generation && Number(value.expiresAt) > now;
}

export function getStartupDelay({ cycle, lease, currentTime, intervalMs }) {
  const regularDelay = Math.min(Math.max(0, Number(intervalMs) || 0), 60_000);
  if (!cycle || !["running", "recovering"].includes(cycle.status)) return regularDelay;
  const leaseExpiry = Number(lease?.expiresAt || 0);
  return leaseExpiry > currentTime ? leaseExpiry - currentTime + 250 : 0;
}

function completedCycle(summary, dailyAttempted, timestamp, config, nextRunAt = 0) {
  return {
    id: "active",
    cycleId: `legacy-summary-${timestamp}`,
    status: "completed",
    scheduledFor: Number(summary?.startedAt || timestamp),
    createdAt: Number(summary?.startedAt || timestamp),
    startedAt: Number(summary?.startedAt || timestamp),
    completedAt: Number(summary?.finishedAt || timestamp),
    updatedAt: timestamp,
    total: Number(summary?.total || 0),
    attempted: Number(summary?.checked || 0),
    completed: Number(summary?.checked || 0),
    failed: Number(summary?.failed || 0),
    current: Number(summary?.current || 0),
    changed: Number(summary?.changed || 0),
    skipped: Number(summary?.skipped || 0),
    networkRetries: Number(summary?.retries || 0),
    dailyKey: getLocalDayKey(timestamp),
    dailyAttempted,
    checksPerDay: config.checksPerDay,
    nextRunAt: Number(nextRunAt || summary?.nextRunAt || 0),
  };
}

export function createAutoUpdateScheduler({
  repository,
  queueRuntime,
  now = Date.now,
  random = Math.random,
  owner = `tab:${Math.random().toString(36).slice(2)}`,
}) {
  let controller = null;
  let generation = 0;
  let timer = null;
  let recoveryAt = 0;
  const listeners = new Set();

  function notify(cycle) {
    listeners.forEach((listener) => {
      try { listener(cycle); } catch { /* UI listeners are isolated. */ }
    });
  }

  async function claimLease(config, signal) {
    const currentTime = now();
    const existing = await repository.getLease();
    if (existing && Number(existing.expiresAt) > currentTime && existing.owner !== owner) {
      return null;
    }
    const value = {
      owner,
      generation,
      claimedAt: currentTime,
      expiresAt: currentTime + config.leaseTtlMs,
    };
    await repository.putLease(value);
    await wait(getClaimJitter(config.jitterMs, random), signal);
    const verified = await repository.getLease();
    return owned(verified, owner, generation, now()) ? verified : null;
  }

  async function stillOwn() {
    return owned(await repository.getLease(), owner, generation, now());
  }

  async function releaseLease() {
    if (await stillOwn()) await repository.deleteLease();
  }

  async function migrateLegacyMetadata(config) {
    const cycle = await queueRuntime.getCycle();
    const legacy = await repository.getLegacyQueueMetadata(now());
    if (legacy?.complete) return { ok: true, cycle, legacy: null };
    if (cycle) {
      const cleared = await repository.clearLegacyQueueMetadata(legacy?.days);
      return cleared?.ok ? { ok: true, cycle, legacy: null } : cleared;
    }
    const summary = legacy?.summary || null;
    if (summary && Number(summary.nextRunAt || 0) > now()) {
      const written = await queueRuntime.putCycle(
        completedCycle(summary, legacy.dailyAttempted, now(), config),
      );
      if (!written?.ok) return written;
      const cleared = await repository.clearLegacyQueueMetadata(legacy.days);
      return cleared?.ok ? { ok: true, cycle: written.value, legacy: null } : cleared;
    }
    return { ok: true, cycle: null, legacy };
  }

  async function run(options = {}) {
    if (controller) return { ok: false, reason: "already_running" };
    if (!queueRuntime) return { ok: false, reason: "queue_unavailable" };
    controller = new AbortController();
    const signal = controller.signal;
    generation += 1;
    const config = await repository.getConfig();
    if (!config.enabled && !options.force) {
      controller = null;
      return { ok: false, reason: "paused" };
    }
    if (!(await claimLease(config, signal))) {
      controller = null;
      return { ok: false, reason: "lease_owned" };
    }

    const migrated = await migrateLegacyMetadata(config);
    if (!migrated?.ok) {
      await releaseLease();
      controller = null;
      return migrated;
    }
    const startedAt = now();
    const nextRunAt = getNextScheduledAt(startedAt, config.intervalMs, config.runHour);
    let cycle = migrated.cycle;
    if (cycle?.status === "completed" && !options.force && !options.runNow && cycle.nextRunAt > startedAt) {
      await releaseLease();
      controller = null;
      return { ok: false, reason: "not_due", nextRunAt: cycle.nextRunAt, cycle };
    }
    if (!cycle || cycle.status === "completed" || cycle.status === "preparing") {
      const snapshot = await queueRuntime.buildSnapshot({
        checksPerDay: config.checksPerDay,
        scheduledFor: startedAt,
        signal,
      });
      if (!snapshot?.ok) {
        await releaseLease();
        controller = null;
        return snapshot;
      }
      cycle = snapshot.cycle;
      if (migrated.legacy) {
        const carried = await queueRuntime.putCycle({
          ...cycle,
          dailyKey: getLocalDayKey(startedAt),
          dailyAttempted: migrated.legacy.dailyAttempted,
        });
        if (!carried?.ok) {
          await releaseLease();
          controller = null;
          return carried;
        }
        cycle = carried.value;
        const cleared = await repository.clearLegacyQueueMetadata(migrated.legacy.days);
        if (!cleared?.ok) {
          await releaseLease();
          controller = null;
          return cleared;
        }
      }
    }
    if (cycle.status === "paused") {
      const resumed = await queueRuntime.putCycle({ ...cycle, status: "running" });
      if (!resumed?.ok) {
        await releaseLease();
        controller = null;
        return resumed;
      }
      cycle = resumed.value;
    }
    if (!cycle.nextRunAt) {
      const scheduled = await queueRuntime.putCycle({ ...cycle, nextRunAt });
      if (!scheduled?.ok) {
        await releaseLease();
        controller = null;
        return scheduled;
      }
    }
    const renewOwnership = async () => {
      if (!(await stillOwn())) return false;
      await repository.putLease({ owner, generation, expiresAt: now() + config.leaseTtlMs });
      return true;
    };
    const worked = await queueRuntime.runWorker({
      owner,
      config,
      signal,
      stillOwn,
      renewOwnership,
      onCycleChange: notify,
    });
    const settledCycle = worked?.cycle || await queueRuntime.getCycle();
    await releaseLease();
    controller = null;
    debugLog(DEBUG_OWNER, "Durable automatic-update cycle settled.", {
      data: { cycleId: settledCycle?.cycleId || "", status: settledCycle?.status || "" },
    });
    return { ok: Boolean(worked?.ok), cycle: settledCycle, reason: worked?.reason };
  }

  async function start(options = {}) {
    const config = await repository.getConfig();
    if (options.reschedule) {
      const cycle = await queueRuntime.getCycle();
      const nextRunAt = getNextScheduledAt(now(), config.intervalMs, config.runHour);
      await queueRuntime.putCycle(
        cycle ? { ...cycle, nextRunAt } : completedCycle(null, 0, now(), config, nextRunAt),
      );
    }
    const [cycle, lease] = await Promise.all([
      queueRuntime.getCycle(),
      repository.getLease(),
    ]);
    const delayMs = getStartupDelay({
      cycle,
      lease,
      currentTime: now(),
      intervalMs: config.intervalMs,
    });
    recoveryAt = ["running", "recovering"].includes(cycle?.status) &&
      Number(lease?.expiresAt || 0) > now()
      ? Number(lease.expiresAt) + 250
      : 0;
    notify(cycle);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      recoveryAt = 0;
      notify(await queueRuntime.getCycle());
      await run();
      if (timer) await start();
    }, delayMs);
    timer?.unref?.();
    debugLog(DEBUG_OWNER, "Automatic-update scheduler armed.", {
      data: { delayMs, cycleStatus: cycle?.status || "idle", leaseExpiresAt: lease?.expiresAt || 0 },
    });
  }

  async function stop() {
    clearTimeout(timer);
    timer = null;
    recoveryAt = 0;
    controller?.abort();
    controller = null;
    const lease = await repository.getLease();
    if (lease?.owner === owner) await repository.deleteLease();
  }

  async function getDurableState() {
    return queueRuntime?.getCycle() || null;
  }

  async function pause() {
    await stop();
    const cycle = await getDurableState();
    if (!cycle || cycle.status === "completed") return { ok: false, reason: "cycle_inactive" };
    const result = await queueRuntime.putCycle({ ...cycle, status: "paused", currentThreadId: "" });
    if (result?.ok) notify(result.value);
    return result;
  }

  async function grantNextBatch() {
    const cycle = await getDurableState();
    if (!cycle || cycle.status === "completed") return { ok: false, reason: "cycle_inactive" };
    const granted = await queueRuntime.grantDailyBonus(cycle, cycle.checksPerDay);
    if (!granted?.ok) return granted;
    notify(granted.value);
    return run({ runNow: true });
  }

  async function restartCycle() {
    await stop();
    const cycle = await getDurableState();
    if (cycle) {
      const discarded = await queueRuntime.discardCycle(cycle.cycleId);
      if (!discarded?.ok) return discarded;
    }
    notify(null);
    return run({ runNow: true, force: true });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    run,
    start,
    stop,
    pause,
    grantNextBatch,
    restartCycle,
    getDurableState,
    subscribe,
    snapshot: () => ({
      running: Boolean(controller),
      recoveryPending: recoveryAt > now(),
      recoveryAt,
    }),
  };
}
