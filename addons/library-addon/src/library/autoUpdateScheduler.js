import { getClaimJitter } from "./autoUpdatePolicy.js";
import { debugLog } from "../../../shared/debugLog.js";

const DEBUG_OWNER = "library-addon:auto-update";

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function owned(value, owner, generation, now) {
  return value?.owner === owner && value?.generation === generation && Number(value.expiresAt) > now;
}

export function createAutoUpdateScheduler({
  repository,
  getDueRecords,
  checkRecords,
  commitResults,
  isRecordEligible = async () => true,
  now = Date.now,
  random = Math.random,
  owner = `tab:${Math.random().toString(36).slice(2)}`,
}) {
  let controller = null;
  let generation = 0;
  let timer = null;
  let sessionCount = 0;

  async function claim(kind, id, config, signal) {
    const currentTime = now();
    const read = kind === "lease" ? repository.getLease : () => repository.getClaim(id);
    const write = kind === "lease" ? repository.putLease : (value) => repository.putClaim(id, value);
    const existing = await read();
    if (existing && Number(existing.expiresAt) > currentTime && existing.owner !== owner) {
      debugLog(DEBUG_OWNER, "Automatic-update claim blocked.", {
        data: { kind, id, owner, heldBy: existing.owner, expiresAt: existing.expiresAt },
      });
      return null;
    }
    const value = {
      owner,
      generation,
      claimedAt: currentTime,
      expiresAt: currentTime + config.leaseTtlMs,
    };
    await write(value);
    await wait(getClaimJitter(config.jitterMs, random), signal);
    const verified = await read();
    const accepted = owned(verified, owner, generation, now());
    debugLog(DEBUG_OWNER, "Automatic-update claim verified.", {
      data: { kind, id, owner, generation, accepted, expiresAt: verified?.expiresAt || 0 },
    });
    return accepted ? verified : null;
  }

  async function stillOwn(threadId = "") {
    const lease = await repository.getLease();
    if (!owned(lease, owner, generation, now())) return false;
    if (!threadId) return true;
    return owned(await repository.getClaim(threadId), owner, generation, now());
  }

  async function run(options = {}) {
    if (controller) {
      debugLog(DEBUG_OWNER, "Automatic update skipped.", {
        data: { reason: "already_running" },
      });
      return { ok: false, reason: "already_running" };
    }
    controller = new AbortController();
    const signal = controller.signal;
    generation += 1;
    const config = await repository.getConfig();
    debugLog(DEBUG_OWNER, "Automatic-update run requested.", {
      data: {
        owner,
        generation,
        enabled: config.enabled,
        force: Boolean(options.force),
        failedOnly: Boolean(options.failedOnly),
        sessionCount,
      },
    });
    if (!config.enabled && !options.force) {
      controller = null;
      debugLog(DEBUG_OWNER, "Automatic update skipped.", { data: { reason: "paused" } });
      return { ok: false, reason: "paused" };
    }
    if (!(await claim("lease", "", config, signal))) {
      controller = null;
      debugLog(DEBUG_OWNER, "Automatic update skipped.", { data: { reason: "lease_owned" } });
      return { ok: false, reason: "lease_owned" };
    }
    const startedAt = now();
    const summary = {
      status: "running",
      startedAt,
      finishedAt: null,
      nextRunAt: startedAt + config.intervalMs,
      total: 0,
      activeThreadId: "",
      checked: 0,
      current: 0,
      changed: 0,
      failed: 0,
      skipped: 0,
      retries: 0,
    };
    await repository.putSummary(summary);
    const day = new Date(startedAt).toISOString().slice(0, 10);
    const dailyUsage = await repository.getDailyUsage(day);
    let dailyCount = Math.max(0, Number(dailyUsage?.count || 0));
    const remaining = options.force
      ? 100
      : Math.max(
          0,
          Math.min(config.sessionCap - sessionCount, config.dailyCap - dailyCount),
        );
    const due = await getDueRecords({
      now: startedAt,
      limit: remaining,
      failedOnly: Boolean(options.failedOnly),
      ignoreSchedule: Boolean(options.failedOnly && options.force),
    });
    summary.total = due.length;
    await repository.putSummary({ ...summary });
    debugLog(DEBUG_OWNER, "Automatic-update due records selected.", {
      data: {
        dueCount: due.length,
        remaining,
        sessionCount,
        dailyCount,
        sessionCap: config.sessionCap,
        dailyCap: config.dailyCap,
      },
    });
    for (const record of due) {
      if (signal.aborted || !(await stillOwn())) break;
      if (!(await claim("thread", record.threadId, config, signal))) {
        summary.skipped += 1;
        await repository.putSummary({ ...summary });
        continue;
      }
      summary.activeThreadId = record.threadId;
      await repository.putSummary({ ...summary });
      debugLog(DEBUG_OWNER, "Automatic-update record claimed.", {
        data: { threadId: record.threadId },
      });
      if (!(await stillOwn(record.threadId)) || !(await isRecordEligible(record.threadId))) break;
      const preview = await checkRecords([record.threadId], {
        signal,
        spacingMs: config.spacingMs,
        jitterMs: config.jitterMs,
        timeoutMs: config.timeoutMs,
        retryLimit: config.retryLimit,
        maxRecords: 1,
      });
      summary.retries += Math.max(0, Number(preview.results?.[0]?.attempts || 1) - 1);
      if (
        signal.aborted ||
        !(await stillOwn(record.threadId)) ||
        !(await isRecordEligible(record.threadId))
      ) break;
      const result = await commitResults(preview, {
        shouldCancel: () => signal.aborted,
        scheduleIntervalMs: config.intervalMs,
      });
      debugLog(DEBUG_OWNER, "Automatic-update record commit settled.", {
        data: {
          threadId: record.threadId,
          checked: Number(result.checked || 0),
          current: Number(result.current || 0),
          changed: Number(result.changed || 0),
          failed: Number(result.failed || 0),
        },
      });
      summary.checked += Number(result.checked || 0);
      summary.current += Number(result.current || 0);
      summary.changed += Number(result.changed || 0);
      summary.failed += Number(result.failed || 0);
      summary.activeThreadId = "";
      sessionCount += Number(result.checked || 0);
      dailyCount += Number(result.checked || 0);
      await repository.putDailyUsage(day, dailyCount);
      await repository.deleteClaim(record.threadId);
      await repository.putLease({
        owner,
        generation,
        expiresAt: now() + config.leaseTtlMs,
      });
      await repository.putSummary({ ...summary });
    }
    summary.status = signal.aborted ? "paused" : "idle";
    summary.activeThreadId = "";
    summary.finishedAt = now();
    await repository.putSummary(summary);
    if (await stillOwn()) await repository.deleteLease();
    controller = null;
    debugLog(DEBUG_OWNER, "Automatic-update run completed.", { data: summary });
    return { ok: !signal.aborted, ...summary };
  }

  async function start() {
    const config = await repository.getConfig();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await run();
      if (timer) await start();
    }, Math.min(config.intervalMs, 60_000));
    timer?.unref?.();
    debugLog(DEBUG_OWNER, "Automatic-update scheduler armed.", {
      data: {
        enabled: config.enabled,
        delayMs: Math.min(config.intervalMs, 60_000),
        intervalMs: config.intervalMs,
      },
    });
  }

  async function stop() {
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    const lease = await repository.getLease();
    if (lease?.owner === owner) await repository.deleteLease();
    debugLog(DEBUG_OWNER, "Automatic-update scheduler stopped.", {
      data: { owner, generation },
    });
  }

  return { run, start, stop, snapshot: () => ({ running: Boolean(controller), sessionCount }) };
}
