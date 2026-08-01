"use strict";

module.exports = function registerThreadUtilityQuickSearch(context) {
  const { assert, loadModule, runTest } = context;

  function quickSearchModule() {
    return loadModule(
      "addons/thread-utility-addon/src/domain/utilities/quickSearch.js",
    );
  }

  function snapshot() {
    return {
      threadId: "42",
      url: "https://f95zone.to/threads/game-name.42/",
      title: "Game Name [v1.0] [Studio]",
      canonicalTitle: "Game Name",
      starter: { postId: "99" },
      sectionSources: { contentRootToken: "starter:1" },
    };
  }

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 preserves all six reference defaults", () => {
    const { DEFAULT_QUICK_SEARCHES } = quickSearchModule();
    assert.deepStrictEqual(
      DEFAULT_QUICK_SEARCHES.map(({ id, label, query, includeTitle }) => ({
        id,
        label,
        query,
        includeTitle,
      })),
      [
        { id: "update", label: "Update", query: "Update", includeTitle: true },
        { id: "new-compressed", label: "New+Compressed", query: "Compressed", includeTitle: true },
        { id: "compressed", label: "Compressed", query: "Compressed", includeTitle: false },
        { id: "walkthrough", label: "Walkthrough", query: "Walkthrough", includeTitle: true },
        { id: "mod", label: "Mod", query: "Mod", includeTitle: false },
        { id: "cheats", label: "Cheats", query: "Cheats", includeTitle: true },
      ],
    );
  });

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 builds encoded thread and global URLs", () => {
    const { buildQuickSearchUrl, buildSearchTerm } = quickSearchModule();
    const definition = {
      query: "Update & compressed",
      includeTitle: true,
    };
    assert.strictEqual(
      buildSearchTerm(definition, snapshot()),
      "Game Name Update & compressed",
    );
    const threadUrl = buildQuickSearchUrl({
      definition,
      snapshot: snapshot(),
      scope: "thread",
    });
    assert.strictEqual(threadUrl.origin, "https://f95zone.to");
    assert.strictEqual(threadUrl.pathname, "/search/1/");
    assert.strictEqual(threadUrl.searchParams.get("q"), "Game Name Update & compressed");
    assert.strictEqual(threadUrl.searchParams.get("t"), "post");
    assert.strictEqual(threadUrl.searchParams.get("o"), "relevance");
    assert.strictEqual(threadUrl.searchParams.get("c[thread]"), "42");

    const globalUrl = buildQuickSearchUrl({
      definition: { query: "Mod", includeTitle: false },
      snapshot: snapshot(),
      scope: "global",
    });
    assert.strictEqual(globalUrl.searchParams.get("q"), "Mod");
    assert.strictEqual(globalUrl.searchParams.has("c[thread]"), false);
  });

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 normalizes invalid persisted definitions", () => {
    const {
      DEFAULT_QUICK_SEARCHES,
      normalizeQuickSearches,
      QUICK_SEARCH_LIMIT,
    } = quickSearchModule();
    const oversized = "x".repeat(200);
    const definitions = normalizeQuickSearches([
      { id: "same", label: " Second ", query: oversized, includeTitle: true, order: 2 },
      { id: "same", label: "First", query: "One", enabled: false, order: 1 },
      { id: "???", label: "Third", query: "Three", order: 3 },
      { id: "empty", label: "", query: "skip", order: 0 },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `extra-${index}`,
        label: `Extra ${index}`,
        query: `Query ${index}`,
        order: index + 4,
      })),
    ]);
    assert.ok(definitions.length <= QUICK_SEARCH_LIMIT);
    assert.deepStrictEqual(definitions.slice(0, 3).map(({ id, order }) => ({ id, order })), [
      { id: "same-2", order: 0 },
      { id: "same", order: 1 },
      { id: "utility-3", order: 2 },
    ]);
    assert.strictEqual(definitions[1].query.length, 120);
    assert.strictEqual(definitions[0].enabled, false);
    assert.deepStrictEqual(normalizeQuickSearches([]), DEFAULT_QUICK_SEARCHES);
  });

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 registry orders families and rejects duplicates", async () => {
    const { createUtilityRegistry } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/registry.js",
    );
    const { registerQuickSearchUtilities } = quickSearchModule();
    const registry = createUtilityRegistry();
    const calls = [];
    registry.register({
      id: "fixed",
      family: "fixed",
      label: "Fixed",
      execute: () => ({ ok: true }),
    });
    registerQuickSearchUtilities(
      registry,
      [
        { id: "one", label: "One", enabled: true },
        { id: "off", label: "Off", enabled: false },
        { id: "two", label: "Two", enabled: true },
      ],
      (definition) => {
        calls.push(definition.id);
        return { ok: true };
      },
    );
    assert.deepStrictEqual(
      registry.list().map(({ id, family }) => ({ id, family })),
      [
        { id: "fixed", family: "fixed" },
        { id: "search:one", family: "quick-search" },
        { id: "search:two", family: "quick-search" },
      ],
    );
    assert.throws(
      () => registry.register({ id: "fixed", execute: () => {} }),
      /duplicate_utility_id:fixed/,
    );
    assert.deepStrictEqual(await registry.execute("search:two"), { ok: true });
    assert.deepStrictEqual(calls, ["two"]);
  });

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 supports current and new-tab navigation", async () => {
    const { createUtilityController } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/controller.js",
    );
    const { createUtilityRegistry } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/registry.js",
    );
    const settings = {
      searchScope: "thread",
      openSearchesInNewTab: true,
    };
    const navigation = [];
    const windowObject = {
      open: (...args) => navigation.push({ kind: "open", args }),
      location: {
        assign: (url) => navigation.push({ kind: "assign", url }),
      },
    };
    const controller = createUtilityController({
      core: { invokeCoreAction: async () => ({ ok: true }) },
      registry: createUtilityRegistry(),
      quickSearches: [
        {
          id: "update",
          label: "Update",
          query: "Update",
          includeTitle: true,
          enabled: true,
        },
      ],
      getSettings: () => settings,
      getActionContext: () => ({
        snapshot: snapshot(),
        isCurrent: () => true,
      }),
      windowObject,
      navigatorObject: {},
      documentObject: {},
    });
    const newTab = await controller.execute("search:update");
    assert.strictEqual(newTab.ok, true);
    assert.strictEqual(navigation[0].kind, "open");
    assert.deepStrictEqual(navigation[0].args.slice(1), ["_blank", "noopener"]);

    settings.openSearchesInNewTab = false;
    settings.searchScope = "global";
    const currentTab = await controller.execute("search:update");
    assert.strictEqual(currentTab.ok, true);
    assert.strictEqual(navigation[1].kind, "assign");
    assert.strictEqual(new URL(navigation[1].url).searchParams.has("c[thread]"), false);
  });

  runTest("THREAD-UTILITY-QUICK-SEARCH-01 fixed actions consume only the current snapshot", async () => {
    const { createUtilityController } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/controller.js",
    );
    const { createUtilityRegistry } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/registry.js",
    );
    const copied = [];
    const navigation = [];
    let current = true;
    const currentSnapshot = snapshot();
    const controller = createUtilityController({
      core: { invokeCoreAction: async () => ({ ok: true }) },
      registry: createUtilityRegistry(),
      quickSearches: [],
      getSettings: () => ({
        searchScope: "thread",
        openSearchesInNewTab: false,
      }),
      getActionContext: () => ({
        snapshot: currentSnapshot,
        isCurrent: () => current,
      }),
      navigatorObject: {
        clipboard: {
          writeText: async (value) => {
            copied.push(value);
          },
        },
      },
      documentObject: {},
      windowObject: {
        location: { assign: (url) => navigation.push(url) },
      },
    });

    assert.strictEqual((await controller.execute("copy-thread-link")).ok, true);
    assert.strictEqual((await controller.execute("copy-title")).ok, true);
    assert.deepStrictEqual(copied, [
      currentSnapshot.url,
      currentSnapshot.title,
    ]);
    assert.deepStrictEqual(navigation, []);

    current = false;
    assert.deepStrictEqual(
      await controller.execute("copy-title"),
      { ok: false, reason: "stale_generation" },
    );
    assert.strictEqual(copied.length, 2);
  });
};
