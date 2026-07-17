module.exports = function registerGroup(context) {
  const { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness } = context;

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
  assert.strictEqual(result.featureNames.includes("latestAjaxErrorRecoveryFeature"), false);
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

};

