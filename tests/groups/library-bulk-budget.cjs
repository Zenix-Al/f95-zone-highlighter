"use strict";

module.exports = function registerLibraryBulkBudgetGroup({ assert, loadModule, runTest }) {
  const { createActionBudget } = loadModule("addons/library-addon/src/api/library/actionBudget.js");
  const { defaultAddonsApiThrottleSettings: defaults } = loadModule("src/config/defaults.js");
  const coreAction = {
    windowMs: defaults.coreActionWindowMs,
    maxCount: defaults.coreActionRateMax,
  };
  const allowance = Math.floor(coreAction.maxCount * 0.8);

  runTest("LIBRARY-BULK-BUDGET-01 stays below the default core action limit", async () => {
    let time = 0;
    const calls = [];
    const budget = createActionBudget(async (action) => {
      calls.push({ action, at: time });
      return { ok: true };
    }, { now: () => time, wait: async (ms) => { time += ms; } });
    await budget.run({ coreAction }, async () => {
      await Promise.all(Array.from({ length: 434 }, () => budget.request("idb.put", {})));
    });
    for (const call of calls) {
      assert(calls.filter((other) => other.at >= call.at && other.at < call.at + coreAction.windowMs).length <= allowance);
    }
    assert.strictEqual(calls.length, 434);
  });

  runTest("LIBRARY-BULK-BUDGET-02 retries shared-core throttling without repeating other errors", async () => {
    let time = 0;
    let attempts = 0;
    const budget = createActionBudget(async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, reason: "rate_limited" } : { ok: true };
    }, { now: () => time, wait: async (ms) => { time += ms; } });
    const result = await budget.run({ coreAction }, () => budget.request("idb.delete", {}));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(attempts, 2);
    assert(time >= coreAction.windowMs);
  });

  runTest("LIBRARY-BULK-BUDGET-03 paces status, pin, auto-update and removal through the service", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    let time = 0;
    const calls = [];
    const stores = { records: new Map(), activity: new Map(), updates: new Map() };
    for (let id = 1; id <= 25; id += 1) {
      stores.records.set(String(id), { threadId: String(id), title: `Synthetic ${id}`, updatedAt: 100 });
    }
    const bridge = {
      async invokeCoreAction(action, payload = {}) {
        if (action === "addon.throttle") return { ok: true, value: { coreAction } };
        calls.push(time);
        const store = stores[payload.storeName || "records"];
        if (action === "idb.get") return { ok: true, value: store.get(payload.key) || null };
        if (action === "idb.put") {
          const key = payload.value.threadId || payload.value.id;
          store.set(key, payload.value);
          return { ok: true, value: key };
        }
        if (action === "idb.delete") return { ok: true, value: store.delete(payload.key) };
        if (action === "idb.query") return { ok: true, value: [] };
        if (action === "idb.count") return { ok: true, value: store.size };
        return { ok: false, reason: "unsupported_action" };
      },
    };
    const service = createLibraryService(bridge, null, {
      actionBudgetOptions: { now: () => time, wait: async (ms) => { time += ms; } },
    });
    const ids = [...stores.records.keys()];
    const progress = [];
    const onProgress = (value) => progress.push(value);
    assert.strictEqual((await service.bulkUpdateStatus(ids, "playing", { commandId: "bulk-test", onProgress })).updated, 25);
    assert.strictEqual((await service.bulkSetPinned(ids, true, { onProgress })).updated, 25);
    assert.strictEqual((await service.setAutoUpdateEnabled(ids, false, { onProgress })).updated, 25);
    assert.strictEqual((await service.bulkRemoveEntries(ids, { onProgress })).removed, 25);
    assert.strictEqual(progress.length, 4 * 26);
    for (let i = 0; i < 4; i += 1) {
      const section = progress.slice(i * 26, (i + 1) * 26);
      assert.strictEqual(section[0].processed, 0);
      assert.strictEqual(section.at(-1).processed, 25);
      assert(section.every((item) => item.total === 25));
    }
    assert.strictEqual(stores.records.size, 0);
    for (const started of calls) {
      assert(calls.filter((other) => other >= started && other < started + coreAction.windowMs).length <= allowance);
    }
    stores.records.set("1", { threadId: "1", title: "One", updatedAt: 100 });
    stores.records.set("2", { threadId: "2", title: "Two", updatedAt: 100 });
    let processed = 0;
    const stopped = await service.bulkSetPinned(["1", "2"], true, {
      onProgress: (value) => { processed = value.processed; },
      shouldCancel: () => processed >= 1,
    });
    assert.deepStrictEqual({ cancelled: stopped.cancelled, updated: stopped.updated }, { cancelled: true, updated: 1 });
    assert.strictEqual(stores.records.get("2").pinned, undefined);
  });

  runTest("LIBRARY-BULK-BUDGET-04 imports a synthetic fresh-library export at core defaults", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    let time = 0;
    const calls = [];
    const stores = { records: new Map(), updates: new Map(), activity: new Map() };
    const bridge = {
      async invokeCoreAction(action, payload = {}) {
        if (action === "addon.throttle") return { ok: true, value: {
          coreAction,
          payloadLimits: { idb: { maxPayloadBytes: 262144, maxBulkItems: 100 } },
        } };
        calls.push(time);
        const store = stores[payload.storeName || "records"];
        if (action === "idb.query") return { ok: true, value: [] };
        if (action === "idb.get") return { ok: true, value: store?.get(payload.key) || null };
        if (action === "idb.bulkPut") {
          for (const entry of payload.entries) {
            const value = entry.value;
            store.set(value.threadId && payload.storeName === "records" ? value.threadId : value.id, value);
          }
          return { ok: true, value: payload.entries.length };
        }
        if (action === "idb.put") {
          const value = payload.value;
          store.set(value.threadId && payload.storeName === "records" ? value.threadId : value.id, value);
          return { ok: true };
        }
        return { ok: false, reason: "unsupported_action" };
      },
    };
    const service = createLibraryService(bridge, null, {
      actionBudgetOptions: { now: () => time, wait: async (ms) => { time += ms; } },
    });
    const records = Array.from({ length: 100 }, (_, i) => ({
      threadId: String(i + 1), title: `Synthetic ${i + 1}`, updatedAt: 1000,
    }));
    const updates = Array.from({ length: 243 }, (_, i) => ({
      id: `update-${i}`, threadId: String(i % 100 + 1), type: "thread-facts",
      observedAt: 100, fields: ["title"], before: {}, after: {},
    }));
    const activity = Array.from({ length: 89 }, (_, i) => ({
      id: `activity-${i}`, threadId: String(i + 1), commandId: `command-${i}`,
      type: "status-change", occurredAt: 100,
    }));
    const document = { version: 2, records, updates, activity };
    const plan = await service.previewImport(document);
    assert.strictEqual(plan.valid, true);
    const importCallStart = calls.length;
    const result = await service.importEntries(document, { plan });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.imported, 432);
    assert.deepStrictEqual([stores.records.size, stores.updates.size, stores.activity.size], [100, 243, 89]);
    const importCalls = calls.slice(importCallStart);
    for (const started of importCalls) {
      assert(importCalls.filter((other) => other >= started && other < started + coreAction.windowMs).length <= allowance);
    }
  });
};
