"use strict";

module.exports = function registerLibraryRatingUiGroup(context) {
  const { assert, createFakeClock, loadModule, runTest, Window } = context;

  runTest("LIBRARY-RATING-UI-01 normalizes typed pasted arrow and blank ratings", () => {
    const { normalizePersonalRatingInput } = loadModule(
      "addons/library-addon/src/library/recordModel.js",
    );
    assert.strictEqual(normalizePersonalRatingInput(""), null);
    assert.strictEqual(normalizePersonalRatingInput("not-a-number"), null);
    assert.strictEqual(normalizePersonalRatingInput("-2"), 0);
    assert.strictEqual(normalizePersonalRatingInput("8"), 5);
    assert.strictEqual(normalizePersonalRatingInput("3.24"), 3);
    assert.strictEqual(normalizePersonalRatingInput("3.25"), 3.5);
    assert.strictEqual(normalizePersonalRatingInput(4.5), 4.5);
  });

  runTest("LIBRARY-RATING-UI-01 renders My Rating from personal state", () => {
    const window = new Window();
    const { renderRows } = loadModule(
      "addons/library-addon/src/ui/components/manager/tableRenderer.js",
    );
    const tbody = window.document.createElement("tbody");
    renderRows(
      tbody,
      [{
        threadId: "42",
        thread: {
          title: "Rating fixture",
          url: "#",
          prefixes: [],
          tags: [],
          threadRating: 1.5,
        },
        personal: { status: "saved", rating: 4.5, note: "" },
        recordModifiedAt: 1,
      }],
      new Set(),
      {
        openStatusMenuId: "",
        openRowMenuId: "",
        ratingCommittedById: new Map(),
        ratingDraftById: new Map(),
      },
    );
    const input = tbody.querySelector('input[data-action="rating-input"]');
    assert.ok(input);
    assert.strictEqual(input.value, "4.5");
    assert.doesNotMatch(tbody.innerHTML, />1\.5</);
  });

  runTest("LIBRARY-RATING-UI-01 serializes rapid commits and latest rating wins", async () => {
    const clock = createFakeClock();
    const previousWindow = global.window;
    global.window = clock;
    try {
      const { createRatingHandlers } = loadModule(
        "addons/library-addon/src/ui/manager/handlers/ratingHandlers.js",
      );
      const writes = [];
      const state = {
        ratingDraftById: new Map([["42", 1]]),
        ratingCommittedById: new Map([["42", 1]]),
        ratingSaveTimers: new Map(),
        ratingCommitChains: new Map(),
        ratingRevisionById: new Map(),
        ratingGeneration: 0,
      };
      const handlers = createRatingHandlers({
        api: {
          getEntry: async () => ({
            threadId: "42",
            thread: { threadRating: 4.8 },
            personal: { rating: writes.at(-1) ?? 1 },
          }),
          applyPersonalActivity: async (_id, patch) => {
            writes.push(patch.rating);
            return { ok: true };
          },
        },
        notifyMutated() {},
        reloadRows: async () => {},
        state,
      });
      await handlers["rating-input"]("42", "2.1");
      const first = handlers["rating-commit"]("42");
      await handlers["rating-input"]("42", "4.6");
      const second = handlers["rating-commit"]("42");
      await Promise.all([first, second]);
      assert.deepStrictEqual(writes, [2, 4.5]);
      assert.strictEqual(state.ratingCommittedById.get("42"), 4.5);
    } finally {
      global.window = previousWindow;
    }
  });

  runTest("LIBRARY-RATING-UI-01 cancellation suppresses stale writes", async () => {
    const clock = createFakeClock();
    const previousWindow = global.window;
    global.window = clock;
    try {
      const { cancelRatingWork, createRatingHandlers } = loadModule(
        "addons/library-addon/src/ui/manager/handlers/ratingHandlers.js",
      );
      let resolveRead;
      let writes = 0;
      const state = {
        ratingDraftById: new Map([["42", 3]]),
        ratingCommittedById: new Map([["42", 2]]),
        ratingSaveTimers: new Map(),
        ratingCommitChains: new Map(),
        ratingRevisionById: new Map([["42", 1]]),
        ratingGeneration: 0,
      };
      const handlers = createRatingHandlers({
        api: {
          getEntry: () => new Promise((resolve) => { resolveRead = resolve; }),
          applyPersonalActivity: async () => { writes += 1; return { ok: true }; },
        },
        notifyMutated() {},
        reloadRows: async () => {},
        state,
      });
      const pending = handlers["rating-commit"]("42");
      await Promise.resolve();
      cancelRatingWork(state);
      resolveRead({ threadId: "42", thread: { threadRating: 5 }, personal: { rating: 2 } });
      const result = await pending;
      assert.strictEqual(result.reason, "cancelled");
      assert.strictEqual(writes, 0);
    } finally {
      global.window = previousWindow;
    }
  });

  runTest("LIBRARY-RATING-UI-01 restores committed rating after failure without thread facts", async () => {
    const clock = createFakeClock();
    const previousWindow = global.window;
    global.window = clock;
    try {
      const { createRatingHandlers } = loadModule(
        "addons/library-addon/src/ui/manager/handlers/ratingHandlers.js",
      );
      let receivedPatch = null;
      const state = {
        ratingDraftById: new Map([["42", 4]]),
        ratingCommittedById: new Map([["42", 2.5]]),
        ratingSaveTimers: new Map(),
        ratingCommitChains: new Map(),
        ratingRevisionById: new Map([["42", 1]]),
        ratingGeneration: 0,
      };
      const handlers = createRatingHandlers({
        api: {
          getEntry: async () => ({
            threadId: "42",
            thread: { threadRating: 4.9 },
            personal: { rating: 2.5 },
          }),
          applyPersonalActivity: async (_id, patch) => {
            receivedPatch = patch;
            return { ok: false, reason: "fixture_failure" };
          },
        },
        notifyMutated() {},
        reloadRows: async () => {},
        state,
      });
      const result = await handlers["rating-commit"]("42");
      assert.strictEqual(result.reason, "fixture_failure");
      assert.deepStrictEqual(receivedPatch, { rating: 4 });
      assert.strictEqual(state.ratingDraftById.get("42"), 2.5);
      assert.ok(!Object.hasOwn(receivedPatch, "thread"));
    } finally {
      global.window = previousWindow;
    }
  });

  runTest("LIBRARY-RATING-UI-01 rating sorting and search use personal rating", () => {
    const { sortLibraryRecords } = loadModule(
      "addons/library-addon/src/library/querying.js",
    );
    const { matchesSearchTokens, parseSearchQuery } = loadModule(
      "addons/library-addon/src/ui/utils/searchTokens.js",
    );
    const rows = [
      { threadId: "a", personal: { rating: 1 }, thread: { threadRating: 5 } },
      { threadId: "b", personal: { rating: 4.5 }, thread: { threadRating: 1 } },
    ];
    assert.deepStrictEqual(
      sortLibraryRecords(rows, "rating", "desc").map(({ threadId }) => threadId),
      ["b", "a"],
    );
    assert.strictEqual(matchesSearchTokens(rows[1], parseSearchQuery("score>=4").tokens), true);
    assert.strictEqual(matchesSearchTokens(rows[0], parseSearchQuery("score>=4").tokens), false);
  });
};
