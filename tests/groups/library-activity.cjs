"use strict";

module.exports = function registerLibraryActivityGroup(context) {
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
        tags: [],
        prefixes: [],
        url: "https://f95zone.to/threads/42/",
        sourcePage: "thread",
        observedAt: 1,
        versionObservedAt: 1,
      },
      personal: {
        status: "saved",
        rating: null,
        note: "",
        pinned: false,
        progressNote: "",
        lastPlayedVersion: "",
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
      recordModifiedAt: 1,
      schemaVersion: 4,
    };
  }

  function createMemoryBridge() {
    let record = createRecord();
    const activity = new Map();
    const updates = new Map();
    const queries = [];
    return {
      bridge: {
        async invokeCoreAction(action, payload) {
          const store = payload.storeName || "records";
          const map = store === "activity" ? activity : updates;
          if (action === "idb.get") {
            return { ok: true, value: store === "records" ? record : map.get(payload.key) || null };
          }
          if (action === "idb.put") {
            if (store === "records") record = payload.value;
            else map.set(payload.value.id, payload.value);
            return { ok: true, value: payload.value };
          }
          if (action === "idb.delete") {
            map.delete(payload.key);
            return { ok: true, value: true };
          }
          if (action === "idb.query") {
            queries.push(payload);
            return {
              ok: true,
              value: [...map.values()]
                .filter((event) => event.threadId === payload.query.lower[0])
                .sort((a, b) => (b.occurredAt || b.observedAt) - (a.occurredAt || a.observedAt))
                .slice(0, payload.limit),
            };
          }
          return { ok: true, value: null };
        },
      },
      snapshot: () => ({
        record,
        activity: [...activity.values()],
        updates: [...updates.values()],
        queries,
      }),
    };
  }

  function threadPatch(version) {
    return {
      threadId: "42",
      title: "Example",
      canonicalTitle: "Example",
      titleNormalized: "example",
      developer: "Dev",
      gameVersion: version,
      threadRating: 4,
      tags: [],
      prefixes: [],
      url: "https://f95zone.to/threads/42/",
      sourcePage: "thread",
    };
  }

  runTest("LIBRARY-ACTIVITY-01 keeps played version separate from observed version", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    await library.applyPersonalActivity("42", {}, {
      commandId: "played-0.7",
      occurredAt: 100,
      playedCurrentVersion: true,
    });
    await library.patchEntry("42", threadPatch("0.8"));
    const snapshot = memory.snapshot();
    assert.strictEqual(snapshot.record.thread.currentVersion, "0.8");
    assert.strictEqual(snapshot.record.personal.lastPlayedVersion, "0.7");
    assert.strictEqual(snapshot.record.personal.lastPlayedAt, 100);
    assert.strictEqual(snapshot.activity.length, 1);
    assert.strictEqual(snapshot.updates.length, 1);
  });

  runTest("LIBRARY-ACTIVITY-01 deduplicates repeated played versions and returns complete records", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    const first = await library.applyPersonalActivity("42", {}, {
      commandId: "played-first",
      occurredAt: 100,
      playedCurrentVersion: true,
    });
    const second = await library.applyPersonalActivity("42", {}, {
      commandId: "played-second",
      occurredAt: 200,
      playedCurrentVersion: true,
    });
    assert.strictEqual(first.value.threadId, "42");
    assert.strictEqual(second.value.threadId, "42");
    assert.strictEqual(second.value.thread.currentVersion, "0.7");
    assert.strictEqual(second.value.personal.lastPlayedAt, 200);
    assert.strictEqual(memory.snapshot().activity.length, 1);
  });

  runTest("LIBRARY-ACTIVITY-01 rating and progress edits do not create timeline events", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    const options = { commandId: "rating-command", occurredAt: 200 };
    await library.applyPersonalActivity("42", { rating: 4.5 }, options);
    await library.applyPersonalActivity("42", { rating: 4.5 }, options);
    await library.applyPersonalActivity(
      "42",
      { progressNote: "chapter 2" },
      { commandId: "progress-command", occurredAt: 250 },
    );
    assert.strictEqual(memory.snapshot().activity.length, 0);
    assert.strictEqual(memory.snapshot().record.personal.rating, 4.5);
    assert.strictEqual(memory.snapshot().record.personal.progressNote, "chapter 2");
  });

  runTest("LIBRARY-ACTIVITY-01 status transitions set dates without erasing history", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    await library.applyPersonalActivity(
      "42",
      { status: "playing" },
      { commandId: "playing", occurredAt: 300 },
    );
    await library.applyPersonalActivity(
      "42",
      { status: "completed" },
      { commandId: "completed", occurredAt: 400 },
    );
    const snapshot = memory.snapshot();
    assert.strictEqual(snapshot.record.personal.startedAt, 300);
    assert.strictEqual(snapshot.record.personal.completedAt, 400);
    assert.strictEqual(snapshot.record.personal.status, "completed");
    assert.strictEqual(snapshot.activity.length, 2);
  });

  runTest("LIBRARY-ACTIVITY-01 cancellation rolls back events and suppresses summary", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    let cancelled = false;
    const originalInvoke = memory.bridge.invokeCoreAction;
    memory.bridge.invokeCoreAction = async (action, payload) => {
      const result = await originalInvoke(action, payload);
      if (action === "idb.put" && payload.storeName === "activity") cancelled = true;
      return result;
    };
    const library = createLibraryService(memory.bridge, {});
    const result = await library.applyPersonalActivity(
      "42",
      { status: "playing" },
      {
        commandId: "cancelled",
        occurredAt: 500,
        shouldCancel: () => cancelled,
      },
    );
    assert.strictEqual(result.reason, "cancelled");
    assert.strictEqual(memory.snapshot().activity.length, 0);
    assert.strictEqual(memory.snapshot().record.personal.status, "saved");
  });

  runTest("LIBRARY-ACTIVITY-01 queries bounded newest-first timelines", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const memory = createMemoryBridge();
    const library = createLibraryService(memory.bridge, {});
    await library.applyPersonalActivity(
      "42",
      { status: "playing" },
      { commandId: "one", occurredAt: 100 },
    );
    await library.applyPersonalActivity(
      "42",
      { status: "completed" },
      { commandId: "two", occurredAt: 200 },
    );
    const events = await library.listActivityEvents("42", 1);
    const query = memory.snapshot().queries.at(-1);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].after, "completed");
    assert.strictEqual(query.index, "threadOccurredAt");
    assert.strictEqual(query.direction, "prev");
    assert.strictEqual(query.limit, 1);
  });
};
