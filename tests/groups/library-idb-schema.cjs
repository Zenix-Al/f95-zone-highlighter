"use strict";

module.exports = function registerLibraryIdbSchemaGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  function createQueueBridge({ failBulkAt = 0 } = {}) {
    const stores = {
      "update-cycles": new Map(),
      "update-queue": new Map(),
    };
    const calls = [];
    let bulkWrites = 0;
    const matches = (value, payload) => {
      if (payload.index === "cycleId") return value.cycleId === payload.query?.value;
      if (payload.index === "cycleStatusPosition") {
        return value.cycleId === payload.query?.lower?.[0] &&
          value.status === payload.query?.lower?.[1];
      }
      if (payload.index === "cycleStatusNextAttempt") {
        return value.cycleId === payload.query?.lower?.[0] &&
          value.status === payload.query?.lower?.[1] &&
          value.nextAttemptAt >= payload.query?.lower?.[2] &&
          value.nextAttemptAt <= payload.query?.upper?.[2];
      }
      return true;
    };
    const sort = (values, index) => [...values].sort((left, right) => {
      if (index === "cycleStatusPosition") return left.position - right.position;
      if (index === "cycleNextAttempt") return left.nextAttemptAt - right.nextAttemptAt;
      if (index === "cycleStatusNextAttempt") return left.nextAttemptAt - right.nextAttemptAt;
      return String(left.id).localeCompare(String(right.id));
    });
    return {
      async invokeCoreAction(action, payload) {
        calls.push({ action, payload });
        const store = stores[payload.storeName];
        if (!store) return { ok: false, reason: "unknown_store" };
        if (action === "idb.get") return { ok: true, value: store.get(payload.key) || null };
        if (action === "idb.put") {
          store.set(payload.value.id, structuredClone(payload.value));
          return { ok: true, value: payload.value };
        }
        if (action === "idb.delete") {
          store.delete(payload.key);
          return { ok: true };
        }
        if (action === "idb.bulkPut") {
          bulkWrites += 1;
          if (failBulkAt && bulkWrites === failBulkAt) {
            return { ok: false, reason: "storage_error" };
          }
          payload.entries.forEach(({ value }) => store.set(value.id, structuredClone(value)));
          return { ok: true, value: payload.entries.length };
        }
        if (action === "idb.bulkDelete") {
          payload.keys.forEach((key) => store.delete(key));
          return { ok: true, value: payload.keys.length };
        }
        const values = sort([...store.values()].filter((value) => matches(value, payload)), payload.index);
        if (action === "idb.count") return { ok: true, value: values.length };
        if (action === "idb.query") {
          const page = values.slice(0, payload.limit);
          if (payload.pagination !== "keyset") {
            return { ok: true, value: page.map((value) => structuredClone(value)) };
          }
          return {
            ok: true,
            value: {
              items: page.map((value) => ({
                cursor: { key: value.id, primaryKey: value.id },
                value: structuredClone(value),
              })),
              nextCursor: page.length
                ? { key: page.at(-1).id, primaryKey: page.at(-1).id }
                : null,
              hasMore: values.length > page.length,
            },
          };
        }
        return { ok: false, reason: "unsupported_action" };
      },
      snapshot: () => ({ stores, calls, bulkWrites }),
    };
  }

  function createQueueRepository(bridge, options = {}) {
    const { createLibraryApiClient } = loadModule(
      "addons/library-addon/src/api/library/client.js",
    );
    const { createAutoUpdateQueueRepository } = loadModule(
      "addons/library-addon/src/library/autoUpdateQueueRepository.js",
    );
    return createAutoUpdateQueueRepository(createLibraryApiClient(bridge), options);
  }

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 declares the complete bounded version-4 schema", () => {
    const constants = loadModule("addons/library-addon/src/constants.js");
    const { normalizeDatabaseSchema } = loadModule("src/services/addons/idbStore.js");
    const schema = normalizeDatabaseSchema({ stores: constants.LIBRARY_DB_STORES });
    assert.strictEqual(constants.LIBRARY_DB_VERSION, 4);
    assert.deepStrictEqual(schema.map(({ name }) => name), [
      "records",
      "updates",
      "activity",
      "meta",
      "update-cycles",
      "update-queue",
    ]);
    assert.deepStrictEqual(
      schema.find(({ name }) => name === "updates").indexes.map(({ name }) => name),
      ["threadId", "observedAt", "version", "threadObservedAt"],
    );
    assert.deepStrictEqual(
      schema.find(({ name }) => name === "update-cycles").indexes.map(({ name }) => name),
      ["cycleId", "status", "updatedAt"],
    );
    assert.deepStrictEqual(
      schema.find(({ name }) => name === "update-queue").indexes.map(({ name }) => name),
      ["cycleId", "cycleStatusPosition", "cycleNextAttempt", "cycleStatusNextAttempt"],
    );
    assert.deepStrictEqual(
      schema.find(({ name }) => name === "activity").indexes.map(({ name }) => name),
      ["threadId", "occurredAt", "type", "threadOccurredAt"],
    );
    assert.deepStrictEqual(
      schema
        .find(({ name }) => name === "records")
        .indexes.filter(({ name }) => name.startsWith("pinnedUpdated"))
        .map(({ name, keyPath }) => ({ name, keyPath })),
      [
        {
          name: "pinnedUpdatedDesc",
          keyPath: ["pinRankDesc", "recordModifiedAt"],
        },
        {
          name: "pinnedUpdatedAsc",
          keyPath: ["pinRankAsc", "recordModifiedAt"],
        },
      ],
    );
    assert.throws(
      () => normalizeDatabaseSchema({ stores: Array.from({ length: 17 }, (_, i) => ({ name: `s-${i}` })) }),
      /indexeddb_schema_store_limit/,
    );
  });

  runTest("LIBRARY-IDB-SCHEMA-02 creates every store and index in one upgrade", () => {
    const constants = loadModule("addons/library-addon/src/constants.js");
    const { ensureDatabaseSchema, normalizeDatabaseSchema } = loadModule(
      "src/services/addons/idbStore.js",
    );
    const originalRecord = {
      threadId: "42",
      title: "Byte-stable fixture",
      nested: { preserved: true },
    };
    const before = JSON.stringify(originalRecord);
    const stores = new Map();
    const db = {
      objectStoreNames: { contains: (name) => stores.has(name) },
      createObjectStore(name, options) {
        const indexes = new Map();
        const store = {
          options,
          indexNames: { contains: (indexName) => indexes.has(indexName) },
          createIndex(indexName, keyPath, indexOptions) {
            indexes.set(indexName, { keyPath, options: indexOptions });
          },
          indexes,
        };
        stores.set(name, store);
        return store;
      },
    };
    const transaction = { objectStore: (name) => stores.get(name) };
    db.createObjectStore("records", { keyPath: "threadId", autoIncrement: false }).records = [
      originalRecord,
    ];
    ensureDatabaseSchema(
      db,
      transaction,
      normalizeDatabaseSchema({ stores: constants.LIBRARY_DB_STORES }),
    );
    assert.strictEqual(stores.size, 6);
    assert.strictEqual(stores.get("records").options.keyPath, "threadId");
    assert.ok(stores.get("records").indexes.has("personalRating"));
    assert.ok(stores.get("records").indexes.has("pinnedUpdatedDesc"));
    assert.ok(stores.get("records").indexes.has("pinnedUpdatedAsc"));
    assert.ok(stores.get("updates").indexes.has("threadObservedAt"));
    assert.ok(stores.get("activity").indexes.has("threadOccurredAt"));
    assert.ok(stores.get("update-queue").indexes.has("cycleStatusPosition"));
    assert.ok(stores.get("update-queue").indexes.has("cycleNextAttempt"));
    assert.ok(stores.get("update-queue").indexes.has("cycleStatusNextAttempt"));
    assert.strictEqual(JSON.stringify(stores.get("records").records[0]), before);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 omits explicit keys for inline-key stores", () => {
    const { putValueInStore } = loadModule("src/services/addons/idbStore.js");
    const calls = [];
    const inlineStore = {
      keyPath: "key",
      put(...args) {
        calls.push(args);
        return {};
      },
    };
    const marker = { key: "schema-v3-complete", complete: true };
    putValueInStore(inlineStore, marker, marker.key, true);
    assert.deepStrictEqual(calls, [[marker]]);

    const outOfLineStore = {
      keyPath: null,
      put(...args) {
        calls.push(args);
        return {};
      },
    };
    putValueInStore(outOfLineStore, { complete: true }, "marker", true);
    assert.deepStrictEqual(calls[1], [{ complete: true }, "marker"]);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 verifies schema before writing one idempotent marker", async () => {
    const { ensureLibrarySchema } = loadModule(
      "addons/library-addon/src/api/library/schema.js",
    );
    const calls = [];
    let marker = null;
    const bridge = {
      async invokeCoreAction(action, payload) {
        calls.push({ action, payload });
        if (action === "idb.get") return { ok: true, value: marker };
        if (action === "idb.put") {
          marker = payload.value;
          return { ok: true, value: payload.value };
        }
        return { ok: true, value: action === "idb.query" ? [] : 0 };
      },
    };
    await ensureLibrarySchema(bridge);
    const firstWrites = calls.filter(({ action }) => action === "idb.put").length;
    await ensureLibrarySchema(bridge);
    assert.strictEqual(firstWrites, 1);
    assert.strictEqual(calls.filter(({ action }) => action === "idb.put").length, 1);
    assert.ok(calls.slice(0, -2).every(({ payload }) => payload.version === 4));
    assert.ok(calls[0].payload.stores.some(({ name }) => name === "meta"));
  });

  runTest("LIBRARY-IDB-SCHEMA-02 serializes concurrent initialization", async () => {
    const { ensureLibrarySchema } = loadModule(
      "addons/library-addon/src/api/library/schema.js",
    );
    let writes = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        await Promise.resolve();
        if (action === "idb.get") return { ok: true, value: null };
        if (action === "idb.put") {
          writes += 1;
          return { ok: true, value: payload.value };
        }
        return { ok: true, value: action === "idb.query" ? [] : 0 };
      },
    };
    const [left, right] = await Promise.all([
      ensureLibrarySchema(bridge),
      ensureLibrarySchema(bridge),
    ]);
    assert.deepStrictEqual(right, left);
    assert.strictEqual(writes, 1);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 backfills released and development records once", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const records = [
      {
        threadId: "released",
        title: "Released shape",
        pinned: true,
        updatedAt: 10,
      },
      {
        threadId: "development",
        thread: { title: "Development shape" },
        personal: { status: "saved", pinned: false },
        recordModifiedAt: 20,
        schemaVersion: 4,
      },
    ];
    let marker = null;
    let bulkWrites = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action === "idb.get" && payload.storeName === "meta") {
          return { ok: true, value: marker };
        }
        if (action === "idb.query" && payload.storeName === "records") {
          return { ok: true, value: records };
        }
        if (action === "idb.bulkPut") {
          bulkWrites += 1;
          payload.entries.forEach(({ value }, index) => {
            records[index] = value;
          });
          return { ok: true, value: payload.entries.length };
        }
        if (action === "idb.put" && payload.storeName === "meta") {
          marker = payload.value;
          return { ok: true, value: marker };
        }
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {});
    const first = await library.runPinnedIndexMigration();
    const second = await library.runPinnedIndexMigration();
    assert.strictEqual(first.migrated, 2);
    assert.strictEqual(second.skipped, true);
    assert.strictEqual(bulkWrites, 1);
    assert.strictEqual(records[0].schemaVersion, 5);
    assert.strictEqual(records[0].personal.pinned, true);
    assert.strictEqual(records[0].pinRankDesc, 1);
    assert.strictEqual(records[0].pinRankAsc, 0);
    assert.strictEqual(records[1].personal.pinned, false);
    assert.strictEqual(records[1].pinRankDesc, 0);
    assert.strictEqual(records[1].pinRankAsc, 1);
    assert.strictEqual(marker.complete, true);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 leaves pin backfill retryable after write failure", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    let markerWrites = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action === "idb.get") return { ok: true, value: null };
        if (action === "idb.query") {
          return {
            ok: true,
            value: [{ threadId: "42", title: "Preserve", pinned: true }],
          };
        }
        if (action === "idb.bulkPut") {
          return { ok: false, reason: "storage_error" };
        }
        if (action === "idb.put" && payload.storeName === "meta") {
          markerWrites += 1;
        }
        return { ok: true, value: null };
      },
    };
    const result = await createLibraryService(
      bridge,
      {},
    ).runPinnedIndexMigration();
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "storage_error");
    assert.strictEqual(markerWrites, 0);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 does not mark a blocked or failed upgrade", async () => {
    const { ensureLibrarySchema } = loadModule(
      "addons/library-addon/src/api/library/schema.js",
    );
    let writes = 0;
    const bridge = {
      async invokeCoreAction(action) {
        if (action === "idb.put") writes += 1;
        return { ok: false, reason: "idb_error" };
      },
    };
    await assert.rejects(() => ensureLibrarySchema(bridge), /verify-store-records/);
    assert.strictEqual(writes, 0);
  });

  runTest("LIBRARY-IDB-SCHEMA-02 leaves records untouched and exposes no transaction callback", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/services/addons/idbStore.js"),
      "utf8",
    );
    const schemaSource = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/api/library/schema.js"),
      "utf8",
    );
    const guardSource = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/app/legacyUpgradeGuard.js"),
      "utf8",
    );
    assert.doesNotMatch(source, /deleteDatabase|deleteObjectStore/);
    assert.doesNotMatch(schemaSource, /bulkPut|idb\.delete/);
    assert.ok(
      guardSource.indexOf("detectLegacyUpgradeState(storage)") <
        guardSource.indexOf("ensureLibrarySchema(core)"),
    );
    assert.doesNotMatch(guardSource, /runLegacyMigration/);
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 bounds cycle and queue persistence shapes", () => {
    const {
      createAutoUpdateQueueItem,
      normalizeAutoUpdateCycle,
      normalizeAutoUpdateQueueItem,
    } = loadModule("addons/library-addon/src/library/autoUpdateQueueRepository.js");
    const cycle = normalizeAutoUpdateCycle({
      cycleId: "x".repeat(500),
      status: "invented",
      total: -4,
      checksPerDay: 999999,
      dailyAttempted: Infinity,
    });
    assert.strictEqual(cycle.cycleId.length, 128);
    assert.strictEqual(cycle.status, "preparing");
    assert.strictEqual(cycle.total, 0);
    assert.strictEqual(cycle.checksPerDay, 100000);
    assert.strictEqual(cycle.dailyAttempted, 0);

    const item = normalizeAutoUpdateQueueItem({
      cycleId: "cycle",
      threadId: "thread",
      position: -1,
      status: "unknown",
      attempts: 999,
      lastErrorCode: "e".repeat(500),
    });
    assert.strictEqual(item.position, 1);
    assert.strictEqual(item.status, "pending");
    assert.strictEqual(item.attempts, 100);
    assert.strictEqual(item.lastErrorCode.length, 120);
    assert.strictEqual(
      createAutoUpdateQueueItem("cycle", "42", 7).id,
      "cycle:42",
    );
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 publishes only a completely written queue", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 200 });
    const result = await repository.prepareCycle({
      cycle: { cycleId: "cycle-complete", createdAt: 100, checksPerDay: 100 },
      items: Array.from({ length: 501 }, (_, index) => ({ threadId: String(index + 1) })),
      batchSize: 200,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.written, 501);
    assert.strictEqual(result.cycle.status, "running");
    assert.strictEqual(result.cycle.startedAt, 200);
    assert.strictEqual(await repository.countCycleItems("cycle-complete"), 501);
    assert.strictEqual(bridge.snapshot().bulkWrites, 3);
    const masterWrites = bridge.snapshot().calls.filter(
      ({ action, payload }) => action === "idb.put" && payload.storeName === "update-cycles",
    );
    assert.deepStrictEqual(masterWrites.map(({ payload }) => payload.value.status), [
      "preparing",
      "preparing",
      "running",
    ]);
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 leaves a partial preparation recoverable", async () => {
    const bridge = createQueueBridge({ failBulkAt: 2 });
    const repository = createQueueRepository(bridge, { now: () => 200 });
    const result = await repository.prepareCycle({
      cycle: { cycleId: "cycle-partial" },
      items: Array.from({ length: 450 }, (_, index) => ({ threadId: String(index + 1) })),
      batchSize: 200,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "storage_error");
    assert.strictEqual(result.written, 200);
    assert.strictEqual((await repository.getCycle()).status, "preparing");
    assert.deepStrictEqual(
      await repository.verifyPreparedCycle("cycle-partial", 450),
      { ok: false, reason: "queue_prepare_incomplete", count: 200, expected: 450 },
    );
    assert.deepStrictEqual(await repository.discardCycle("cycle-partial"), {
      ok: true,
      removed: 200,
    });
    assert.strictEqual(await repository.getCycle(), null);
  });

  runTest("LIBRARY-UPDATE-QUEUE-COMPAT-01 refuses cleanup outside the active cycle", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 200 });
    await repository.prepareCycle({
      cycle: { cycleId: "owned-cycle" },
      items: [{ threadId: "1" }],
    });
    assert.deepStrictEqual(await repository.discardCycle("unowned-cycle"), {
      ok: false,
      reason: "cycle_identity_mismatch",
      removed: 0,
    });
    assert.strictEqual(await repository.countCycleItems("owned-cycle"), 1);
    assert.strictEqual((await repository.getCycle()).cycleId, "owned-cycle");
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 reopens and queries a published cycle", async () => {
    const bridge = createQueueBridge();
    const first = createQueueRepository(bridge, { now: () => 10 });
    await first.prepareCycle({
      cycle: { cycleId: "cycle-reopen" },
      items: [{ threadId: "b" }, { threadId: "a" }],
    });
    const reopened = createQueueRepository(bridge, { now: () => 20 });
    assert.strictEqual((await reopened.getCycle()).cycleId, "cycle-reopen");
    const page = await reopened.queryCycleItems({
      cycleId: "cycle-reopen",
      queueStatus: "pending",
      limit: 10,
    });
    assert.strictEqual(page.ok, true);
    assert.deepStrictEqual(page.items.map(({ value }) => value.threadId), ["b", "a"]);
  });

  runTest("LIBRARY-UPDATE-QUEUE-VERIFY-01 reopens every persisted cycle transition", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 20 });
    for (const status of ["preparing", "running", "recovering", "waiting", "paused", "completed"]) {
      const written = await repository.putCycle({ cycleId: `state-${status}`, status });
      assert.strictEqual(written.ok, true, status);
      const reopened = createQueueRepository(bridge, { now: () => 30 });
      assert.strictEqual((await reopened.getCycle()).status, status);
      assert.strictEqual((await reopened.getCycle()).cycleId, `state-${status}`);
    }
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 rolls days and recovers stale item ownership", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 500 });
    await repository.prepareCycle({
      cycle: {
        cycleId: "cycle-recovery",
        dailyKey: "2026-08-28",
        dailyAttempted: 100,
        dailyBonusAllowance: 100,
      },
      items: [{ threadId: "stale" }, { threadId: "complete" }],
    });
    const cycle = await repository.getCycle();
    const rolled = await repository.rolloverDailyAllowance(cycle, "2026-08-29");
    assert.strictEqual(rolled.ok, true);
    assert.strictEqual(rolled.value.dailyAttempted, 0);
    assert.strictEqual(rolled.value.dailyBonusAllowance, 0);
    assert.strictEqual(rolled.value.dailyKey, "2026-08-29");
    const granted = await repository.grantDailyBonus(rolled.value, 100);
    assert.strictEqual(granted.value.dailyBonusAllowance, 100);

    const stale = await repository.getQueueItem("cycle-recovery:stale");
    const claimed = await repository.claimQueueItem(stale, {
      owner: "old-tab",
      expiresAt: 400,
      dailyKey: "2026-08-29",
    });
    assert.strictEqual(claimed.value.status, "processing");
    assert.strictEqual(claimed.value.attempts, 1);
    assert.strictEqual((await repository.recoverStaleProcessing("cycle-recovery", 500)).recovered, 1);
    assert.strictEqual(
      (await repository.getQueueItem("cycle-recovery:stale")).status,
      "retry",
    );

    const complete = await repository.getQueueItem("cycle-recovery:complete");
    const completeClaim = await repository.claimQueueItem(complete, {
      owner: "new-tab",
      expiresAt: 1000,
      dailyKey: "2026-08-29",
    });
    assert.strictEqual(
      (await repository.settleQueueItem(completeClaim.value, {
        owner: "old-tab",
        status: "completed",
      })).reason,
      "queue_claim_lost",
    );
    assert.strictEqual(
      await repository.ownsQueueItem(completeClaim.value.id, "new-tab", 500),
      true,
    );
    const renewed = await repository.renewQueueItemClaim(
      completeClaim.value.id,
      "new-tab",
      1200,
    );
    assert.strictEqual(renewed.value.claimExpiresAt, 1200);
    const settled = await repository.settleQueueItem(completeClaim.value, {
      owner: "new-tab",
      status: "completed",
      completedAt: 500,
    });
    assert.strictEqual(settled.value.status, "completed");
    assert.strictEqual(settled.value.claimedBy, "");
    const counts = await repository.getCycleStatusCounts("cycle-recovery");
    assert.deepStrictEqual(counts.counts, {
      pending: 0,
      processing: 0,
      retry: 1,
      completed: 1,
      failed: 0,
    });
  });

  runTest("LIBRARY-UPDATE-QUEUE-WORKER-01 selects due retry without blocking pending work", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 500 });
    await repository.prepareCycle({
      cycle: { cycleId: "cycle-selection" },
      items: [{ threadId: "future" }, { threadId: "due" }, { threadId: "pending" }],
    });
    const future = await repository.getQueueItem("cycle-selection:future");
    const due = await repository.getQueueItem("cycle-selection:due");
    await repository.putQueueItem({ ...future, status: "retry", nextAttemptAt: 900 });
    await repository.putQueueItem({ ...due, status: "retry", nextAttemptAt: 400 });
    assert.strictEqual(
      (await repository.getNextActionableItem("cycle-selection", 500)).item.threadId,
      "due",
    );
    await repository.putQueueItem({ ...due, status: "completed", nextAttemptAt: 0 });
    assert.strictEqual(
      (await repository.getNextActionableItem("cycle-selection", 500)).item.threadId,
      "pending",
    );
  });

  runTest("LIBRARY-UPDATE-QUEUE-SCHEMA-01 writes a 10000-row queue in bounded batches", async () => {
    const bridge = createQueueBridge();
    const repository = createQueueRepository(bridge, { now: () => 10 });
    const result = await repository.prepareCycle({
      cycle: { cycleId: "cycle-large" },
      items: Array.from({ length: 10_000 }, (_, index) => ({
        threadId: String(index + 1),
      })),
      batchSize: 200,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.written, 10_000);
    assert.strictEqual(bridge.snapshot().bulkWrites, 50);
    assert.strictEqual(await repository.countCycleItems("cycle-large"), 10_000);
  });
};
