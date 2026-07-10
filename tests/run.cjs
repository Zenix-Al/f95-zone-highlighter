const path = require("path");
const fs = require("fs");
const assert = require("assert");
const esbuild = require("esbuild");
const {
  generateFeatureManifest,
  checkFeatureManifest,
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
  resetRouteStateForTests,
  setRoutePageFlags,
} = loadModule("src/core/routeState.js");
const { runBootstrapPipeline } = loadModule("src/core/bootstrap.js");
const { getExportableConfigKeys, validateConfig } = loadModule("src/config/schema.js");
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
  getAllFeatureStatuses,
  getRuntimeErrors,
  reportFeatureFailure,
  reportFeatureWarning,
  reportRuntimeError,
} = loadModule("src/core/featureHealth.js");
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

runTest("manifest generation rejects duplicate feature exports across files", () => {
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
    /duplicate/i,
  );
});

runTest("manifest check mode reports a stale generated file without rewriting it", () => {
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

runTest("route state creates one shared generation and aborts stale route work", () => {
  resetRouteStateForTests();
  const first = beginRoute({ href: "https://f95zone.to/threads/a" });
  const duplicate = beginRoute({ href: "https://f95zone.to/threads/a" });
  const second = beginRoute({ href: "https://f95zone.to/sam/latest_alpha#new" });
  setRoutePageFlags({ isLatest: true });
  assert.strictEqual(first.changed, true);
  assert.strictEqual(duplicate.changed, false);
  assert.strictEqual(second.generation, first.generation + 1);
  assert.strictEqual(first.signal.aborted, true);
  assert.strictEqual(getRouteContext().pageFlags.isLatest, true);
  resetRouteStateForTests();
});

runTest("bootstrap classifies optional, recoverable, and required failures", async () => {
  const calls = [];
  const degraded = await runBootstrapPipeline([
    { id: "success", classification: "required", run: () => calls.push("success") },
    { id: "optional", classification: "optional", run: () => { throw new Error("optional"); } },
    { id: "recover", classification: "recoverable", run: () => { throw new Error("recover"); }, fallback: () => calls.push("fallback") },
  ]);
  assert.strictEqual(degraded.status, "degraded");
  assert.deepStrictEqual(calls, ["success", "fallback"]);
  assert.deepStrictEqual(degraded.degradedSteps, ["optional", "recover"]);
  const failed = await runBootstrapPipeline([
    { id: "required", classification: "required", run: () => { throw new Error("required"); } },
    { id: "dependent", classification: "required", run: () => calls.push("dependent") },
  ]);
  assert.strictEqual(failed.status, "failed");
  assert.ok(!calls.includes("dependent"));
  assert.deepStrictEqual(failed.failedSteps, ["required"]);
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

runTest("feature catalog rejects invalid descriptors before registration", () => {
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

runTest("feature catalog rejects duplicate ids and settings contributions", () => {
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

runTest("oncePerRoute capture reactivates on a route generation change", () => {
  resetFastCaptureHarness();
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
  registerFastCaptureFeatures([feature]);
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

  refreshFastCaptureFeatures([feature]);
  assert.strictEqual(
    processCompletedFastCapture(
      "fetch",
      "https://f95zone.to/latest_data.php?page=2",
      JSON.stringify({ msg: { data: [2] } }),
    ),
    1,
  );
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

testChain.then(() => {
  console.log(`\nTest results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
