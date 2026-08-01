module.exports = function registerGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest, Window } = context;
  const performanceAudit = require("../../scripts/core-runtime-performance-audit.cjs");

  function readBaseline() {
    return JSON.parse(fs.readFileSync(
      path.join(ROOT, "docs/architecture/core-runtime-performance-baseline.json"),
      "utf8",
    ));
  }

  runTest("MODAL-CSS-BASELINE-01 report is deterministic and machine-neutral", () => {
    const first = readBaseline();
    const second = JSON.parse(JSON.stringify(first));
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.deterministic.timestamps, false);
    assert.strictEqual(first.deterministic.absolutePaths, false);
    assert.strictEqual(JSON.stringify(first).includes(ROOT.replace(/\\/g, "/")), false);
  });

  runTest("MODAL-CSS-BASELINE-01 records startup and modal CSS phases", () => {
    const css = readBaseline().cssLifecycle;
    assert.strictEqual(css.stylesheet.path, "src/ui/assets/css.css");
    assert.strictEqual(css.stylesheet.target, "shadow");
    assert.ok(css.stylesheet.authoredBytes > 0);
    assert.ok(css.stylesheet.ownership.startupRequired.selectors.includes("#toast-container"));
    assert.ok(css.stylesheet.ownership.startupRequired.selectors.includes("#tag-config-button"));
    assert.ok(css.stylesheet.ownership.modalOnlyCandidates.selectors.includes("#tag-config-modal"));
    assert.strictEqual(css.phases.beforeFirstInteraction.shadowStyleElements, 1);
    assert.strictEqual(css.phases.firstOpenModal.newShadowStyleElements, 0);
    assert.strictEqual(css.phases.repeatOpenModal.newShadowStyleElements, 0);
  });

  runTest("MODAL-CSS-BASELINE-01 records conservative catalog-copy cost", () => {
    const { configCopy } = readBaseline();
    assert.deepStrictEqual(configCopy.catalogFixture, { tags: 400, prefixes: 40 });
    assert.strictEqual(configCopy.explicitFullConfigClonePasses, 8);
    assert.strictEqual(configCopy.explicitCatalogItemsCopied, 3520);
    assert.strictEqual(configCopy.additionalSchemaTraversal, true);
  });

  runTest("MODAL-CSS-BASELINE-01 records deterministic tag-search costs", () => {
    const { tagSearch } = readBaseline();
    const empty = tagSearch.scenarios.find((scenario) => scenario.query === "");
    const narrow = tagSearch.scenarios.find((scenario) => scenario.query === "tag 00");
    const missing = tagSearch.scenarios.find((scenario) => scenario.query === "missing");
    assert.strictEqual(tagSearch.fixture.catalogSize, 400);
    assert.strictEqual(empty.resultRows, 391);
    assert.strictEqual(empty.actionButtons, 1173);
    assert.strictEqual(empty.perResultActionListeners, 1173);
    assert.strictEqual(narrow.candidateTags, 9);
    assert.strictEqual(missing.resultRows, 0);
  });

  runTest("MODAL-CSS-BASELINE-01 accepted evidence remains self-consistent", () => {
    const reportPath = path.join(ROOT, "docs/architecture/core-runtime-performance-baseline.json");
    const markdownPath = path.join(ROOT, "docs/architecture/core-runtime-performance-baseline.md");
    if (!fs.existsSync(reportPath) || !fs.existsSync(markdownPath)) return;
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.strictEqual(report.package, "MODAL-CSS-BASELINE-01");
    assert.ok(fs.readFileSync(markdownPath, "utf8").includes("# Core runtime performance baseline"));
  });

  runTest("MODAL-CSS-SPLIT-01 keeps critical and modal selectors in their owned assets", () => {
    const startup = fs.readFileSync(path.join(ROOT, "src/ui/assets/startup.css"), "utf8");
    const modal = fs.readFileSync(path.join(ROOT, "src/ui/assets/css.css"), "utf8");
    const startupRules = performanceAudit.classifyCss(startup);
    const modalRules = performanceAudit.classifyCss(modal);
    const baseline = readBaseline().cssLifecycle.stylesheet;
    const selectors = [
      ...startupRules.ownership.startupRequired.selectors,
      ...startupRules.ownership.modalOnlyCandidates.selectors,
      ...modalRules.ownership.startupRequired.selectors,
      ...modalRules.ownership.modalOnlyCandidates.selectors,
    ].sort((a, b) => a.localeCompare(b));
    const allBaselineSelectors = [
      ...baseline.ownership.startupRequired.selectors,
      ...baseline.ownership.modalOnlyCandidates.selectors,
    ];
    const baselineSelectors = allBaselineSelectors
      .filter((selector) =>
        !selector.includes(".dark-color-") && selector !== ".feature-health-line")
      .sort((a, b) => a.localeCompare(b));
    const retiredColorRuleCount = allBaselineSelectors.length - baselineSelectors.length;

    assert.ok(startup.includes("#toast-container"));
    assert.ok(startup.includes("#f95ue-page-dock"));
    assert.ok(startup.includes("#tag-config-button"));
    assert.strictEqual(startup.includes("#tag-config-modal"), false);
    assert.ok(modal.includes("#tag-config-modal"));
    assert.strictEqual(modal.includes("#toast-container"), false);
    const originalSelectors = selectors.filter((selector) => !selector.includes("tag-search-load-more"));
    assert.strictEqual(
      startupRules.styleRuleCount + modalRules.styleRuleCount,
      baseline.styleRuleCount - retiredColorRuleCount + 3,
    );
    assert.deepStrictEqual(originalSelectors, baselineSelectors);
  });

  runTest("MODAL-CSS-SPLIT-01 installs modal CSS once and reacquires after cleanup", () => {
    const previousDocument = global.document;
    const window = new Window();
    global.document = window.document;
    try {
      const harness = loadModule("tests/fixtures/modal-css-harness.js", {
        loader: { ".css": "text" },
      });
      const host = window.document.createElement("div");
      window.document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });
      harness.resetModalCssHarness(shadowRoot);

      harness.injectCSS();
      let snapshot = harness.getStyleRegistrySnapshot();
      assert.ok(snapshot["base-ui"]);
      assert.strictEqual(snapshot["base-modal-ui"], undefined);
      assert.strictEqual(shadowRoot.querySelectorAll("style").length, 1);

      assert.strictEqual(harness.ensureModalCss(), true);
      assert.strictEqual(harness.ensureModalCss(), true);
      snapshot = harness.getStyleRegistrySnapshot();
      assert.strictEqual(snapshot["base-modal-ui"].refs, 1);
      assert.strictEqual(shadowRoot.querySelectorAll("style").length, 2);

      harness.clearAllStyles();
      harness.injectCSS();
      assert.strictEqual(harness.ensureModalCss(), true);
      snapshot = harness.getStyleRegistrySnapshot();
      assert.strictEqual(snapshot["base-modal-ui"].refs, 1);
      assert.strictEqual(shadowRoot.querySelectorAll("style").length, 2);
      harness.clearAllStyles();
    } finally {
      global.document = previousDocument;
      window.close();
    }
  });

  runTest("MODAL-CSS-SPLIT-01 acquires modal CSS before modal construction", () => {
    const modalSource = fs.readFileSync(path.join(ROOT, "src/ui/components/modal.js"), "utf8");
    const ensureIndex = modalSource.indexOf("ensureModalCss();");
    const initializeIndex = modalSource.indexOf("await initModalUi();");
    const visibleIndex = modalSource.indexOf('.style.display = "block"');
    assert.ok(ensureIndex >= 0);
    assert.ok(ensureIndex < initializeIndex);
    assert.ok(initializeIndex < visibleIndex);
  });

  runTest("MODAL-CSS-VERIFY-01 records deterministic integrated CSS evidence", () => {
    const report = performanceAudit.auditCoreRuntimePerformance(ROOT);
    const { baseline } = report.verification;
    const css = report.cssLifecycle;
    assert.strictEqual(report.package, "MODAL-CSS-VERIFY-01");
    assert.strictEqual(baseline.startupCssBytes, 31122);
    assert.strictEqual(css.phases.beforeFirstInteraction.shadowCssBytes, 3483);
    assert.strictEqual(baseline.startupCssRules, 215);
    assert.strictEqual(css.startupStylesheet.styleRuleCount, 24);
    assert.strictEqual(css.phases.firstOpenModal.newShadowStyleElements, 1);
    assert.strictEqual(css.phases.repeatOpenModal.newShadowStyleElements, 0);
    assert.ok(performanceAudit.renderMarkdown(report).includes("synchronously acquires the modal stylesheet"));
  });

  runTest("CONFIG-CATALOG-COPY-01 unrelated updates do not serialize runtime catalogs", async () => {
    const previousGM = global.GM;
    const { createDomSandbox, createFakeGM } = context;
    const sandbox = createDomSandbox();
    global.GM = createFakeGM();
    try {
      const harness = loadModule("tests/fixtures/configInteractionHarness.js");
      const measurement = await harness.measureUnrelatedCatalogCopies();
      assert.strictEqual(measurement.committed, true);
      assert.deepStrictEqual(measurement.reads, { tagsToJson: 0, prefixesToJson: 0 });
      assert.strictEqual(measurement.resultRetainsTags, true);
      assert.strictEqual(measurement.resultRetainsPrefixes, true);
      assert.strictEqual(measurement.previousRetainsTags, true);
      assert.strictEqual(measurement.previousRetainsPrefixes, true);
      assert.strictEqual(measurement.changedPaths.some((path) => path.startsWith("tags")), false);
      assert.strictEqual(measurement.changedPaths.some((path) => path.startsWith("prefixes")), false);
    } finally {
      global.GM = previousGM;
      sandbox.restore();
    }
  });

  runTest("TAG-SEARCH-BOUND-01 chunks all results in stable order with one listener", async () => {
    const previousGM = global.GM;
    const { createDomSandbox, createFakeGM } = context;
    const sandbox = createDomSandbox();
    global.GM = createFakeGM();
    try {
      const harness = loadModule("tests/fixtures/tagSearchBoundHarness.js");
      const setup = await harness.setupTagSearchHarness(130);
      harness.renderTags(setup.tags);

      const resultIds = () => [...setup.results.querySelectorAll("[data-tag-result-id]")]
        .map((row) => Number(row.dataset.tagResultId));
      assert.strictEqual(setup.resultClickListeners, 1);
      assert.strictEqual(resultIds().length, harness.TAG_SEARCH_RESULT_CHUNK_SIZE);
      assert.deepStrictEqual(resultIds(), setup.tags.slice(0, 60).map((tag) => tag.id));

      setup.results.querySelector("[data-tag-search-action='load-more']").click();
      assert.strictEqual(resultIds().length, 120);
      setup.results.querySelector("[data-tag-search-action='load-more']").click();
      assert.deepStrictEqual(resultIds(), setup.tags.map((tag) => tag.id));
      assert.strictEqual(setup.results.querySelector("[data-tag-search-action='load-more']"), null);
    } finally {
      global.GM = previousGM;
      sandbox.restore();
    }
  });

  runTest("TAG-SEARCH-BOUND-01 delegated actions validate IDs and update every list", async () => {
    const previousGM = global.GM;
    const previousAnimationFrame = global.requestAnimationFrame;
    const previousSetTimeout = global.setTimeout;
    const previousClearTimeout = global.clearTimeout;
    const { createDomSandbox, createFakeClock, createFakeGM } = context;
    const sandbox = createDomSandbox();
    const clock = createFakeClock();
    global.GM = createFakeGM();
    global.requestAnimationFrame = (callback) => callback();
    global.setTimeout = clock.setTimeout;
    global.clearTimeout = clock.clearTimeout;
    try {
      const harness = loadModule("tests/fixtures/tagSearchBoundHarness.js");
      const setup = await harness.setupTagSearchHarness(20);
      const clickAction = async (action, tagId) => {
        const button = setup.results.querySelector(
          `[data-tag-action='${action}'][data-tag-id='${tagId}']`,
        );
        assert.ok(button);
        button.click();
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      };

      harness.renderTags(setup.tags);
      await clickAction("preferred", 1);
      await clickAction("excluded", 2);
      await clickAction("marked", 3);
      assert.deepStrictEqual(harness.selectedLists(), {
        preferred: [1],
        excluded: [2],
        marked: [3],
      });

      const invalid = document.createElement("button");
      invalid.dataset.tagAction = "preferred";
      invalid.dataset.tagId = "99999";
      setup.results.appendChild(invalid);
      invalid.click();
      await Promise.resolve();
      assert.deepStrictEqual(harness.selectedLists().preferred, [1]);
    } finally {
      global.GM = previousGM;
      global.requestAnimationFrame = previousAnimationFrame;
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
      sandbox.restore();
    }
  });

  runTest("TAG-SEARCH-BOUND-01 stale rows and closed results cannot commit", async () => {
    const previousGM = global.GM;
    const { createDomSandbox, createFakeGM } = context;
    const sandbox = createDomSandbox();
    global.GM = createFakeGM();
    try {
      const harness = loadModule("tests/fixtures/tagSearchBoundHarness.js");
      const setup = await harness.setupTagSearchHarness(80);
      harness.renderTags(setup.tags.slice(0, 40));
      const staleButton = setup.results.querySelector("[data-tag-action='preferred']");
      harness.renderTags(setup.tags.slice(40));
      staleButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(harness.selectedLists().preferred, []);

      harness.hideResults(setup.results);
      assert.strictEqual(setup.results.style.display, "none");
      assert.strictEqual(setup.results.children.length, 0);
    } finally {
      global.GM = previousGM;
      sandbox.restore();
    }
  });

  runTest("TAG-SEARCH-BOUND-01 clear and Escape discard active results", async () => {
    const previousGM = global.GM;
    const { createDomSandbox, createFakeGM } = context;
    const sandbox = createDomSandbox();
    global.GM = createFakeGM();
    try {
      const harness = loadModule("tests/fixtures/tagSearchBoundHarness.js");
      const setup = await harness.setupTagSearchHarness(80);

      setup.input.value = "Tag";
      setup.input.dispatchEvent(new Event("input", { bubbles: true }));
      harness.renderTags(setup.tags);
      setup.clear.click();
      assert.strictEqual(setup.input.value, "");
      assert.strictEqual(setup.results.style.display, "none");
      assert.strictEqual(setup.results.children.length, 0);

      setup.input.value = "Tag 0";
      harness.renderTags(setup.tags.slice(0, 20));
      setup.input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert.strictEqual(setup.results.style.display, "none");
      assert.strictEqual(setup.results.children.length, 0);
    } finally {
      global.GM = previousGM;
      sandbox.restore();
    }
  });
};
