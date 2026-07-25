"use strict";

module.exports = function registerLibraryVersionHistoryGroup(context) {
  const { assert, loadModule, runTest } = context;

  function createRecord(version = "0.7") {
    return {
      threadId: "42",
      thread: {
        title: "Example",
        canonicalTitle: "Example",
        titleNormalized: "example",
        developer: "Dev",
        currentVersion: version,
        threadRating: 4,
        tags: ["one"],
        prefixes: [{ label: "Completed", color: "" }],
        url: "https://f95zone.to/threads/42/",
        sourcePage: "thread",
        observedAt: 10,
        versionObservedAt: 10,
      },
      personal: {
        status: "playing",
        rating: 4.5,
        note: "",
        pinned: false,
        progressNote: "",
        lastPlayedVersion: "0.7",
        addedAt: 1,
        startedAt: null,
        lastPlayedAt: null,
        completedAt: null,
        droppedAt: null,
        lastActivityAt: null,
      },
      updateState: "current",
      lastCheckedAt: null,
      lastThreadChangeAt: null,
      recordModifiedAt: 10,
      schemaVersion: 4,
    };
  }

  function createMemoryBridge(initial = createRecord()) {
    let record = initial;
    const events = new Map();
    let recordWrites = 0;
    let eventWrites = 0;
    const queries = [];
    return {
      bridge: {
        async invokeCoreAction(action, payload) {
          const store = payload.storeName || "records";
          if (action === "idb.get") {
            return {
              ok: true,
              value: store === "updates" ? events.get(payload.key) || null : record,
            };
          }
          if (action === "idb.put") {
            if (store === "updates") {
              events.set(payload.value.id, payload.value);
              eventWrites += 1;
            } else {
              record = payload.value;
              recordWrites += 1;
            }
            return { ok: true, value: payload.value };
          }
          if (action === "idb.delete") {
            events.delete(payload.key);
            return { ok: true, value: true };
          }
          if (action === "idb.query") {
            queries.push(payload);
            const rows = [...events.values()]
              .filter((event) => event.threadId === payload.query.lower[0])
              .sort((a, b) => b.observedAt - a.observedAt)
              .slice(0, payload.limit);
            return { ok: true, value: rows };
          }
          return { ok: true, value: null };
        },
      },
      snapshot: () => ({ record, events: [...events.values()], recordWrites, eventWrites, queries }),
    };
  }

  function threadPatch(version, extra = {}) {
    return {
      threadId: "42",
      title: "Example",
      canonicalTitle: "Example",
      titleNormalized: "example",
      developer: "Dev",
      gameVersion: version,
      threadRating: 4,
      tags: ["one"],
      prefixes: [{ label: "Completed", color: "" }],
      url: "https://f95zone.to/threads/42/",
      sourcePage: "thread",
      ...extra,
    };
  }

  runTest("LIBRARY-VERSION-HISTORY-01 records one real version transition", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    const result = await library.patchEntry("42", threadPatch("0.8"));
    const snapshot = memory.snapshot();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(snapshot.events.length, 1);
    assert.strictEqual(snapshot.events[0].type, "version");
    assert.strictEqual(snapshot.record.updateState, "changed");
    assert.strictEqual(snapshot.record.thread.currentVersion, "0.8");
    assert.strictEqual(snapshot.record.personal.status, "playing");
    assert.strictEqual(snapshot.record.personal.lastPlayedVersion, "0.7");
  });

  runTest("LIBRARY-VERSION-HISTORY-01 repeated and equivalent versions are write-free", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    await library.patchEntry("42", threadPatch("v0.7"));
    await library.patchEntry("42", threadPatch(" 0.7 "));
    assert.strictEqual(memory.snapshot().recordWrites, 0);
    assert.strictEqual(memory.snapshot().eventWrites, 0);
  });

  runTest("LIBRARY-VERSION-HISTORY-01 ignores empty versions but records other facts", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge(createRecord(""));
    const library = createLibraryService(memory.bridge, {});
    await library.patchEntry("42", threadPatch("", { title: "Renamed" }));
    const snapshot = memory.snapshot();
    assert.strictEqual(snapshot.events.length, 1);
    assert.strictEqual(snapshot.events[0].type, "thread-facts");
    assert.strictEqual(snapshot.record.updateState, "current");
  });

  runTest("LIBRARY-VERSION-HISTORY-01 deduplicates deterministic events and acknowledges", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const { createUpdateEvent, diffThreadFacts } = loadModule(
      "addons/library-addon/src/library/updateEventModel.js",
    );
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    const before = createRecord("0.7");
    const after = createRecord("0.8");
    const diff = diffThreadFacts(before, after);
    assert.strictEqual(
      createUpdateEvent("42", diff, 100).id,
      createUpdateEvent("42", diff, 200).id,
    );
    await library.patchEntry("42", threadPatch("0.8"));
    const acknowledged = await library.acknowledgeCurrentUpdate("42");
    assert.strictEqual(acknowledged.ok, true);
    assert.strictEqual(acknowledged.value.updateState, "acknowledged");
  });

  runTest("LIBRARY-VERSION-HISTORY-01 queries bounded ordered history by thread", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    await library.patchEntry("42", threadPatch("0.8"));
    const events = await library.listUpdateEvents("42", 20);
    const query = memory.snapshot().queries[0];
    assert.strictEqual(events.length, 1);
    assert.strictEqual(query.index, "threadObservedAt");
    assert.strictEqual(query.direction, "prev");
    assert.strictEqual(query.limit, 20);
    assert.deepStrictEqual(query.query.lower, ["42", 0]);
  });

  runTest("LIBRARY-VERSION-HISTORY-01 rolls back a new event after record failure", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const originalInvoke = memory.bridge.invokeCoreAction;
    memory.bridge.invokeCoreAction = async (action, payload) => {
      if (action === "idb.put" && payload.storeName === "records") {
        return { ok: false, reason: "storage_error" };
      }
      return originalInvoke(action, payload);
    };
    const library = createLibraryService(memory.bridge, {});
    const result = await library.patchEntry("42", threadPatch("0.8"));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(memory.snapshot().events.length, 0);
  });

  runTest("LIBRARY-VERSION-HISTORY-01 exposes acknowledgement and bounded history in editor", () => {
    const { renderEntryEditor } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorRenderer.js",
    );
    const html = renderEntryEditor(
      { ...createRecord("0.8"), updateState: "changed" },
      {
        status: "playing",
        rating: "4.5",
        note: "",
        progressNote: "",
        lastPlayedVersion: "0.7",
        startedAt: "",
        lastPlayedAt: "",
        completedAt: "",
        droppedAt: "",
      },
      [],
      [
        {
          previousVersion: "0.7",
          version: "0.8",
          observedAt: 100,
        },
      ],
    );
    assert.match(html, /data-editor-action="acknowledge-update"/);
    assert.match(html, /0\.7/);
    assert.match(html, /0\.8/);
  });
};
