"use strict";

module.exports = function registerLibraryOpportunisticUpdateGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 ignores unsaved thread visits", async () => {
    const { createOpportunisticObserver } = loadModule(
      "addons/library-addon/src/app/opportunisticObserver.js",
    );
    let observations = 0;
    const observer = createOpportunisticObserver({
      isEnabled: () => true,
      library: {
        getEntry: async () => null,
        observeThreadFacts: async () => {
          observations += 1;
          return { ok: true };
        },
      },
    });
    const result = await observer.observe({ threadId: "1" });
    assert.strictEqual(result.saved, false);
    assert.strictEqual(observations, 0);
  });

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 observes saved snapshots through history service", async () => {
    const { createOpportunisticObserver } = loadModule(
      "addons/library-addon/src/app/opportunisticObserver.js",
    );
    const existing = { threadId: "1", thread: { currentVersion: "0.7" } };
    let received = null;
    const observer = createOpportunisticObserver({
      isEnabled: () => true,
      library: {
        getEntry: async () => existing,
        observeThreadFacts: async (record, snapshot, options) => {
          received = { record, snapshot, cancelled: options.shouldCancel() };
          return { ok: true, event: { type: "version" } };
        },
      },
    });
    const snapshot = { threadId: "1", gameVersion: "0.8" };
    const result = await observer.observe(snapshot);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.saved, true);
    assert.strictEqual(received.record, existing);
    assert.strictEqual(received.snapshot, snapshot);
    assert.strictEqual(received.cancelled, false);
  });

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 unchanged saved visits stay write-free", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const record = {
      threadId: "1",
      thread: {
        title: "Game",
        canonicalTitle: "Game",
        titleNormalized: "game",
        developer: "Dev",
        currentVersion: "0.7",
        threadRating: 4,
        tags: [],
        prefixes: [],
        url: "https://f95zone.to/threads/1/",
        sourcePage: "thread",
        observedAt: 1,
        versionObservedAt: 1,
      },
      personal: {
        status: "playing",
        rating: null,
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
      recordModifiedAt: 1,
      schemaVersion: 4,
    };
    let writes = 0;
    const bridge = {
      async invokeCoreAction(action) {
        if (action === "idb.put") writes += 1;
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {});
    const result = await library.observeThreadFacts(record, {
      threadId: "1",
      title: "Game",
      canonicalTitle: "Game",
      titleNormalized: "game",
      developer: "Dev",
      gameVersion: "v0.7",
      threadRating: 4,
      tags: [],
      prefixes: [],
      url: "https://f95zone.to/threads/1/",
      sourcePage: "thread",
    });
    assert.strictEqual(result.unchanged, true);
    assert.strictEqual(writes, 0);
  });

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 rapid routes cancel stale observations", async () => {
    const { createOpportunisticObserver } = loadModule(
      "addons/library-addon/src/app/opportunisticObserver.js",
    );
    const resolvers = new Map();
    const observed = [];
    const observer = createOpportunisticObserver({
      isEnabled: () => true,
      library: {
        getEntry: (id) =>
          new Promise((resolve) => {
            resolvers.set(id, resolve);
          }),
        observeThreadFacts: async (_record, snapshot) => {
          observed.push(snapshot.threadId);
          return { ok: true };
        },
      },
    });
    const first = observer.observe({ threadId: "1" });
    const second = observer.observe({ threadId: "2" });
    resolvers.get("1")({ threadId: "1" });
    resolvers.get("2")({ threadId: "2" });
    assert.strictEqual((await first).reason, "cancelled");
    assert.strictEqual((await second).ok, true);
    assert.deepStrictEqual(observed, ["2"]);
  });

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 surfaces changed state in table markup", () => {
    const { renderRows } = loadModule(
      "addons/library-addon/src/ui/components/manager/tableRenderer.js",
    );
    const tbody = { innerHTML: "" };
    renderRows(
      tbody,
      [
        {
          threadId: "1",
          thread: { title: "Changed", tags: [], prefixes: [] },
          personal: { status: "saved", rating: null, note: "" },
          updateState: "changed",
          recordModifiedAt: 1,
        },
      ],
      new Set(),
      {
        liveThreadId: "",
        openRowMenuId: "",
        openStatusMenuId: "",
        ratingDraftById: new Map(),
        ratingCommittedById: new Map(),
      },
    );
    assert.match(tbody.innerHTML, /data-update-state="pending"/);
    assert.match(tbody.innerHTML, /Update state: changed/);
  });

  runTest("LIBRARY-OPPORTUNISTIC-UPDATE-01 performs no background network fetch", () => {
    const sources = [
      "addons/library-addon/src/app/opportunisticObserver.js",
      "addons/library-addon/src/app/dockController.js",
    ]
      .map((relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8"))
      .join("\n");
    assert.doesNotMatch(sources, /\bfetch\s*\(|GM_xmlhttpRequest|XMLHttpRequest/);
  });
};
