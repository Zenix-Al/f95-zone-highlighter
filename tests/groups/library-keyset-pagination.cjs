"use strict";

module.exports = function registerLibraryKeysetPaginationGroup(context) {
  const { assert, loadModule, runTest } = context;

  function createCursorSource(entries) {
    return {
      openCursor(_range, direction) {
        const ordered = direction === "prev" ? [...entries].reverse() : [...entries];
        const request = { result: null, error: null, onsuccess: null, onerror: null };
        let index = 0;
        const advance = () => {
          const entry = ordered[index];
          request.result = entry
            ? {
                key: entry.key,
                primaryKey: entry.primaryKey,
                value: entry.value,
                continue() {
                  index += 1;
                  queueMicrotask(advance);
                },
              }
            : null;
          request.onsuccess?.();
        };
        queueMicrotask(advance);
        return request;
      },
    };
  }

  runTest("Library keyset core query preserves legacy arrays and emits stable cursors", async () => {
    const { readCursorPage } = loadModule("src/services/addons/idbStore.js");
    const entries = [
      { key: 1, primaryKey: "a", value: { threadId: "a" } },
      { key: 1, primaryKey: "b", value: { threadId: "b" } },
      { key: 2, primaryKey: "c", value: { threadId: "c" } },
      { key: 3, primaryKey: "d", value: { threadId: "d" } },
    ];
    const source = createCursorSource(entries);
    const legacy = await readCursorPage(source, { limit: 2 });
    assert.deepStrictEqual(legacy.map(({ threadId }) => threadId), ["a", "b"]);

    const first = await readCursorPage(createCursorSource(entries), {
      keysetMode: true,
      includeCursor: true,
      limit: 2,
    });
    assert.deepStrictEqual(
      first.items.map(({ value }) => value.threadId),
      ["a", "b"],
    );
    assert.deepStrictEqual(first.nextCursor, { key: 1, primaryKey: "b" });
    assert.strictEqual(first.hasMore, true);

    const second = await readCursorPage(createCursorSource(entries), {
      keysetMode: true,
      includeCursor: true,
      boundary: first.nextCursor,
      limit: 2,
    });
    assert.deepStrictEqual(
      second.items.map(({ value }) => value.threadId),
      ["c", "d"],
    );
    assert.strictEqual(second.hasMore, false);
  });

  runTest("Library keyset service bounded-scans filters and resumes after last visible row", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const pages = [
      {
        items: [
          { cursor: { key: 5, primaryKey: "a" }, value: { threadId: "a", personal: { status: "saved" }, recordModifiedAt: 5 } },
          { cursor: { key: 4, primaryKey: "b" }, value: { threadId: "b", personal: { status: "playing" }, recordModifiedAt: 4 } },
          { cursor: { key: 3, primaryKey: "c" }, value: { threadId: "c", personal: { status: "playing" }, recordModifiedAt: 3 } },
        ],
        nextCursor: { key: 3, primaryKey: "c" },
        hasMore: true,
      },
      {
        items: [
          { cursor: { key: 2, primaryKey: "d" }, value: { threadId: "d", personal: { status: "playing" }, recordModifiedAt: 2 } },
        ],
        nextCursor: { key: 2, primaryKey: "d" },
        hasMore: false,
      },
    ];
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action === "idb.count") {
          return { ok: true, value: payload.index ? 4 : 4 };
        }
        if (action === "idb.query") return { ok: true, value: pages.shift() };
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {});
    const result = await library.queryEntriesPage({
      status: "playing",
      sortBy: "updatedAt",
      sortDir: "desc",
      limit: 2,
    });
    assert.deepStrictEqual(result.rows.map(({ threadId }) => threadId), ["b", "c"]);
    assert.deepStrictEqual(result.nextCursor, { key: 3, primaryKey: "c" });
    assert.strictEqual(result.hasNext, true);
    assert.strictEqual(result.mode, "keyset");
  });

  runTest("Library falls back when legacy records are absent from the keyset index", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const records = Array.from({ length: 49 }, (_, index) => ({
      threadId: String(index + 1),
      title: `Legacy ${index + 1}`,
      updatedAt: index + 1,
    }));
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action === "idb.count") {
          return { ok: true, value: payload.index ? 2 : records.length };
        }
        if (action === "idb.query") {
          const offset = Number(payload.offset || 0);
          const limit = Number(payload.limit || records.length);
          return { ok: true, value: records.slice(offset, offset + limit) };
        }
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {});
    const first = await library.queryEntriesPage({
      sortBy: "updatedAt",
      sortDir: "desc",
      limit: 20,
      page: 1,
    });
    const second = await library.queryEntriesPage({
      sortBy: "updatedAt",
      sortDir: "desc",
      limit: 20,
      page: 2,
    });
    assert.strictEqual(first.rows.length, 20);
    assert.strictEqual(first.hasNext, true);
    assert.strictEqual(first.totalRows, 49);
    assert.strictEqual(first.mode, "incomplete-index-fallback");
    assert.strictEqual(second.rows.length, 20);
    assert.notStrictEqual(first.rows[0].threadId, second.rows[0].threadId);
  });

  runTest("Library keyset navigation resets and maintains cursor history", async () => {
    const { createNavigationHandlers } = loadModule(
      "addons/library-addon/src/ui/manager/handlers/navigationHandlers.js",
    );
    const { resetPagination } = loadModule(
      "addons/library-addon/src/ui/manager/state.js",
    );
    let reloads = 0;
    const state = {
      page: 1,
      pageCursors: [null],
      nextCursor: { key: 10, primaryKey: "x" },
      hasNextPage: true,
      paginationMode: "keyset",
    };
    const handlers = createNavigationHandlers({
      state,
      reloadRows: async () => { reloads += 1; },
    });
    await handlers.next();
    assert.strictEqual(state.page, 2);
    assert.deepStrictEqual(state.pageCursors[1], { key: 10, primaryKey: "x" });
    await handlers.prev();
    assert.strictEqual(state.page, 1);
    assert.deepStrictEqual(state.pageCursors, [null]);
    resetPagination(state);
    assert.strictEqual(state.page, 1);
    assert.strictEqual(state.hasNextPage, false);
    assert.strictEqual(reloads, 2);
  });

  runTest("Library sorting keeps pinned records first in both directions", () => {
    const { getSortConfig, sortLibraryRecords } = loadModule(
      "addons/library-addon/src/library/querying.js",
    );
    const records = [
      {
        threadId: "new-unpinned",
        personal: { pinned: false },
        recordModifiedAt: 30,
      },
      {
        threadId: "old-pinned",
        personal: { pinned: true },
        recordModifiedAt: 10,
      },
      {
        threadId: "new-pinned",
        personal: { pinned: true },
        recordModifiedAt: 20,
      },
    ];
    assert.deepStrictEqual(
      sortLibraryRecords(records, "updatedAt", "desc").map(({ threadId }) => threadId),
      ["new-pinned", "old-pinned", "new-unpinned"],
    );
    assert.deepStrictEqual(
      sortLibraryRecords(records, "updatedAt", "asc").map(({ threadId }) => threadId),
      ["old-pinned", "new-pinned", "new-unpinned"],
    );
    assert.deepStrictEqual(getSortConfig("updatedAt", "desc"), {
      index: "pinnedUpdatedDesc",
      direction: "prev",
    });
    assert.deepStrictEqual(getSortConfig("updatedAt", "asc"), {
      index: "pinnedUpdatedAsc",
      direction: "next",
    });
  });
};
