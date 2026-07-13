const path = require("path");
const fs = require("fs");
const assert = require("assert");
const childProcess = require("child_process");
const esbuild = require("esbuild");
const { createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition } = require("./helpers.cjs");
const {
  generateFeatureManifest,
  checkFeatureManifest,
  renderFeatureManifest,
  validateFeatureManifestEntries,
} = require("../scripts/featureManifest.cjs");

const ROOT = path.join(__dirname, "..");
const TMP_DIR = path.join(__dirname, ".tmp");

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
  getConfigPathMetadata,
  getDefaultConfig,
  getExportableConfigKeys,
  getPersistedConfigPaths,
  getSchemaPathIndex,
  getSyncedConfigPaths,
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

  const valid = validateConfig(defaults, { mode: "strict" });
  assert.strictEqual(valid.valid, true);
  assert.deepStrictEqual(valid.data, defaults);
  assert.strictEqual(JSON.stringify(defaults), defaultsSnapshot);

  const representative = validateConfig({
    prefixes: {
      items: [{ id: 1, name: "Example", class: "example" }],
      categories: { games: [{ id: null, name: "Games", prefixIds: [1] }] },
    },
    globalSettings: { enableCrossTabSync: true },
    metrics: { retried: 1 },
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
  assert.deepStrictEqual(getSyncedConfigPaths().sort(), [
    "addons",
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
  assert.strictEqual(getConfigPathMetadata("latestSettings.priorityWeights.rating").exportable, true);
  assert.strictEqual(getConfigPathMetadata("addons.byAddon.example-addon.state.enabled").syncable, true);
  assert.strictEqual(getConfigPathMetadata("missing.path"), null);
  assert.ok(getSchemaPathIndex()["latestSettings.tagModifiers.preferred"]);

  const merged = mergeWithDefaults({ latestSettings: { autoRefresh: true } });
  assert.strictEqual(merged.latestSettings.autoRefresh, true);
  assert.strictEqual(typeof merged.latestSettings.minVersion, "number");
  assert.notStrictEqual(merged.latestSettings, defaults.latestSettings);
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

runTest("CONFIG-01 tolerant and migration modes preserve valid data and recover invalid input", () => {
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

  const migration = validateConfig({
    minVersion: 0.7,
    threadSettings: { marked: false, skipMaskedLink: true },
  }, { mode: "migration", partial: true });
  assert.strictEqual(migration.valid, true);
  assert.strictEqual(migration.data.threadSettings.marked, false);
  assert.strictEqual(Object.hasOwn(migration.data, "minVersion"), false);
  assert.strictEqual(Object.hasOwn(migration.data.threadSettings, "skipMaskedLink"), false);

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
  const changes = [];
  const id = gm.addValueChangeListener("value", (...args) => changes.push(args.slice(0, 3)));
  await gm.setValue("value", 2);
  gm.removeValueChangeListener(id);
  assert.deepStrictEqual(changes, [["value", 1, 2]]);
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
    const result = await settings.commitConfig({ ...config, metrics: { ...config.metrics, lowest: 0 } });
    assert.strictEqual(result.committed, false);
    assert.strictEqual(result.issues[0].code, "storage_error");
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
    const result = await settings.commitConfig(config, { origin: "TEST-01" });
    assert.strictEqual(result.committed, true);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, 1);
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
    const first = await settings.commitConfig(config, { origin: "PERSIST-01" });
    const second = await settings.commitConfig({
      ...first.config,
      latestSettings: { ...first.config.latestSettings, minVersion: 0.9 },
    }, { origin: "PERSIST-01" });
    assert.strictEqual(first.committed, true);
    assert.strictEqual(second.committed, true);
    assert.strictEqual(first.revision, 1);
    assert.strictEqual(second.revision, 2);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_BACKUP_KEY].revision, 1);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.latestSettings.minVersion, 0.9);
    assert.deepStrictEqual(second.revisionMetadata, {
      revision: 2,
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

  const failingGM = createFakeGM({ [settings.CONFIG_ENVELOPE_KEY]: previousEnvelope }, { failSetAt: 2 });
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

runTest("PERSIST-01 migration failure preserves the old canonical envelope", async () => {
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
    const loaded = await settings.loadConfig({ migrations: { 1: () => { throw new Error("migration_injected"); } } });
    assert.strictEqual(loaded.recovered, true);
    assert.strictEqual(loaded.source, "canonical");
    assert.deepStrictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY], oldEnvelope);
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
      data: { latestSettings: { minVersion: "bad" } },
    });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, validBackup);
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
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, { schemaVersion: 1, revision: 4, writerId: "bad", updatedAt: 4, data: { latestSettings: { minVersion: "bad" } } });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, { schemaVersion: 1, revision: 3, writerId: "also-bad", updatedAt: 3, data: { latestSettings: { minVersion: "also-bad" } } });
    const loaded = await settings.loadConfig();
    assert.strictEqual(loaded.source, "defaults");
    assert.strictEqual(loaded.degraded, true);
    assert.strictEqual(gm.snapshot()[settings.CONFIG_RECOVERY_MARKER_KEY].kind, "corrupt");
  } finally { global.GM = previousGM; }
});

runTest("PERSIST-01 legacy keys migrate into one envelope before cleanup", async () => {
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
    assert.strictEqual(loaded.source, "legacy-migration");
    assert.strictEqual(loaded.persisted, true);
    assert.strictEqual(snapshot[settings.CONFIG_ENVELOPE_KEY].data.latestSettings.minVersion, 0.7);
    assert.strictEqual(snapshot[settings.CONFIG_ENVELOPE_KEY].data.threadSettings.skipMaskedLink, undefined);
    assert.strictEqual(Object.hasOwn(snapshot, "minVersion"), false);
    assert.strictEqual(Object.hasOwn(snapshot, "tags"), false);
    assert.strictEqual(Object.hasOwn(snapshot, "threadSettings"), false);
    const revision = snapshot[settings.CONFIG_ENVELOPE_KEY].revision;
    const repeated = await settings.loadConfig();
    assert.strictEqual(repeated.source, "canonical");
    assert.strictEqual(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].revision, revision);
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 migration is idempotent and corrupted canonical config recovers from backup", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ minVersion: 0.7, threadSettings: { skipMaskedLink: true } });
  global.GM = gm;
  try {
    const { migrateLegacyConfigPayload } = loadModule("src/services/configMigrationService.js");
    const migrated = await migrateLegacyConfigPayload(gm.snapshot());
    const repeated = await migrateLegacyConfigPayload(migrated);
    assert.strictEqual(migrated.latestSettings.minVersion, 0.7);
    assert.strictEqual(migrated.threadSettings.skipMaskedLink, undefined);
    assert.deepStrictEqual(repeated, migrated);
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, { revision: 3, data: { latestSettings: { minVersion: "bad" } } });
    await gm.setValue(settings.CONFIG_BACKUP_KEY, { revision: 2, data: config });
    const loaded = await settings.loadData();
    assert.strictEqual(loaded.latestSettings.minVersion, config.latestSettings.minVersion);
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 config import preview rejects invalid data without mutating state", async () => {
  const previousGM = global.GM;
  global.GM = createFakeGM();
  try {
    const { config } = loadModule("src/config.js");
    const { previewConfigImport } = loadModule("src/services/configTransferService.js");
    const before = JSON.stringify(config);
    const preview = previewConfigImport({ settings: { latestSettings: { unknown: true } } });
    assert.strictEqual(preview.ok, false);
    assert.strictEqual(JSON.stringify(config), before);
  } finally { global.GM = previousGM; }
});

runTest("TRANSFER-01 export uses schema metadata and includes safe document metadata", () => {
  const service = loadModule("src/services/configTransferService.js");
  const exported = service.buildConfigExport({ exportedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepStrictEqual(Object.keys(exported.settings).sort(), getExportableConfigKeys().sort());
  assert.strictEqual(exported.formatVersion, 1);
  assert.strictEqual(exported.schemaVersion, 1);
  assert.strictEqual(exported.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.strictEqual(Object.hasOwn(exported.settings, "metrics"), false);
  assert.strictEqual(Object.hasOwn(exported.settings, "addons"), false);
  assert.strictEqual(typeof exported.applicationVersion, "string");
});

runTest("TRANSFER-01 format and schema errors are structured without raw payloads", () => {
  const { previewConfigImport } = loadModule("src/services/configTransferService.js");
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

runTest("TRANSFER-01 preview is read-only and migrates supported legacy exports", () => {
  const previousGM = global.GM;
  const gm = createFakeGM({ untouched: "value" });
  global.GM = gm;
  try {
    const service = loadModule("src/services/configTransferService.js");
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
    const service = loadModule("src/services/configTransferService.js");
    const result = await service.commitConfigImport({
      formatVersion: 1,
      schemaVersion: 1,
      settings: {
        color: { completed: "#abc" },
        globalSettings: { enableCrossTabSync: true },
        latestSettings: { minVersion: 0.9 },
        tags: [{ id: 7, name: "Imported" }],
      },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.committed, true);
    assert.strictEqual(result.config.color.completed, "#abc");
    assert.strictEqual(result.config.globalSettings.enableCrossTabSync, true);
    assert.strictEqual(result.config.latestSettings.minVersion, 0.9);
    assert.deepStrictEqual(result.config.tags, [{ id: 7, name: "Imported" }]);
    assert.deepStrictEqual(result.changedSections.sort(), ["color", "globalSettings", "latestSettings", "tags"].sort());
    assert.strictEqual(result.reloadRequired, false);
    assert.strictEqual(gm.snapshot()["f95ue:config"].data.metrics.failed, result.config.metrics.failed);
  } finally { global.GM = previousGM; }
});

runTest("TEST-01 sync rejects stale envelopes and ignores local loop events", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const sync = loadModule("src/services/syncService.js");
    const { config } = loadModule("src/config.js");
    const data = { ...JSON.parse(JSON.stringify(config)), metrics: { ...config.metrics, lowest: 0 } };
    const newer = { schemaVersion: 1, revision: 2, updatedAt: 20, writerId: "tab-b", data };
    const stale = { schemaVersion: 1, revision: 1, updatedAt: 10, writerId: "tab-a", data };
    assert.strictEqual(sync.applyIncoming(newer), true);
    assert.strictEqual(sync.applyIncoming(stale), false);
  } finally { global.GM = previousGM; }
});

runTest("SYNC-01 compares revisions deterministically and prevents remote echo loops", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const tabA = loadModule("tests/fixtures/syncTabHarness.js");
    const tabB = loadModule("tests/fixtures/syncTabHarness.js");
    await Promise.all([tabA.enableSync(), tabB.enableSync()]);
    const data = tabA.snapshotConfig();
    const originalMetrics = data.metrics.failed;
    data.latestSettings.minVersion = 0.9;
    data.metrics.failed += 10;
    const envelope = { schemaVersion: 1, revision: 1, updatedAt: 10, writerId: "tab-a", data };
    gm.emitRemote("f95ue:config", envelope);
    assert.strictEqual(tabA.snapshotConfig().latestSettings.minVersion, 0.9);
    assert.strictEqual(tabB.snapshotConfig().latestSettings.minVersion, 0.9);
    assert.strictEqual(tabA.snapshotConfig().metrics.failed, originalMetrics);
    gm.emitRemote("f95ue:config", envelope);
    assert.strictEqual(tabB.snapshotConfig().latestSettings.minVersion, 0.9);

    const tieData = tabA.snapshotConfig();
    tieData.latestSettings.minVersion = 0.8;
    gm.emitRemote("f95ue:config", { schemaVersion: 1, revision: 2, updatedAt: 20, writerId: "tab-a", data: tieData });
    tieData.latestSettings.minVersion = 0.7;
    gm.emitRemote("f95ue:config", { schemaVersion: 1, revision: 2, updatedAt: 20, writerId: "tab-b", data: tieData });
    assert.strictEqual(tabA.snapshotConfig().latestSettings.minVersion, 0.7);
    assert.strictEqual(tabB.snapshotConfig().latestSettings.minVersion, 0.7);
    tabA.resetSync(); tabB.resetSync();
  } finally { global.GM = previousGM; }
});

runTest("SYNC-01 replays static, tag, nested, and dynamic metadata through one pipeline", async () => {
  const result = await loadModule("tests/fixtures/syncCoverageHarness.js").runSyncCoverage();
  const seen = new Set(result.seen.map(([name]) => name));
  for (const name of ["color", "overlay", "thread", "latest", "modifier", "global", "tag", "preference"]) {
    assert.ok(seen.has(name), name);
  }
  assert.ok(result.appliedPaths.some((path) => path.startsWith("latestSettings.priorityWeights")));
  assert.ok(result.appliedPaths.some((path) => path.startsWith("tags[0]")));
  assert.strictEqual(result.metricsFailed, 0);
});

runTest("SYNC-01 isolates effect failures and continues unrelated replay", async () => {
  const result = await loadModule("tests/fixtures/syncCoverageHarness.js").runEffectFailureIsolation();
  assert.deepStrictEqual(result.seen, ["succeeding"]);
  assert.strictEqual(typeof result.value, "number");
});

runTest("TEST-01 cross-tab sync replays registered effects across config sections", () => {
  const harness = loadModule("tests/fixtures/syncEffectHarness.js");
  const result = harness.runSyncEffectReplay();
  assert.strictEqual(result.applied, true);
  assert.deepStrictEqual(result.seen.map(([section]) => section).sort(), ["global", "latest"]);
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
    const service = loadModule("src/services/configTransferService.js");
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
