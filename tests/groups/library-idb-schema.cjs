"use strict";

module.exports = function registerLibraryIdbSchemaGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  runTest("LIBRARY-IDB-SCHEMA-02 declares the complete bounded version-3 schema", () => {
    const constants = loadModule("addons/library-addon/src/constants.js");
    const { normalizeDatabaseSchema } = loadModule("src/services/addons/idbStore.js");
    const schema = normalizeDatabaseSchema({ stores: constants.LIBRARY_DB_STORES });
    assert.strictEqual(constants.LIBRARY_DB_VERSION, 3);
    assert.deepStrictEqual(schema.map(({ name }) => name), [
      "records",
      "updates",
      "activity",
      "meta",
    ]);
    assert.deepStrictEqual(
      schema.find(({ name }) => name === "updates").indexes.map(({ name }) => name),
      ["threadId", "observedAt", "version", "threadObservedAt"],
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
    assert.strictEqual(stores.size, 4);
    assert.strictEqual(stores.get("records").options.keyPath, "threadId");
    assert.ok(stores.get("records").indexes.has("personalRating"));
    assert.ok(stores.get("records").indexes.has("pinnedUpdatedDesc"));
    assert.ok(stores.get("records").indexes.has("pinnedUpdatedAsc"));
    assert.ok(stores.get("updates").indexes.has("threadObservedAt"));
    assert.ok(stores.get("activity").indexes.has("threadOccurredAt"));
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
    assert.ok(calls.slice(0, -2).every(({ payload }) => payload.version === 3));
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
    const appSource = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/app/createLibraryAddonApp.js"),
      "utf8",
    );
    assert.doesNotMatch(source, /deleteDatabase|deleteObjectStore/);
    assert.doesNotMatch(schemaSource, /bulkPut|idb\.delete/);
    assert.ok(
      appSource.indexOf("ensureLibrarySchema(core)") <
        appSource.indexOf("library.runLegacyMigration()"),
    );
  });
};
