"use strict";

module.exports = function registerLatestFiltersSurpriseGroup(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  runTest("LATEST-FILTERS-SURPRISE-01 applies deterministic preference weights with excluded precedence", () => {
    const {
      createSurpriseTagCandidates,
      selectSurpriseTags,
    } = loadModule(
      "addons/latest-filters-addon/src/domain/surpriseTags.js",
    );
    const prefs = {
      tags: [
        { id: 1, name: "Preferred" },
        { id: 2, name: "Normal" },
        { id: 3, name: "Excluded" },
        { id: 4, name: "Both" },
      ],
      preferredTags: [1, 4],
      excludedTags: [3, 4],
      markedTags: [2],
    };
    assert.deepStrictEqual(
      createSurpriseTagCandidates(prefs).map(({ id, weight }) => [id, weight]),
      [[1, 4], [2, 1], [3, 0.25], [4, 0.25]],
    );
    assert.strictEqual(
      selectSurpriseTags(prefs, {
        minCount: 1,
        maxCount: 1,
        rng: () => 0,
      }).tags[0].id,
      1,
    );
    assert.strictEqual(
      selectSurpriseTags(prefs, {
        minCount: 1,
        maxCount: 1,
        rng: () => 0.8,
      }).tags[0].id,
      2,
    );
    assert.strictEqual(
      selectSurpriseTags(prefs, {
        minCount: 1,
        maxCount: 1,
        rng: () => 0.93,
      }).tags[0].id,
      3,
    );
    assert.strictEqual(
      selectSurpriseTags(prefs, {
        minCount: 1,
        maxCount: 1,
        rng: () => 0.99,
      }).tags[0].id,
      4,
    );
  });

  runTest("LATEST-FILTERS-SURPRISE-01 gives equal-weight candidates deterministic equal ranges", () => {
    const { selectSurpriseTags } = loadModule(
      "addons/latest-filters-addon/src/domain/surpriseTags.js",
    );
    const prefs = {
      tags: [
        { id: 1, name: "One" },
        { id: 2, name: "Two" },
        { id: 3, name: "Three" },
      ],
    };
    const pick = (value) =>
      selectSurpriseTags(prefs, {
        minCount: 1,
        maxCount: 1,
        rng: () => value,
      }).tags[0].id;
    assert.deepStrictEqual(
      [pick(0), pick(0.34), pick(1 - Number.EPSILON)],
      [1, 2, 3],
    );
  });

  runTest("LATEST-FILTERS-SURPRISE-01 samples one to three unique valid tags with safe RNG bounds", () => {
    const { selectSurpriseTags } = loadModule(
      "addons/latest-filters-addon/src/domain/surpriseTags.js",
    );
    const tags = [
      { id: 1, name: "One" },
      { id: 1, name: "Duplicate" },
      { id: 2, name: "Two" },
      { id: 3, name: "Three" },
      { id: 4, name: "" },
      { id: "bad", name: "Bad" },
    ];
    const high = selectSurpriseTags(
      { tags },
      { rng: () => 1 },
    );
    assert.strictEqual(high.ok, true);
    assert.strictEqual(high.tags.length, 3);
    assert.strictEqual(new Set(high.tags.map(({ id }) => id)).size, 3);
    const invalid = selectSurpriseTags(
      { tags },
      { rng: () => Number.NaN },
    );
    assert.strictEqual(invalid.tags.length, 1);
    const clamped = selectSurpriseTags(
      { tags: [{ id: 1, name: "Only" }] },
      { minCount: 3, maxCount: 30, rng: () => 0.5 },
    );
    assert.strictEqual(clamped.tags.length, 1);
    assert.deepStrictEqual(
      selectSurpriseTags({ tags: [] }),
      { ok: false, reason: "tag_catalog_unavailable", tags: [] },
    );
  });

  runTest("LATEST-FILTERS-SURPRISE-01 replaces tags, resolves exclusions, and preserves sibling route state", () => {
    const { applySurpriseTags } = loadModule(
      "addons/latest-filters-addon/src/domain/filterRoute.js",
    );
    const result = applySurpriseTags(
      "https://f95zone.to/sam/latest_alpha/?rows=30#/cat=games/page=4/tags=9/notags=2,3,8/prefixes=1/search=x/creator=y/sort=likes/date=14/tagtype=or/custom=z",
      [2, 5],
    );
    assert.strictEqual(result.changed, true);
    assert.strictEqual(new URL(result.url).search, "?rows=30");
    assert.strictEqual(
      new URL(result.url).hash,
      "#/cat=games/tags=2,5/notags=3,8/prefixes=1/search=x/creator=y/sort=likes/date=14/tagtype=or/custom=z",
    );
    assert.strictEqual(
      applySurpriseTags(
        "https://f95zone.to/sam/latest_alpha/#/cat=games/tags=2,5",
        [2, 5],
      ).changed,
      false,
    );
  });

  runTest("LATEST-FILTERS-SURPRISE-01 uses the owned root binding and removes it on cleanup", () => {
    const sandbox = createDomSandbox();
    try {
      sandbox.document.body.innerHTML =
        '<div id="root"><button data-action="surprise">Surprise Me</button></div>';
      const { createLatestFiltersBindings } = loadModule(
        "addons/latest-filters-addon/src/ui/bindings.js",
      );
      let calls = 0;
      const rootEl = sandbox.document.querySelector("#root");
      const cleanup = createLatestFiltersBindings({
        rootEl,
        onSurprise: () => {
          calls += 1;
        },
      });
      rootEl.querySelector("button").click();
      assert.strictEqual(calls, 1);
      cleanup();
      rootEl.querySelector("button").click();
      assert.strictEqual(calls, 1);
    } finally {
      sandbox.restore();
    }
  });

  runTest("LATEST-FILTERS-SURPRISE-01 navigates without preset or settings writes and reports missing catalogs", () => {
    const sandbox = createDomSandbox(
      "https://f95zone.to/sam/latest_alpha/#/cat=games/page=2/notags=1",
    );
    try {
      const { createSurpriseController } = loadModule(
        "addons/latest-filters-addon/src/app/surpriseController.js",
      );
      let writes = 0;
      let applied = null;
      let unavailable = "";
      const controller = createSurpriseController({
        getTagPrefs: () => ({
          tags: [{ id: 1, name: "One" }, { id: 2, name: "Two" }],
        }),
        isAvailable: () => true,
        applyMutation: (mutation) => {
          applied = mutation;
        },
        onUnavailable: (reason) => {
          unavailable = reason;
        },
        rng: () => 0,
      });
      const result = controller.run();
      assert.strictEqual(result.ok, true);
      assert.strictEqual(applied.changed, true);
      assert.strictEqual(writes, 0);

      const empty = createSurpriseController({
        getTagPrefs: () => ({ tags: [] }),
        isAvailable: () => true,
        applyMutation: () => {
          writes += 1;
        },
        onUnavailable: (reason) => {
          unavailable = reason;
        },
      }).run();
      assert.strictEqual(empty.ok, false);
      assert.strictEqual(unavailable, "tag_catalog_unavailable");
      assert.strictEqual(writes, 0);
    } finally {
      sandbox.restore();
    }
  });
};
