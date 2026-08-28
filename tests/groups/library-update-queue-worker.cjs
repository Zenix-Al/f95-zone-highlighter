"use strict";

module.exports = function registerLibraryUpdateQueueWorkerGroup(context) {
  const { assert, loadModule, runTest } = context;

  function createRepository(threadIds) {
    let cycle = {
      id: "active",
      cycleId: "worker-cycle",
      status: "running",
      total: threadIds.length,
      attempted: 0,
      completed: 0,
      failed: 0,
      retryPending: 0,
      current: 0,
      changed: 0,
      skipped: 0,
      networkRetries: 0,
      nextRunAt: 10000,
      dailyKey: "",
      dailyAttempted: 0,
      dailyBonusAllowance: 0,
      checksPerDay: 100,
    };
    const items = new Map(threadIds.map((threadId, index) => [threadId, {
      id: `worker-cycle:${threadId}`,
      cycleId: "worker-cycle",
      threadId,
      position: index + 1,
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
    }]));
    return {
      async getCycle() { return structuredClone(cycle); },
      async putCycle(value) {
        cycle = structuredClone(value);
        return { ok: true, value: structuredClone(cycle) };
      },
      async rolloverDailyAllowance(value, dailyKey) {
        cycle = {
          ...value,
          dailyKey,
          dailyAttempted: value.dailyKey === dailyKey ? value.dailyAttempted || 0 : 0,
          dailyBonusAllowance: value.dailyKey === dailyKey
            ? value.dailyBonusAllowance || 0
            : 0,
        };
        return { ok: true, value: structuredClone(cycle) };
      },
      async recoverStaleProcessing() { return { ok: true, recovered: 0 }; },
      async getNextActionableItem(cycleId, now) {
        const candidates = [...items.values()]
          .filter((item) => item.cycleId === cycleId)
          .filter((item) => item.status === "pending" ||
            (item.status === "retry" && item.nextAttemptAt <= now))
          .sort((left, right) => left.position - right.position);
        const future = [...items.values()]
          .filter((item) => item.status === "retry" && item.nextAttemptAt > now)
          .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)[0];
        return {
          ok: true,
          item: candidates[0] ? structuredClone(candidates[0]) : null,
          waitingForRetryAt: candidates.length ? 0 : future?.nextAttemptAt || 0,
        };
      },
      async getCycleStatusCounts() {
        const counts = { pending: 0, processing: 0, retry: 0, completed: 0, failed: 0 };
        items.forEach((item) => { counts[item.status] += 1; });
        return { ok: true, counts };
      },
      async claimQueueItem(value, claim) {
        const item = {
          ...value,
          status: "processing",
          attempts: value.attempts + 1,
          attemptedDayKey: claim.dailyKey || value.attemptedDayKey || "",
          claimedBy: claim.owner,
          claimExpiresAt: claim.expiresAt,
        };
        items.set(item.threadId, item);
        return { ok: true, value: structuredClone(item) };
      },
      async ownsQueueItem(id, owner, now) {
        const item = [...items.values()].find((value) => value.id === id);
        return Boolean(item?.status === "processing" &&
          item.claimedBy === owner && item.claimExpiresAt > now);
      },
      async renewQueueItemClaim(id, owner, expiresAt) {
        const item = [...items.values()].find((value) => value.id === id);
        if (!item || item.status !== "processing" || item.claimedBy !== owner) {
          return { ok: false, reason: "queue_claim_lost" };
        }
        item.claimExpiresAt = expiresAt;
        return { ok: true, value: structuredClone(item) };
      },
      async settleQueueItem(value, settlement) {
        const item = {
          ...value,
          ...settlement,
          claimedBy: "",
          claimExpiresAt: 0,
        };
        items.set(item.threadId, item);
        return { ok: true, value: structuredClone(item) };
      },
      async putQueueItem(value) {
        items.set(value.threadId, structuredClone(value));
        return { ok: true, value: structuredClone(value) };
      },
      snapshot: () => ({
        cycle: structuredClone(cycle),
        items: [...items.values()].map((item) => structuredClone(item)),
      }),
      steal(threadId, claimedBy, claimExpiresAt) {
        const item = items.get(threadId);
        items.set(threadId, { ...item, claimedBy, claimExpiresAt });
      },
    };
  }

  const config = {
    intervalMs: 86400000,
    spacingMs: 10000,
    jitterMs: 0,
    timeoutMs: 30000,
    retryLimit: 2,
    leaseTtlMs: 90000,
    checksPerDay: 100,
  };

  function createWorker(options) {
    const { createAutoUpdateQueueWorker } = loadModule(
      "addons/library-addon/src/library/autoUpdateQueueWorker.js",
    );
    return createAutoUpdateQueueWorker(options);
  }

  runTest("LIBRARY-UPDATE-QUEUE-WORKER-01 completes an uninterrupted cycle in order", async () => {
    const repository = createRepository(["1", "2", "3"]);
    const records = new Map(["1", "2", "3"].map((threadId) => [threadId, {
      threadId,
      updateCheck: { enabled: true },
    }]));
    const checked = [];
    const waits = [];
    const worker = createWorker({
      repository,
      getRecord: async (threadId) => records.get(threadId) || null,
      checkRecords: async ([threadId]) => {
        checked.push(threadId);
        return {
          results: [{
            threadId,
            ok: true,
            changed: threadId === "2",
            attempts: threadId === "3" ? 2 : 1,
          }],
        };
      },
      commitResults: async (preview) => ({
        checked: 1,
        current: preview.results[0].changed ? 0 : 1,
        changed: preview.results[0].changed ? 1 : 0,
      }),
      now: () => 100,
      waitFor: async (ms) => { waits.push(ms); },
    });
    const result = await worker.run({
      owner: "tab-one",
      config,
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(checked, ["1", "2", "3"]);
    assert.ok(waits.every((value) => value === 10000));
    assert.deepStrictEqual(repository.snapshot().items.map(({ status }) => status), [
      "completed",
      "completed",
      "completed",
    ]);
    assert.deepStrictEqual(
      (({ status, attempted, completed, current, changed, networkRetries }) => ({
        status, attempted, completed, current, changed, networkRetries,
      }))(repository.snapshot().cycle),
      {
        status: "completed",
        attempted: 3,
        completed: 3,
        current: 2,
        changed: 1,
        networkRetries: 1,
      },
    );
  });

  runTest("LIBRARY-UPDATE-QUEUE-WORKER-01 continues past retryable failure", async () => {
    const repository = createRepository(["bad", "good"]);
    const records = new Map(["bad", "good"].map((threadId) => [threadId, {
      threadId,
      updateCheck: { enabled: true },
    }]));
    const checked = [];
    const worker = createWorker({
      repository,
      getRecord: async (threadId) => records.get(threadId),
      checkRecords: async ([threadId]) => {
        checked.push(threadId);
        return { results: [{
          threadId,
          ok: threadId === "good",
          reason: threadId === "bad" ? "network_error" : "",
          attempts: threadId === "bad" ? 3 : 1,
        }] };
      },
      commitResults: async (preview) => ({
        checked: 1,
        current: preview.results[0].ok ? 1 : 0,
        failed: preview.results[0].ok ? 0 : 1,
      }),
      now: () => 100,
      waitFor: async () => {},
    });
    const result = await worker.run({
      owner: "tab-one",
      config,
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.waiting, true);
    assert.deepStrictEqual(checked, ["bad", "good"]);
    assert.deepStrictEqual(repository.snapshot().items.map(({ status }) => status), [
      "retry",
      "completed",
    ]);
    assert.strictEqual(repository.snapshot().cycle.retryPending, 1);
  });

  runTest("LIBRARY-UPDATE-QUEUE-WORKER-01 settles removed disabled and terminal records", async () => {
    const repository = createRepository(["removed", "disabled", "gone"]);
    const records = new Map([
      ["disabled", { threadId: "disabled", updateCheck: { enabled: false } }],
      ["gone", { threadId: "gone", updateCheck: { enabled: true } }],
    ]);
    const worker = createWorker({
      repository,
      getRecord: async (threadId) => records.get(threadId) || null,
      checkRecords: async ([threadId]) => ({
        results: [{ threadId, ok: false, reason: "http_404", attempts: 1 }],
      }),
      commitResults: async () => ({ checked: 1, failed: 1 }),
      now: () => 100,
      waitFor: async () => {},
    });
    const result = await worker.run({
      owner: "tab-one",
      config,
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(result.cycle.status, "completed");
    assert.strictEqual(result.cycle.skipped, 2);
    assert.strictEqual(result.cycle.failed, 1);
    assert.deepStrictEqual(repository.snapshot().items.map(({ status }) => status), [
      "completed",
      "completed",
      "failed",
    ]);
  });

  runTest("LIBRARY-UPDATE-QUEUE-WORKER-01 heartbeats ownership during a slow request", async () => {
    const repository = createRepository(["slow"]);
    let heartbeat = null;
    let release;
    let renewals = 0;
    const worker = createWorker({
      repository,
      getRecord: async () => ({ threadId: "slow", updateCheck: { enabled: true } }),
      checkRecords: async () => new Promise((resolve) => {
        release = () => resolve({ results: [{ threadId: "slow", ok: true, attempts: 1 }] });
      }),
      commitResults: async () => ({ checked: 1, current: 1 }),
      now: () => 100,
      waitFor: async () => {},
      setIntervalFn: (callback) => { heartbeat = callback; return 1; },
      clearIntervalFn: () => {},
    });
    const running = worker.run({
      owner: "tab-one",
      config,
      stillOwn: async () => true,
      renewOwnership: async () => { renewals += 1; return true; },
    });
    while (!release || !heartbeat) await new Promise((resolve) => setTimeout(resolve, 0));
    await heartbeat();
    release();
    await running;
    assert.ok(renewals >= 2);
  });

  runTest("LIBRARY-UPDATE-QUEUE-RECOVERY-01 preserves one cycle across ten daily allowances", async () => {
    const threadIds = Array.from({ length: 1_000 }, (_, index) => String(index + 1));
    const repository = createRepository(threadIds);
    const checked = [];
    let currentTime = new Date(2026, 7, 1, 12, 0, 0, 0).getTime();
    const worker = createWorker({
      repository,
      getRecord: async (threadId) => ({ threadId, updateCheck: { enabled: true } }),
      checkRecords: async ([threadId]) => {
        checked.push(threadId);
        return { results: [{ threadId, ok: true, attempts: 1 }] };
      },
      commitResults: async () => ({ checked: 1, current: 1 }),
      now: () => currentTime,
      waitFor: async () => {},
    });
    for (let day = 0; day < 10; day += 1) {
      const result = await worker.run({
        owner: "daily-tab",
        config,
        stillOwn: async () => true,
        renewOwnership: async () => true,
      });
      assert.strictEqual(checked.length, Math.min(1_000, (day + 1) * 100));
      assert.strictEqual(result.cycle.status, day === 9 ? "completed" : "waiting");
      if (day === 0) {
        const sameDay = await worker.run({
          owner: "daily-tab",
          config,
          stillOwn: async () => true,
          renewOwnership: async () => true,
        });
        assert.strictEqual(sameDay.reason, "daily_allowance_exhausted");
        assert.strictEqual(checked.length, 100);
      }
      currentTime += 24 * 60 * 60 * 1_000;
    }
    assert.deepStrictEqual(checked, threadIds);
    assert.strictEqual(repository.snapshot().cycle.dailyAttempted, 100);
  });

  runTest("LIBRARY-UPDATE-QUEUE-VERIFY-01 applies allowance changes to the active cycle", async () => {
    const repository = createRepository(["1", "2", "3", "4"]);
    let currentTime = new Date(2026, 7, 1, 12, 0, 0, 0).getTime();
    const checked = [];
    const worker = createWorker({
      repository,
      getRecord: async (threadId) => ({ threadId, updateCheck: { enabled: true } }),
      checkRecords: async ([threadId]) => {
        checked.push(threadId);
        return { results: [{ threadId, ok: true, attempts: 1 }] };
      },
      commitResults: async () => ({ checked: 1, current: 1 }),
      now: () => currentTime,
      waitFor: async () => {},
    });
    const first = await worker.run({
      owner: "allowance-tab",
      config: { ...config, checksPerDay: 2 },
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(first.reason, "daily_allowance_exhausted");
    assert.deepStrictEqual(checked, ["1", "2"]);
    const second = await worker.run({
      owner: "allowance-tab",
      config: { ...config, checksPerDay: 3 },
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(second.reason, "daily_allowance_exhausted");
    assert.deepStrictEqual(checked, ["1", "2", "3"]);
    currentTime += 24 * 60 * 60 * 1_000;
    const completed = await worker.run({
      owner: "allowance-tab",
      config: { ...config, checksPerDay: 3 },
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(completed.cycle.status, "completed");
    assert.deepStrictEqual(checked, ["1", "2", "3", "4"]);
  });

  runTest("LIBRARY-UPDATE-QUEUE-RECOVERY-01 blocks commit after queue ownership changes", async () => {
    const repository = createRepository(["lost"]);
    let commits = 0;
    const worker = createWorker({
      repository,
      getRecord: async () => ({ threadId: "lost", updateCheck: { enabled: true } }),
      checkRecords: async () => {
        repository.steal("lost", "new-tab", 100_000);
        return { results: [{ threadId: "lost", ok: true, attempts: 1 }] };
      },
      commitResults: async () => { commits += 1; return { checked: 1, current: 1 }; },
      now: () => 100,
      waitFor: async () => {},
    });
    const result = await worker.run({
      owner: "old-tab",
      config,
      stillOwn: async () => true,
      renewOwnership: async () => true,
    });
    assert.strictEqual(result.reason, "lease_lost");
    assert.strictEqual(commits, 0);
    assert.strictEqual(repository.snapshot().items[0].claimedBy, "new-tab");
  });
};
