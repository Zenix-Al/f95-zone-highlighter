"use strict";

module.exports = function registerLibraryImportExportGroup(context) {
  const { assert, loadModule, runTest } = context;

  function legacyRecord(threadId = "42") {
    return {
      threadId,
      title: "Example",
      gameVersion: "0.7",
      userStatus: "playing",
      userScore: 4.5,
      createdAt: 100,
      updatedAt: 300,
      lastPlayedAt: 200,
    };
  }

  function createBridge(seed = {}, options = {}) {
    const stores = {
      records: new Map((seed.records || []).map((value) => [value.threadId, value])),
      updates: new Map((seed.updates || []).map((value) => [value.id, value])),
      activity: new Map((seed.activity || []).map((value) => [value.id, value])),
    };
    return {
      bridge: {
        async invokeCoreAction(action, payload) {
          const store = stores[payload.storeName || "records"];
          if (action === "addon.throttle") {
            return {
              ok: true,
              value: {
                coreAction: { suggestedMinIntervalMs: 0 },
                payloadLimits: { idb: { maxPayloadBytes: 65536, maxBulkItems: 500 } },
              },
            };
          }
          if (action === "idb.query") return { ok: true, value: [...store.values()] };
          if (action === "idb.get") return { ok: true, value: store.get(payload.key) || null };
          if (action === "idb.put") {
            const key = payload.value.threadId || payload.value.id;
            store.set(key, payload.value);
            return { ok: true, value: payload.value };
          }
          if (action === "idb.bulkPut") {
            if (options.failStore === (payload.storeName || "records")) {
              return { ok: false, reason: "fixture_store_failure" };
            }
            for (const entry of payload.entries || []) {
              const key = entry.value.threadId || entry.value.id;
              store.set(key, entry.value);
            }
            return { ok: true, value: true };
          }
          return { ok: true, value: null };
        },
      },
      snapshot() {
        return Object.fromEntries(
          Object.entries(stores).map(([name, values]) => [name, [...values.values()]]),
        );
      },
    };
  }

  runTest("LIBRARY-IMPORT-EXPORT-02 accepts v1 and creates no history", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createBridge();
    const service = createLibraryService(memory.bridge, { get: async () => true });
    const document = { version: 1, records: [legacyRecord()] };
    const preview = await service.previewImport(document);
    assert.strictEqual(preview.valid, true);
    assert.strictEqual(preview.sections.updates.total, 0);
    assert.strictEqual(preview.sections.activity.total, 0);
    const result = await service.importEntries(document, { plan: preview });
    assert.strictEqual(result.ok, true);
    const snapshot = memory.snapshot();
    assert.strictEqual(snapshot.records[0].schemaVersion, 5);
    assert.strictEqual(snapshot.records[0].personal.rating, 4.5);
    assert.deepStrictEqual(snapshot.updates, []);
    assert.deepStrictEqual(snapshot.activity, []);
  });

  runTest("LIBRARY-IMPORT-EXPORT-02 v2 round trips records and histories", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const sourceMemory = createBridge();
    const source = createLibraryService(sourceMemory.bridge, { get: async () => true });
    await source.importEntries([legacyRecord()], {
      conflictPolicy: "replace",
    });
    const canonical = sourceMemory.snapshot().records[0];
    sourceMemory.snapshot;
    const update = {
      id: "update:42:x",
      threadId: "42",
      type: "version",
      observedAt: 250,
      version: "0.7",
      previousVersion: "0.6",
      fields: ["version"],
      before: {},
      after: {},
    };
    const activity = {
      id: "activity:42:cmd:rating-change",
      threadId: "42",
      commandId: "cmd",
      type: "rating-change",
      occurredAt: 260,
      version: "0.7",
      before: null,
      after: 4.5,
    };
    const document = {
      version: 2,
      records: [canonical],
      updates: [update],
      activity: [activity],
    };
    const targetMemory = createBridge();
    const target = createLibraryService(targetMemory.bridge, { get: async () => true });
    const preview = await target.previewImport(document);
    assert.strictEqual(preview.valid, true);
    const result = await target.importEntries(document, { plan: preview });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.historyImported, 2);
    const exported = await target.exportEntries();
    assert.strictEqual(exported.version, 2);
    assert.strictEqual(exported.records[0].personal.rating, 4.5);
    assert.strictEqual(exported.records[0].personal.lastPlayedAt, 200);
    assert.deepStrictEqual(exported.updates, [update]);
    assert.deepStrictEqual(exported.activity, [activity]);
  });

  runTest("LIBRARY-IMPORT-EXPORT-02 invalid history preview is write-free", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createBridge();
    const service = createLibraryService(memory.bridge, { get: async () => true });
    const document = {
      version: 2,
      records: [legacyRecord()],
      updates: [{ id: "broken", threadId: "42" }],
      activity: [],
    };
    const preview = await service.previewImport(document);
    assert.strictEqual(preview.valid, false);
    const result = await service.importEntries(document, { plan: preview });
    assert.strictEqual(result.reason, "invalid_import_document");
    assert.deepStrictEqual(memory.snapshot().records, []);
  });

  runTest("LIBRARY-IMPORT-EXPORT-02 reports partial multi-store failure", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createBridge({}, { failStore: "activity" });
    const service = createLibraryService(memory.bridge, { get: async () => true });
    const document = {
      version: 2,
      records: [legacyRecord()],
      updates: [{
        id: "update:42:x",
        threadId: "42",
        type: "thread-facts",
        observedAt: 250,
        fields: ["title"],
        before: {},
        after: {},
      }],
      activity: [{
        id: "activity:42:cmd:rating-change",
        threadId: "42",
        commandId: "cmd",
        type: "rating-change",
        occurredAt: 260,
      }],
    };
    const preview = await service.previewImport(document);
    const result = await service.importEntries(document, { plan: preview });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.partial, true);
    assert.strictEqual(result.failedSection, "activity");
    assert.deepStrictEqual(result.committedSections, ["records", "updates"]);
  });

  runTest("LIBRARY-IMPORT-EXPORT-02 keeps payload and item bounds", () => {
    const { buildImportBatches } = loadModule(
      "addons/library-addon/src/library/importWorkflow.js",
    );
    const operations = Array.from({ length: 5 }, (_, index) => ({
      value: { id: String(index), text: "x".repeat(100) },
    }));
    const batches = buildImportBatches(
      operations,
      { payloadLimits: { idb: { maxPayloadBytes: 4096, maxBulkItems: 2 } } },
      (entries) => ({ entries }),
    );
    assert.deepStrictEqual(batches.map((batch) => batch.length), [2, 2, 1]);
  });
};
