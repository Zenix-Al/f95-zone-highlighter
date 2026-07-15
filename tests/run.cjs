const path = require("path");
const fs = require("fs");
const assert = require("assert");
const childProcess = require("child_process");
const esbuild = require("esbuild");
const { Window } = require("happy-dom");
const { createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition } = require("./helpers.cjs");
const {
  generateFeatureManifest,
  checkFeatureManifest,
  renderFeatureManifest,
  validateFeatureManifestEntries,
} = require("../scripts/featureManifest.cjs");
const coreAudit = require("../scripts/core-source-audit.cjs");
const coreSizeGate = require("../scripts/core-size-gate.cjs");
const cssAudit = require("../scripts/css-audit.cjs");
const addonBaseline = require("../scripts/addon-baseline.cjs");
const addonCatalog = require("../scripts/addon-catalog.cjs");
const addonBuildTools = require("../scripts/addon-build-tools.cjs");
const addonBuilder = require("../addons/build-addon.js");

const ROOT = path.join(__dirname, "..");
const TMP_DIR = path.join(__dirname, ".tmp");
const ADDON_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, "addons", "addons.manifest.json"), "utf8"),
);
const TRUSTED_ADDON_CATALOG = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "services", "addons", "trusted-catalog.json"), "utf8"),
);

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function loadModule(relativePath) {
  const entry = path.join(ROOT, relativePath);
  const outFile = path.join(
    TMP_DIR,
    relativePath.replace(/[\\/]/g, "_") + ".cjs",
  );

  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    define: {
      __F95UE_DEBUG__: "false",
    },
    outfile: outFile,
    logLevel: "silent",
  });

  delete require.cache[require.resolve(outFile)];
  return require(outFile);
}

let passed = 0;
let failed = 0;
let testChain = Promise.resolve();

function runTest(name, testFn) {
  testChain = testChain.then(async () => {
    try {
      await testFn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(err);
    }
  });
}

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === "dist") return [];
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(filePath);
    return entry.isFile() && filePath.endsWith(".js") ? [filePath] : [];
  });
}

async function seedReadyConfig(gm, settings, config) {
  const data = JSON.parse(JSON.stringify(config));
  const tags = data.tags || [];
  const prefixes = data.prefixes || { items: [], categories: {} };
  data.tags = [];
  data.prefixes = { items: [], categories: {} };
  await gm.setValue(settings.CONFIG_ENVELOPE_KEY, {
    schemaVersion: 1,
    revision: 1,
    writerId: "ready-fixture",
    updatedAt: 1,
    data,
  });
  await gm.setValue(settings.CONFIG_BACKUP_KEY, null);
  await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
  await gm.setValue(settings.CONFIG_TAGS_CACHE_KEY, tags);
  await gm.setValue(settings.CONFIG_PREFIXES_CACHE_KEY, prefixes);
}

const { createStateManager } = loadModule("src/core/StateManager.js");
const { pageDefinitions } = loadModule("src/config.js");
const { featureMatchesPageScopes } = loadModule("src/core/featureScope.js");
const {
  beginRoute,
  getRouteContext,
  normalizeRouteUrl,
  resetRouteStateForTests,
  setRoutePageFlags,
} = loadModule("src/core/routeState.js");
const { runBootstrapPipeline } = loadModule("src/core/bootstrap.js");
const {
  CONFIG_SCHEMA,
  getConfigPathMetadata,
  getDefaultConfig,
  getExportableConfigKeys,
  getPersistedConfigPaths,
  getSchemaPathIndex,
  mergeWithDefaults,
  sanitizeConfig,
  validateConfig,
  validateConfigSection,
} = loadModule("src/config/schema.js");
const {
  registerFeature,
  resetFeatureCatalogForTests,
  validateFeatureDescriptor,
} = loadModule("src/core/featureCatalog.js");
const {
  createFeature,
  normalizeFeatureBootstrapMode,
} = loadModule("src/core/featureFactory.js");
const {
  createResourceOwner,
  releaseOwner,
  getResourceSnapshot,
} = loadModule("src/core/resourceManager.js");
const { createTaskQueue } = loadModule("src/core/taskQueue.js");
const {
  clearHealthEventsForTests,
  getHealthDiagnostics,
  getHealthEvents,
  getAllFeatureStatuses,
  getRuntimeErrors,
  recordHealthEvent,
  registerDiagnosticsProvider,
  reportFeatureFailure,
  reportFeatureWarning,
  reportRuntimeError,
} = loadModule("src/core/featureHealth.js");
const { queryFirstBySelectors } = loadModule("src/utils/selectorQuery.js");
const {
  OVERLAY_COLOR_ORDER_KEYS,
  normalizeOverlayColorOrder,
  buildOrderedOverlayMatches,
} = loadModule("src/features/latest-overlay/overlayOrder.js");
const {
  enqueueFastCaptureProcessing,
  getFastCaptureData,
  getFastCaptureDiagnostics,
  getFastCaptureSnapshot,
  hasFastCaptureData,
  matchesFastCaptureUrl,
  processCompletedFastCapture,
  refreshFastCaptureFeatures,
  registerFastCaptureFeatures,
  resetFastCaptureAdapterForTests,
  resetFastCaptureStoreForTests,
  subscribeFastCapture,
} = loadModule("src/services/fastCapture/index.js");
const { normalizeFastCaptureConfig } = loadModule("src/services/fastCapture/rules.js");
const { FAST_CAPTURE_LIMITS } = loadModule("src/services/fastCapture/limits.js");
const {
  executeActionDescriptor,
  getActionSnapshot,
  registerAction,
} = loadModule("src/services/addons/actions/registry.js");
const {
  getRegisteredAddonActionSnapshot,
  invokeRegisteredAddonCoreAction,
  isAddonActionAllowed,
} = loadModule("src/services/addons/coreActions.js");
const { coerceSettingValue } = loadModule(
  "src/ui/renderers/coerceSettingValue.js",
);
const {
  getMetadataByConfigPath,
  getSettingsMetadataById,
  getSettingsMetadataByOwner,
  getSettingsMetadataBySection,
  getSettingsMetadataSnapshot,
  registerSettingsMetadata,
  resetSettingsMetadataForTests,
} = loadModule("src/ui/settings/metaRegistry.js");
const { renderSetting } = loadModule("src/ui/renderers/renderSetting.js");
const { createInput } = loadModule("src/ui/renderers/createInput.js");
const { setByPath } = loadModule("src/utils/objectPath.js");
const { flushQueuedToasts, showToast } = loadModule(
  "src/ui/components/toast.js",
);
const { isAddonOwnedObserverNode } = loadModule(
  "src/services/addons/observer.js",
);
const {
  ADDON_UI_SLOT_POLICY,
  normalizeAddonMountSlot,
  sanitizeAddonCss,
  sanitizeAddonHtml,
} = loadModule("src/services/addons/uiSanitizer.js");
const { createAddonDockGroup } = loadModule(
  "src/ui/components/addons/addonDockGroup.js",
);
const { normalizePrefixesFromLatestUpdates } = loadModule(
  "src/services/prefixService.js",
);
const { buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord } =
  loadModule("src/features/latest-overlay/latestDataIndex.js");
const { buildPrefixStatusMap } = loadModule(
  "src/features/latest-overlay/overlayCache.js",
);
const { getRecordHighlightClasses } = loadModule(
  "src/features/latest-overlay/ratingEngagementHighlight.js",
);
const { matchesPageDefinition } = loadModule("src/core/pageDetection.js");
const { normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError } = loadModule(
  "src/features/latest-ajax-error-recovery/index.js",
);
const { __downloadPageControllerTestInternals } = loadModule(
  "addons/masked-direct-addon/src/downloadPageController.js",
);

runTest("page definitions match configured hosts and paths", () => {
  const latestLocation = {
    hostname: "f95zone.to",
    pathname: "/sam/latest_alpha/",
    href: "https://f95zone.to/sam/latest_alpha/",
  };
  const threadLocation = {
    hostname: "f95zone.to",
    pathname: "/threads/example.123/",
    href: "https://f95zone.to/threads/example.123/",
  };

  assert.strictEqual(
    matchesPageDefinition(pageDefinitions.isF95Zone, latestLocation),
    true,
  );
  assert.strictEqual(
    matchesPageDefinition(pageDefinitions.isLatest, latestLocation),
    true,
  );
  assert.strictEqual(
    matchesPageDefinition(pageDefinitions.isThread, latestLocation),
    false,
  );
  assert.strictEqual(
    matchesPageDefinition(pageDefinitions.isThread, threadLocation),
    true,
  );
});

runTest("latest ajax error shield normalizes undefined responseJSON", () => {
  const jqXHR = {
    status: 200,
    responseText: "<html>not json</html>",
    responseJSON: undefined,
  };

  assert.strictEqual(normalizeLatestAjaxErrorPayload(jqXHR, "fallback"), true);
  assert.deepStrictEqual(jqXHR.responseJSON, { msg: "fallback" });
  assert.strictEqual(jqXHR.responseJSON.hasOwnProperty("msg"), true);
});

runTest("latest ajax error recovery retries transient failures only", () => {
  assert.strictEqual(shouldRetryLatestAjaxError("parsererror", { status: 200 }), true);
  assert.strictEqual(shouldRetryLatestAjaxError("timeout", { status: 0 }), true);
  assert.strictEqual(shouldRetryLatestAjaxError("error", { status: 503 }), true);
  assert.strictEqual(shouldRetryLatestAjaxError("error", { status: 403 }), false);
  assert.strictEqual(shouldRetryLatestAjaxError("error", { status: 429 }), false);
});

runTest(
  "Datanodes stripped-marker recovery stays blocked for ambiguous files",
  () => {
    const now = Date.now();
    const { findSingleStrippedMarkerTrigger } =
      __downloadPageControllerTestInternals;
    const triggers = [
      {
        active: true,
        requestId: "req-1",
        ownerTabId: "tab-1",
        host: "datanodes.to",
        createdAt: now - 1000,
        expiresAt: now + 60000,
        sourceUrl:
          "https://datanodes.to/abc/Dawn_of_Corruption_exe_1.0.0.7z?f95ue_dd=1&f95ue_dd_req=req-1",
      },
      {
        active: true,
        requestId: "req-2",
        ownerTabId: "tab-1",
        host: "datanodes.to",
        createdAt: now - 900,
        expiresAt: now + 60000,
        sourceUrl:
          "https://datanodes.to/def/Other_Game_2.0.zip?f95ue_dd=1&f95ue_dd_req=req-2",
      },
    ];

    assert.strictEqual(
      findSingleStrippedMarkerTrigger("datanodes.to", triggers),
      null,
    );
  },
);

runTest(
  "Datanodes stripped-marker recovery uses visible filename identifier",
  () => {
    const now = Date.now();
    const { findSingleStrippedMarkerTrigger } =
      __downloadPageControllerTestInternals;
    const triggers = [
      {
        active: true,
        requestId: "req-1",
        ownerTabId: "tab-1",
        host: "datanodes.to",
        createdAt: now - 1000,
        expiresAt: now + 60000,
        sourceUrl:
          "https://datanodes.to/abc/Dawn_of_Corruption_exe_1.0.0.7z?f95ue_dd=1&f95ue_dd_req=req-1",
      },
      {
        active: true,
        requestId: "req-2",
        ownerTabId: "tab-1",
        host: "datanodes.to",
        createdAt: now - 900,
        expiresAt: now + 60000,
        sourceUrl:
          "https://datanodes.to/def/Other_Game_2.0.zip?f95ue_dd=1&f95ue_dd_req=req-2",
      },
    ];

    const match = findSingleStrippedMarkerTrigger("datanodes.to", triggers, {
      pageIdentifier: " Dawn_of_Corruption_exe_1.0.0.7z ",
    });

    assert.strictEqual(match.requestId, "req-1");
  },
);

runTest("generated feature manifest contains current feature exports", () => {
  const result = generateFeatureManifest({ rootDir: ROOT });
  const generated = fs.readFileSync(result.outputFile, "utf8");

  assert.ok(result.featureNames.includes("latestOverlayFeature"));
  assert.ok(result.featureNames.includes("latestAjaxErrorRecoveryFeature"));
  assert.ok(result.featureNames.includes("wideLatestPageFeature"));
  assert.ok(result.featureNames.includes("denseLatestGridFeature"));
  assert.ok(result.featureNames.includes("threadOverlayFeature"));
  assert.ok(generated.includes("export const generatedFeatures"));
  assert.ok(generated.includes("../features/latest-overlay/index.js"));
});

runTest("MANIFEST-01 generation rejects duplicate feature exports across files with both paths", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "manifest-"));
  const alphaDir = path.join(fixtureRoot, "src/features/alpha");
  const betaDir = path.join(fixtureRoot, "src/features/beta");

  fs.mkdirSync(alphaDir, { recursive: true });
  fs.mkdirSync(betaDir, { recursive: true });
  fs.writeFileSync(path.join(alphaDir, "index.js"), "export const duplicateFeature = {}\n");
  fs.writeFileSync(path.join(betaDir, "index.js"), "export const duplicateFeature = {}\n");

  assert.throws(
    () =>
      generateFeatureManifest({
        rootDir: fixtureRoot,
        outputFile: path.join(fixtureRoot, "src/generated/features.generated.js"),
      }),
    (error) => /duplicateFeature/.test(error.message)
      && /src\/features\/alpha\/index\.js/.test(error.message)
      && /src\/features\/beta\/index\.js/.test(error.message),
  );
});

runTest("CORE-LEAN-BASE-01 repeated source audits are byte-identical", () => {
  const first = coreAudit.auditCoreSource(ROOT);
  const second = coreAudit.auditCoreSource(ROOT);
  assert.strictEqual(coreAudit.stableJson(first), coreAudit.stableJson(second));
});

runTest("CORE-CSS audit parses and inventories dynamic selectors deterministically", async () => {
  const first = await cssAudit.auditCss({ rootDir: ROOT, includeBundle: false });
  const second = await cssAudit.auditCss({ rootDir: ROOT, includeBundle: false });
  assert.strictEqual(cssAudit.stableJson(first), cssAudit.stableJson(second));
  assert.ok(first.selectorCount > 0);
  assert.ok(first.declarationCount > 0);
  assert.strictEqual(first.keyframeCount, 0);
  assert.strictEqual(first.duplicateSelectorBlocks.length, 0);
  assert.ok(first.evidenceMap.some((item) => item.selector === ".tag-chip" && item.category === "dynamic-reference"));
  assert.ok(first.evidenceMap.some((item) => item.selector === ".preferred-tag-remove" && item.category === "unresolved"));
  assert.ok(first.evidenceMap.some((item) => item.selector === ".addins-card" && item.category === "dynamic-reference"));
  assert.deepStrictEqual(first.externalPageSelectors, []);

  const requiredSelectors = [
    "#tag-config-modal",
    ".settings-nav-item",
    ".settings-panel.active",
    "#search-results",
    ".tag-chip.dragging",
    ".dark-color-popover.open",
    ".toast.show",
    ".config-dialog-backdrop",
    ".feature-health-box",
    ".addins-card",
    "#f95ue-page-dock",
  ];
  for (const selector of requiredSelectors) assert.ok(first.selectors.some((entry) => entry.selector === selector), selector);
  for (const file of [
    "src/ui/components/tag-search/tagDrag.js",
    "src/ui/components/dialog.js",
    "src/ui/components/toast.js",
    "src/ui/components/configButton.js",
    "src/ui/renderers/addonsRenderer.js",
  ]) assert.ok(first.dynamicEvidenceFiles.includes(file), file);

  const window = new Window();
  window.document.body.innerHTML = fs.readFileSync(path.join(ROOT, "src/ui/assets/ui.html"), "utf8");
  for (const id of ["settings-nav", "settings-panel-color", "preferred-tags-list", "excluded-tags-list", "marked-tags-list"]) {
    assert.ok(window.document.getElementById(id), id);
  }
  assert.ok(window.document.querySelector(".settings-mobile-panel-header"));
  window.close();
});

runTest("CORE-LEAN-BASE-01 excludes generated, add-on, and vendored source from authored totals", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "core-audit-exclusions-"));
  try {
    const files = {
      "src/config/kept.js": "export const kept = true;\n",
      "src/services/kept.js": "export const service = true;\n",
      "src/services/addons/excluded.js": "export const addon = true;\n",
      "src/services/addonsService.js": "export const addonService = true;\n",
      "src/ui/components/addons/excluded.js": "export const addonUi = true;\n",
      "src/ui/renderers/addonsRenderer.js": "export const renderer = true;\n",
      "src/features/latest-ajax-error-recovery/index.js": "export const legacy = true;\n",
      "src/generated/features.generated.js": "export const generated = true;\n",
    };
    for (const [relative, source] of Object.entries(files)) {
      const target = path.join(fixtureRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
    const report = coreAudit.auditCoreSource(fixtureRoot);
    assert.strictEqual(report.fileCount, 2);
    assert.deepStrictEqual(report.bytesByArea, { config: 26, core: 0, services: 29, features: 0, ui: 0 });
    assert.strictEqual(report.largestFiles.some((file) => file.path.includes("addons")), false);
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

runTest("CORE-LEAN-BASE-01 reports deterministic cycles and orphan exports as hints", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "core-audit-graph-"));
  try {
    const files = {
      "src/core/a.js": "import { b } from './b.js'; export const a = b;\n",
      "src/core/b.js": "import { a } from './a.js'; export const b = a;\n",
      "src/core/orphan.js": "export const orphan = true;\n",
    };
    for (const [relative, source] of Object.entries(files)) {
      const target = path.join(fixtureRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
    const report = coreAudit.auditCoreSource(fixtureRoot);
    assert.deepStrictEqual(report.graph.cycles, ["src/core/a.js -> src/core/b.js"]);
    assert.ok(report.graph.orphanFiles.includes("src/core/orphan.js"));
    assert.ok(report.graph.unreferencedExports.includes("src/core/orphan.js#orphan"));
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

runTest("CORE-DEAD-CODE-01 audit fixtures distinguish static imports from strings and events", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "core-dead-code-reachability-"));
  try {
    const files = {
      "src/core/entry.js": "import { staticValue } from './static.js'; export const entry = staticValue;\n",
      "src/core/static.js": "export const staticValue = true;\n",
      "src/core/stringAndEvent.js": "const action = 'dynamic-action'; window.addEventListener('dynamic-event', () => action);\n",
      "src/core/dynamic.js": "export const dynamicValue = true;\n",
    };
    for (const [relative, source] of Object.entries(files)) {
      const target = path.join(fixtureRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
    const report = coreAudit.auditCoreSource(fixtureRoot);
    const byPath = new Map(report.graph.files.map((file) => [file.path, file]));
    assert.strictEqual(byPath.get("src/core/static.js").fanIn, 1);
    assert.strictEqual(byPath.get("src/core/dynamic.js").fanIn, 0);
    assert.ok(report.graph.orphanFiles.includes("src/core/dynamic.js"));
    assert.ok(!report.graph.orphanFiles.includes("src/core/static.js"));
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

runTest("CORE-LEAN-BASE-01 compares baseline size fields with deterministic deltas", () => {
  const current = {
    authored: { authoredBytes: 120 },
    bundle: {
      readable: { bytes: 400, gzipBytes: 200 },
      uglified: { bytes: 250, gzipBytes: 140 },
    },
  };
  const baseline = {
    authored: { authoredBytes: 100 },
    bundle: {
      readable: { bytes: 450, gzipBytes: 210 },
      uglified: { bytes: 300, gzipBytes: 150 },
    },
  };
  const comparison = coreAudit.compareReports(current, baseline);
  assert.deepStrictEqual(comparison.authoredBytes, { current: 120, baseline: 100, delta: 20 });
  assert.deepStrictEqual(comparison.readableBytes, { current: 400, baseline: 450, delta: -50 });
  assert.deepStrictEqual(comparison.uglifiedGzipBytes, { current: 140, baseline: 150, delta: -10 });
});

runTest("CORE-SIZE-GATE-01 allows tiny core growth and excludes add-on bundle growth", () => {
  const baseline = {
    authored: {
      authoredBytes: 10000,
      bytesByArea: { config: 4000, core: 2000, services: 2000, features: 1000, ui: 1000 },
      bytesByFile: { "src/config/base.js": 4000 },
      graph: { cycles: [], crossBoundaryImports: [] },
    },
    bundle: {
      readable: { bytes: 20000, coreBytes: 10000, gzipBytes: 5000 },
      uglified: { bytes: 12000, coreBytes: 5000, gzipBytes: 3500 },
    },
  };
  const current = JSON.parse(JSON.stringify(baseline));
  current.authored.authoredBytes += 100;
  current.authored.bytesByArea.config += 100;
  current.authored.bytesByFile["src/config/base.js"] += 100;
  current.bundle.readable.bytes += 100000;
  current.bundle.uglified.bytes += 100000;
  current.bundle.readable.gzipBytes += 1000;
  current.bundle.uglified.gzipBytes += 1000;
  const result = coreSizeGate.evaluateGate(current, baseline);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.metrics.readable.delta, 0);
  assert.strictEqual(result.metrics.gzip.readable.informational, true);
});

runTest("CORE-SIZE-GATE-01 reports meaningful growth with owning files", () => {
  const baseline = {
    authored: {
      bytesByArea: { config: 4000, core: 2000 },
      bytesByFile: { "src/config/base.js": 4000 },
      graph: { cycles: [], crossBoundaryImports: [{ from: "config", to: "core", count: 1, examples: [] }] },
    },
    bundle: {
      readable: { bytes: 20000, coreBytes: 10000, gzipBytes: 5000 },
      uglified: { bytes: 12000, coreBytes: 5000, gzipBytes: 3500 },
    },
  };
  const current = JSON.parse(JSON.stringify(baseline));
  current.authored.bytesByArea.config += 2000;
  current.authored.bytesByFile["src/config/new.js"] = 2000;
  current.bundle.readable.coreBytes += 3000;
  current.bundle.uglified.coreBytes += 1500;
  const result = coreSizeGate.evaluateGate(current, baseline);
  assert.strictEqual(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("authored:config") && failure.includes("src/config/new.js")));
  assert.ok(result.failures.some((failure) => failure.includes("readable-core-input")));
  assert.ok(result.largestPositiveDeltas.some((entry) => entry.path === "src/config/new.js"));
});

runTest("CORE-SIZE-GATE-01 rejects new cycles and import directions", () => {
  const baseline = {
    authored: { bytesByArea: {}, bytesByFile: {}, graph: { cycles: [], crossBoundaryImports: [] } },
    bundle: { readable: { coreBytes: 0, bytes: 0, gzipBytes: 0 }, uglified: { coreBytes: 0, bytes: 0, gzipBytes: 0 } },
  };
  const current = JSON.parse(JSON.stringify(baseline));
  current.authored.graph.cycles = ["src/core/a.js -> src/core/b.js"];
  current.authored.graph.crossBoundaryImports = [{ from: "core", to: "services", count: 1, examples: [{ from: "src/core/a.js", to: "src/services/b.js" }] }];
  const result = coreSizeGate.evaluateGate(current, baseline);
  assert.strictEqual(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.includes("new import cycles")));
  assert.ok(result.failures.some((failure) => failure.includes("core->services")));
});

runTest("CORE-SIZE-GATE-01 baseline updates require a rationale", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "core-size-gate-rationale-"));
  try {
    assert.throws(() => coreSizeGate.rationaleRecord(fixtureRoot, null, null), /require/);
    const rationale = path.join(fixtureRoot, "rationale.md");
    fs.writeFileSync(rationale, "Accepted after reviewing the core-only baseline.\n");
    const result = coreSizeGate.rationaleRecord(fixtureRoot, rationale, null);
    assert.strictEqual(result.type, "file");
    assert.strictEqual(result.path, "rationale.md");
  } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});

runTest("CORE-LEAN-BASE-01 smoke builds report sizes without mutating tracked state", async () => {
  const beforeStatus = childProcess.execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
  const beforeVersion = fs.readFileSync(path.join(ROOT, "version.json"));
  const result = await coreAudit.runCoreSmokeBuild({ rootDir: ROOT });
  assert.ok(result.readable.bytes > result.uglified.bytes);
  assert.ok(Number.isInteger(result.readable.coreBytes));
  assert.ok(result.readable.coreBytes < result.readable.bytes);
  assert.ok(result.readable.gzipBytes > 0);
  assert.ok(Number.isInteger(result.uglified.coreBytes));
  assert.ok(result.uglified.coreBytes < result.uglified.bytes);
  assert.ok(result.uglified.gzipBytes > 0);
  assert.ok(result.uglified.contributors.length > 0);
  assert.strictEqual(childProcess.execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }), beforeStatus);
  assert.deepStrictEqual(fs.readFileSync(path.join(ROOT, "version.json")), beforeVersion);
});

runTest("MANIFEST-01 validation rejects repeated symbols and generated import paths", () => {
  const entries = [
    { filePath: "/repo/src/features/alpha/index.js", relativePath: "src/features/alpha/index.js", exports: ["alphaFeature", "alphaFeature"] },
    { filePath: "/repo/src/features/alpha/index.js", relativePath: "src/features/alpha/index.js", exports: ["betaFeature"] },
  ];
  const errors = validateFeatureManifestEntries(entries, { rootDir: "/repo" });
  assert.ok(errors.some((error) => /more than once/.test(error) && /alphaFeature/.test(error)));
  assert.ok(errors.some((error) => /Duplicate generated import path/.test(error) && /alpha\/index\.js/.test(error)));
});

runTest("MANIFEST-01 check command exits non-zero for stale output without rewriting it", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(TMP_DIR, "manifest-check-"));
  const featureDir = path.join(fixtureRoot, "src/features/example");
  const outputFile = path.join(fixtureRoot, "src/generated/features.generated.js");

  fs.mkdirSync(featureDir, { recursive: true });
  fs.writeFileSync(path.join(featureDir, "index.js"), "export const exampleFeature = {}\n");
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, "// stale\n");

  const result = checkFeatureManifest({ rootDir: fixtureRoot, outputFile });
  assert.strictEqual(result.matches, false);
  assert.strictEqual(result.actualContent, "// stale\n");
  assert.ok(result.expectedContent.includes("exampleFeature"));
  const command = childProcess.spawnSync(process.execPath, [
    path.join(ROOT, "scripts/check-feature-manifest.cjs"),
    "--root", fixtureRoot,
    "--output", outputFile,
  ], { encoding: "utf8" });
  assert.notStrictEqual(command.status, 0);
  assert.strictEqual(fs.readFileSync(outputFile, "utf8"), "// stale\n");
});

runTest("MANIFEST-01 manifest rendering is deterministic for unordered discovery entries", () => {
  const entries = [
    { relativePath: "src/features/zeta/index.js", exports: ["zetaFeature"] },
    { relativePath: "src/features/alpha/index.js", exports: ["alphaFeature"] },
  ];
  const first = renderFeatureManifest(entries);
  const second = renderFeatureManifest([...entries].reverse());
  assert.strictEqual(first, second);
  assert.ok(first.indexOf("alphaFeature") < first.indexOf("zetaFeature"));
});

runTest(
  "feature scope helper skips features outside current page scope",
  () => {
    const feature = { pageScopes: ["isLatest"] };
    const currentThreadScopes = { isLatest: false, isThread: true };
    const currentLatestScopes = { isLatest: true, isThread: false };

    assert.strictEqual(
      featureMatchesPageScopes(feature, (scope) => currentThreadScopes[scope]),
      false,
    );
    assert.strictEqual(
      featureMatchesPageScopes(feature, (scope) => currentLatestScopes[scope]),
      true,
    );
    assert.strictEqual(
      featureMatchesPageScopes({ pageScopes: [] }, () => false),
      true,
    );
  },
);

runTest("feature lifecycle aborts an in-progress enable when disabled", async () => {
  const events = [];
  let resolveStarted;
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const feature = createFeature("Lifecycle Test", {
    id: "lifecycle-test",
    enable: (context) =>
      new Promise((resolve, reject) => {
        resolveStarted();
        const onAbort = () => {
          events.push("abort");
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
        setTimeout(() => {
          if (!context.signal.aborted) {
            events.push("finish");
            resolve();
          }
        }, 20);
      }),
    disable: () => {
      events.push("disable");
    },
  });

  const enablePromise = feature.enable();
  await started;
  const disablePromise = feature.disable();

  await assert.rejects(enablePromise, /aborted|AbortError/i);
  await disablePromise;
  assert.deepStrictEqual(events, ["abort", "disable"]);
});

runTest("ROUTE-01 route state creates one shared generation and aborts stale route work", () => {
  resetRouteStateForTests();
  const first = beginRoute({ href: "https://f95zone.to/threads/a" });
  const duplicate = beginRoute({ href: "https://f95zone.to/threads/a" });
  const second = beginRoute({ href: "https://f95zone.to/sam/latest_alpha#new" });
  setRoutePageFlags({ isLatest: true });
  assert.strictEqual(first.changed, true);
  assert.strictEqual(duplicate.changed, false);
  assert.strictEqual(second.generation, first.generation + 1);
  assert.strictEqual(duplicate.correlationId, first.correlationId);
  assert.notStrictEqual(second.correlationId, first.correlationId);
  assert.strictEqual(first.signal.aborted, true);
  assert.strictEqual(getRouteContext().pageFlags.isLatest, true);
  resetRouteStateForTests();
});

runTest("BOOT-01 classifies success, optional, recoverable, and required steps", async () => {
  const calls = [];
  const correlationIds = [];
  const degraded = await runBootstrapPipeline([
    { id: "success", classification: "required", timeoutMs: 100, run: (context) => { correlationIds.push(context.correlationId); calls.push("success"); } },
    { id: "optional", classification: "optional", timeoutMs: 100, run: (context) => { correlationIds.push(context.correlationId); throw new Error("optional"); } },
    { id: "recover", classification: "recoverable", timeoutMs: 100, run: () => { throw new Error("recover"); }, fallback: () => calls.push("fallback") },
  ]);
  assert.strictEqual(degraded.status, "degraded");
  assert.deepStrictEqual(correlationIds, [degraded.correlationId, degraded.correlationId]);
  assert.deepStrictEqual(calls, ["success", "fallback"]);
  assert.deepStrictEqual(degraded.degradedSteps, ["optional", "recover"]);
  const failed = await runBootstrapPipeline([
    { id: "required", classification: "required", timeoutMs: 100, run: () => { throw new Error("required"); } },
    { id: "dependent", classification: "required", timeoutMs: 100, run: () => calls.push("dependent") },
  ]);
  assert.strictEqual(failed.status, "failed");
  assert.ok(!calls.includes("dependent"));
  assert.deepStrictEqual(failed.failedSteps, ["required"]);
});

runTest("ROUTE-01 normalization treats path query and hash changes as meaningful", () => {
  const base = normalizeRouteUrl({ href: "https://f95zone.to/threads/a.1/" });
  const query = normalizeRouteUrl({ href: "https://f95zone.to/threads/a.1/?page=2" });
  const hash = normalizeRouteUrl({ href: "https://f95zone.to/threads/a.1/#updates" });
  assert.notStrictEqual(base, query);
  assert.notStrictEqual(base, hash);
  assert.strictEqual(normalizeRouteUrl({ href: "https://f95zone.to/threads/a.1/" }), base);
});

runTest("ROUTE-01 reconciles applicability A to B to C without duplicate same-route work", async () => {
  const sandbox = createDomSandbox();
  try {
    const result = await loadModule("tests/fixtures/routeHarness.js").runRouteApplicabilityScenario();
    assert.strictEqual(result.duplicate.changed, false);
    assert.strictEqual(result.duplicate.generation, result.a.generation);
    assert.deepStrictEqual(result.lifecycle, [
      `enable:${result.a.generation}`,
      `disable:${result.b.generation}`,
      `enable:${result.c.generation}`,
    ]);
    const transitionEvents = result.events.filter((event) => event.code === "ROUTE_TRANSITION");
    assert.deepStrictEqual(transitionEvents.map((event) => event.correlationId), [
      result.a.correlationId,
      result.b.correlationId,
      result.c.correlationId,
    ]);
  } finally {
    sandbox.restore();
  }
});

runTest("ROUTE-01 task queue consumes route context and aborts stale running work", async () => {
  const clock = createFakeClock();
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  try {
    resetRouteStateForTests();
    const a = beginRoute({ href: "https://f95zone.to/threads/a.1/" });
    const queue = createTaskQueue({ name: "ROUTE-01", ownerId: "core:route-test", delay: 0, routeContext: a });
    let observed;
    const work = queue.add("work", (context) => {
      observed = context;
      return new Promise(() => {});
    }, a);
    await clock.tick(0);
    const b = beginRoute({ href: "https://f95zone.to/threads/b.2/" });
    queue.setRouteContext(b);
    assert.strictEqual((await work).status, "cancelled");
    assert.strictEqual(observed.correlationId, a.correlationId);
    assert.strictEqual(observed.routeGeneration, a.generation);
    await queue.dispose();
    resetRouteStateForTests();
  } finally {
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  }
});

runTest("ROUTE-01 rapid A to B to C signals prevent stale lifecycle commits", async () => {
  resetRouteStateForTests();
  const commits = [];
  const feature = createFeature("ROUTE-01 Stale Commit", {
    enable: async (context) => {
      await Promise.resolve();
      if (!context.signal.aborted) commits.push(context.routeGeneration);
    },
    disable: () => null,
  });
  const contexts = ["a.1", "b.2", "c.3"].map((slug) => beginRoute({ href: `https://f95zone.to/threads/${slug}/` }));
  const operations = contexts.map((context) => feature.enable({ ...context, routeGeneration: context.generation }));
  await Promise.allSettled(operations);
  assert.deepStrictEqual(commits, [contexts[2].generation]);
  await feature.disable({ reason: "teardown" });
  resetRouteStateForTests();
});

runTest("BOOT-01 timeout aborts the step and returns a structured failed summary", async () => {
  const clock = createFakeClock();
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  try {
    let signal;
    const running = runBootstrapPipeline([
      { id: "timeout", classification: "required", timeoutMs: 25, run: (context) => { signal = context.signal; return new Promise(() => {}); } },
    ], { correlationId: "bootstrap:timeout" });
    for (let index = 0; index < 5 && clock.pending() === 0; index += 1) await Promise.resolve();
    await clock.tick(25);
    const summary = await running;
    assert.strictEqual(summary.status, "failed");
    assert.strictEqual(summary.steps[0].timedOut, true);
    assert.strictEqual(signal.aborted, true);
    assert.strictEqual(summary.correlationId, "bootstrap:timeout");
  } finally {
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  }
});

runTest("TEARDOWN-01 aborts active bootstrap without publishing stale summary", async () => {
  const bootstrap = loadModule("src/core/bootstrap.js");
  let release;
  const running = bootstrap.runBootstrapPipeline([
    { id: "teardown-hang", classification: "required", timeoutMs: 1000, run: () => new Promise((resolve) => { release = resolve; }) },
  ]);
  await Promise.resolve();
  assert.strictEqual(bootstrap.abortActiveBootstrap("TEARDOWN-01"), 1);
  release(true);
  const summary = await running;
  assert.strictEqual(summary.status, "cancelled");
  assert.strictEqual(bootstrap.getLastBootstrapSummary(), null);
});

runTest("BOOT-01 degraded diagnostics retain correlation and redact failure details", async () => {
  const result = await loadModule("tests/fixtures/bootstrapHarness.js").runDegradedBootstrapScenario();
  assert.strictEqual(result.summary.status, "degraded");
  assert.strictEqual(result.diagnostics.snapshots.bootstrap.status, "degraded");
  assert.deepStrictEqual(result.diagnostics.snapshots.bootstrap.degradedSteps, ["optional", "recover"]);
  assert.ok(result.events.length >= 2);
  assert.ok(result.events.every((event) => event.correlationId === result.summary.correlationId));
  assert.ok(result.events.every((event) => !event.message.includes("secret")));
});

runTest("BOOT-01 reset followed by startup does not reuse stale bootstrap state", async () => {
  const sandbox = createDomSandbox();
  try {
    const result = await loadModule("tests/fixtures/bootstrapHarness.js").runFreshBootstrapScenario();
    assert.strictEqual(result.first.correlationId, "bootstrap:first");
    assert.strictEqual(result.idle, null);
    assert.strictEqual(result.second.correlationId, "bootstrap:second");
    assert.deepStrictEqual(result.second.steps.map((step) => step.id), ["second"]);
  } finally {
    sandbox.restore();
  }
});

runTest("config schema strictly rejects unknown nested fields and tolerantly preserves siblings", () => {
  const strict = validateConfig({ latestSettings: { autoRefresh: true, unknown: true } }, { mode: "strict", partial: true });
  assert.strictEqual(strict.valid, false);
  assert.ok(strict.issues.some((entry) => entry.path === "latestSettings.unknown"));
  const tolerant = validateConfig({ latestSettings: { autoRefresh: true, minVersion: "bad" } }, { mode: "tolerant", partial: true });
  assert.strictEqual(tolerant.data.latestSettings.autoRefresh, true);
  assert.strictEqual(typeof tolerant.data.latestSettings.minVersion, "number");
  assert.ok(getExportableConfigKeys().includes("latestSettings"));
});

runTest("CONFIG-01 schema covers defaults, metadata, and deterministic pure APIs", () => {
  const defaults = getDefaultConfig();
  const defaultsSnapshot = JSON.stringify(defaults);
  const persistedPaths = getPersistedConfigPaths().sort();
  assert.deepStrictEqual(persistedPaths, Object.keys(defaults).sort());
  assert.strictEqual(Object.hasOwn(defaults, "metrics"), false);

  const valid = validateConfig(defaults, { mode: "strict" });
  assert.strictEqual(valid.valid, true);
  assert.deepStrictEqual(valid.data, defaults);
  assert.strictEqual(JSON.stringify(defaults), defaultsSnapshot);

  const representative = validateConfig({
    prefixes: {
      items: [{ id: 1, name: "Example", class: "example" }],
      categories: { games: [{ id: null, name: "Games", prefixIds: [1] }] },
    },
    globalSettings: { configVisibility: false },
    addons: {
      byAddon: { "example-addon": { state: { enabled: true, mode: "safe" } } },
      installedMeta: { "example-addon": { name: "Example", version: "1.0", installedSeenAt: 1, lastSeenAt: 2 } },
    },
    savedNotifID: 42,
  }, { mode: "strict", partial: true });
  assert.strictEqual(representative.valid, true);
  assert.strictEqual(representative.data.prefixes.categories.games[0].id, null);
  assert.strictEqual(representative.data.addons.byAddon["example-addon"].state.mode, "safe");
  assert.strictEqual(representative.data.savedNotifID, 42);

  assert.deepStrictEqual(getExportableConfigKeys().sort(), [
    "color",
    "excludedTags",
    "globalSettings",
    "latestSettings",
    "markedTags",
    "overlaySettings",
    "preferredTags",
    "tags",
    "threadSettings",
  ].sort());
  assert.strictEqual(getExportableConfigKeys().includes("metrics"), false);
  assert.strictEqual(getConfigPathMetadata("latestSettings.priorityWeights.rating").exportable, true);
  assert.strictEqual(Object.hasOwn(getConfigPathMetadata("addons.byAddon.example-addon.state.enabled"), "syncable"), false);
  assert.strictEqual(getConfigPathMetadata("missing.path"), null);
  assert.ok(getSchemaPathIndex()["latestSettings.tagModifiers.preferred"]);

  const merged = mergeWithDefaults({ latestSettings: { autoRefresh: true } });
  assert.strictEqual(merged.latestSettings.autoRefresh, true);
  assert.strictEqual(typeof merged.latestSettings.minVersion, "number");
  assert.notStrictEqual(merged.latestSettings, defaults.latestSettings);
});

runTest("CORE-CONFIG-RUNTIME-LEAN-01 keeps descriptor defaults and metadata covered", () => {
  const defaults = getDefaultConfig();
  for (const [key, descriptor] of Object.entries(CONFIG_SCHEMA)) {
    assert.ok(Object.hasOwn(defaults, key), key);
    assert.deepStrictEqual(defaults[key], descriptor.defaultValue, key);
  }

  assert.ok(getConfigPathMetadata("tags[3].id"));
  assert.ok(getConfigPathMetadata("prefixes.categories.games[3].prefixIds[2]"));
  assert.strictEqual(getConfigPathMetadata("addons.byAddon.example-addon.state.enabled").persisted, true);

  const schemaSource = fs.readFileSync(path.join(ROOT, "src/config/schema.js"), "utf8");
  assert.doesNotMatch(schemaSource, /\bPATH_INDEX\b/);
  assert.doesNotMatch(schemaSource, /\bconst DEFAULTS\b/);
});

runTest("CONFIG-01 strict mode covers nested constraints and feature validators", () => {
  const invalid = validateConfig({
    tags: [{ id: 1, name: "Example" }, { id: 1, name: "Duplicate" }],
    color: { red: "not-a-color" },
    latestSettings: {
      latestOverlayStyle: "invalid",
      latestOverlayColorOrder: ["excluded", "excluded", "completed", "onhold", "abandoned", "highVersion", "invalidVersion"],
      ratingHighlightThreshold: -1,
      priorityWeights: { rating: "heavy" },
      tagModifiers: { preferred: 11 },
    },
    addons: {
      trustedIds: ["bad id"],
      byAddon: { "bad.id": { state: { enabled: true } } },
    },
  }, { mode: "strict", partial: true });

  assert.strictEqual(invalid.valid, false);
  for (const path of [
    "tags[1]",
    "color.red",
    "latestSettings.latestOverlayStyle",
    "latestSettings.latestOverlayColorOrder",
    "latestSettings.ratingHighlightThreshold",
    "latestSettings.priorityWeights.rating",
    "latestSettings.tagModifiers.preferred",
    "addons.trustedIds[0]",
    "addons.byAddon.bad.id",
  ]) assert.ok(invalid.issues.some((entry) => entry.path === path), path);
  assert.ok(invalid.issues.every((entry) => typeof entry.receivedType === "string" && typeof entry.receivedSummary === "string"));
});

runTest("CORE-METRICS-REMOVE-01 drops persisted metrics while preserving valid siblings without a write", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    const data = JSON.parse(JSON.stringify(config));
    data.latestSettings.minVersion = 0.9;
    data.metrics = { failed: 22, succeeded: 100 };
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, {
      schemaVersion: 1,
      revision: 4,
      writerId: "metrics-fixture",
      updatedAt: 4,
      data,
    });
    await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
    const before = JSON.stringify(gm.snapshot());
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.status, "sanitized");
    assert.strictEqual(loaded.data.latestSettings.minVersion, 0.9);
    assert.strictEqual(Object.hasOwn(loaded.data, "metrics"), false);
    assert.strictEqual(JSON.stringify(gm.snapshot()), before);
  } finally { global.GM = previousGM; }
});

runTest("CORE-METRICS-REMOVE-01 leaves no persisted-metrics service, imports, or UI surface", () => {
  assert.strictEqual(fs.existsSync(path.join(ROOT, "src/services/metricsService.js")), false);
  for (const relativePath of [
    "src/config/defaults.js",
    "src/config/schema.js",
    "src/config/state.js",
    "src/ui/assets/ui.html",
    "src/ui/assets/css.css",
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.doesNotMatch(source, /metricsService|recordSuccess|recordFail|defaultMetrics|config\.metrics/);
  }
});

runTest("CONFIG-01 tolerant mode preserves valid data and recovers invalid input", () => {
  const tolerant = sanitizeConfig({
    preferredTags: [1, 1, "bad"],
    latestSettings: {
      autoRefresh: true,
      minVersion: "bad",
      priorityWeights: { rating: 2.5, engagement: "bad" },
    },
    addons: { byAddon: { "bad.id": { state: { enabled: true } }, "good-addon": { state: { enabled: true } } } },
  }, { partial: true });

  assert.strictEqual(tolerant.data.latestSettings.autoRefresh, true);
  assert.strictEqual(tolerant.data.latestSettings.minVersion, getDefaultConfig().latestSettings.minVersion);
  assert.strictEqual(tolerant.data.latestSettings.priorityWeights.rating, 2.5);
  assert.strictEqual(tolerant.data.latestSettings.priorityWeights.engagement, getDefaultConfig().latestSettings.priorityWeights.engagement);
  assert.deepStrictEqual(tolerant.data.preferredTags, [1]);
  assert.deepStrictEqual(Object.keys(tolerant.data.addons.byAddon), ["good-addon"]);
  assert.ok(tolerant.issues.length >= 4);

  const section = validateConfigSection("color", { completed: "#abc" }, { mode: "strict" });
  assert.strictEqual(section.valid, true);
  assert.strictEqual(section.data.color.completed, "#abc");
});

runTest("MANIFEST-01 feature catalog rejects invalid descriptors before registration", () => {
  resetFeatureCatalogForTests();
  const invalid = {
    id: "bad-feature",
    featureKey: "bad-feature",
    bootstrapMode: "eventually",
    pageScopes: ["missingScope"],
    enable: true,
  };
  const errors = validateFeatureDescriptor(invalid);
  assert.ok(errors.some((error) => /bootstrap/i.test(error)));
  assert.ok(errors.some((error) => /page scope/i.test(error)));
  assert.ok(errors.some((error) => /enable/i.test(error)));
  assert.throws(() => registerFeature(invalid), /registration rejected/i);
});

runTest("MANIFEST-01 feature catalog rejects duplicate ids and settings contributions", () => {
  resetFeatureCatalogForTests();
  const descriptor = {
    id: "catalog-alpha",
    featureKey: "catalog-alpha",
    bootstrapMode: "waitForBody",
    pageScopes: [],
    enable() {},
    disable() {},
    settingsUi: { sectionId: "latest", metaMaps: [{ control: {} }] },
  };
  assert.strictEqual(registerFeature(descriptor), descriptor);
  assert.throws(
    () => registerFeature({ ...descriptor, featureKey: "catalog-beta" }),
    /duplicate feature id/i,
  );
  assert.throws(
    () => registerFeature({ ...descriptor, id: "catalog-beta", featureKey: "catalog-beta" }),
    /settings contribution/i,
  );
  resetFeatureCatalogForTests();
});

runTest("MANIFEST-01 descriptor defaults only missing bootstrap and page scopes", () => {
  resetFeatureCatalogForTests();
  const descriptor = { id: "manifest-defaults", featureKey: "manifest-defaults" };
  assert.deepStrictEqual(validateFeatureDescriptor(descriptor), []);
  assert.strictEqual(registerFeature(descriptor), descriptor);
  assert.strictEqual(descriptor.bootstrapMode, "waitForBody");
  assert.deepStrictEqual(descriptor.pageScopes, []);
  resetFeatureCatalogForTests();
});

runTest("MANIFEST-01 production rejects invalid descriptors and continues valid registration", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const result = loadModule("tests/fixtures/manifestCatalogHarness.js").runProductionRegistrationScenario();
    assert.strictEqual(result.invalidResult, null);
    assert.strictEqual(result.validAccepted, true);
    assert.deepStrictEqual(result.registeredIds, ["valid-production-feature"]);
    assert.ok(result.events.some((event) => event.code === "FEATURE_FAILURE"
      && event.ownerId === "Feature Catalog"
      && /invalid bootstrap mode/.test(event.message)));
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

runTest("add-on action registry rejects duplicates and exposes safe snapshots", () => {
  registerAction({
    id: "test.action", protocolVersion: 1, requiredCapabilities: ["test"], timeoutMs: 10,
    auditCategory: "test", validatePayload: () => true, execute: () => ({ ok: true, value: "ok" }),
  });
  assert.throws(() => registerAction({ id: "test.action", validatePayload: () => true, execute: () => ({ ok: true }) }), /duplicate/i);
  const snapshot = getActionSnapshot();
  assert.strictEqual(snapshot[0].id, "test.action");
  assert.strictEqual("execute" in snapshot[0], false);
});

runTest("add-on action descriptor validates payloads and enforces timeouts", async () => {
  const invalid = await executeActionDescriptor({ validatePayload: () => ({ ok: false, reason: "invalid_payload" }) }, { payload: {} });
  assert.deepStrictEqual(invalid, { ok: false, reason: "invalid_payload" });
  const timedOut = await executeActionDescriptor({
    validatePayload: () => true, timeoutMs: 1, execute: () => new Promise(() => {}), redactResult: (value) => value,
  }, { payload: {} });
  assert.deepStrictEqual(timedOut, { ok: false, reason: "action_timeout" });
});

runTest("registered add-on actions expose capabilities without handlers", () => {
  const actions = getRegisteredAddonActionSnapshot();
  assert.ok(actions.length >= 20);
  assert.ok(actions.some((entry) => entry.id === "storage.set" && entry.requiredCapabilities.includes("storage")));
  assert.ok(actions.every((entry) => !("execute" in entry)));
  assert.strictEqual(isAddonActionAllowed(new Set(["toast"]), "storage.set"), false);
  assert.strictEqual(isAddonActionAllowed(new Set(["storage"]), "storage.set"), true);
});

runTest("registered add-on action descriptors preserve valid action responses", async () => {
  const received = [];
  const result = await invokeRegisteredAddonCoreAction({
    addonId: "test-addon", action: "toast.show", payload: { message: "Hello", type: "info" },
    deps: { showToast: (...args) => received.push(args) }, limits: {},
  });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(received.length, 1);
});

runTest("settings metadata registry indexes ownership and releases dynamic entries", () => {
  resetSettingsMetadataForTests();

  const cleanup = registerSettingsMetadata("latest", {
    autoRefresh: {
      type: "toggle",
      config: "latestSettings.autoRefresh",
      text: "Auto Refresh",
    },
  }, "feature:latest-control");

  assert.strictEqual(
    getMetadataByConfigPath("latestSettings.autoRefresh").id,
    "autoRefresh",
  );
  assert.strictEqual(getSettingsMetadataById("autoRefresh").ownerId, "feature:latest-control");
  assert.strictEqual(getSettingsMetadataBySection("latest").autoRefresh.config, "latestSettings.autoRefresh");
  assert.strictEqual(getSettingsMetadataByOwner("feature:latest-control").length, 1);
  assert.ok(Object.isFrozen(getSettingsMetadataSnapshot()));
  assert.throws(
    () => registerSettingsMetadata("thread", { autoRefresh: { type: "toggle" } }, "feature:duplicate"),
    /duplicate settings metadata id/i,
  );
  assert.throws(
    () => registerSettingsMetadata("thread", {
      anotherControl: { type: "toggle", config: "latestSettings.autoRefresh" },
    }, "feature:duplicate"),
    /duplicate settings metadata config path/i,
  );

  assert.strictEqual(cleanup(), 1);
  assert.strictEqual(cleanup(), 0);
  assert.strictEqual(getMetadataByConfigPath("latestSettings.autoRefresh"), null);
  resetSettingsMetadataForTests();
});

runTest("info metadata renders without input listeners and unsupported input types fail clearly", () => {
  const previousDocument = global.document;
  const doc = createFakeDocument();
  global.document = doc;

  try {
    const row = renderSetting("notice", {
      type: "info",
      text: "This setting is informational.",
      tooltip: "No changes are saved.",
      className: "notice",
    });
    assert.strictEqual(row.tagName, "DIV");
    assert.strictEqual(row.children.length, 1);
    assert.strictEqual(row.children[0].tagName, "P");
    assert.strictEqual(row.children[0].textContent, "This setting is informational.");
    assert.strictEqual(Object.hasOwn(row, "dataset"), false);
    assert.throws(() => createInput({ type: "unsupported" }, "unsupported"), /unknown input type/i);
  } finally {
    global.document = previousDocument;
  }
});

runTest("resource owners release scoped resources and expose snapshots", () => {
  const owner = createResourceOwner("feature:test-owner");
  const cleanupCalls = [];

  owner.register("listener:one", () => cleanupCalls.push("listener-one"));
  owner.register("listener:two", () => cleanupCalls.push("listener-two"));

  const snapshot = getResourceSnapshot();
  assert.strictEqual(snapshot.owners["feature:test-owner"].resources.length, 2);

  const releaseSummary = releaseOwner("feature:test-owner");
  assert.deepStrictEqual(releaseSummary, {
    ownerId: "feature:test-owner",
    released: 2,
    alreadyReleased: false,
  });
  assert.deepStrictEqual(cleanupCalls, ["listener-one", "listener-two"]);
  assert.deepStrictEqual(getResourceSnapshot().owners, {});
});

runTest("resource owners reject duplicate resources for the same owner", () => {
  const owner = createResourceOwner("feature:duplicate-owner");
  owner.register("listener:duplicate", () => {});
  assert.throws(() => owner.register("listener:duplicate", () => {}), /duplicate/i);
  releaseOwner("feature:duplicate-owner");
});

runTest("task queue applies every duplicate policy deterministically", async () => {
  for (const [policy, firstStatus] of [
    ["drop-new", "completed"],
    ["drop-old", "cancelled"],
    ["replace-pending", "cancelled"],
  ]) {
    const queue = createTaskQueue({
      name: `duplicate-${policy}`,
      ownerId: `test:${policy}`,
      delay: 0,
      duplicatePolicy: policy,
    });
    queue.pause();
    const first = queue.add("same", () => "first");
    const second = queue.add("same", () => "second");
    queue.resume();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.strictEqual(firstResult.status, firstStatus);
    assert.strictEqual(secondResult.status, policy === "drop-new" ? "cancelled" : "completed");
    await queue.dispose();
  }
});

runTest("task queue enforces overflow, generation invalidation, and running cancellation", async () => {
  const queue = createTaskQueue({
    name: "queue-contract",
    ownerId: "test:queue-contract",
    delay: 0,
    maxPending: 1,
    overflowPolicy: "drop-oldest",
  });
  queue.pause();
  const oldest = queue.add("oldest", () => "oldest");
  const newest = queue.add("newest", () => "newest");
  queue.resume();
  assert.strictEqual((await oldest).status, "cancelled");
  assert.strictEqual((await newest).status, "completed");

  const stale = queue.add("stale", () => "stale", 0);
  queue.setGeneration(1);
  assert.strictEqual((await stale).status, "cancelled");

  let taskContext;
  const running = queue.add("running", (context) => {
    taskContext = context;
    return new Promise(() => {});
  }, 1);
  while (!taskContext) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(queue.cancelRunning("test cancellation"), true);
  assert.strictEqual((await running).status, "cancelled");
  const idle = await queue.whenIdle();
  assert.strictEqual(idle.runningKey, null);
  await queue.dispose();
});

runTest("task queue drain resolves cancelled when disposed before completion", async () => {
  const queue = createTaskQueue({
    name: "queue-drain",
    ownerId: "test:queue-drain",
    delay: 0,
  });
  const pending = queue.add("pending", () => "pending");
  const drained = await queue.dispose();

  assert.strictEqual(drained.status, "disposed");
  assert.strictEqual((await pending).status, "cancelled");
  const idle = await queue.whenIdle();
  assert.strictEqual(idle.disposed, true);
});

runTest("task queue drain reports a cancelled result when disposed before tasks finish", async () => {
  const queue = createTaskQueue({
    name: "queue-drain-cancelled",
    ownerId: "test:queue-drain-cancelled",
    delay: 0,
  });
  queue.add("pending", () => "pending");
  const drainResult = await queue.drain();
  assert.strictEqual(drainResult.status, "cancelled");
  assert.strictEqual(drainResult.reason, "queue disposed");
  await queue.dispose();
});

runTest("add-on observers ignore nodes mounted inside their own UI", () => {
  const addonRoot = {
    nodeType: 1,
    parentElement: null,
    getAttribute: (name) => (name === "data-addon-id" ? "example-addon" : null),
  };
  const child = {
    nodeType: 1,
    parentElement: addonRoot,
    getAttribute: () => null,
  };

  assert.strictEqual(isAddonOwnedObserverNode(child, "example-addon"), true);
  assert.strictEqual(isAddonOwnedObserverNode(child, "different-addon"), false);
});

function createFakeElement(tagName, doc) {
  const classes = new Set();
  const attrs = Object.create(null);
  const element = {
    tagName: String(tagName || "").toUpperCase(),
    ownerDocument: doc,
    children: [],
    style: {},
    textContent: "",
    parentNode: null,
    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      this.children.push(child);
      if (child.id) {
        doc.__nodesById[child.id] = child;
      }
      return child;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
      if (name === "id") {
        this.id = String(value);
        doc.__nodesById[this.id] = this;
      }
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) {
        this.parentNode.children.splice(index, 1);
      }
      if (this.id) {
        delete doc.__nodesById[this.id];
      }
      this.parentNode = null;
    },
    classList: {
      add(name) {
        classes.add(String(name));
      },
      remove(name) {
        classes.delete(String(name));
      },
      contains(name) {
        return classes.has(String(name));
      },
    },
  };

  Object.defineProperty(element, "firstElementChild", {
    get() {
      return this.children[0] || null;
    },
  });

  return element;
}

function createFakeDocument({ withBody = false } = {}) {
  const doc = {
    __nodesById: Object.create(null),
    body: null,
    documentElement: null,
    getElementById(id) {
      return this.__nodesById[String(id)] || null;
    },
    createElement(tagName) {
      return createFakeElement(tagName, doc);
    },
  };

  doc.documentElement = createFakeElement("html", doc);
  if (withBody) {
    doc.body = createFakeElement("body", doc);
  }

  return doc;
}

function resetFastCaptureHarness() {
  resetFastCaptureAdapterForTests();
  resetFastCaptureStoreForTests();
}

runTest("add-on dock buttons receive the core dock style class", () => {
  const doc = createFakeDocument();
  const slot = createFakeElement("div", doc);
  slot.querySelector = () => null;

  const group = createAddonDockGroup(slot, "example-addon", [
    { id: "open", label: "Open", variant: "secondary" },
  ]);

  assert.strictEqual(group.children[0].className, "f95ue-page-dock-btn");
  assert.strictEqual(group.children[0].classList.contains("secondary"), true);
});

runTest(
  "StateManager blocks unknown set paths when knownPaths is provided",
  () => {
    const manager = createStateManager(
      { known: 1 },
      { knownPaths: new Set(["known"]), warnUnknown: false },
    );

    assert.strictEqual(manager.set("known", 2), true);
    assert.strictEqual(manager.get("known"), 2);

    assert.strictEqual(manager.set("unknown", 1), false);
    assert.strictEqual(manager.get("unknown"), undefined);
  },
);

runTest("setByPath recovers from primitive intermediate path segments", () => {
  const obj = { feature: "legacy" };
  const didSet = setByPath(obj, "feature.enabled", true);
  assert.strictEqual(didSet, true);
  assert.deepStrictEqual(obj, { feature: { enabled: true } });
});

runTest(
  "StateManager getState handles circular runtime values without throwing",
  () => {
    const manager = createStateManager({ shadowRoot: null });
    const circular = {};
    circular.self = circular;

    assert.strictEqual(manager.set("shadowRoot", circular), true);
    const snapshot = manager.getState();
    assert.deepStrictEqual(snapshot, { shadowRoot: { self: null } });
  },
);

runTest(
  "normalizeOverlayColorOrder restores missing keys and removes duplicates",
  () => {
    const result = normalizeOverlayColorOrder([
      "preferred",
      "excluded",
      "preferred",
      "onhold",
    ]);
    assert.strictEqual(result.length, OVERLAY_COLOR_ORDER_KEYS.length);
    assert.deepStrictEqual(result.slice(0, 3), [
      "preferred",
      "excluded",
      "onhold",
    ]);
    assert.strictEqual(new Set(result).size, OVERLAY_COLOR_ORDER_KEYS.length);
  },
);

runTest("buildOrderedOverlayMatches follows requested order", () => {
  const order = ["completed", "excluded", "preferred"];
  const overlayMatches = {
    preferred: { label: "Preferred", color: "#111111" },
    excluded: { label: "Excluded", color: "#222222" },
    completed: { label: "Completed", color: "#333333" },
  };

  const result = buildOrderedOverlayMatches(overlayMatches, order);
  assert.deepStrictEqual(result.labels.slice(0, 3), [
    "Completed",
    "Excluded",
    "Preferred",
  ]);
  assert.deepStrictEqual(result.colors.slice(0, 3), [
    "#333333",
    "#222222",
    "#111111",
  ]);
});

runTest("coerceSettingValue keeps numeric setting typed and clamped", () => {
  const meta = {
    type: "number",
    config: "latestSettings.minVersion",
    input: { min: 0, max: 2 },
  };

  assert.strictEqual(coerceSettingValue(meta, "1.2", 0.5), 1.2);
  assert.strictEqual(coerceSettingValue(meta, "-4", 0.5), 0);
  assert.strictEqual(coerceSettingValue(meta, "999", 0.5), 2);
  assert.strictEqual(coerceSettingValue(meta, "abc", 0.5), 0.5);
});

runTest("coerceSettingValue validates color values", () => {
  const meta = { type: "color", config: "color.preferred" };

  assert.strictEqual(coerceSettingValue(meta, "#abcdef", "#123456"), "#abcdef");
  assert.strictEqual(coerceSettingValue(meta, "invalid", "#123456"), "#123456");
});

runTest(
  "prefix normalization retains complete records inside category groups",
  () => {
    const result = normalizePrefixesFromLatestUpdates({
      games: [
        {
          id: 1,
          name: "Engine",
          prefixes: [{ id: 7, name: "Ren&#039;Py", class: "pre-renpy" }],
        },
      ],
    });

    assert.deepStrictEqual(result.categories.games[0], {
      id: 1,
      name: "Engine",
      prefixes: [{ id: 7, name: "Ren&#039;Py", class: "pre-renpy" }],
      prefixIds: [7],
    });
    assert.deepStrictEqual(result.items, [
      { id: 7, name: "Ren&#039;Py", class: "pre-renpy" },
    ]);
  },
);

runTest(
  "latest records retain complete payload fields and index by thread id",
  () => {
    const raw = {
      thread_id: "291307",
      title: "Sunset Rose",
      creator: "Lewdlab",
      version: "v0.2",
      views: "201089",
      likes: 297,
      prefixes: [7, "22"],
      tags: [75, "107"],
      rating: "3.5",
      watched: false,
      ignored: false,
      new: true,
      ts: 1781926200,
      future_field: { preserved: true },
    };
    const record = normalizeLatestRecord(raw);
    const index = buildLatestRecordMap([raw]);

    assert.strictEqual(record.thread_id, 291307);
    assert.deepStrictEqual(record.prefixes, [7, 22]);
    assert.deepStrictEqual(record.tags, [75, 107]);
    assert.strictEqual(record.rating, 3.5);
    assert.strictEqual(record.new, true);
    assert.deepStrictEqual(record.future_field, { preserved: true });
    assert.strictEqual(index.get(291307).title, "Sunset Rose");
  },
);

runTest(
  "latest record age uses capture timestamp and clamps fresh records to one day",
  () => {
    assert.strictEqual(
      calculateRecordAgeDays({ ts: 1000 }, 1000 * 1000 + 3600000),
      1,
    );
    assert.strictEqual(
      calculateRecordAgeDays({ ts: 1000 }, 1000 * 1000 + 172800000),
      2,
    );
  },
);

runTest(
  "captured metrics drive rating and engagement highlights without DOM reads",
  () => {
    const classes = getRecordHighlightClasses(
      {
        rating: 3.5,
        likes: 297,
        views: 201089,
        ts: 1781926200,
      },
      1781936304553,
      "games",
    );

    assert.strictEqual(classes.ratingClass, "engagement-rating-green");
    assert.ok(classes.engagementClass);
    assert.strictEqual(classes.views, 201089);
    assert.strictEqual(classes.time, 1);
  },
);

runTest(
  "prefix status map resolves complete records and legacy id references",
  () => {
    const complete = buildPrefixStatusMap({
      items: [],
      categories: {
        games: [
          {
            id: 4,
            name: "Status",
            prefixes: [
              { id: 18, name: "Completed" },
              { id: 20, name: "On Hold" },
              { id: 22, name: "Abandoned" },
            ],
          },
        ],
      },
    });
    const legacy = buildPrefixStatusMap({
      items: [{ id: 22, name: "Abandoned" }],
      categories: { games: [{ name: "Status", prefixIds: [22] }] },
    });

    assert.strictEqual(complete.get(18), "completed");
    assert.strictEqual(complete.get(20), "onhold");
    assert.strictEqual(complete.get(22), "abandoned");
    assert.strictEqual(legacy.get(22), "abandoned");
  },
);

runTest("feature metadata defaults to waitForBody and stable slug id", () => {
  const feature = createFeature("Fancy Feature", {
    enable: () => null,
    disable: () => null,
  });

  assert.strictEqual(normalizeFeatureBootstrapMode(undefined), "waitForBody");
  assert.strictEqual(feature.bootstrapMode, "waitForBody");
  assert.strictEqual(feature.featureKey, "fancy-feature");
});

runTest(
  "feature fast capture metadata normalizes urlIncludes and defaults",
  () => {
    const normalized = normalizeFastCaptureConfig({
      urlIncludes: "latest_data.php",
      dataPath: "msg.data",
    });

    assert.deepStrictEqual(normalized, {
      urlIncludes: ["latest_data.php"],
      dataPath: "msg.data",
      transport: "any",
      mode: "oncePerDocument",
      ttlMs: FAST_CAPTURE_LIMITS.entryTtlMs,
    });
  },
);

runTest("feature fast capture accepts latest mode and ttl", () => {
  assert.deepStrictEqual(
    normalizeFastCaptureConfig({
      urlIncludes: "latest_data.php",
      dataPath: "msg.data",
      mode: "latest",
      ttlMs: 30000,
    }),
    {
      urlIncludes: ["latest_data.php"],
      dataPath: "msg.data",
      transport: "any",
      mode: "latest",
      ttlMs: 30000,
    },
  );
});

runTest(
  "feature health helpers record failure warning and runtime phases",
  () => {
    const failureDetails = reportFeatureFailure(
      "Health Helper Failure Test",
      new Error("boom"),
      "unit.failure",
    );
    const warningDetails = reportFeatureWarning(
      "Health Helper Warning Test",
      "soft boom",
      "unit.warning",
    );
    const runtimeDetails = reportRuntimeError("loose boom", "unit.runtime");
    const statuses = getAllFeatureStatuses();
    const runtimeErrors = getRuntimeErrors();

    assert.strictEqual(failureDetails, "[unit.failure] boom");
    assert.strictEqual(
      statuses["Health Helper Failure Test"].status,
      "failing",
    );
    assert.strictEqual(
      statuses["Health Helper Failure Test"].details,
      "[unit.failure] boom",
    );
    assert.strictEqual(warningDetails, "[unit.warning] soft boom");
    assert.strictEqual(
      statuses["Health Helper Warning Test"].status,
      "degraded",
    );
    assert.strictEqual(runtimeDetails, "[unit.runtime] loose boom");
    assert.ok(
      runtimeErrors.some(
        (entry) => entry.details === "[unit.runtime] loose boom",
      ),
    );
  },
);

runTest("OBSERVE health events redact details, deduplicate, and cap retention", () => {
  clearHealthEventsForTests();
  for (let index = 0; index < 1000; index += 1) {
    recordHealthEvent({
      code: "ADDON_REQUEST", ownerId: "example-addon", subsystem: "addons",
      message: "request failed token=super-secret-value payload=<script>boom()</script>",
      correlationId: "req-observe-1",
    });
  }
  const events = getHealthEvents();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].count, 1000);
  assert.ok(!JSON.stringify(events).includes("super-secret-value"));
  assert.ok(!JSON.stringify(events).includes("<script>"));
  for (let index = 0; index < 150; index += 1) {
    recordHealthEvent({ code: `FEATURE_${index}`, ownerId: `feature-${index}`, message: `failure ${index}` });
  }
  assert.ok(getHealthEvents().length <= 100);
});

runTest("OBSERVE diagnostics providers return snapshots on demand", () => {
  const unregister = registerDiagnosticsProvider("observe-test", () => ({ count: 2 }));
  assert.deepStrictEqual(getHealthDiagnostics().snapshots["observe-test"], { count: 2 });
  unregister();
});

runTest("OBSERVE selector helper chooses fallbacks without failing optional misses", () => {
  const root = { querySelector(selector) { return selector === ".fallback" ? { id: "fallback" } : null; } };
  assert.deepStrictEqual(queryFirstBySelectors([".primary", ".fallback"], root, { key: "test.selector", required: true }), { id: "fallback" });
  assert.strictEqual(queryFirstBySelectors([".missing"], root, { key: "optional.selector", required: false }), null);
});

runTest("matchesFastCaptureUrl supports string and array urlIncludes", () => {
  assert.strictEqual(
    matchesFastCaptureUrl(
      "https://example.com/latest_data.php?page=1",
      "latest_data.php",
    ),
    true,
  );
  assert.strictEqual(
    matchesFastCaptureUrl("https://example.com/api/feed", [
      "latest_data.php",
      "/api/feed",
    ]),
    true,
  );
  assert.strictEqual(
    matchesFastCaptureUrl("https://example.com/api/feed", "/missing"),
    false,
  );
});

runTest(
  "fast capture handles fetch success and disables once-captured listeners",
  () => {
    resetFastCaptureHarness();

    registerFastCaptureFeatures([
      {
        name: "Latest Raw Capture",
        featureKey: "latest-raw-capture",
        bootstrapMode: "fast",
        fastCapture: {
          urlIncludes: ["latest_data.php"],
          dataPath: "msg.data",
          transport: "fetch",
          once: true,
        },
        isApplicable: () => true,
      },
    ]);

    const captured = processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=1",
      JSON.stringify({ msg: { data: [{ id: 1 }] } }),
    );
    const snapshot = getFastCaptureSnapshot("latest-raw-capture");

    assert.strictEqual(captured, 1);
    assert.strictEqual(snapshot.status, "captured");
    assert.deepStrictEqual(getFastCaptureData("latest-raw-capture"), [
      { id: 1 },
    ]);
    assert.strictEqual(hasFastCaptureData("latest-raw-capture"), true);
    assert.strictEqual(
      processCompletedFastCapture(
        "fetch",
        "https://f95zone.to/latest_data.php?page=2",
        JSON.stringify({ msg: { data: [{ id: 2 }] } }),
      ),
      0,
    );
  },
);

runTest(
  "latest mode overwrites the snapshot on every matching response",
  () => {
    resetFastCaptureHarness();
    registerFastCaptureFeatures([
      {
        name: "Latest Capture",
        featureKey: "latest-capture",
        bootstrapMode: "fast",
        fastCapture: {
          urlIncludes: ["latest_data.php"],
          dataPath: "msg.data",
          transport: "fetch",
          mode: "latest",
          ttlMs: 30000,
        },
        isApplicable: () => true,
      },
    ]);

    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=1",
      JSON.stringify({ msg: { data: [{ id: 1 }] } }),
    );
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=2",
      JSON.stringify({ msg: { data: [{ id: 2 }] } }),
    );

    const snapshot = getFastCaptureSnapshot("latest-capture");
    assert.deepStrictEqual(snapshot.data, [{ id: 2 }]);
    assert.strictEqual(snapshot.mode, "latest");
    assert.ok(snapshot.expiresAt > snapshot.capturedAt);
  },
);

runTest("ROUTE-01 oncePerRoute capture consumes the shared route generation", () => {
  resetFastCaptureHarness();
  resetRouteStateForTests();
  const feature = {
    name: "Route Capture",
    featureKey: "route-capture",
    bootstrapMode: "fast",
    fastCapture: {
      urlIncludes: ["latest_data.php"],
      dataPath: "msg.data",
      transport: "fetch",
      mode: "oncePerRoute",
    },
    isApplicable: () => true,
  };
  const firstRoute = beginRoute({ href: "https://f95zone.to/sam/latest_alpha#one" });
  registerFastCaptureFeatures([feature], firstRoute);
  processCompletedFastCapture(
    "fetch",
    "https://f95zone.to/latest_data.php?page=1",
    JSON.stringify({ msg: { data: [1] } }),
  );
  assert.strictEqual(
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=2",
      JSON.stringify({ msg: { data: [2] } }),
    ),
    0,
  );

  const secondRoute = beginRoute({ href: "https://f95zone.to/sam/latest_alpha#two" });
  refreshFastCaptureFeatures([feature], secondRoute);
  assert.strictEqual(
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=2",
      JSON.stringify({ msg: { data: [2] } }),
    ),
    1,
  );
  resetRouteStateForTests();
});

runTest(
  "fast capture handles xhr capture while allowing one feature failure without breaking another",
  () => {
    resetFastCaptureHarness();
    global.document = { body: null };

    registerFastCaptureFeatures([
      {
        name: "Valid Capture",
        featureKey: "valid-capture",
        bootstrapMode: "fast",
        fastCapture: {
          urlIncludes: ["latest_data.php"],
          dataPath: "msg.data",
          transport: "xhr",
          once: true,
        },
        isApplicable: () => true,
      },
      {
        name: "Broken Capture",
        featureKey: "broken-capture",
        bootstrapMode: "fast",
        fastCapture: {
          urlIncludes: ["latest_data.php"],
          dataPath: "msg.missing",
          transport: "xhr",
          once: true,
        },
        isApplicable: () => true,
      },
    ]);

    const captured = processCompletedFastCapture(
      "xhr",
      "https://f95zone.to/latest_data.php?cmd=refresh",
      JSON.stringify({ msg: { data: ["ok"] } }),
    );

    assert.strictEqual(captured, 1);
    assert.strictEqual(
      getFastCaptureSnapshot("valid-capture").status,
      "captured",
    );
    assert.strictEqual(getFastCaptureSnapshot("broken-capture").status, "idle");
  },
);

runTest("fast capture recovers after malformed matching JSON", () => {
  resetFastCaptureHarness();
  global.document = { body: null };

  registerFastCaptureFeatures([
    {
      name: "Recoverable Capture",
      featureKey: "recoverable-capture",
      bootstrapMode: "fast",
      fastCapture: {
        urlIncludes: ["latest_data.php"],
        dataPath: "msg.data",
        transport: "fetch",
        once: true,
      },
      isApplicable: () => true,
    },
  ]);

  assert.strictEqual(
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php",
      "not-json",
    ),
    0,
  );
  assert.strictEqual(
    getFastCaptureSnapshot("recoverable-capture").status,
    "idle",
  );

  assert.strictEqual(
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php",
      JSON.stringify({ msg: { data: { ok: true } } }),
    ),
    1,
  );
  assert.deepStrictEqual(getFastCaptureData("recoverable-capture"), {
    ok: true,
  });
});

runTest(
  "malformed latest responses preserve the last valid fast capture",
  () => {
    resetFastCaptureHarness();

    registerFastCaptureFeatures([
      {
        name: "Latest Capture",
        featureKey: "latest-malformed-capture",
        bootstrapMode: "fast",
        fastCapture: {
          urlIncludes: ["latest_data.php"],
          dataPath: "msg.data",
          transport: "fetch",
          mode: "latest",
        },
        isApplicable: () => true,
      },
    ]);

    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php",
      JSON.stringify({ msg: { data: [{ id: 1 }] } }),
    );

    assert.strictEqual(
      processCompletedFastCapture(
        "fetch",
        "https://f95zone.to/latest_data.php",
        "not-json",
      ),
      0,
    );
    assert.strictEqual(
      getFastCaptureSnapshot("latest-malformed-capture").status,
      "captured",
    );
    assert.deepStrictEqual(getFastCaptureData("latest-malformed-capture"), [
      { id: 1 },
    ]);
  },
);

runTest("fast capture subscribers receive captured snapshots", () => {
  resetFastCaptureHarness();
  global.document = { body: null };

  const seen = [];
  const unsubscribe = subscribeFastCapture("subscriber-capture", (snapshot) => {
    seen.push(snapshot);
  });

  registerFastCaptureFeatures([
    {
      name: "Subscriber Capture",
      featureKey: "subscriber-capture",
      bootstrapMode: "fast",
      fastCapture: {
        urlIncludes: ["latest_data.php"],
        dataPath: "msg.data",
        transport: "fetch",
        once: true,
      },
      isApplicable: () => true,
    },
  ]);

  processCompletedFastCapture(
    "fetch",
    "https://f95zone.to/latest_data.php",
    JSON.stringify({ msg: { data: { hello: "world" } } }),
  );
  unsubscribe();

  assert.strictEqual(seen.length, 2);
  assert.strictEqual(seen[0].status, "idle");
  assert.strictEqual(seen[1].status, "captured");
  assert.deepStrictEqual(seen[1].data, { hello: "world" });
});

runTest("fast capture subscribers receive cached snapshot on subscribe", () => {
  resetFastCaptureHarness();

  registerFastCaptureFeatures([
    {
      name: "Cached Capture",
      featureKey: "cached-capture",
      bootstrapMode: "fast",
      fastCapture: {
        urlIncludes: ["latest_data.php"],
        dataPath: "msg.data",
        transport: "fetch",
        mode: "latest",
      },
      isApplicable: () => true,
    },
  ]);

  processCompletedFastCapture(
    "fetch",
    "https://f95zone.to/latest_data.php",
    JSON.stringify({ msg: { data: [{ id: 7 }] } }),
  );

  const seen = [];
  const unsubscribe = subscribeFastCapture("cached-capture", (snapshot) => {
    seen.push(snapshot);
  });
  unsubscribe();

  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].status, "captured");
  assert.deepStrictEqual(seen[0].data, [{ id: 7 }]);
});

runTest("fast capture accepts the exact response limit and rejects one byte over", () => {
  resetFastCaptureHarness();
  registerFastCaptureFeatures([{
    featureKey: "limit-capture",
    bootstrapMode: "fast",
    fastCapture: { urlIncludes: "limit_data.php", dataPath: "msg.data", transport: "fetch" },
    isApplicable: () => true,
  }]);
  const exact = "x".repeat(FAST_CAPTURE_LIMITS.maxResponseBytes);
  const over = `${exact}x`;
  assert.strictEqual(enqueueFastCaptureProcessing("fetch", "https://f95zone.to/limit_data.php", exact), true);
  assert.strictEqual(enqueueFastCaptureProcessing("fetch", "https://f95zone.to/limit_data.php", over), false);
  assert.strictEqual(getFastCaptureDiagnostics().dropped.payload_too_large, 1);
});

runTest("fast capture expires entries at the configured TTL", () => {
  resetFastCaptureHarness();
  const originalNow = Date.now;
  try {
    Date.now = () => 1_000;
    registerFastCaptureFeatures([{
      featureKey: "ttl-capture",
      bootstrapMode: "fast",
      fastCapture: { urlIncludes: "ttl_data.php", dataPath: "msg.data", transport: "fetch", ttlMs: 1 },
      isApplicable: () => true,
    }]);
    processCompletedFastCapture("fetch", "https://f95zone.to/ttl_data.php", JSON.stringify({ msg: { data: [1] } }));
    assert.strictEqual(hasFastCaptureData("ttl-capture"), true);
    Date.now = () => 1_002;
    assert.strictEqual(hasFastCaptureData("ttl-capture"), false);
  } finally {
    Date.now = originalNow;
  }
});

runTest("fast capture evicts oldest snapshots when retained bytes exceed the cap", () => {
  resetFastCaptureHarness();
  const features = Array.from({ length: 5 }, (_, index) => ({
    featureKey: `eviction-capture-${index}`,
    bootstrapMode: "fast",
    fastCapture: { urlIncludes: "eviction_data.php", dataPath: "msg.data", transport: "fetch" },
    isApplicable: () => true,
  }));
  registerFastCaptureFeatures(features);
  const payload = JSON.stringify({ msg: { data: "x".repeat(FAST_CAPTURE_LIMITS.maxResponseBytes - 128) } });
  processCompletedFastCapture("fetch", "https://f95zone.to/eviction_data.php", payload);
  const diagnostics = getFastCaptureDiagnostics();
  assert.ok(diagnostics.retainedBytes <= FAST_CAPTURE_LIMITS.maxRetainedBytes);
  assert.ok(diagnostics.evictedEntries > 0);
});

runTest("fast capture discards queued work from a stale route generation", async () => {
  resetFastCaptureHarness();
  const feature = {
    featureKey: "stale-route-capture",
    bootstrapMode: "fast",
    fastCapture: { urlIncludes: "stale_data.php", dataPath: "msg.data", transport: "fetch" },
    isApplicable: () => true,
  };
  registerFastCaptureFeatures([feature], { generation: 1 });
  assert.strictEqual(
    enqueueFastCaptureProcessing("fetch", "https://f95zone.to/stale_data.php", JSON.stringify({ msg: { data: [1] } })),
    true,
  );
  refreshFastCaptureFeatures([feature], { generation: 2 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.strictEqual(hasFastCaptureData("stale-route-capture"), false);
});

runTest(
  "toast queue accepts pre-body calls and flushes in order after body exists",
  () => {
    const previousDocument = global.document;
    const previousRequestAnimationFrame = global.requestAnimationFrame;

    try {
      const docWithoutBody = createFakeDocument({ withBody: false });
      global.document = docWithoutBody;
      global.requestAnimationFrame = (callback) => callback();

      showToast("first toast");
      showToast("second toast");

      const docWithBody = createFakeDocument({ withBody: true });
      global.document = docWithBody;

      const flushed = flushQueuedToasts();
      const container = docWithBody.getElementById("toast-container");

      assert.strictEqual(flushed, 2);
      assert.ok(container);
      assert.strictEqual(container.children.length, 2);
      assert.strictEqual(container.children[0].textContent, "first toast");
      assert.strictEqual(container.children[1].textContent, "second toast");
    } finally {
      global.document = previousDocument;
      global.requestAnimationFrame = previousRequestAnimationFrame;
    }
  },
);

runTest("ADDON-BRIDGE protocol rejects malformed envelopes and replay IDs", () => {
  const { createReplayCache, createSafeAddonResponse, validateAddonRequestEnvelope } = loadModule("src/services/addons/protocol.js");
  const envelope = {
    marker: "bridge-marker", protocolVersion: "0.1.0", requestId: "request-123",
    addonId: "example-addon", action: "toast.show", payload: {},
  };
  assert.strictEqual(validateAddonRequestEnvelope(envelope, { marker: "bridge-marker", apiVersion: "0.1.0" }).ok, true);
  assert.strictEqual(validateAddonRequestEnvelope({ ...envelope, requestId: "bad" }, { marker: "bridge-marker", apiVersion: "0.1.0" }).reason, "invalid_request_id");
  const cache = createReplayCache();
  assert.strictEqual(cache.seen("example-addon", "request-123"), false);
  assert.strictEqual(cache.seen("example-addon", "request-123"), true);
  assert.deepStrictEqual(
    createSafeAddonResponse({ apiVersion: "0.1.0", addonId: "example-addon", requestId: "request-123", result: { ok: false, reason: "invalid_payload", secret: "discarded" } }),
    { ok: false, reason: "invalid_payload", value: undefined, protocolVersion: "0.1.0", addonId: "example-addon", requestId: "request-123" },
  );
});

runTest("ADDON-BASELINE-01 records deterministic metadata, behavior, and size evidence", async () => {
  const before = addonBaseline.snapshotWorkingTree();
  const first = await addonBaseline.createBaseline();
  const second = await addonBaseline.createBaseline();
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/architecture/addon-baseline.json"), "utf8"));

  assert.deepStrictEqual(first, second);
  assert.deepStrictEqual(first, committed);
  assert.deepStrictEqual(
    first.manifest.entries.map((entry) => entry.id).sort(),
    first.addons.map((entry) => entry.id).sort(),
  );
  assert.strictEqual(new Set(first.publicActions.map((action) => action.id)).size, first.publicActions.length);
  assert.ok(first.behaviorSnapshots.registration);
  assert.ok(first.behaviorSnapshots.teardown);
  assert.strictEqual(first.coreServiceFootprint.addonsService.fileCount, 1);
  assert.ok(first.coreServiceFootprint.servicesAddons.authoredBytes > 0);
  assert.ok(first.coreServiceFootprint.uiIntegration.authoredBytes > 0);
  assert.strictEqual(first.deterministic.outputHasTimestamps, false);
  assert.strictEqual(first.deterministic.outputHasAbsolutePaths, false);
  assert.deepStrictEqual(addonBaseline.snapshotWorkingTree(), before);
});

runTest("ADDON-BUILD-TOOLS-01 validates manifest paths and metadata rules", () => {
  const manifest = ADDON_MANIFEST.addons.map((addon) => ({ ...addon, capabilities: [...addon.capabilities], matches: [...addon.matches], grants: [...addon.grants] }));
  const invalid = { ...manifest[0], entry: "addons/wrong/src/index.js", grants: ["none", "GM_setValue"], capabilities: ["not-a-capability"], runAt: "tomorrow" };
  const errors = addonCatalog.validateManifest([invalid], { checkFiles: false });
  assert.ok(errors.some((error) => error.startsWith("addons[0].entry:")));
  assert.ok(errors.some((error) => error.startsWith("addons[0].grants:")));
  assert.ok(errors.some((error) => error.startsWith("addons[0].capabilities:")));
  assert.ok(errors.some((error) => error.startsWith("addons[0].runAt:")));

  const legacyCollision = { ...manifest[1], legacyIds: [manifest[0].id] };
  assert.ok(addonCatalog.validateManifest([manifest[0], legacyCollision], { checkFiles: false })
    .some((error) => error.startsWith("addons[1].legacyIds:")));
});

runTest("ADDON-BUILD-TOOLS-01 accepts canonical and documented tiny layouts", () => {
  assert.deepStrictEqual(addonBuildTools.validateStructure(ADDON_MANIFEST.addons), []);
  const tempRoot = fs.mkdtempSync(path.join(TMP_DIR, "addon-structure-"));
  try {
    const mainPath = path.join(tempRoot, "addons", "tiny-addon", "src", "main.js");
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.writeFileSync(mainPath, "console.log('tiny');\n");
    assert.deepStrictEqual(
      addonBuildTools.validateStructure([
        {
          id: "tiny-addon",
          entry: "addons/tiny-addon/src/main.js",
          outfile: "addons/tiny-addon/dist/tiny-addon.user.js",
        },
      ], { rootDir: tempRoot }),
      [],
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

runTest("ADDON-BUILD-TOOLS-01 smoke builds every add-on in regular and release modes", async () => {
  const before = addonBaseline.snapshotWorkingTree();
  const report = await addonBuildTools.runSmokeBuild();
  assert.strictEqual(report.selectedAddons.length, ADDON_MANIFEST.addons.length);
  assert.strictEqual(report.builds.length, ADDON_MANIFEST.addons.length * 2);
  assert.deepStrictEqual(report.modes, ["regular", "release"]);
  assert.ok(report.builds.every((build) => build.metafile === "<temporary>"));
  assert.ok(report.builds.every((build) => build.outputHasTimestamps === false));
  assert.ok(report.builds.every((build) => build.outputHasAbsolutePaths === false));
  assert.strictEqual(report.validation.unchanged, true);
  assert.deepStrictEqual(addonBaseline.snapshotWorkingTree(), before);
});

runTest("ADDON-BUILD-TOOLS-01 preserves current release stripping behavior", async () => {
  const addon = ADDON_MANIFEST.addons.find((entry) => entry.id === "halloween-theme-addon");
  const tempRoot = fs.mkdtempSync(path.join(TMP_DIR, "addon-release-strip-"));
  try {
    const regular = await addonBuilder.buildAddonToPath(addon, false, {
      outputPath: path.join(tempRoot, "regular.user.js"),
      deterministicHeader: true,
    });
    const release = await addonBuilder.buildAddonToPath(addon, true, {
      outputPath: path.join(tempRoot, "release.user.js"),
      deterministicHeader: true,
    });
    const debugCall = /(?:^|[;{}\n])\s*(?:void\s+|await\s+)?debugLog\s*\(/;
    assert.match(regular.code, debugCall);
    assert.doesNotMatch(release.code, debugCall);
    assert.strictEqual(release.header, regular.header);
    assert.strictEqual(require("../stripDebugLogs").stripDebugLogs.name, "strip-debug-logs");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

runTest("ADDON-BUILD-TOOLS-01 normalizes Windows and POSIX metafile paths", () => {
  const normalized = addonBuildTools.normalizeMetafile({
    inputs: {
      "D:\\programming\\js\\userscript\\latest highlighter\\addons\\tiny\\src\\main.js": { bytesInOutput: 1 },
      "addons/tiny/src/other.js": { bytesInOutput: 2 },
    },
    outputs: {
      "D:\\temp\\tiny.user.js": { bytes: 3 },
    },
  });
  const serialized = JSON.stringify(normalized);
  assert.doesNotMatch(serialized, /\\/);
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/);
});

runTest("ADDON-SCOPE-02 validates authoritative metadata and preserves headers", () => {
  const manifest = addonCatalog.readManifest ? addonCatalog.readManifest() : JSON.parse(fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8")).addons;
  assert.deepStrictEqual(addonCatalog.validateManifest(manifest), []);
  const catalog = addonCatalog.buildTrustedCatalog(manifest);
  assert.deepStrictEqual(catalog.map((entry) => entry.id), [...catalog].map((entry) => entry.id).sort());
  for (const addon of manifest) {
    const header = addonBuilder.headerForAddon(addon);
    for (const match of addon.matches) assert.ok(header.includes(`// @match        ${match}`));
    for (const grant of addon.grants) assert.ok(header.includes(`// @grant        ${grant}`));
    assert.ok(header.includes(`// @run-at       ${addon.runAt}`));
    assert.ok(header.includes(`// @version      ${addon.version}`));
  }
  const header = fs.readFileSync(path.join(ROOT, "header.txt"), "utf8");
  assert.ok(header.includes("@resource     trustedAddonCatalog https://cdn.jsdelivr.net/gh/Zenix-Al/f95-zone-highlighter@main/src/services/addons/trusted-catalog.json"));
  assert.strictEqual(addonCatalog.renderCatalog(manifest), addonCatalog.renderCatalog([...manifest].reverse()));
});

runTest("ADDON-SCOPE-02 injects manifest scope metadata without changing header metadata", async () => {
  const manifest = addonCatalog.readManifest();
  const relativeOutfile = "tests/.tmp/addon-scope-injection.user.js";
  const outfile = path.join(ROOT, relativeOutfile);
  try {
    await addonBuilder.buildAddon({ ...manifest.find((entry) => entry.id === "image-repair-addon"), outfile: relativeOutfile }, false);
    const output = fs.readFileSync(outfile, "utf8");
    assert.ok(output.includes("core-required"));
    assert.ok(output.includes("thread"));
    assert.ok(output.includes("*://f95zone.to/threads/*"));
  } finally {
    fs.rmSync(outfile, { force: true });
  }
});

runTest("ADDON-SCOPE-02 separates activation matching, runtime scopes, and registration modes", () => {
  const scope = loadModule("src/services/addons/scope.js");
  assert.strictEqual(scope.matchesUserscriptPattern("https://f95zone.to/threads/example.1/", "*://f95zone.to/threads/*"), true);
  assert.strictEqual(scope.matchesUserscriptPattern("https://f95zone.to/sam/latest_alpha/", "*://f95zone.to/threads/*"), false);
  assert.strictEqual(scope.matchesUserscriptPattern("https://f95zone.to/masked/example/", "*://f95zone.to/masked/*"), true);
  assert.strictEqual(scope.matchesUserscriptPattern("https://sub.buzzheavier.com/file/1", "*://*.buzzheavier.com/*"), true);
  assert.deepStrictEqual(scope.resolveScopeIntersection(["f95zone", "latest"], ["latest"]), ["latest"]);
  assert.deepStrictEqual(
    scope.validateAddonRuntimeMetadata({ runtimeMode: "core-required", requiresCore: true, pageScopes: ["download"], matches: ["*://f95zone.to/*"] }).errors,
    ["unknown_page_scope"],
  );
  assert.ok(scope.validateAddonRuntimeMetadata({ runtimeMode: "unsupported", requiresCore: true, pageScopes: ["f95zone"], matches: ["*://f95zone.to/*"] }).errors.includes("invalid_runtime_mode"));
  const malformedScopes = scope.validateAddonRuntimeMetadata({ runtimeMode: "core-required", requiresCore: true, pageScopes: ["thread", "thread", ""], matches: ["*://f95zone.to/*"] }).errors;
  assert.ok(malformedScopes.includes("duplicate_page_scope"));
  assert.ok(malformedScopes.includes("empty_page_scope"));
  assert.ok(scope.validateAddonRuntimeMetadata({ runtimeMode: "standalone", requiresCore: false, pageScopes: [], matches: ["*://f95zone.to/*"] }, { registration: true }).errors.includes("standalone_must_not_register"));
  const registry = loadModule("src/services/addons/registry.js");
  registry.registerAddon({ id: "invalid-scope-addon", name: "Invalid", runtimeMode: "core-required", requiresCore: true, pageScopes: ["download"], matches: ["*://f95zone.to/*"] });
  assert.strictEqual(registry.getRegisteredAddon("invalid-scope-addon"), null);
  assert.ok(scope.validateAddonRuntimeMetadata({ runtimeMode: "hybrid", requiresCore: true, pageScopes: ["f95zone"], matches: ["*://f95zone.to/*", "*://example.com/*"] }).ok);
  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const latest = buildKnownAddonsSnapshot({
    catalog: [{ id: "latest", name: "Latest", pageScopes: ["latest"], matches: ["*://f95zone.to/sam/latest_alpha/*"], trusted: true }],
    currentScopes: ["latest"],
    currentUrl: "https://f95zone.to/sam/latest_alpha/",
  })[0];
  assert.strictEqual(latest.matchesCurrentPage, true);
  assert.strictEqual(latest.scopeApplies, true);
  assert.strictEqual(latest.supportsCurrentPage, true);
  const thread = buildKnownAddonsSnapshot({
    catalog: [{ id: "latest", name: "Latest", pageScopes: ["latest"], matches: ["*://f95zone.to/sam/latest_alpha/*"], trusted: true }],
    currentScopes: ["thread"],
    currentUrl: "https://f95zone.to/threads/example.1/",
  })[0];
  assert.strictEqual(thread.matchesCurrentPage, false);
  assert.strictEqual(thread.scopeApplies, false);
  assert.strictEqual(thread.supportsCurrentPage, false);
});

runTest("ADDON-TRUST-GATING-01 reproduces the stale trusted-and-blocked masked fixture", () => {
  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const snapshot = buildKnownAddonsSnapshot({
    registered: [{
      id: "masked-direct-addon",
      name: "F95UE Masked + Direct Download Add-on",
      version: "0.3.45",
      status: "disabled",
      statusMessage: "Blocked by main settings: enable untrusted add-ons or trust this add-on.",
      trusted: true,
      blocked: true,
      pageScopes: ["f95zone"],
      matches: ["*://f95zone.to/threads/*"],
      capabilities: [],
    }],
    catalog: [{
      id: "masked-direct-addon",
      name: "F95UE Masked + Direct Download Add-on",
      version: "0.3.45",
      trusted: true,
      pageScopes: ["f95zone"],
      matches: ["*://f95zone.to/threads/*"],
    }],
    currentScopes: ["f95zone"],
    currentUrl: "https://f95zone.to/threads/example.1/",
    catalogFresh: true,
  })[0];

  assert.strictEqual(snapshot.name, "F95UE Masked + Direct Download Add-on");
  assert.strictEqual(snapshot.version, "0.3.45");
  assert.strictEqual(snapshot.trusted, true);
  assert.strictEqual(snapshot.blocked, false);
  assert.strictEqual(snapshot.status, "disabled");
  assert.strictEqual(snapshot.activeOnPage, true);
  assert.strictEqual(
    snapshot.statusMessage,
    "Disabled from core. It will remain off when the add-on loads.",
  );
  assert.strictEqual(snapshot.blockReason, null);
  assert.strictEqual(snapshot.canEnable, true);
  // The pre-fix fixture had trusted=true, blocked=true, and the untrusted
  // policy message. The shared projection normalizes that stale runtime state.
  assert.ok(!(snapshot.trusted && snapshot.blocked));
});

runTest("ADDON-TRUST-GATING-01 shares trust, identity, enabled, and scope decisions", () => {
  const { resolveAddonAccess } = loadModule("src/services/addons/access.js");
  const common = {
    id: "MASKED.DIRECT.ADDON",
    registered: {
      id: "MASKED.DIRECT.ADDON",
      status: "installed",
      pageScopes: ["f95zone"],
      matches: ["*://f95zone.to/threads/*"],
    },
    trustedIds: [],
    allowUntrusted: false,
    currentScopes: ["f95zone"],
    currentUrl: "https://f95zone.to/threads/example.1/",
  };
  const catalogTrusted = resolveAddonAccess({
    ...common,
    catalogEntry: { id: "masked-direct-addon", trusted: true },
  });
  assert.deepStrictEqual(
    {
      isTrusted: catalogTrusted.isTrusted,
      isBlocked: catalogTrusted.isBlocked,
      blockReason: catalogTrusted.blockReason,
      supportsCurrentPage: catalogTrusted.supportsCurrentPage,
    },
    { isTrusted: true, isBlocked: false, blockReason: null, supportsCurrentPage: true },
  );

  const userTrusted = resolveAddonAccess({ ...common, trustedIds: ["masked-direct-addon"] });
  assert.strictEqual(userTrusted.trustSource, "user");
  assert.strictEqual(userTrusted.isBlocked, false);

  const untrusted = resolveAddonAccess({
    ...common,
    id: "unknown-addon",
    registered: { ...common.registered, id: "unknown-addon" },
  });
  assert.deepStrictEqual(
    { isTrusted: untrusted.isTrusted, isBlocked: untrusted.isBlocked, blockReason: untrusted.blockReason },
    { isTrusted: false, isBlocked: true, blockReason: "untrusted_disallowed" },
  );
  assert.strictEqual(resolveAddonAccess({ ...common, allowUntrusted: true, desiredEnabled: false }).isBlocked, false);

  const missingCatalog = resolveAddonAccess({ ...common, catalogEntry: null });
  assert.strictEqual(missingCatalog.identityStatus, "unresolved");
  assert.strictEqual(missingCatalog.blockReason, "untrusted_disallowed");
  const mismatchedCatalog = resolveAddonAccess({ ...common, catalogEntry: { id: "other-addon", trusted: true } });
  assert.strictEqual(mismatchedCatalog.identityStatus, "mismatch");
  assert.strictEqual(mismatchedCatalog.blockReason, "identity_error");

  const disabled = resolveAddonAccess({
    ...common,
    catalogEntry: { id: "masked-direct-addon", trusted: true },
    registered: { ...common.registered, status: "disabled" },
  });
  assert.strictEqual(disabled.isEnabled, false);
  assert.strictEqual(disabled.isBlocked, false);
  assert.strictEqual(disabled.canEnable, true);

  const registry = loadModule("src/services/addons/registry.js");
  registry.registerAddon({
    id: "example-addon",
    name: "F95UE Example Add-on",
    status: "disabled",
    capabilities: ["feature", "storage"],
    runtimeMode: "core-required",
    requiresCore: true,
    pageScopes: ["f95zone"],
    matches: ["*://f95zone.to/*"],
  });
  const trustedDisabled = registry.getRegisteredAddon("example-addon");
  assert.strictEqual(trustedDisabled.trusted, true);
  assert.strictEqual(trustedDisabled.blocked, false);
  assert.strictEqual(trustedDisabled.canEnable, true);
  assert.ok(trustedDisabled.capabilities.includes("feature"));

  registry.registerAddon({
    id: "untrusted-regression-addon",
    name: "Untrusted Regression Add-on",
    status: "installed",
    capabilities: ["feature", "storage"],
    runtimeMode: "core-required",
    requiresCore: true,
    pageScopes: ["f95zone"],
    matches: ["*://f95zone.to/*"],
  });
  const untrustedRegistered = registry.getRegisteredAddon("untrusted-regression-addon");
  assert.strictEqual(untrustedRegistered.trusted, false);
  assert.strictEqual(untrustedRegistered.blocked, true);
  assert.deepStrictEqual(untrustedRegistered.capabilities, []);

  const addonService = loadModule("src/services/addonsService.js");
  assert.strictEqual(
    addonService.getAddonExecutionBlockReason(trustedDisabled, ["f95zone"]),
    "addon_disabled",
  );
  assert.strictEqual(
    addonService.getAddonExecutionBlockReason(untrustedRegistered, ["f95zone"]),
    "addon_untrusted",
  );

  const catalogModule = loadModule("src/services/addons/catalog.js");
  const previousResourceLoader = global.GM_getResourceText;
  try {
    global.GM_getResourceText = () => JSON.stringify([
      { id: "reload-addon", trusted: true, name: "Reloaded" },
    ]);
    catalogModule.reloadTrustedAddonCatalog();
    assert.strictEqual(catalogModule.getTrustedCatalogEntry("RELOAD.ADDON").trusted, true);
  } finally {
    if (typeof previousResourceLoader === "undefined") delete global.GM_getResourceText;
    else global.GM_getResourceText = previousResourceLoader;
    catalogModule.reloadTrustedAddonCatalog();
  }
});

runTest("ADDON-TRUST-GATING-01 covers every catalog-trusted add-on", () => {
  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const catalogById = new Map(TRUSTED_ADDON_CATALOG.map((entry) => [entry.id, entry]));
  const pageUrlFor = (entry) => entry.pageScopes.includes("latest")
    ? "https://f95zone.to/sam/latest_alpha/"
    : entry.matches.some((match) => String(match).includes("/threads/"))
      ? "https://f95zone.to/threads/example.1/"
      : "https://f95zone.to/";
  const currentScopeFor = (entry) => [entry.pageScopes[0] || "f95zone"];

  for (const entry of ADDON_MANIFEST.addons) {
    const catalogEntry = catalogById.get(entry.id);
    assert.ok(catalogEntry?.trusted === true, `${entry.id} must be catalog-trusted for this matrix`);
    const base = {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      pageScopes: entry.pageScopes,
      matches: entry.matches,
      capabilities: entry.capabilities,
    };
    const common = {
      catalog: [catalogEntry],
      currentScopes: currentScopeFor(entry),
      currentUrl: pageUrlFor(entry),
      catalogFresh: true,
      allowUntrusted: false,
    };
    const disabled = buildKnownAddonsSnapshot({
      ...common,
      registered: [{ ...base, status: "disabled" }],
    })[0];
    const enabled = buildKnownAddonsSnapshot({
      ...common,
      registered: [{ ...base, status: "installed" }],
    })[0];
    const untrusted = buildKnownAddonsSnapshot({
      ...common,
      catalog: [],
      registered: [{ ...base, status: "installed" }],
    })[0];

    assert.strictEqual(disabled.isTrusted, true, `${entry.id} disabled trust`);
    assert.strictEqual(disabled.isBlocked, false, `${entry.id} disabled block`);
    assert.strictEqual(disabled.status, "disabled", `${entry.id} disabled status`);
    assert.strictEqual(disabled.canEnable, true, `${entry.id} enable control`);
    assert.deepStrictEqual(disabled.capabilities, entry.capabilities, `${entry.id} disabled capabilities`);
    assert.strictEqual(enabled.isTrusted, true, `${entry.id} enabled trust`);
    assert.strictEqual(enabled.isBlocked, false, `${entry.id} enabled block`);
    assert.strictEqual(enabled.blockReason, null, `${entry.id} enabled reason`);
    assert.deepStrictEqual(enabled.capabilities, entry.capabilities, `${entry.id} enabled capabilities`);
    assert.strictEqual(untrusted.isTrusted, false, `${entry.id} untrusted trust`);
    assert.strictEqual(untrusted.isBlocked, true, `${entry.id} untrusted block`);
    assert.strictEqual(untrusted.blockReason, "untrusted_disallowed", `${entry.id} untrusted reason`);
    assert.deepStrictEqual(untrusted.capabilities, [], `${entry.id} untrusted capabilities`);
  }
});

runTest("ADDON-TRUST-GATING-01 requires one handshake and access contract per add-on", () => {
  const sharedBridge = fs.readFileSync(path.join(ROOT, "addons/shared/coreBridge.js"), "utf8");
  assert.ok(sharedBridge.includes('"ping"'), "shared bridge must ping before registration");
  assert.ok(sharedBridge.includes('"addon.access"'), "shared bridge must expose addon.access");
  assert.ok(sharedBridge.includes('detail.addonId'), "shared bridge must filter command identity");
  assert.ok(sharedBridge.includes('"teardown-complete"'), "shared bridge must acknowledge teardown");

  for (const entry of ADDON_MANIFEST.addons) {
    const addonRoot = path.join(ROOT, path.dirname(entry.entry), "..");
    const files = collectJavaScriptFiles(addonRoot);
    const source = files.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
    assert.ok(source.includes("waitForCorePing"), `${entry.id} must perform the core handshake`);
    assert.ok(/registerAddon|registerAddonRuntime|dispatchCoreCommand\("register"/.test(source), `${entry.id} must register through the bridge`);
    assert.ok(/getAddonAccess|addon\.access/.test(source), `${entry.id} must consume the shared access result`);
    assert.ok(source.includes("invokeCoreAction"), `${entry.id} must use permission-checked core actions`);
    assert.ok(/(?:detail|d)\.addonId|bindAddonCommands/.test(source), `${entry.id} must filter core commands by identity`);
    assert.ok(!source.includes("Blocked by main settings: enable untrusted add-ons or trust this add-on."), `${entry.id} must not own the core trust message`);
  }
});

runTest("ADDON-SCOPE-02 keeps management actions outside runtime scope", () => {
  const { getAddonActionScopePolicy } = loadModule("src/services/addons/actions/policy.js");
  const { getAddonActionBlockReason } = loadModule("src/services/addonsService.js");
  const addon = { trusted: true, blocked: false, status: "installed", pageScopes: ["thread"] };
  assert.strictEqual(getAddonActionScopePolicy("addon.access"), "management");
  assert.strictEqual(getAddonActionScopePolicy("feature.enable"), "management");
  assert.strictEqual(getAddonActionScopePolicy("storage.get"), "runtime");
  assert.strictEqual(getAddonActionBlockReason(addon, "feature.enable"), null);
  assert.strictEqual(getAddonActionBlockReason(addon, "storage.get"), "addon_out_of_scope");
});

runTest("ADDON-BRIDGE listener shutdown permits one clean reinitialization", () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousCustomEvent = global.CustomEvent;
  const listeners = new Map();
  global.window = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
  };
  global.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  global.document = { documentElement: { dataset: {}, appendChild(node) { return node; } }, createElement() { return { remove() {} }; } };
  try {
    const bridge = loadModule("src/services/addons/bridgeServer.js");
    const options = { marker: "bridge-test", devCommandEvent: "bridge-event", apiVersion: "0.1.0", isServiceDisabled: () => false, onInvokeCoreAction: () => ({ ok: true }) };
    bridge.initAddonsBridgeServer(options);
    assert.strictEqual(bridge.getAddonsBridgeDiagnostics().listenerBound, true);
    bridge.shutdownAddonsBridgeServer();
    assert.strictEqual(bridge.getAddonsBridgeDiagnostics().listenerBound, false);
    bridge.initAddonsBridgeServer(options);
    assert.strictEqual(listeners.size, 1);
    bridge.shutdownAddonsBridgeServer();
  } finally { global.window = previousWindow; global.document = previousDocument; global.CustomEvent = previousCustomEvent; }
});

runTest("OBSERVE add-on diagnostics retain request correlation without payload", async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousCustomEvent = global.CustomEvent;
  const listeners = new Map();
  global.window = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
  };
  global.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  global.document = { documentElement: { dataset: {}, appendChild(node) { return node; } }, createElement() { return { remove() {} }; } };
  try {
    const bridge = loadModule("src/services/addons/bridgeServer.js");
    bridge.initAddonsBridgeServer({ marker: "observe-marker", devCommandEvent: "observe-event", apiVersion: "0.1.0", isServiceDisabled: () => false, onInvokeCoreAction: () => ({ ok: true }) });
    global.window.dispatchEvent(new global.CustomEvent("observe-event", { detail: {
      type: "core-action", marker: "observe-marker", protocolVersion: "0.1.0", requestId: "req-observe-123", addonId: "example-addon", action: "storage.set", payload: { secret: "must-not-appear" }, replyEvent: "observe-reply",
    } }));
    await Promise.resolve();
    const request = bridge.getAddonsBridgeDiagnostics().lastRequest;
    assert.deepStrictEqual(request && { addonId: request.addonId, action: request.action, correlationId: request.correlationId }, { addonId: "example-addon", action: "storage.set", correlationId: "req-observe-123" });
    assert.ok(!JSON.stringify(request).includes("must-not-appear"));
    bridge.shutdownAddonsBridgeServer();
  } finally { global.window = previousWindow; global.document = previousDocument; global.CustomEvent = previousCustomEvent; }
});

runTest("out-of-scope add-ons can still be enabled or disabled from core UI", () => {
  const { getAddonActionBlockReason } = loadModule("src/services/addonsService.js");
  const addon = { trusted: true, blocked: false, status: "installed", pageScopes: ["thread"] };
  assert.strictEqual(getAddonActionBlockReason(addon, "feature.disable"), null);
  assert.strictEqual(getAddonActionBlockReason(addon, "storage.get"), "addon_out_of_scope");
});

runTest("ADDON-UI fixed mount policy rejects body and selector targets", () => {
  assert.deepStrictEqual(Object.keys(ADDON_UI_SLOT_POLICY).sort(), [
    "latest.filters.after-title", "page.dock", "page.floating", "page.panel",
  ]);
  assert.strictEqual(normalizeAddonMountSlot("page.panel"), "page.panel");
  assert.strictEqual(normalizeAddonMountSlot("body"), "");
  assert.strictEqual(normalizeAddonMountSlot("selector:#victim"), "");
});

runTest("ADDON-UI dock mounts require the dock capability at execution", () => {
  const { actionUiMount } = loadModule("src/services/addons/coreActions.js");
  const mount = () => ({ ok: true });
  const sanitizeId = (value) => value;
  assert.strictEqual(
    actionUiMount("example-addon", { mountId: "dock", html: "<div></div>", slot: "page.dock" }, 1024, sanitizeId, mount, new Set(["ui.mount"])).reason,
    "permission_denied",
  );
  assert.strictEqual(
    actionUiMount("example-addon", { mountId: "dock", html: "<div></div>", slot: "page.dock" }, 1024, sanitizeId, mount, new Set(["ui.mount", "ui.dock"])).ok,
    true,
  );
});

runTest("ADDON-UI descriptor preserves mount-slot capability checks", async () => {
  const result = await invokeRegisteredAddonCoreAction({
    addonId: "example-addon",
    action: "ui.mount",
    payload: { mountId: "dock", html: "<div></div>", slot: "page.dock" },
    allowed: new Set(["ui.mount"]),
    deps: { sanitizeAddonMountId: (value) => value, mountAddonUi: () => ({ ok: true }) },
    limits: { maxAddonUiHtmlBytes: 1024 },
    authorize: () => null,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "permission_denied" });
});

runTest("ADDON-UI sanitizer treats markup as text without a DOM parser", () => {
  const previousDocument = global.document;
  try {
    global.document = undefined;
    const sanitized = sanitizeAddonHtml('<img src="javascript:alert(1)" onerror="boom"><script>boom()</script>');
    assert.ok(!sanitized.includes("<script>"));
    assert.ok(!sanitized.includes("<img"));
    assert.ok(sanitized.includes("&lt;script&gt;"));
  } finally {
    global.document = previousDocument;
  }
});

runTest("ADDON-UI page CSS is owner scoped and rejects global escape hatches", () => {
  const scoped = sanitizeAddonCss("example-addon", ".card { color: red; } .card > button { display: block; }");
  assert.strictEqual(scoped.ok, true);
  assert.ok(scoped.cssText.includes('[data-addon-id="example-addon"] .card'));
  assert.strictEqual(sanitizeAddonCss("example-addon", "body { display: none; }").reason, "unsafe_css_selector");
  assert.strictEqual(sanitizeAddonCss("example-addon", "@import url(https://example.test/a.css);").reason, "unsafe_css");
  assert.strictEqual(sanitizeAddonCss("example-addon", ".card { background: url(https://example.test/a.png); }").reason, "unsafe_css");
});

runTest("TEST-01 DOM sanitizer strips active content while retaining safe add-on markup", () => {
  const sandbox = createDomSandbox();
  try {
    const { sanitizeAddonHtml } = loadModule("src/services/addons/uiSanitizer.js");
    const html = sanitizeAddonHtml('<button class="safe" onclick="boom()">Run</button><a href="javascript:boom()">bad</a><iframe srcdoc="x"></iframe><svg onload="boom()"></svg>');
    sandbox.document.body.innerHTML = html;
    assert.strictEqual(sandbox.document.querySelectorAll("button.safe").length, 1);
    assert.strictEqual(sandbox.document.querySelector("button").getAttribute("onclick"), null);
    assert.strictEqual(sandbox.document.querySelector("a").getAttribute("href"), null);
    assert.strictEqual(sandbox.document.querySelector("iframe"), null);
    assert.strictEqual(sandbox.document.querySelector("svg"), null);
  } finally { sandbox.restore(); }
});

runTest("TEST-01 deterministic helpers isolate GM storage and timers", async () => {
  const gm = createFakeGM({ value: 1 });
  await gm.setValue("value", 2);
  const clock = createFakeClock();
  const events = [];
  clock.setTimeout(() => events.push("late"), 10);
  clock.setTimeout(() => events.push("early"), 5);
  await clock.tick(10);
  assert.deepStrictEqual(events, ["early", "late"]);
  assert.strictEqual(clock.pending(), 0);
});

runTest("TEST-01 reusable page lifecycle and add-on bridge fakes preserve event state", () => {
  const sandbox = createDomSandbox();
  try {
    let persisted = null;
    sandbox.window.addEventListener("pagehide", (event) => { persisted = event.persisted; });
    dispatchPageTransition(sandbox.window, "pagehide", true);
    assert.strictEqual(persisted, true);
    const bridge = createAddonBridgeTransport(sandbox.window);
    const received = [];
    const unsubscribe = bridge.subscribe((event) => received.push(event.detail));
    bridge.send({ requestId: "TEST-01-request", action: "storage.get" });
    unsubscribe();
    assert.deepStrictEqual(received, [{ requestId: "TEST-01-request", action: "storage.get" }]);
  } finally { sandbox.restore(); }
});

runTest("TEST-01 lifecycle rapid route transitions commit only the latest operation", async () => {
  const commits = [];
  const feature = createFeature("TEST Route Lifecycle", {
    enable: async (context) => {
      await Promise.resolve();
      if (!context.signal.aborted) commits.push(context.routeGeneration);
    },
    disable: () => null,
  });
  const first = feature.enable({ routeGeneration: 1, correlationId: "route-a" });
  const second = feature.enable({ routeGeneration: 2, correlationId: "route-b" });
  const third = feature.enable({ routeGeneration: 3, correlationId: "route-c" });
  await Promise.allSettled([first, second, third]);
  assert.deepStrictEqual(commits, [3]);
  await feature.disable({ reason: "teardown" });
});

runTest("TEST-01 lifecycle enable route disable and re-enable leaves no stale commit", async () => {
  const events = [];
  const feature = createFeature("TEST Route Re-enable", {
    enable: async (context) => { if (!context.signal.aborted) events.push(`enable:${context.routeGeneration}`); },
    disable: async () => { events.push("disable"); },
  });
  await feature.enable({ routeGeneration: 1, correlationId: "route-1" });
  await feature.disable({ routeGeneration: 2, reason: "route-change" });
  await feature.enable({ routeGeneration: 3, correlationId: "route-3" });
  assert.deepStrictEqual(events, ["enable:1", "disable", "enable:3"]);
});

runTest("ROUTE-01 DOM observer coalesces dispatch while preserving distinct generations and cleanup", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/a.1/");
  try {
    const route = loadModule("src/core/routeObserver.js");
    const contexts = [];
    const originalPushState = sandbox.window.history.pushState;
    const originalReplaceState = sandbox.window.history.replaceState;
    const cleanup = route.initRouteObserver((context) => contexts.push(context));
    sandbox.window.history.pushState({}, "", "/threads/b.2/");
    sandbox.window.history.pushState({}, "", "/threads/c.3/");
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(contexts.length, 1);
    assert.ok(contexts[0].url.includes("/threads/c.3/"));
    assert.strictEqual(contexts[0].generation, 2);
    cleanup();
    assert.strictEqual(sandbox.window.history.pushState, originalPushState);
    assert.strictEqual(sandbox.window.history.replaceState, originalReplaceState);
  } finally { sandbox.restore(); }
});

runTest("ROUTE-01 full teardown restores route history patches", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/a.1/");
  try {
    const result = await loadModule("tests/fixtures/routeTeardownHarness.js").runRouteTeardownScenario();
    assert.strictEqual(result.patched, true);
    assert.strictEqual(result.restored, true);
  } finally {
    sandbox.restore();
  }
});

runTest("TEST-01 teardown suspension, resume, and full cleanup are idempotent", async () => {
  const teardown = loadModule("src/core/teardown.js");
  teardown.resetTeardownForTests();
  teardown.markRuntimeRunning();
  assert.strictEqual(teardown.suspendRuntime("bfcache").state, "suspended");
  assert.strictEqual(teardown.suspendRuntime("bfcache").state, "suspended");
  assert.strictEqual(teardown.resumeRuntime(), "running");
  const summary = await teardown.teardownAll("TEST-01");
  assert.strictEqual(summary.state, "stopped");
  assert.strictEqual(teardown.getRuntimeState(), "stopped");
  teardown.resetTeardownForTests();
});

runTest("TEARDOWN-01 full teardown is bounded, idempotent, and disposes queues/resources", async () => {
  const result = await loadModule("tests/fixtures/teardownHarness.js").runTeardownResourceScenario();
  assert.strictEqual(result.first.state, "stopped");
  assert.strictEqual(result.first.failures.some((failure) => failure.code === "timeout"), true);
  assert.deepStrictEqual(result.second, result.first);
  assert.strictEqual(result.queues.queueCount, 0);
  assert.strictEqual(result.resources.totalResources, 0);
});

runTest("TEST-01 persistence commit is atomic on storage failure", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({}, { failSet: true });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    const before = JSON.stringify(config);
    const result = await settings.commitConfig({ ...config, latestSettings: { ...config.latestSettings, minVersion: 0.9 } });
    assert.strictEqual(result.committed, false);
    assert.strictEqual(result.issues[0].code, "config_not_ready");
    assert.deepStrictEqual(gm.snapshot(), {});
    assert.strictEqual(JSON.stringify(config), before);
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 persistence commit atomically stores a valid canonical envelope", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(gm, settings, config);
    const result = await settings.commitConfig(config, { origin: "TEST-01" });
    assert.strictEqual(result.committed, true);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, 2);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.latestSettings.minVersion, config.latestSettings.minVersion);
  } finally { global.GM = previousGM; }
});

runTest("PERSIST-01 storage adapter remains a raw I/O boundary", async () => {
  const calls = [];
  const values = new Map();
  const adapter = loadModule("src/services/storageAdapter.js").createStorageAdapter({
    async getValue(key, fallback) { calls.push(["get", key]); return values.has(key) ? values.get(key) : fallback; },
    async setValue(key, value) { calls.push(["set", key]); values.set(key, value); },
    async deleteValue(key) { calls.push(["delete", key]); values.delete(key); },
  });
  await adapter.set("raw", { value: 1 });
  assert.deepStrictEqual(await adapter.get("raw", null), { value: 1 });
  await adapter.delete("raw");
  assert.deepStrictEqual(calls.map(([operation]) => operation), ["set", "get", "delete"]);
});

runTest("PERSIST-01 successful commits advance revisions and retain last-known-good", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(gm, settings, config);
    const first = await settings.commitConfig(config, { origin: "PERSIST-01" });
    const second = await settings.commitConfig({
      ...first.config,
      latestSettings: { ...first.config.latestSettings, minVersion: 0.9 },
    }, { origin: "PERSIST-01" });
    assert.strictEqual(first.committed, true);
    assert.strictEqual(second.committed, true);
    assert.strictEqual(first.revision, 2);
    assert.strictEqual(second.revision, 3);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_BACKUP_KEY].revision, 2);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.latestSettings.minVersion, 0.9);
    assert.deepStrictEqual(second.revisionMetadata, {
      revision: second.revision,
      writerId: second.envelope.writerId,
      updatedAt: second.envelope.updatedAt,
    });
    assert.ok(Array.isArray(second.changedPaths));
  } finally { global.GM = previousGM; }
});

runTest("PERSIST-01 failed multi-write commit preserves canonical and live state", async () => {
  const previousGM = global.GM;
  const seedGM = createFakeGM();
  global.GM = seedGM;
  let settings = loadModule("src/services/settingsService.js");
  const { config } = loadModule("src/config.js");
  const seed = await settings.commitConfig(config, { origin: "PERSIST-01" });
  const previousEnvelope = seedGM.snapshot()[settings.CONFIG_ENVELOPE_KEY];

  const failingGM = createFakeGM({
    [settings.CONFIG_ENVELOPE_KEY]: previousEnvelope,
    [settings.CONFIG_MIGRATION_VERSION_KEY]: 1,
    [settings.CONFIG_TAGS_CACHE_KEY]: [],
    [settings.CONFIG_PREFIXES_CACHE_KEY]: { items: [], categories: {} },
  }, { failSetAt: 2 });
  global.GM = failingGM;
  try {
    settings = loadModule("src/services/settingsService.js");
    const result = await settings.commitConfig({
      ...config,
      latestSettings: { ...config.latestSettings, minVersion: 0.9 },
    }, { origin: "PERSIST-01" });
    assert.strictEqual(result.committed, false);
    assert.strictEqual(result.failed[0].code, "storage_error");
    assert.deepStrictEqual(failingGM.snapshot()[settings.CONFIG_ENVELOPE_KEY], previousEnvelope);
    assert.deepStrictEqual(result.config, result.previousConfig);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-STORAGE-01 version-zero canonical data recovers from a valid backup without migration", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    const oldEnvelope = {
      schemaVersion: 0,
      revision: 4,
      writerId: "old-writer",
      updatedAt: 10,
      data: config,
    };
    const backupEnvelope = {
      schemaVersion: 1,
      revision: 3,
      writerId: "backup-writer",
      updatedAt: 9,
      data: config,
    };
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, oldEnvelope);
    await gm.setValue(settings.CONFIG_BACKUP_KEY, backupEnvelope);
    await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
    await gm.setValue(settings.CONFIG_TAGS_CACHE_KEY, []);
    await gm.setValue(settings.CONFIG_PREFIXES_CACHE_KEY, { items: [], categories: {} });
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.recovered, true);
    assert.strictEqual(loaded.status, "recovered");
    assert.strictEqual(loaded.source, "backup");
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].schemaVersion, 1);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, 5);
  } finally { global.GM = previousGM; }
});

runTest("PERSIST-01 valid backup recovers corrupt canonical data", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    const validBackup = {
      schemaVersion: 1,
      revision: 2,
      writerId: "backup-writer",
      updatedAt: 2,
      data: config,
    };
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, {
      schemaVersion: 1,
      revision: 5,
      writerId: "corrupt-writer",
      updatedAt: 5,
      data: null,
    });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, validBackup);
    await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
    await gm.setValue(settings.CONFIG_TAGS_CACHE_KEY, []);
    await gm.setValue(settings.CONFIG_PREFIXES_CACHE_KEY, { items: [], categories: {} });
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.source, "backup");
    assert.strictEqual(loaded.recovered, true);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, 6);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.latestSettings.minVersion, config.latestSettings.minVersion);
  } finally { global.GM = previousGM; }
});

runTest("PERSIST-01 corrupt canonical and backup load defaults with a recovery marker", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, { schemaVersion: 1, revision: 4, writerId: "bad", updatedAt: 4, data: null });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, { schemaVersion: 1, revision: 3, writerId: "also-bad", updatedAt: 3, data: null });
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.source, "defaults");
    assert.strictEqual(loaded.status, "migration-failed");
    assert.strictEqual(loaded.degraded, true);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_RECOVERY_MARKER_KEY].kind, "migration-failed");
    assert.strictEqual(gm.snapshot()[settings.CONFIG_MIGRATION_VERSION_KEY], undefined);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-STORAGE-01 missing canonical data ignores obsolete standalone keys", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({
    tags: [{ id: 1, name: "Legacy" }],
    minVersion: 0.7,
    threadSettings: { marked: true, skipMaskedLink: true },
  });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    const snapshot = gm.snapshot();
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(loaded.source, "legacy-migration");
    assert.strictEqual(loaded.data.latestSettings.minVersion, 0.7);
    assert.strictEqual(loaded.data.threadSettings.marked, true);
    assert.deepStrictEqual(snapshot[settings.CONFIG_TAGS_CACHE_KEY], [{ id: 1, name: "Legacy" }]);
    assert.strictEqual(snapshot[settings.CONFIG_MIGRATION_VERSION_KEY], 1);
    assert.strictEqual(snapshot.tags, undefined);
    assert.strictEqual(snapshot.minVersion, undefined);
    assert.strictEqual(snapshot.threadSettings, undefined);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-STORAGE-01 sanitized version-one data preserves valid siblings without writing", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    const data = {
      ...JSON.parse(JSON.stringify(config)),
      minVersion: 0.7,
      globalSettings: { ...config.globalSettings, enableCrossTabSync: true, configVisibility: false },
      threadSettings: { ...config.threadSettings, marked: true, skipMaskedLink: true },
    };
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, {
      schemaVersion: 1, revision: 3, writerId: "writer", updatedAt: 3, data,
    });
    await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
    await gm.setValue(settings.CONFIG_TAGS_CACHE_KEY, []);
    await gm.setValue(settings.CONFIG_PREFIXES_CACHE_KEY, { items: [], categories: {} });
    const before = JSON.stringify(gm.snapshot());
    const result = await loadModule("tests/fixtures/configStorageHarness.js").loadWithHealth();
    assert.strictEqual(result.loaded.status, "sanitized");
    assert.strictEqual(result.loaded.data.latestSettings.minVersion, config.latestSettings.minVersion);
    assert.strictEqual(result.loaded.data.threadSettings.marked, true);
    assert.strictEqual(Object.hasOwn(result.loaded.data, "minVersion"), false);
    assert.strictEqual(Object.hasOwn(result.loaded.data.globalSettings, "enableCrossTabSync"), false);
    assert.strictEqual(result.loaded.data.globalSettings.configVisibility, false);
    assert.strictEqual(Object.hasOwn(result.loaded.data.threadSettings, "skipMaskedLink"), false);
    assert.strictEqual(JSON.stringify(gm.snapshot()), before);
    assert.strictEqual(result.events.filter((event) => event.code === "CONFIG_SANITIZED").length, 1);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-STORAGE-01 persistence contract has version one and zero migrations", () => {
  const persistence = loadModule("src/config/persistence.js");
  assert.strictEqual(persistence.CONFIG_SCHEMA_VERSION, 1);
  assert.strictEqual(persistence.CONFIG_MIGRATION_COUNT, 0);
  assert.deepStrictEqual(persistence.CONFIG_MIGRATIONS, []);
  assert.strictEqual(persistence.isCurrentConfigVersion(1), true);
  assert.strictEqual(persistence.isSupportedConfigVersion(0), false);
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 recovers the supplied real-world surface layout", async () => {
  const previousGM = global.GM;
  const fixture = loadModule("tests/fixtures/configMigrationHarness.js");
  const reference = fixture.loadConfigReference({ compactCatalogs: true });
  const gm = createFakeGM(reference);
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    const snapshot = gm.snapshot();
    const canonical = snapshot[settings.CONFIG_ENVELOPE_KEY];
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(loaded.data.globalSettings.disableHelpMessage, true);
    assert.strictEqual(loaded.data.latestSettings.autoRefresh, true);
    assert.strictEqual(loaded.data.latestSettings.webNotif, true);
    assert.deepStrictEqual(loaded.data.preferredTags, reference.preferredTags);
    assert.deepStrictEqual(loaded.data.excludedTags, reference.excludedTags);
    assert.deepStrictEqual(loaded.data.markedTags, reference.markedTags);
    assert.strictEqual(loaded.data.threadSettings.preferredShadow, false);
    assert.strictEqual(loaded.data.addons.byAddon["latest-filters-addon"].state.enabled, true);
    assert.ok(Array.isArray(loaded.data.addons.byAddon["latest-filters-addon"].state.presets));
    assert.strictEqual(Object.hasOwn(canonical.data, "metrics"), false);
    assert.strictEqual(canonical.data.tags.length, 0);
    assert.deepStrictEqual(canonical.data.prefixes, { items: [], categories: {} });
    assert.deepStrictEqual(snapshot[settings.CONFIG_TAGS_CACHE_KEY], reference.tags);
    assert.deepStrictEqual(snapshot[settings.CONFIG_PREFIXES_CACHE_KEY], reference.prefixes);
    assert.strictEqual(snapshot.tags, undefined);
    assert.strictEqual(snapshot.prefixes, undefined);
    assert.strictEqual(snapshot.globalSettings, undefined);
    assert.strictEqual(snapshot.metrics, undefined);
    assert.strictEqual(snapshot[settings.CONFIG_MIGRATION_VERSION_KEY], 1);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 current marker uses the fast path only", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({
    ["f95ue:config:migration-version"]: 1,
    ["f95ue:config"]: {
      schemaVersion: 1, revision: 7, writerId: "ready", updatedAt: 7,
      data: getDefaultConfig(),
    },
    ["f95ue:cache:tags"]: [{ id: 1, name: "Cached" }],
    ["f95ue:cache:prefixes"]: { items: [], categories: {} },
    color: { completed: "#000000" },
    metrics: { failed: 10 },
  });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const before = gm.logs();
    const loaded = await settings.loadConfig();
    const logs = gm.logs();
    assert.strictEqual(loaded.status, "loaded");
    assert.deepStrictEqual(loaded.data.tags, [{ id: 1, name: "Cached" }]);
    assert.deepStrictEqual(logs.writes, before.writes);
    assert.deepStrictEqual(logs.deletes, before.deletes);
    assert.deepStrictEqual(logs.reads, ["f95ue:config:migration-version", "f95ue:config", "f95ue:cache:tags", "f95ue:cache:prefixes"]);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 invalid historical leaves preserve valid siblings", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({
    globalSettings: { configVisibility: "bad", disableHelpMessage: true, enableCrossTabSync: true },
    latestSettings: { autoRefresh: true, priorityWeights: { rating: 4, engagement: "bad" } },
  });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(loaded.data.globalSettings.disableHelpMessage, true);
    assert.strictEqual(Object.hasOwn(loaded.data.globalSettings, "enableCrossTabSync"), false);
    assert.strictEqual(loaded.data.globalSettings.configVisibility, true);
    assert.strictEqual(loaded.data.latestSettings.autoRefresh, true);
    assert.strictEqual(loaded.data.latestSettings.priorityWeights.rating, 4);
    assert.strictEqual(loaded.data.latestSettings.priorityWeights.engagement, 1.5);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 fresh installs get a marker and repeat startup is write-free", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    let settings = loadModule("src/services/settingsService.js");
    const first = await settings.loadConfig();
    assert.strictEqual(first.status, "migrated");
    const firstRevision = gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision;
    const writesBefore = gm.logs().writes.length;
    const deletesBefore = gm.logs().deletes.length;
    settings = loadModule("src/services/settingsService.js");
    const second = await settings.loadConfig();
    assert.strictEqual(second.status, "loaded");
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, firstRevision);
    assert.strictEqual(gm.logs().writes.length, writesBefore);
    assert.strictEqual(gm.logs().deletes.length, deletesBefore);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 cache writes do not rotate the core envelope", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(gm, settings, config);
    await settings.loadConfig();
    const before = gm.logs();
    const tags = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, name: `Tag ${index + 1}` }));
    const result = await settings.saveConfigKeys({ tags });
    const writes = gm.logs().writes.slice(before.writes.length);
    assert.strictEqual(result.committed, true);
    assert.deepStrictEqual(writes, [settings.CONFIG_TAGS_CACHE_KEY]);
    assert.deepStrictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, 1);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_BACKUP_KEY], null);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 prefix and add-on updates stay in their ownership boundaries", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(gm, settings, config);
    await settings.loadConfig();
    const beforePrefix = gm.logs();
    const prefixResult = await settings.saveConfigKeys({ prefixes: { items: [{ id: 1, name: "Engine", class: "label" }], categories: {} } });
    const prefixWrites = gm.logs().writes.slice(beforePrefix.writes.length);
    assert.strictEqual(prefixResult.committed, true);
    assert.deepStrictEqual(prefixWrites, [settings.CONFIG_PREFIXES_CACHE_KEY]);

    const beforeAddon = gm.logs();
    const addonResult = await settings.saveConfigKeys({ addons: { byAddon: { "example-addon": { state: { enabled: true, presets: ["safe"] } } } } });
    const addonWrites = gm.logs().writes.slice(beforeAddon.writes.length);
    assert.strictEqual(addonResult.committed, true);
    assert.deepStrictEqual(addonWrites, [settings.CONFIG_BACKUP_KEY, settings.CONFIG_ENVELOPE_KEY]);
    assert.strictEqual(addonWrites.includes(settings.CONFIG_TAGS_CACHE_KEY), false);
    assert.strictEqual(addonWrites.includes(settings.CONFIG_PREFIXES_CACHE_KEY), false);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 migration failures keep source data and marker unset", async () => {
  const previousGM = global.GM;
  const source = { preferredTags: [9], latestSettings: { autoRefresh: true } };
  const gm = createFakeGM(source, { failSetKey: "f95ue:config" });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.status, "migration-failed");
    assert.deepStrictEqual(gm.snapshot().preferredTags, [9]);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_MIGRATION_VERSION_KEY], undefined);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY], undefined);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 marker and read-back failures never complete migration", async () => {
  for (const option of [
    { failSetKey: "f95ue:config:migration-version" },
    { afterSet: (key, values) => {
      if (key !== "f95ue:config") return;
      values.set(key, { schemaVersion: 1, revision: 999, writerId: "corrupt", updatedAt: 0, data: null });
    } },
  ]) {
    const previousGM = global.GM;
    const gm = createFakeGM({ preferredTags: [7] }, option);
    global.GM = gm;
    try {
      const settings = loadModule("src/services/settingsService.js");
      const loaded = await settings.loadConfig();
      assert.strictEqual(loaded.status, "migration-failed");
      assert.strictEqual(gm.snapshot()[settings.CONFIG_MIGRATION_VERSION_KEY], undefined);
      assert.deepStrictEqual(gm.snapshot().preferredTags, [7]);
    } finally { global.GM = previousGM; }
  }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 cleanup failure leaves verified data and marker intact", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ preferredTags: [8] }, { failDelete: true });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(gm.snapshot()[settings.CONFIG_MIGRATION_VERSION_KEY], 1);
    assert.deepStrictEqual(gm.snapshot().preferredTags, [8]);
    assert.ok(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY]);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 concurrent startup has one migration winner", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ preferredTags: [11] });
  global.GM = gm;
  try {
    const firstSettings = loadModule("src/services/settingsService.js");
    const secondSettings = loadModule("src/services/settingsService.js");
    const [first, second] = await Promise.all([firstSettings.loadConfig(), secondSettings.loadConfig()]);
    assert.ok([first.status, second.status].includes("migrated"));
    assert.strictEqual(gm.snapshot()[firstSettings.CONFIG_MIGRATION_VERSION_KEY], 1);
    assert.ok([first.status, second.status].includes("loaded"));
    assert.notStrictEqual(first.status, second.status);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 save waits for migration readiness", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ preferredTags: [13], latestSettings: { autoRefresh: true } });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loadPromise = settings.loadConfig();
    const savePromise = settings.saveConfigKeys({ globalSettings: { disableHelpMessage: true } });
    const [loaded, saved] = await Promise.all([loadPromise, savePromise]);
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(saved.committed, true);
    assert.deepStrictEqual(saved.config.preferredTags, [13]);
    assert.strictEqual(saved.config.globalSettings.disableHelpMessage, true);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 canonical size is isolated from tag and prefix catalog size", () => {
  const migration = loadModule("src/services/configMigrationService.js");
  const makeTags = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Tag ${index}` }));
  const makePrefixes = (count) => ({
    items: makeTags(count).map((item) => ({ ...item, class: "label--blue" })),
    categories: { games: [{ id: 1, name: "All", prefixes: makeTags(count).map((item) => ({ ...item, class: "label--blue" })), prefixIds: makeTags(count).map((item) => item.id) }] },
  });
  const small = migration.buildMigrationPlan({ surfaceValues: { tags: makeTags(10), prefixes: makePrefixes(10) } });
  const large = migration.buildMigrationPlan({ surfaceValues: { tags: makeTags(10000), prefixes: makePrefixes(300) } });
  assert.strictEqual(JSON.stringify(migration.getCanonicalData(small.data)).length, JSON.stringify(migration.getCanonicalData(large.data)).length);
  assert.ok(JSON.stringify(large.caches.tags).length > JSON.stringify(small.caches.tags).length);
  assert.ok(JSON.stringify(large.caches.prefixes).length > JSON.stringify(small.caches.prefixes).length);
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 reproduces stale tag rendering after a detached save", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox();
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const harness = loadModule("tests/fixtures/configInteractionHarness.js");
    const result = await harness.reproduceStaleTagRender();
    assert.deepStrictEqual(result.renderedLists[0], [1, 7]);
    assert.strictEqual(harness.getTagEffectMetadata().config, "preferredTags");
    assert.strictEqual(typeof harness.getTagEffectMetadata().effects.custom, "function");
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 serializes rapid tag edits without losing operations", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox();
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const result = await loadModule("tests/fixtures/configInteractionHarness.js").runSerializedTagMutationSequence();
    assert.deepStrictEqual(result.config.preferredTags, [2, 1, 8]);
    assert.deepStrictEqual(result.config.excludedTags, []);
    assert.deepStrictEqual(result.config.markedTags, [7]);
    assert.ok(result.renders.length >= 5);
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 measures catalog persistence without rotating core config", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox();
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const measurements = await loadModule("tests/fixtures/configInteractionHarness.js").measureCatalogPersistence();
    assert.ok(measurements.every((entry) => entry.committed));
    const coreMeasurement = measurements.find((entry) => entry.kind === "tag-list");
    const cacheMeasurements = measurements.filter((entry) => entry.kind !== "tag-list");
    assert.deepStrictEqual(coreMeasurement.writes, ["f95ue:config:last-known-good", "f95ue:config"]);
    assert.ok(coreMeasurement.reads.includes("f95ue:config"));
    assert.ok(cacheMeasurements.every((entry) => entry.writes.length === 1));
    assert.ok(cacheMeasurements.every((entry) => entry.writes[0].includes("cache:")));
    assert.strictEqual(new Set(measurements.map((entry) => entry.canonicalBytes)).size, 1);
    console.log(`CORE-CONFIG-INTERACTION-REGRESSION-02 measurements ${JSON.stringify(measurements)}`);
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 serializes Latest Overlay off-on lifecycle transitions", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox("https://f95zone.to/sam/latest_alpha/");
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const result = await loadModule("tests/fixtures/configInteractionHarness.js").runLatestOverlayToggleSequence();
    assert.strictEqual(result.finalToggle, true);
    assert.strictEqual(result.status, "ACTIVE");
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 suppresses load toasts while retaining interactive notifications", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox();
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const result = await loadModule("tests/fixtures/configInteractionHarness.js").runLoadEffectNotificationContract();
    assert.strictEqual(result.customCalls, 2);
    assert.deepStrictEqual(result.loadToasts, []);
    assert.deepStrictEqual(result.interactiveToasts, ["Notification probe disabled"]);
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("CORE-CONFIG-INTERACTION-REGRESSION-02 settings load does not announce persisted feature state", async () => {
  const previousGM = global.GM;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  const dom = createDomSandbox();
  global.requestAnimationFrame = (callback) => callback();
  global.GM = createFakeGM();
  try {
    const result = await loadModule("tests/fixtures/configInteractionHarness.js").runSettingsLoadNotificationContract();
    assert.strictEqual(result.source, "canonical");
    assert.strictEqual(result.toggle, false);
    assert.deepStrictEqual(result.toasts, []);
  } finally {
    global.GM = previousGM;
    global.requestAnimationFrame = previousRequestAnimationFrame;
    dom.restore();
  }
});

runTest("TEST-01 config import preview rejects invalid data without mutating state", async () => {
  const previousGM = global.GM;
  global.GM = createFakeGM();
  try {
    const { config } = loadModule("src/config.js");
    const { previewConfigImport } = loadModule("src/services/configTransfer/index.js");
    const before = JSON.stringify(config);
    const preview = previewConfigImport({ settings: { latestSettings: { unknown: true } } });
    assert.strictEqual(preview.ok, false);
    assert.strictEqual(JSON.stringify(config), before);
  } finally { global.GM = previousGM; }
});

runTest("TRANSFER-LEAN-01 keeps the transfer domain DOM-free and the UI one-way", () => {
  const serviceSource = fs.readFileSync(path.join(ROOT, "src/services/configTransfer/index.js"), "utf8");
  const uiSource = fs.readFileSync(path.join(ROOT, "src/ui/configTransfer/index.js"), "utf8");
  assert.doesNotMatch(serviceSource, /src[\\/](?:features|ui)|from ["'][^"']*ui/);
  assert.match(uiSource, /services[\\/]configTransfer[\\/]index\.js/);
  assert.doesNotMatch(uiSource, /features[\\/]config-transfer/);
  assert.strictEqual(fs.existsSync(path.join(ROOT, "src/features/config-transfer")), false);

  const manifest = require("../scripts/featureManifest.cjs").buildFeatureManifestState({ rootDir: ROOT });
  assert.strictEqual(manifest.entries.some((entry) => entry.relativePath.includes("config-transfer")), false);
  assert.strictEqual(manifest.featureNames.includes("configTransferFeature"), false);
});

runTest("TRANSFER-01 export uses schema metadata and includes safe document metadata", () => {
  const service = loadModule("src/services/configTransfer/index.js");
  const exported = service.buildConfigExport({ exportedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepStrictEqual(Object.keys(exported.settings).sort(), getExportableConfigKeys().sort());
  assert.strictEqual(exported.formatVersion, 1);
  assert.strictEqual(exported.schemaVersion, 1);
  assert.strictEqual(exported.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.strictEqual(Object.hasOwn(exported.settings, "addons"), false);
  assert.strictEqual(typeof exported.applicationVersion, "string");
  const { config } = loadModule("src/config.js");
  const liveColor = config.color.completed;
  exported.settings.color.completed = "#abc";
  assert.strictEqual(config.color.completed, liveColor);
});

runTest("TRANSFER-01 format and schema errors are structured without raw payloads", () => {
  const { previewConfigImport } = loadModule("src/services/configTransfer/index.js");
  const invalidJson = previewConfigImport("{not-json");
  assert.strictEqual(invalidJson.ok, false);
  assert.strictEqual(invalidJson.issues[0].code, "invalid_json");
  assert.strictEqual(Object.hasOwn(invalidJson.issues[0], "received"), false);

  const unsupported = previewConfigImport({ formatVersion: 99, settings: { color: { completed: "#abc" } } });
  assert.strictEqual(unsupported.issues[0].code, "unsupported");
  assert.strictEqual(unsupported.issues[0].path, "formatVersion");

  const unknown = previewConfigImport({ settings: { latestSettings: { unknown: true } } });
  assert.strictEqual(unknown.ok, false);
  assert.ok(unknown.issues.some((entry) => entry.code === "unknown"));

  const invalidNested = previewConfigImport({ settings: { latestSettings: { priorityWeights: { rating: "bad" } } } });
  assert.strictEqual(invalidNested.ok, false);
  assert.ok(invalidNested.issues.some((entry) => entry.path === "latestSettings.priorityWeights.rating"));
});

runTest("TRANSFER-01 preview is read-only and normalizes supported legacy exports", () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ untouched: "value" });
  global.GM = gm;
  try {
    const service = loadModule("src/services/configTransfer/index.js");
    const { config } = loadModule("src/config.js");
    const beforeConfig = JSON.stringify(config);
    const beforeStorage = JSON.stringify(gm.snapshot());
    const preview = service.previewConfigImport({
      minVersion: 0.7,
      tags: { Legacy: "1" },
      threadSettings: { marked: false, skipMaskedLink: true },
    });
    assert.strictEqual(preview.ok, true);
    assert.strictEqual(preview.migrated, true);
    assert.strictEqual(preview.candidate.latestSettings.minVersion, 0.7);
    assert.deepStrictEqual(preview.candidate.tags, [{ id: 1, name: "Legacy" }]);
    assert.strictEqual(Object.hasOwn(preview.candidate.threadSettings, "skipMaskedLink"), false);
    assert.strictEqual(JSON.stringify(config), beforeConfig);
    assert.strictEqual(JSON.stringify(gm.snapshot()), beforeStorage);
  } finally { global.GM = previousGM; }
});

runTest("TRANSFER-01 successful import commits complete sections through shared application", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const service = loadModule("src/services/configTransfer/index.js");
    const result = await service.commitConfigImport({
      formatVersion: 1,
      schemaVersion: 1,
      settings: {
        color: { completed: "#abc" },
        globalSettings: { configVisibility: false },
        latestSettings: { minVersion: 0.9 },
        tags: [{ id: 7, name: "Imported" }],
      },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.committed, true);
    assert.strictEqual(result.config.color.completed, "#abc");
    assert.strictEqual(result.config.globalSettings.configVisibility, false);
    assert.strictEqual(result.config.latestSettings.minVersion, 0.9);
    assert.deepStrictEqual(result.config.tags, [{ id: 7, name: "Imported" }]);
    assert.deepStrictEqual(result.changedSections.sort(), ["color", "globalSettings", "latestSettings", "tags"].sort());
    assert.strictEqual(result.reloadRequired, false);
  } finally { global.GM = previousGM; }
});

runTest("TRANSFER-LEAN-01 file picker cancellation removes temporary DOM and listeners", async () => {
  const sandbox = createDomSandbox();
  try {
    const transferIO = loadModule("src/ui/configTransfer/transferIO.js");
    const picker = transferIO.createJsonFilePicker();
    assert.strictEqual(document.querySelectorAll('input[type="file"]').length, 1);
    picker.cancel();
    assert.strictEqual(await picker.promise, null);
    assert.strictEqual(document.querySelectorAll('input[type="file"]').length, 0);
  } finally { sandbox.restore(); }
});

runTest("TRANSFER-LEAN-01 successful commit applies registered effects exactly once", async () => {
  const previousGM = global.GM;
  global.GM = createFakeGM();
  try {
    const result = await loadModule("tests/fixtures/transferHarness.js").runTransferEffectScenario();
    assert.strictEqual(result.result.ok, true);
    assert.strictEqual(result.result.committed, true);
    assert.strictEqual(result.seen.length, 1);
  } finally { global.GM = previousGM; }
});

runTest("CORE-CONFIG-SYNC-REMOVE-01 removes the unreleased core sync surface", () => {
  const defaults = getDefaultConfig();
  assert.strictEqual(Object.hasOwn(defaults.globalSettings, "enableCrossTabSync"), false);
  assert.strictEqual(Object.hasOwn(getConfigPathMetadata("globalSettings"), "syncable"), false);
  assert.strictEqual(fs.existsSync(path.join(ROOT, "src/services/syncService.js")), false);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "src/ui/settings/globalSettings.js"), "utf8"), /cross.?tab/i);
});

runTest("TEST-01 BFCache page lifecycle suspends, resumes fresh route work, and fully tears down", async () => {
  const { createPageLifecycleHandlers } = loadModule("src/core/pageLifecycle.js");
  const calls = [];
  let beginRouteOptions = null;
  const handlers = createPageLifecycleHandlers({
    suspendRuntime: (reason) => calls.push(`suspend:${reason}`),
    teardownAll: async (reason) => calls.push(`teardown:${reason}`),
    resumeRuntime: () => calls.push("resume"),
    beginRoute: (_location, options) => { beginRouteOptions = options; return { generation: 9, correlationId: "route-9" }; },
    detectPage: () => calls.push("detect"),
    refreshFastBootstrapFeatures: (context) => calls.push(`fast:${context.generation}`),
    reconcileFeatures: async (context) => calls.push(`reconcile:${context.generation}`),
  });
  handlers.handlePageHide({ persisted: true });
  await handlers.handlePageShow({ persisted: true });
  await handlers.handlePageHide({ persisted: false });
  assert.deepStrictEqual(calls, ["suspend:bfcache", "resume", "detect", "fast:9", "reconcile:9", "teardown:pagehide"]);
  assert.deepStrictEqual(beginRouteOptions, { force: true });
});

runTest("TEST-01 resource leak assertion detects and clears owner resources", () => {
  const resources = loadModule("src/core/resourceManager.js");
  resources.resetResourceManagerForTests();
  const owner = resources.createResourceOwner("TEST-01:leak-owner");
  owner.register("TEST-01:leaked-listener", () => {});
  assert.throws(() => resources.assertNoResourceLeaks("TEST-01:leak-owner"), /Resource leak/);
  resources.releaseOwner("TEST-01:leak-owner");
  assert.strictEqual(resources.assertNoResourceLeaks("TEST-01:leak-owner"), true);
});

runTest("TRANSFER-01 transactional import leaves live and canonical state unchanged on persistence failure", async () => {
  const previousGM = global.GM;
  const originalEnvelope = { sentinel: "unchanged" };
  global.GM = createFakeGM({ "f95ue:config": originalEnvelope }, { failSet: true });
  try {
    const service = loadModule("src/services/configTransfer/index.js");
    const { config } = loadModule("src/config.js");
    const before = JSON.stringify(config);
    const result = await service.commitConfigImport({ settings: { latestSettings: { ...config.latestSettings, minVersion: 0.9 } } });
    assert.strictEqual(result.committed, false);
    assert.strictEqual(JSON.stringify(config), before);
    assert.deepStrictEqual(global.GM.snapshot()["f95ue:config"], originalEnvelope);
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 add-on UI ownership rejects cross-owner mutation and cleans every resource", () => {
  const sandbox = createDomSandbox();
  try {
    const host = loadModule("src/services/addons/uiHost.js");
    assert.strictEqual(host.mountAddonUi("addon-a", { mountId: "panel", slot: "page.panel", html: '<button onclick="bad()">Safe</button>' }).ok, true);
    assert.strictEqual(host.updateAddonUi("addon-b", { mountId: "panel", html: "stolen" }).reason, "mount_not_found");
    assert.strictEqual(host.registerAddonStyle("addon-a", { styleId: "panel", cssText: ".panel { color: red; }" }).ok, true);
    assert.strictEqual(host.openAddonDialog("addon-a", { dialogId: "dialog", html: "<div>Dialog</div>" }).ok, true);
    host.cleanupAddonUi("addon-a");
    const owners = host.getAddonUiPolicySnapshot().owners;
    assert.deepStrictEqual(owners, { docks: [], dialogs: [], mounts: [], pendingMounts: [], styles: [] });
    host.resetAddonUiHostForTests();
  } finally { sandbox.restore(); }
});

runTest("TEST-01 add-on trust state and execution-time scope revocation remain enforced", () => {
  const { getAddonActionBlockReason } = loadModule("src/services/addonsService.js");
  const base = { trusted: true, blocked: false, status: "installed", pageScopes: [] };
  assert.strictEqual(getAddonActionBlockReason(base, "storage.get"), null);
  assert.strictEqual(getAddonActionBlockReason({ ...base, status: "disabled" }, "storage.get"), "addon_disabled");
  assert.strictEqual(getAddonActionBlockReason({ ...base, trusted: false }, "storage.get"), "addon_untrusted");
  assert.strictEqual(getAddonActionBlockReason({ ...base, blocked: true }, "storage.get"), "addon_blocked");
  assert.strictEqual(getAddonActionBlockReason({ ...base, pageScopes: ["never-current"] }, "storage.get"), "addon_out_of_scope");
});

runTest("TEST-01 lifecycle timeout and repeated applicability transitions settle deterministically", async () => {
  const clock = createFakeClock();
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  try {
    const timed = createFeature("TEST-01 Timeout Feature", { enable: () => new Promise(() => {}), disable: () => null });
    const operation = timed.enable();
    for (let index = 0; index < 8 && clock.pending() === 0; index += 1) await Promise.resolve();
    assert.ok(clock.pending() > 0);
    await clock.tick(15000);
    await assert.rejects(operation, /timeout/i);
    let applicable = false;
    const transitions = [];
    const feature = createFeature("TEST-01 Applicability Feature", {
      isApplicable: () => applicable,
      enable: () => transitions.push("enable"), disable: () => transitions.push("disable"),
    });
    assert.strictEqual(await feature.enable(), false);
    applicable = true; await feature.enable();
    applicable = false; await feature.disable();
    applicable = true; await feature.enable();
    assert.deepStrictEqual(transitions, ["enable", "disable", "enable"]);
  } finally { global.setTimeout = previousSetTimeout; global.clearTimeout = previousClearTimeout; }
});

runTest("TEST-01 queue timeout reports final idle state without sleeps", async () => {
  const clock = createFakeClock();
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  global.setTimeout = clock.setTimeout;
  global.clearTimeout = clock.clearTimeout;
  try {
    const { createTaskQueue: createQueue } = loadModule("src/core/taskQueue.js");
    const queue = createQueue({ name: "TEST-01-timeout", ownerId: "TEST-01:queue-timeout", delay: 0, timeoutMs: 5 });
    let startedResolve;
    const started = new Promise((resolve) => { startedResolve = resolve; });
    const task = queue.add("blocked", () => { startedResolve(); return new Promise(() => {}); });
    await clock.tick(0); await started; await clock.tick(5);
    assert.strictEqual((await task).status, "cancelled");
    const idle = await queue.whenIdle();
    assert.strictEqual(idle.runningKey, null);
    await queue.dispose();
  } finally { global.setTimeout = previousSetTimeout; global.clearTimeout = previousClearTimeout; }
});

runTest("TEST-01 corrupted canonical and invalid backup recover to validated defaults", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, { revision: 4, data: { latestSettings: { minVersion: "bad" } } });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, { revision: 3, data: { latestSettings: { minVersion: "also-bad" } } });
    const loaded = await settings.loadData();
    assert.strictEqual(typeof loaded.latestSettings.minVersion, "number");
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 malformed payloads are rejected across add-on action categories", async () => {
  for (const action of ["toast.show", "storage.set", "idb.put", "observer.watch", "ui.mount", "ui.dialog.open", "ui.style.register"]) {
    const result = await invokeRegisteredAddonCoreAction({ addonId: "test-addon", action, payload: null, deps: {}, limits: {}, authorize: () => null });
    assert.strictEqual(result.reason, "invalid_payload", action);
  }
});

testChain.then(() => {
  console.log(`\nTest results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
