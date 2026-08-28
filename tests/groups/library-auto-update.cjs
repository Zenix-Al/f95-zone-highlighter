"use strict";

module.exports = function registerLibraryAutoUpdateGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  function createRepository(overrides = {}) {
    let lease = null;
    let config = {
      enabled: true,
      intervalMs: 60000,
      runHour: 0,
      spacingMs: 5000,
      jitterMs: 0,
      timeoutMs: 1000,
      retryLimit: 1,
      checksPerDay: 100,
      leaseTtlMs: 30000,
    };
    return {
      getConfig: async () => config,
      putConfig: async (value) => { config = value; return { ok: true }; },
      getLease: async () => lease,
      putLease: async (value) => { lease = value; return { ok: true }; },
      deleteLease: async () => { lease = null; return { ok: true }; },
      getLegacyQueueMetadata: async () => ({ complete: true, days: [] }),
      clearLegacyQueueMetadata: async () => ({ ok: true }),
      snapshot: () => ({ lease, config }),
      ...overrides,
    };
  }

  function createQueue(initialCycle = null) {
    let cycle = initialCycle;
    let snapshots = 0;
    let workerRuns = 0;
    return {
      async getCycle() { return cycle; },
      async putCycle(value) { cycle = value; return { ok: true, value }; },
      async buildSnapshot() {
        snapshots += 1;
        cycle = { cycleId: "queue-cycle", status: "running", total: 2, checksPerDay: 100 };
        return { ok: true, cycle };
      },
      async runWorker() {
        workerRuns += 1;
        cycle = { ...cycle, status: "completed", attempted: 2, completed: 2 };
        return { ok: true, cycle };
      },
      snapshot: () => ({ cycle, snapshots, workerRuns }),
    };
  }

  runTest("LIBRARY-AUTO-UPDATE-01 defaults legacy records to eligible without rewriting", () => {
    const { normalizeRecord } = loadModule("addons/library-addon/src/library/recordModel.js");
    const normalized = normalizeRecord({ threadId: "1", title: "Game", updatedAt: 1 }, { now: 2 });
    assert.strictEqual(normalized.updateCheck.enabled, true);
    assert.strictEqual(normalized.updateCheck.status, "pending");
    const disabled = normalizeRecord({
      threadId: "2",
      updateCheck: { enabled: false, status: "disabled" },
    }, { now: 2 });
    assert.strictEqual(disabled.updateCheck.enabled, false);
    assert.strictEqual(disabled.updateCheck.status, "disabled");
  });

  runTest("LIBRARY-UPDATE-QUEUE-SETTINGS-01 migrates daily cap and omits session cap", () => {
    const { normalizeAutoUpdateConfig } = loadModule(
      "addons/library-addon/src/library/autoUpdateRepository.js",
    );
    const config = normalizeAutoUpdateConfig({ dailyCap: 77, sessionCap: 25 });
    assert.strictEqual(config.checksPerDay, 77);
    assert.strictEqual(Object.hasOwn(config, "dailyCap"), false);
    assert.strictEqual(Object.hasOwn(config, "sessionCap"), false);
  });

  runTest("LIBRARY-UPDATE-QUEUE-SETTINGS-01 derives and patches primary button state", () => {
    const { derivePrimaryUpdateAction, patchAutoUpdateView } = loadModule(
      "addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js",
    );
    const cycle = { total: 200, completed: 50, failed: 0, checksPerDay: 100 };
    assert.strictEqual(derivePrimaryUpdateAction(null).label, "Update now");
    assert.strictEqual(derivePrimaryUpdateAction({ ...cycle, status: "paused" }).label, "Resume updates");
    assert.strictEqual(derivePrimaryUpdateAction({ ...cycle, status: "waiting", dailyAttempted: 100 }).label, "Continue another batch...");
    assert.strictEqual(derivePrimaryUpdateAction({ ...cycle, status: "running" }).disabled, true);
    assert.strictEqual(derivePrimaryUpdateAction({ ...cycle, status: "completed" }).label, "Check again...");
    assert.deepStrictEqual(
      derivePrimaryUpdateAction({ ...cycle, status: "running" }, { recoveryPending: true }),
      { action: "", label: "Waiting for previous process...", disabled: true },
    );
    const primary = { dataset: {}, disabled: false, textContent: "", setAttribute() {} };
    patchAutoUpdateView({
      querySelector: (selector) => selector === '[data-role="primaryAction"]' ? primary : null,
    }, { ...cycle, status: "waiting", dailyAttempted: 100 });
    assert.strictEqual(primary.dataset.autoAction, "continue-batch");
  });

  runTest("LIBRARY-AUTO-UPDATE-01 bounds jitter and exponential failure backoff", () => {
    const { getClaimJitter, getFailureDelay } = loadModule(
      "addons/library-addon/src/library/autoUpdatePolicy.js",
    );
    assert.strictEqual(getClaimJitter(500, () => 0), 0);
    assert.strictEqual(getClaimJitter(500, () => 1), 500);
    assert.strictEqual(getFailureDelay(60000, 1), 120000);
    assert.strictEqual(getFailureDelay(60000, 99), 1920000);
  });

  runTest("LIBRARY-UPDATE-QUEUE-RECOVERY-01 schedules refresh recovery at lease expiry", () => {
    const { getStartupDelay } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    assert.strictEqual(getStartupDelay({
      cycle: { status: "running" },
      lease: { expiresAt: 90_000 },
      currentTime: 10_000,
      intervalMs: 86_400_000,
    }), 80_250);
    assert.strictEqual(getStartupDelay({
      cycle: { status: "running" },
      lease: { expiresAt: 9_000 },
      currentTime: 10_000,
      intervalMs: 86_400_000,
    }), 0);
    assert.strictEqual(getStartupDelay({
      cycle: { status: "completed" },
      lease: null,
      currentTime: 10_000,
      intervalMs: 86_400_000,
    }), 60_000);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 exposes bounded controls without new transport grants", () => {
    const { renderAutoUpdateDialog } = loadModule(
      "addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js",
    );
    const markup = renderAutoUpdateDialog({ enabled: true, checksPerDay: 100 }, null);
    for (const field of ["enabled", "runHour", "spacingMs", "timeoutMs", "retryLimit", "checksPerDay"]) {
      assert.match(markup, new RegExp(`name="${field}"`));
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8"));
    const library = manifest.addons.find((addon) => addon.id === "library-addon");
    assert.doesNotMatch(JSON.stringify(library.grants || []), /ValueChangeListener|navigator\.locks/);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 reads legacy metadata once and records completion", async () => {
    const values = new Map([
      ["auto-update:last-run", { nextRunAt: 500 }],
      ["auto-update:daily:2026-08-28", { count: 40 }],
    ]);
    const calls = [];
    const api = {
      async getMeta(key) { calls.push(["get", key]); return values.get(key) || null; },
      async putMeta(value) { calls.push(["put", value.key]); values.set(value.key, value); return { ok: true }; },
      async deleteMeta(key) { calls.push(["delete", key]); values.delete(key); return { ok: true }; },
    };
    const { createAutoUpdateRepository } = loadModule(
      "addons/library-addon/src/library/autoUpdateRepository.js",
    );
    const repository = createAutoUpdateRepository(api);
    const timestamp = Date.parse("2026-08-28T12:00:00Z");
    const legacy = await repository.getLegacyQueueMetadata(timestamp);
    assert.strictEqual(legacy.dailyAttempted, 40);
    assert.strictEqual(legacy.summary.nextRunAt, 500);
    assert.strictEqual((await repository.clearLegacyQueueMetadata(legacy.days)).ok, true);
    const readsBefore = calls.length;
    assert.strictEqual((await repository.getLegacyQueueMetadata(timestamp)).complete, true);
    assert.deepStrictEqual(calls.slice(readsBefore), [["get", "auto-update:queue-compat-v1"]]);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 preserves a future legacy schedule without requests", async () => {
    let cleared = 0;
    const repository = createRepository({
      getLegacyQueueMetadata: async () => ({
        summary: { status: "idle", nextRunAt: 500, checked: 25 },
        dailyAttempted: 25,
        days: ["1970-01-01"],
      }),
      clearLegacyQueueMetadata: async () => { cleared += 1; return { ok: true }; },
    });
    const queue = createQueue();
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const result = await createAutoUpdateScheduler({
      repository,
      queueRuntime: queue,
      owner: "compat-future",
      now: () => 100,
      random: () => 0,
    }).run();
    assert.strictEqual(result.reason, "not_due");
    assert.strictEqual(queue.snapshot().workerRuns, 0);
    assert.strictEqual(queue.snapshot().cycle.dailyAttempted, 25);
    assert.strictEqual(cleared, 1);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 carries current-day usage into a due snapshot", async () => {
    let cleared = 0;
    const repository = createRepository({
      getLegacyQueueMetadata: async () => ({
        summary: { status: "idle", nextRunAt: 50 },
        dailyAttempted: 65,
        days: ["1970-01-01"],
      }),
      clearLegacyQueueMetadata: async () => { cleared += 1; return { ok: true }; },
    });
    const queue = createQueue();
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const result = await createAutoUpdateScheduler({
      repository,
      queueRuntime: queue,
      owner: "compat-due",
      now: () => 100,
      random: () => 0,
    }).run();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(queue.snapshot().workerRuns, 1);
    assert.strictEqual(queue.snapshot().cycle.dailyAttempted, 65);
    assert.strictEqual(cleared, 1);
  });

  runTest("LIBRARY-UPDATE-QUEUE-RECOVERY-01 elects one durable worker across ten tabs", async () => {
    const repository = createRepository();
    const queue = createQueue({ cycleId: "shared", status: "running", total: 1, nextRunAt: 1 });
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const schedulers = Array.from({ length: 10 }, (_, index) => createAutoUpdateScheduler({
      repository,
      queueRuntime: queue,
      owner: `tab-${index}`,
      now: () => 100,
      random: () => 0,
    }));
    const results = await Promise.all(schedulers.map((scheduler) => scheduler.run()));
    assert.strictEqual(queue.snapshot().workerRuns, 1);
    assert.strictEqual(results.filter((result) => result.ok).length, 1);
    assert.strictEqual(results.filter((result) => result.reason === "lease_owned").length, 9);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 durable master is authoritative over legacy metadata", async () => {
    let cleared = 0;
    const repository = createRepository({
      getLegacyQueueMetadata: async () => ({ summary: { nextRunAt: 1 }, days: ["old"] }),
      clearLegacyQueueMetadata: async () => { cleared += 1; return { ok: true }; },
    });
    const queue = createQueue({ cycleId: "current", status: "completed", nextRunAt: 500 });
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const result = await createAutoUpdateScheduler({
      repository,
      queueRuntime: queue,
      owner: "authoritative",
      now: () => 100,
      random: () => 0,
    }).run();
    assert.strictEqual(result.reason, "not_due");
    assert.strictEqual(result.nextRunAt, 500);
    assert.strictEqual(cleared, 1);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 removes the duplicate due runner but retains record backoff metadata", () => {
    const scheduler = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/library/autoUpdateScheduler.js"),
      "utf8",
    );
    const service = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/library/service.js"),
      "utf8",
    );
    const model = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/library/recordModel.js"),
      "utf8",
    );
    assert.doesNotMatch(scheduler, /getDueRecords|sessionCount|failedOnly|getDailyUsage|putDailyUsage/);
    assert.doesNotMatch(service, /getDueAutoUpdateRecords|selectDueRecords/);
    assert.match(model, /nextCheckAt/);
  });
};
