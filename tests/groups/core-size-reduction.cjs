module.exports = function registerGroup(context) {
  const { assert, fs, path, ROOT, Window, loadModule, runTest } = context;
  const coreAudit = require("../../scripts/core-source-audit.cjs");
  const {
    compactCoreModalHtml,
    isCoreModalHtmlPath,
  } = require("../../build/compactCoreModalHtml.js");
  const baselinePath = path.join(
    ROOT,
    "docs/architecture/core-size-reduction-baseline.json",
  );

  function readBaseline() {
    return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  }

  runTest("CORE-SIZE-REDUCTION-BASELINE-01 evidence is deterministic and complete", () => {
    const baseline = readBaseline();
    assert.strictEqual(baseline.reportSchemaVersion, 2);
    assert.strictEqual(baseline.reductionEvidence.completeCoreContributors, true);
    assert.strictEqual(baseline.reductionEvidence.candidateFilesAssignedOnce, true);
    assert.strictEqual(coreAudit.stableJson(baseline), coreAudit.stableJson(readBaseline()));

    for (const mode of ["readable", "uglified"]) {
      const bundle = baseline.bundle[mode];
      assert.ok(bundle.coreContributors.length > 20);
      assert.strictEqual(
        bundle.coreContributors.reduce((sum, entry) => sum + entry.bytes, 0),
        bundle.coreBytes,
      );
      assert.strictEqual(
        bundle.coreContributors.some((entry) => entry.path.startsWith("src/services/addons/")),
        false,
      );
    }
  });

  runTest("CORE-SIZE-REDUCTION-BASELINE-01 records non-overlapping candidates", () => {
    const { candidates } = readBaseline().reductionEvidence;
    const assignedPaths = Object.values(candidates).flatMap((candidate) => candidate.paths);
    assert.strictEqual(new Set(assignedPaths).size, assignedPaths.length);
    assert.deepStrictEqual(candidates.customColorPicker.paths, [
      "src/ui/components/darkColorPicker.js",
    ]);
    assert.strictEqual(candidates.customColorPicker.authoredBytes, 9258);
    assert.strictEqual(candidates.customColorPicker.uglifiedBundleBytes, 4831);
    assert.strictEqual(candidates.customColorPicker.cssRules.authoredBytes, 1427);
    assert.strictEqual(candidates.modalHtml.html.authoredBytes, 6070);
    assert.strictEqual(candidates.modalHtml.html.estimatedReductionBytes, 1042);
    assert.strictEqual(candidates.notificationService.uglifiedBundleBytes, 0);
    assert.strictEqual(candidates.optionalFeatures.uglifiedBundleBytes, 12603);
  });

  runTest("CORE-SIZE-REDUCTION-BASELINE-01 comparison includes core and candidates", () => {
    const baseline = readBaseline();
    const comparison = coreAudit.compareReports(baseline, baseline);
    for (const field of [
      "authoredBytes",
      "readableBytes",
      "readableCoreBytes",
      "readableGzipBytes",
      "uglifiedBytes",
      "uglifiedCoreBytes",
      "uglifiedGzipBytes",
    ]) {
      assert.strictEqual(comparison[field].delta, 0, field);
    }
    for (const candidate of Object.values(comparison.candidates)) {
      assert.strictEqual(candidate.authoredBytes.delta, 0);
      assert.strictEqual(candidate.readableBundleBytes.delta, 0);
      assert.strictEqual(candidate.uglifiedBundleBytes.delta, 0);
    }
  });

  runTest("CORE-SIZE-HTML-COMPACT-01 compacts only the core modal deterministically", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/ui/assets/ui.html"), "utf8");
    const first = compactCoreModalHtml(source);
    const second = compactCoreModalHtml(source);

    assert.strictEqual(first, second);
    assert.strictEqual(first.includes("\n"), false);
    assert.ok(Buffer.byteLength(first) < Buffer.byteLength(source));
    assert.strictEqual(isCoreModalHtmlPath(path.join(ROOT, "src/ui/assets/ui.html")), true);
    assert.strictEqual(isCoreModalHtmlPath(path.join(ROOT, "addons/example/ui.html")), false);
    assert.strictEqual(
      compactCoreModalHtml('<div title="keep  this">Visible  text</div>\n  <span>Next</span>'),
      '<div title="keep  this">Visible  text</div> <span>Next</span>',
    );
  });

  runTest("CORE-SIZE-HTML-COMPACT-01 preserves the modal element contract", () => {
    const source = fs.readFileSync(path.join(ROOT, "src/ui/assets/ui.html"), "utf8");
    const compacted = compactCoreModalHtml(source);
    const parse = (html) => {
      const window = new Window();
      const root = window.document.createElement("div");
      root.innerHTML = html;
      const snapshot = [...root.querySelectorAll("*")].map((element) => ({
        tag: element.tagName,
        attributes: [...element.attributes]
          .map((attribute) => [attribute.name, attribute.value])
          .sort(([left], [right]) => left.localeCompare(right)),
        text: element.textContent.replace(/\s+/g, " ").trim(),
      }));
      const ids = [...root.querySelectorAll("[id]")].map((element) => element.id).sort();
      const result = { snapshot, ids, text: root.textContent.replace(/\s+/g, " ").trim() };
      window.close();
      return result;
    };

    assert.deepStrictEqual(parse(compacted), parse(source));
    const parsed = parse(compacted);
    for (const id of [
      "settings-nav",
      "close-modal",
      "settings-panel-general",
      "settings-panel-latest",
      "settings-panel-thread",
      "settings-panel-tags",
      "settings-panel-color",
      "settings-panel-addins",
      "addins-installed-list",
    ]) {
      assert.strictEqual(parsed.ids.filter((value) => value === id).length, 1, id);
    }
  });

  runTest("CORE-SIZE-HTML-COMPACT-01 shares one transform across build and audit", () => {
    const buildSource = fs.readFileSync(path.join(ROOT, "build.js"), "utf8");
    const auditSource = fs.readFileSync(path.join(ROOT, "scripts/core-source-audit.cjs"), "utf8");
    assert.ok(buildSource.includes("compactCoreModalHtmlAsset"));
    assert.ok(auditSource.includes("compactCoreModalHtmlAsset"));
    assert.ok(auditSource.includes("compactCoreModalHtml(source)"));
  });

  runTest("CORE-SIZE-HEALTH-UI-01 formats complete and empty support reports", () => {
    const harness = loadModule("tests/fixtures/featureHealthHarness.js");
    const statuses = {
      alpha: {
        status: "degraded",
        details: "bounded detail",
        errorLog: [{ timestamp: "2026-08-01T00:00:00.000Z", details: "safe error" }],
      },
    };
    const addons = [{
      id: "sample",
      name: "Sample",
      status: "needs-update",
      statusMessage: "Update available",
      activeOnPage: true,
      supportsCurrentPage: true,
      blocked: false,
      trusted: true,
    }];
    const report = harness.formatFeatureHealthReport(
      statuses,
      harness.summarizeFeatureStatuses(statuses),
      addons,
      harness.summarizeAddons(addons),
      {
        timestamp: "2026-08-01T00:00:00.000Z",
        page: "https://f95zone.to/threads/sample.1/",
        diagnostics: {
          snapshots: {
            resources: { totalResources: 4, ownerCount: 2 },
            queues: { queueCount: 3, pendingCount: 1, runningCount: 1 },
          },
        },
        runtimeErrors: [{ timestamp: "2026-08-01T00:00:01.000Z", details: "runtime-safe" }],
      },
    );

    for (const expected of [
      "alpha: degraded - bounded detail",
      "safe error",
      "Resources: total=4, owners=2; Queues: total=3, pending=1, running=1",
      "Runtime errors (1)",
      "Sample (sample): needs-update [active-here, scope-match, trusted] - Update available",
    ]) assert.ok(report.includes(expected), expected);

    const empty = harness.formatFeatureHealthReport(
      {},
      harness.summarizeFeatureStatuses({}),
      [],
      harness.summarizeAddons([]),
      { diagnostics: { snapshots: {} }, runtimeErrors: [], timestamp: "fixed", page: "fixed" },
    );
    assert.ok(empty.includes("No feature status entries found."));
    assert.ok(empty.includes("No installed add-ons detected."));
  });

  runTest("CORE-SIZE-HEALTH-UI-01 renders and copies one report without duplicate UI", async () => {
    const previous = {
      window: global.window,
      document: global.document,
      requestAnimationFrame: global.requestAnimationFrame,
      cancelAnimationFrame: global.cancelAnimationFrame,
    };
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, "navigator");
    const window = new Window({ url: "https://f95zone.to/threads/sample.1/" });
    global.window = window;
    global.document = window.document;
    Object.defineProperty(global, "navigator", {
      configurable: true,
      value: window.navigator,
    });
    global.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    global.cancelAnimationFrame = () => {};
    const copied = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => copied.push(text) },
    });

    try {
      const harness = loadModule("tests/fixtures/featureHealthHarness.js");
      const host = window.document.createElement("div");
      window.document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: "open" });
      const container = window.document.createElement("div");
      container.id = "global-settings-container";
      shadow.appendChild(container);
      harness.setFeatureHealthRoot(shadow);

      const first = harness.showFeatureHealthBox({}, "one support payload");
      const second = harness.showFeatureHealthBox({}, "updated support payload");
      assert.strictEqual(first, second);
      assert.strictEqual(shadow.querySelectorAll("#feature-health-box").length, 1);
      const content = second.querySelector(".feature-health-content");
      assert.strictEqual(content.tagName, "PRE");
      assert.strictEqual(content.textContent, "updated support payload");
      assert.strictEqual(content.children.length, 0);

      const buttons = [...second.querySelectorAll("button")];
      buttons.find((button) => button.textContent === "Copy").click();
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual(copied, [content.textContent]);
      buttons.find((button) => button.textContent === "Close").click();
      assert.strictEqual(second.style.display, "none");

      harness.setFeatureHealthRoot(null);
      const fallbackContainer = window.document.createElement("div");
      fallbackContainer.id = "global-settings-container";
      window.document.body.appendChild(fallbackContainer);
      const fallback = harness.showFeatureHealthBox({}, "fallback payload");
      assert.strictEqual(fallback.parentElement, fallbackContainer);
    } finally {
      global.window = previous.window;
      global.document = previous.document;
      if (navigatorDescriptor) Object.defineProperty(global, "navigator", navigatorDescriptor);
      else delete global.navigator;
      global.requestAnimationFrame = previous.requestAnimationFrame;
      global.cancelAnimationFrame = previous.cancelAnimationFrame;
      window.close();
    }
  });
};
