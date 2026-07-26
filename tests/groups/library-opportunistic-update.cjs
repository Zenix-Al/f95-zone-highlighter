"use strict";

module.exports = function registerLibraryOpportunisticUpdateGroup(context) {
  const {
    assert,
    createDomSandbox,
    fs,
    loadModule,
    path,
    ROOT,
    runTest,
  } = context;

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

  runTest("Library thread-title chips reuse personal and update state idempotently", () => {
    const sandbox = createDomSandbox();
    const {
      clearThreadTitleChips,
      getThreadTitleChips,
      renderThreadTitleChips,
    } = loadModule(
      "addons/library-addon/src/ui/threadTitle/titleChips.js",
    );
    try {
      sandbox.document.body.innerHTML =
        '<div class="p-title"><h1 class="p-title-value"><span class="label">Others</span>Example [v2]</h1></div>';
      const record = {
        threadId: "1",
        thread: { currentVersion: "v2" },
        personal: { status: "playing", lastPlayedVersion: "v1" },
        updateCheck: { enabled: false },
      };
      assert.deepStrictEqual(
        getThreadTitleChips(record).map(({ kind }) => kind),
        ["playing", "new-version", "updates-off"],
      );
      assert.strictEqual(renderThreadTitleChips(record), true);
      assert.strictEqual(renderThreadTitleChips(record), true);
      assert.strictEqual(
        sandbox.document.querySelectorAll(".f95ue-library-title-chips").length,
        1,
      );
      assert.strictEqual(
        sandbox.document.querySelectorAll(".f95ue-library-title-chip").length,
        3,
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="playing"]')
          .classList.contains("label--royalBlue"),
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="new-version"]')
          .classList.contains("label--orange"),
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="updates-off"]')
          .classList.contains("label--subtle"),
      );
      assert.match(
        sandbox.document.querySelector("h1").textContent,
        /Example \[v2\]/,
      );
      clearThreadTitleChips();
      assert.strictEqual(
        sandbox.document.querySelectorAll(".f95ue-library-title-chips").length,
        0,
      );
    } finally {
      sandbox.restore();
    }
  });

  runTest("Library record cache is bounded and invalidated by writes and deletes", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const records = new Map([
      [
        "1",
        {
          threadId: "1",
          thread: { title: "Cached", currentVersion: "1" },
          personal: { status: "saved" },
        },
      ],
    ]);
    let reads = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action === "idb.get") {
          reads += 1;
          return { ok: true, value: records.get(String(payload.key)) || null };
        }
        if (action === "idb.put") {
          records.set(String(payload.value.threadId), payload.value);
          return { ok: true, value: payload.value };
        }
        if (action === "idb.delete") {
          records.delete(String(payload.key));
          return { ok: true };
        }
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {}, {
      entryCacheLimit: 10,
      entryCacheTtlMs: 1000,
    });
    assert.strictEqual((await library.getEntry("1")).thread.title, "Cached");
    assert.strictEqual((await library.getEntry("1")).thread.title, "Cached");
    assert.strictEqual(reads, 1);

    const patched = await library.patchEntry("1", { status: "playing" });
    assert.strictEqual(patched.ok, true);
    assert.strictEqual((await library.getEntry("1")).personal.status, "playing");
    assert.strictEqual(reads, 1);

    await library.removeEntry("1");
    assert.strictEqual(await library.getEntry("1"), null);
    assert.strictEqual(reads, 2);
    assert.deepStrictEqual(library.getEntryCacheSnapshot(), {
      limit: 10,
      size: 0,
      ttlMs: 1000,
    });
  });
};
