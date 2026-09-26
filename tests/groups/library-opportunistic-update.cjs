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

  runTest("LIBRARY-STATE-CALLERS-01 routes status controls through the canonical command", () => {
    const sourceFor = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

    assert.match(
      sourceFor("addons/library-addon/src/ui/manager/handlers/statusHandlers.js"),
      /api\.setPersonalStatus\(/,
    );
    assert.match(
      sourceFor("addons/library-addon/src/ui/entryEditor/editorController.js"),
      /library\.setPersonalStatus\(/,
    );
    assert.match(
      sourceFor("addons/library-addon/src/ui/manager/handlers/bulkHandlers.js"),
      /api\.bulkUpdateStatus\(/,
    );
  });

  runTest("LIBRARY-STATE-VERSION-SEMANTICS-01 gives title chips distinct version-state roles", () => {
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
        updateState: "changed",
        updateCheck: { enabled: false },
      };
      assert.deepStrictEqual(
        getThreadTitleChips(record).map(({ kind }) => kind),
        ["playing", "update-pending", "unplayed-current-version", "updates-off"],
      );
      assert.strictEqual(renderThreadTitleChips(record), true);
      assert.strictEqual(renderThreadTitleChips(record), true);
      assert.strictEqual(
        sandbox.document.querySelectorAll(".f95ue-library-title-chips").length,
        1,
      );
      assert.strictEqual(
        sandbox.document.querySelectorAll(".f95ue-library-title-chip").length,
        4,
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="playing"]')
          .classList.contains("label--royalBlue"),
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="update-pending"]')
          .classList.contains("label--orange"),
      );
      assert.ok(
        sandbox.document
          .querySelector('[data-kind="unplayed-current-version"]')
          .classList.contains("label--royalBlue"),
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

  runTest("LIBRARY-STATE-TITLE-CHIPS-01 gives every saved status a distinct title chip", () => {
    const { getThreadTitleChips, renderThreadTitleChips } = loadModule(
      "addons/library-addon/src/ui/threadTitle/titleChips.js",
    );
    const statuses = ["saved", "backlog", "playing", "paused", "completed", "dropped"];

    const visibleStatuses = statuses.map((status) =>
      getThreadTitleChips({
        threadId: `thread-${status}`,
        thread: { currentVersion: "v1" },
        personal: { status, lastPlayedVersion: "v1" },
        updateCheck: { enabled: true },
      })
        .filter((chip) => chip.kind === status)
        .map((chip) => chip.text),
    );

    assert.deepStrictEqual(visibleStatuses, [
      ["Saved"],
      ["Backlog"],
      ["Playing"],
      ["Paused"],
      ["Completed"],
      ["Dropped"],
    ]);

    const sandbox = createDomSandbox();
    try {
      sandbox.document.body.innerHTML = '<h1 class="p-title-value">Example</h1>';
      assert.strictEqual(renderThreadTitleChips(null), false);
      assert.strictEqual(
        renderThreadTitleChips({
          threadId: "saved-thread",
          thread: { currentVersion: "v1" },
          personal: { status: "saved", lastPlayedVersion: "v1" },
        }),
        true,
      );
      const chip = sandbox.document.querySelector('[data-kind="saved"]');
      assert.ok(chip);
      assert.strictEqual(chip.textContent, "Saved");
      assert.strictEqual(chip.style.backgroundColor, "#4b5563");
    } finally {
      sandbox.restore();
    }
  });

  runTest("LIBRARY-STATE-VERSION-SEMANTICS-01 keeps acknowledgement and play indicators independent", () => {
    const { getThreadTitleChips } = loadModule(
      "addons/library-addon/src/ui/threadTitle/titleChips.js",
    );
    const cases = [
      ["acknowledged+played", "acknowledged", "v2", ["saved"]],
      ["changed+played", "changed", "v2", ["saved", "update-pending"]],
      ["acknowledged+unplayed", "acknowledged", "v1", ["saved", "unplayed-current-version"]],
      ["changed+unplayed", "changed", "v1", ["saved", "update-pending", "unplayed-current-version"]],
    ];

    for (const [label, updateState, lastPlayedVersion, expected] of cases) {
      assert.deepStrictEqual(
        getThreadTitleChips({
          threadId: label,
          thread: { currentVersion: "v2" },
          personal: { status: "saved", lastPlayedVersion },
          updateState,
          updateCheck: { enabled: true },
        }).map((chip) => chip.kind),
        expected,
        label,
      );
    }
  });

  runTest("LIBRARY-STATE-VERSION-SEMANTICS-01 normalizes version identity and ignores missing versions", () => {
    const {
      hasUnacknowledgedUpdate,
      hasUnplayedCurrentVersion,
    } = loadModule("addons/library-addon/src/library/versionState.js");

    assert.strictEqual(
      hasUnplayedCurrentVersion({
        thread: { currentVersion: " v1.2 " },
        personal: { lastPlayedVersion: "1.2" },
      }),
      false,
    );
    assert.strictEqual(
      hasUnplayedCurrentVersion({
        thread: { currentVersion: "v1.2" },
        personal: { lastPlayedVersion: "" },
      }),
      false,
    );
    assert.strictEqual(
      hasUnplayedCurrentVersion({
        thread: { currentVersion: "" },
        personal: { lastPlayedVersion: "v1.1" },
      }),
      false,
    );
    assert.strictEqual(hasUnacknowledgedUpdate({ updateState: " changed " }), true);
    assert.strictEqual(hasUnacknowledgedUpdate({ updateState: "acknowledged" }), false);
  });

  runTest("LIBRARY-STATE-CURRENT-THREAD-01 presents the saved current thread before pinned rows", () => {
    const { renderRows } = loadModule(
      "addons/library-addon/src/ui/components/manager/tableRenderer.js",
    );
    const tbody = { innerHTML: "" };
    renderRows(
      tbody,
      [
        { threadId: "1", thread: { title: "Pinned", tags: [], prefixes: [] }, personal: { status: "saved", pinned: true, rating: null, note: "" }, recordModifiedAt: 3 },
        { threadId: "2", thread: { title: "Current", tags: [], prefixes: [] }, personal: { status: "saved", pinned: false, rating: null, note: "" }, recordModifiedAt: 2 },
        { threadId: "3", thread: { title: "Other", tags: [], prefixes: [] }, personal: { status: "saved", pinned: false, rating: null, note: "" }, recordModifiedAt: 1 },
      ],
      new Set(),
      {
        liveThreadId: "2",
        openRowMenuId: "",
        openStatusMenuId: "",
        ratingDraftById: new Map(),
        ratingCommittedById: new Map(),
      },
    );
    assert.match(tbody.innerHTML, /^\s*<tr[^>]*data-thread-id="2"/);
  });

  runTest("LIBRARY-STATE-CURRENT-THREAD-01 injects once on page one and respects filters", async () => {
    const sandbox = createDomSandbox();
    const { reloadRows } = loadModule("addons/library-addon/src/ui/manager/reloadRows.js");
    const { createInitialState } = loadModule("addons/library-addon/src/ui/manager/state.js");
    const current = {
      threadId: "2",
      thread: { title: "Current", tags: [], prefixes: [] },
      personal: { status: "saved", rating: null, note: "" },
    };
    const firstPageRows = [
      { threadId: "1", thread: { title: "Pinned", tags: [], prefixes: [] }, personal: { status: "saved", pinned: true, rating: null, note: "" } },
      current,
    ];
    const secondPageRows = [
      current,
      { threadId: "3", thread: { title: "Other", tags: [], prefixes: [] }, personal: { status: "saved", rating: null, note: "" } },
    ];
    const requests = [];
    const api = {
      getEntry: async () => current,
      countChangedEntries: async () => ({ ok: true, count: 0 }),
      queryEntriesPage: async (request) => {
        requests.push(request);
        return {
          rows: request.page === 1 ? firstPageRows : secondPageRows,
          nextCursor: request.page === 1 ? "page-two" : null,
          hasNext: request.page === 1,
          totalRows: 3,
          mode: "keyset",
        };
      },
    };
    const state = createInitialState();
    state.liveThreadId = "2";
    state.pageSize = 3;
    const root = sandbox.document.createElement("div");
    root.innerHTML = `
      <div id="f95ue-library-rows-status"></div>
      <span data-role="updatesCount"></span>
      <table><tbody data-role="rows"></tbody></table>
      <button data-action="prev"></button><span data-role="pageInfo"></span><button data-action="next"></button>`;
    sandbox.document.body.appendChild(root);
    try {
      await reloadRows(root, state, api, {}, "f95ue-library-rows-status");
      assert.strictEqual(requests[0].limit, 2);
      assert.deepStrictEqual(state.rows.map((row) => row.threadId), ["2", "1"]);
      assert.strictEqual(state.priorityThreadId, "2");

      state.page = 2;
      state.pageCursors[1] = "page-two";
      await reloadRows(root, state, api, {}, "f95ue-library-rows-status");
      assert.strictEqual(requests[1].limit, 3);
      assert.deepStrictEqual(state.rows.map((row) => row.threadId), ["3"]);

      state.page = 1;
      state.status = "playing";
      await reloadRows(root, state, api, {}, "f95ue-library-rows-status");
      assert.strictEqual(requests[2].limit, 3);
      assert.strictEqual(state.priorityThreadId, "");
      assert.deepStrictEqual(state.rows.map((row) => row.threadId), ["1", "2"]);
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
    const activity = new Map();
    let reads = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        const storeName = payload.storeName || "records";
        if (action === "idb.get") {
          if (storeName === "activity") {
            return { ok: true, value: activity.get(String(payload.key)) || null };
          }
          reads += 1;
          return { ok: true, value: records.get(String(payload.key)) || null };
        }
        if (action === "idb.put") {
          if (storeName === "activity") {
            activity.set(String(payload.value.id), payload.value);
            return { ok: true, value: payload.value };
          }
          records.set(String(payload.value.threadId), payload.value);
          return { ok: true, value: payload.value };
        }
        if (action === "idb.delete") {
          if (storeName === "activity") {
            activity.delete(String(payload.key));
            return { ok: true };
          }
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

    const patched = await library.setPersonalStatus("1", "playing", {
      commandId: "cache-status",
    });
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
