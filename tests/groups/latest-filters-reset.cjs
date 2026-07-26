"use strict";

module.exports = function registerLatestFiltersResetGroup(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  runTest("LATEST-FILTERS-RESET-01 removes included or excluded tags without touching sibling filters", () => {
    const sandbox = createDomSandbox(
      "https://f95zone.to/sam/latest_alpha/?rows=30#/cat=games/page=4/tags=1,2/notags=3/search=hello%20world/sort=likes/custom=value",
    );
    try {
      const { resetTagFilter } = loadModule(
        "addons/latest-filters-addon/src/domain/filterRoute.js",
      );
      const included = resetTagFilter(location.href, "tags", location.origin);
      assert.strictEqual(included.changed, true);
      assert.strictEqual(
        new URL(included.url).hash,
        "#/cat=games/notags=3/search=hello%20world/sort=likes/custom=value",
      );
      assert.strictEqual(new URL(included.url).search, "?rows=30");

      const excluded = resetTagFilter(location.href, "notags", location.origin);
      assert.strictEqual(excluded.changed, true);
      assert.strictEqual(
        new URL(excluded.url).hash,
        "#/cat=games/tags=1,2/search=hello%20world/sort=likes/custom=value",
      );
      const noOp = resetTagFilter(
        "https://f95zone.to/sam/latest_alpha/#/cat=games/page=4",
        "tags",
      );
      assert.strictEqual(noOp.changed, false);
      assert.match(noOp.url, /page=4/);
    } finally {
      sandbox.restore();
    }
  });

  runTest("LATEST-FILTERS-RESET-01 removes one dynamic prefix group from both prefix directions", () => {
    const { resetPrefixGroup } = loadModule(
      "addons/latest-filters-addon/src/domain/filterRoute.js",
    );
    const result = resetPrefixGroup(
      "https://f95zone.to/sam/latest_alpha/#/cat=games/page=9/prefixes=1,2,30/noprefixes=3,4,31/tagtype=or/creator=Some%20Dev",
      ["1", "3", "999"],
    );
    assert.strictEqual(result.changed, true);
    assert.strictEqual(
      new URL(result.url).hash,
      "#/cat=games/prefixes=2,30/noprefixes=4,31/tagtype=or/creator=Some%20Dev",
    );
    const removesEmptySegments = resetPrefixGroup(
      "https://f95zone.to/sam/latest_alpha/#/page=2/prefixes=1/noprefixes=3/date=14",
      ["1", "3"],
    );
    assert.strictEqual(
      new URL(removesEmptySegments.url).hash,
      "#/date=14",
    );
  });

  runTest("LATEST-FILTERS-RESET-01 reconciles dynamic controls idempotently and owns cleanup", () => {
    const sandbox = createDomSandbox();
    try {
      sandbox.document.body.innerHTML = `
        <div id="filter-block_tags"></div>
        <div id="filter-block_tags_exclude"></div>
        <div id="filter-block_prefixes">
          <div class="filter-block_prefix-group" id="group-a">
            <div class="filter-block_content">
              <input data-prefix="1"><input data-prefix="2">
            </div>
          </div>
          <div class="filter-block_prefix-group" id="group-b">
            <div class="filter-block_content"><input data-prefix="30"></div>
          </div>
        </div>
      `;
      const { createFilterResetControls } = loadModule(
        "addons/latest-filters-addon/src/ui/filterResetControls.js",
      );
      const resets = [];
      const controls = createFilterResetControls({
        onReset: (value) => resets.push(value),
      });
      assert.deepStrictEqual(controls.reconcile(), { added: 4, total: 4 });
      assert.deepStrictEqual(controls.reconcile(), { added: 0, total: 4 });

      sandbox.document
        .querySelector("#group-a [data-f95ue-lf-reset]")
        .click();
      assert.deepStrictEqual(resets, [
        { kind: "prefix-group", prefixIds: ["1", "2"] },
      ]);

      sandbox.document.querySelector("#filter-block_prefixes").innerHTML = `
        <div class="filter-block_prefix-group" id="group-c">
          <div class="filter-block_content"><input data-prefix="47"></div>
        </div>
      `;
      assert.deepStrictEqual(controls.reconcile(), { added: 1, total: 3 });
      sandbox.document
        .querySelector("#filter-block_tags [data-f95ue-lf-reset]")
        .click();
      assert.deepStrictEqual(resets.at(-1), { kind: "tags", prefixIds: [] });

      controls.destroy();
      assert.strictEqual(
        sandbox.document.querySelectorAll("[data-f95ue-lf-reset]").length,
        0,
      );
      sandbox.document
        .querySelector("#filter-block_tags")
        .appendChild(sandbox.document.createElement("button"))
        .click();
      assert.strictEqual(resets.length, 2);
    } finally {
      sandbox.restore();
    }
  });

  runTest("Latest Filters builds one reusable tag index per preference load", () => {
    const sandbox = createDomSandbox();
    try {
      const { createTagRenderConfig, renderPanelContent } = loadModule(
        "addons/latest-filters-addon/src/ui/renderer.js",
        { loader: { ".css": "text", ".html": "text" } },
      );
      const tags = Array.from({ length: 10000 }, (_, index) => ({
        id: index + 1,
        name: `Tag ${index + 1}`,
      }));
      const tagRenderConfig = createTagRenderConfig({
        tags,
        preferredTags: [1],
        excludedTags: [2],
        markedTags: [3],
        color: {},
      });
      assert.strictEqual(tagRenderConfig.byId.size, 10000);
      assert.strictEqual(tagRenderConfig.preferred.has(1), true);
      assert.strictEqual(tagRenderConfig.excluded.has(2), true);

      sandbox.document.body.innerHTML =
        '<div id="panel"><div data-role="current"></div><div data-role="results"></div></div>';
      const root = sandbox.document.querySelector("#panel");
      const tagPrefs = {};
      Object.defineProperty(tagPrefs, "tags", {
        get() {
          throw new Error("tag preferences were traversed again");
        },
      });
      const presets = Array.from({ length: 50 }, (_, index) => ({
        id: `preset-${index}`,
        name: `Preset ${index}`,
        searchText: `preset ${index}`,
        summary: "tags",
        summaryParts: [{ key: "tags", label: "tags", values: ["1", "2"] }],
      }));
      const args = {
        currentPresetName: null,
        currentSummary: "tags",
        currentSummaryParts: [
          { key: "tags", label: "tags", values: ["1", "3"] },
        ],
        presets,
        searchQuery: "",
        currentPresetId: null,
        tagPrefs,
        tagRenderConfig,
      };
      renderPanelContent(root, args);
      renderPanelContent(root, args);
      assert.strictEqual(
        root.querySelectorAll(".f95ue-lf-row").length,
        50,
      );
      assert.match(root.textContent, /Tag 1/);
      assert.match(root.innerHTML, /data-state="preferred"/);
    } finally {
      sandbox.restore();
    }
  });
};
