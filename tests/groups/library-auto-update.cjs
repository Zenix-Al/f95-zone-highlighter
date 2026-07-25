"use strict";

module.exports = function registerLibraryAutoUpdateGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  function createRepository(clock, initialLease = null) {
    let lease = initialLease;
    const claims = new Map();
    let config = {
      enabled: true,
      intervalMs: 60000,
      spacingMs: 250,
      jitterMs: 0,
      timeoutMs: 1000,
      retryLimit: 1,
      sessionCap: 2,
      dailyCap: 2,
      leaseTtlMs: 30000,
    };
    let summary = null;
    const summaryWrites = [];
    const daily = new Map();
    return {
      getConfig: async () => config,
      putConfig: async (next) => { config = next; return { ok: true }; },
      getSummary: async () => summary,
      putSummary: async (next) => {
        summary = next;
        summaryWrites.push({ ...next });
        return { ok: true };
      },
      getLease: async () => lease,
      putLease: async (next) => { lease = next; return { ok: true }; },
      deleteLease: async () => { lease = null; return { ok: true }; },
      getClaim: async (id) => claims.get(id) || null,
      putClaim: async (id, value) => { claims.set(id, value); return { ok: true }; },
      deleteClaim: async (id) => { claims.delete(id); return { ok: true }; },
      getDailyUsage: async (day) => daily.get(day) || null,
      putDailyUsage: async (day, count) => { daily.set(day, { count }); return { ok: true }; },
      snapshot: () => ({ lease, claims, summary, summaryWrites, daily, clock }),
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

  runTest("LIBRARY-AUTO-UPDATE-01 bounds jitter and exponential failure backoff", () => {
    const { getClaimJitter, getFailureDelay, selectDueRecords } = loadModule(
      "addons/library-addon/src/library/autoUpdatePolicy.js",
    );
    assert.strictEqual(getClaimJitter(500, () => 0), 0);
    assert.strictEqual(getClaimJitter(500, () => 1), 500);
    assert.strictEqual(getFailureDelay(60000, 1), 120000);
    assert.strictEqual(getFailureDelay(60000, 99), 1920000);
    assert.deepStrictEqual(
      selectDueRecords([
        { threadId: "late", updateCheck: { enabled: true, nextCheckAt: 20 } },
        { threadId: "disabled", updateCheck: { enabled: false, nextCheckAt: 1 } },
        { threadId: "early", updateCheck: { enabled: true, nextCheckAt: 10 } },
      ], { now: 20, limit: 2 }).map((record) => record.threadId),
      ["early", "late"],
    );
  });

  runTest("LIBRARY-AUTO-UPDATE-01 exposes bounded controls without new transport grants", () => {
    const { renderAutoUpdateDialog } = loadModule(
      "addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js",
    );
    const markup = renderAutoUpdateDialog({
      enabled: true,
      intervalMs: 86_400_000,
      spacingMs: 10_000,
      timeoutMs: 30_000,
      retryLimit: 2,
      sessionCap: 25,
      dailyCap: 100,
    }, null);
    for (const field of [
      "enabled",
      "intervalHours",
      "spacingMs",
      "timeoutMs",
      "retryLimit",
      "sessionCap",
      "dailyCap",
    ]) assert.match(markup, new RegExp(`name="${field}"`));
    assert.match(markup, /data-auto-action="retry"/);
    const managerMarkup = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/assets/manager.html"),
      "utf8",
    );
    assert.match(managerMarkup, /data-action="open-auto-update"/);
    assert.match(managerMarkup, /value="auto-enable"/);
    assert.match(managerMarkup, /value="auto-disable"/);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8"),
    );
    const library = manifest.addons.find((addon) => addon.id === "library-addon");
    assert.ok(library);
    assert.doesNotMatch(JSON.stringify(library.grants || []), /ValueChangeListener|navigator\.locks/);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 forced failed retry ignores scheduled backoff", () => {
    const { selectDueRecords } = loadModule(
      "addons/library-addon/src/library/autoUpdatePolicy.js",
    );
    const failed = {
      threadId: "failed",
      updateCheck: { enabled: true, status: "failed", nextCheckAt: 999_999 },
    };
    assert.deepStrictEqual(
      selectDueRecords([failed], {
        now: 1,
        limit: 1,
        failedOnly: true,
        ignoreSchedule: true,
      }).map((record) => record.threadId),
      ["failed"],
    );
  });

  runTest("LIBRARY-AUTO-UPDATE-01 lease, due order, and budgets bound a run", async () => {
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    let clock = Date.parse("2026-07-25T00:00:00Z");
    const repository = createRepository(() => clock);
    const checked = [];
    const scheduler = createAutoUpdateScheduler({
      repository,
      owner: "one",
      now: () => clock,
      random: () => 0,
      getDueRecords: async ({ limit }) =>
        [{ threadId: "old" }, { threadId: "new" }, { threadId: "overflow" }].slice(0, limit),
      checkRecords: async ([id]) => {
        checked.push(id);
        return { results: [{ threadId: id, ok: true, changed: false, attempts: 1 }] };
      },
      commitResults: async () => ({ checked: 1, current: 1, changed: 0, failed: 0 }),
    });
    const result = await scheduler.run();
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(checked, ["old", "new"]);
    assert.strictEqual(result.checked, 2);
    assert.strictEqual(repository.snapshot().lease, null);
    assert.ok(
      repository.snapshot().summaryWrites.some(
        (summary) =>
          summary.status === "running" &&
          summary.total === 2 &&
          summary.activeThreadId === "old",
      ),
    );
    assert.ok(
      repository.snapshot().summaryWrites.some(
        (summary) => summary.status === "running" && summary.checked === 1,
      ),
    );
  });

  runTest("LIBRARY-AUTO-UPDATE-01 formats live per-record progress", () => {
    const { formatAutoUpdateSummary } = loadModule(
      "addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js",
    );
    const text = formatAutoUpdateSummary({
      status: "running",
      total: 25,
      activeThreadId: "297902",
      checked: 4,
      current: 3,
      changed: 1,
      failed: 0,
      skipped: 0,
      retries: 1,
      nextRunAt: 1,
    });
    assert.match(text, /progress 4 \/ 25/);
    assert.match(text, /checking thread 297902/);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 expired lease is reclaimed and live lease blocks", async () => {
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const now = 100000;
    let requests = 0;
    const live = createRepository(null, { owner: "other", generation: 1, expiresAt: now + 1000 });
    const blocked = createAutoUpdateScheduler({
      repository: live,
      owner: "new",
      now: () => now,
      random: () => 0,
      getDueRecords: async () => [{ threadId: "1" }],
      checkRecords: async () => { requests += 1; return { results: [] }; },
      commitResults: async () => ({}),
    });
    assert.strictEqual((await blocked.run()).reason, "lease_owned");
    assert.strictEqual(requests, 0);

    const expired = createRepository(null, { owner: "old", generation: 1, expiresAt: now - 1 });
    const takeover = createAutoUpdateScheduler({
      repository: expired,
      owner: "new",
      now: () => now,
      random: () => 0,
      getDueRecords: async () => [],
      checkRecords: async () => ({ results: [] }),
      commitResults: async () => ({}),
    });
    assert.strictEqual((await takeover.run()).ok, true);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 simultaneous lease contenders produce one requester", async () => {
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const repository = createRepository();
    let requests = 0;
    const make = (owner) =>
      createAutoUpdateScheduler({
        repository,
        owner,
        now: () => 100000,
        random: () => 0,
        getDueRecords: async () => [{ threadId: "1" }],
        checkRecords: async () => {
          requests += 1;
          return { results: [{ threadId: "1", ok: true, attempts: 1 }] };
        },
        commitResults: async () => ({ checked: 1, current: 1 }),
      });
    await Promise.all([make("a").run(), make("b").run()]);
    assert.strictEqual(requests, 1);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 teardown cancellation prevents late commit", async () => {
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const repository = createRepository();
    let release;
    let commits = 0;
    const scheduler = createAutoUpdateScheduler({
      repository,
      owner: "cancel",
      now: () => Date.now(),
      random: () => 0,
      getDueRecords: async () => [{ threadId: "1" }],
      checkRecords: async () => new Promise((resolve) => {
        release = () => resolve({ results: [{ threadId: "1", ok: true, attempts: 1 }] });
      }),
      commitResults: async () => { commits += 1; return { checked: 1 }; },
    });
    const running = scheduler.run();
    while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
    await scheduler.stop();
    release();
    await running;
    assert.strictEqual(commits, 0);
  });

  runTest("LIBRARY-AUTO-UPDATE-01 pause and explicit retry re-enable are deterministic", async () => {
    const { createAutoUpdateScheduler } = loadModule(
      "addons/library-addon/src/library/autoUpdateScheduler.js",
    );
    const repository = createRepository();
    const config = await repository.getConfig();
    await repository.putConfig({ ...config, enabled: false });
    let requests = 0;
    const scheduler = createAutoUpdateScheduler({
      repository,
      owner: "paused",
      now: () => 100000,
      random: () => 0,
      getDueRecords: async () => [{ threadId: "failed" }],
      checkRecords: async () => {
        requests += 1;
        return { results: [{ threadId: "failed", ok: true, attempts: 1 }] };
      },
      commitResults: async () => ({ checked: 1, current: 1 }),
    });
    assert.strictEqual((await scheduler.run()).reason, "paused");
    assert.strictEqual(requests, 0);
    assert.strictEqual((await scheduler.run({ force: true, failedOnly: true })).ok, true);
    assert.strictEqual(requests, 1);
  });
};
