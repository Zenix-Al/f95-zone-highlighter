module.exports = function registerGroup(context) {
  const { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness } = context;

runTest("ADDON-ACTIONS-02 composes every public action exactly once with complete contracts", () => {
  const expected = [
    "config.getTagPrefs", "feature.disable", "feature.enable", "feature.refresh",
    "idb.bulkDelete", "idb.bulkPut", "idb.count", "idb.delete", "idb.get", "idb.put", "idb.query",
    "observer.unwatch", "observer.waitFor", "observer.watch", "page.getContext",
    "storage.get", "storage.getUsage", "storage.set", "toast.show",
    "ui.confirm", "ui.dialog.close", "ui.dialog.open", "ui.dialog.update",
    "ui.dock.removeButtons", "ui.dock.setButtons", "ui.mount", "ui.style.register",
    "ui.style.unregister", "ui.unmount", "ui.update",
  ];
  const snapshot = getRegisteredAddonActionSnapshot();
  assert.deepStrictEqual(snapshot.map((entry) => entry.id).sort(), expected);
  assert.strictEqual(new Set(snapshot.map((entry) => entry.id)).size, expected.length);
  for (const descriptor of snapshot) {
    assert.strictEqual(descriptor.protocolVersion, 1, descriptor.id);
    assert.ok(Array.isArray(descriptor.requiredCapabilities) && descriptor.requiredCapabilities.length > 0, descriptor.id);
    assert.strictEqual(descriptor.timeoutMs, 5000, descriptor.id);
    assert.ok(["management", "runtime"].includes(descriptor.scopePolicy), descriptor.id);
    assert.strictEqual(typeof descriptor.auditCategory, "string", descriptor.id);
    assert.strictEqual("execute" in descriptor, false, descriptor.id);
  }
});

runTest("ADDON-ACTIONS-02 has one composition root and no action registration cycle", () => {
  const root = path.join(ROOT, "src/services/addons/actions");
  const facade = fs.readFileSync(path.join(ROOT, "src/services/addons/coreActions.js"), "utf8");
  const composition = fs.readFileSync(path.join(root, "composition.js"), "utf8");
  const families = collectJavaScriptFiles(path.join(root, "families"));
  assert.ok(facade.split(/\r?\n/).length < 40);
  assert.doesNotMatch(facade, /registerAction|createLegacyActionHandlers|action[A-Z].*\(/);
  assert.match(composition, /registerAction\(descriptor\)/);
  for (const file of families) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /coreActions|actions\/composition/, path.relative(ROOT, file));
    assert.doesNotMatch(source, /registerAction\(/, path.relative(ROOT, file));
  }
  assert.strictEqual(fs.existsSync(path.join(root, "descriptors.js")), false);
});

runTest("ADDON-ACTIONS-02 keeps unsupported responses deterministic", async () => {
  const result = await invokeRegisteredAddonCoreAction({
    addonId: "example-addon", action: "unknown.action", payload: {}, deps: {}, limits: {},
  });
  assert.deepStrictEqual(result, { ok: false, reason: "unsupported_action" });
});

runTest("ADDON-ACTIONS-02 reauthorizes before an async legacy-storage commit", async () => {
  const previousGM = global.GM;
  let releaseRead;
  let readStarted;
  const started = new Promise((resolve) => { readStarted = resolve; });
  global.GM = {
    getValue: () => new Promise((resolve) => { releaseRead = resolve; readStarted(); }),
    setValue: async () => undefined,
  };
  try {
    const actions = loadModule("src/services/addons/coreActions.js");
    const state = {};
    let revoked = false;
    let commits = 0;
    const pending = actions.invokeRegisteredAddonCoreAction({
      addonId: "example-addon", action: "storage.get", payload: { key: "legacy" },
      allowed: new Set(["storage"]), limits: {},
      deps: {
        ensureAddonStateBucket: () => state,
        persistAddonsState: async () => { commits += 1; return { ok: true }; },
      },
      authorize: () => revoked ? "addon_disabled" : null,
    });
    await started;
    revoked = true;
    releaseRead("legacy-value");
    assert.deepStrictEqual(await pending, { ok: false, reason: "addon_disabled" });
    assert.strictEqual(commits, 0);
    assert.deepStrictEqual(state, {});
  } finally { global.GM = previousGM; }
});

runTest("ADDON-SERVICE-FACADE-01 preserves every public export", () => {
  const service = loadModule("src/services/addonsService.js");
  assert.deepStrictEqual(Object.keys(service).sort(), [
    "clearAddonState", "disableAddonsService", "getAddonActionBlockReason",
    "getAddonExecutionBlockReason", "getAddonLifecycleSnapshot", "getAddonState",
    "initAddonsConsoleBridge", "invokeAddonCoreAction", "isAddonsServiceDisabled",
    "isCatalogFresh", "listKnownAddons", "listRegisteredAddons",
    "notifyAllAddonsBeforePageChange", "refreshAddonSecurityPolicies",
    "registerAddon", "removeAddonInstallationTrace", "replaceRegisteredAddons",
    "setAddonStateValue", "shutdownAddonsService", "subscribeAddonsRegistry",
    "unregisterAddon", "validateAddonRegistration",
  ].sort());
});

runTest("ADDON-SERVICE-FACADE-01 uses bounded family dependencies and owned modules", () => {
  const facadePath = path.join(ROOT, "src/services/addonsService.js");
  const facade = fs.readFileSync(facadePath, "utf8");
  const scope = fs.readFileSync(path.join(ROOT, "src/services/addons/scope.js"), "utf8");
  const bootstrap = fs.readFileSync(path.join(ROOT, "src/services/addons/bootstrap.js"), "utf8");
  const invocation = fs.readFileSync(path.join(ROOT, "src/services/addons/invocation.js"), "utf8");
  const lifecycle = fs.readFileSync(path.join(ROOT, "src/services/addons/runtimeLifecycle.js"), "utf8");
  const state = fs.readFileSync(path.join(ROOT, "src/services/addons/state.js"), "utf8");
  const deps = loadModule("src/services/addons/actionRuntime.js").getAddonActionDependencySnapshot();

  assert.ok(facade.split(/\r?\n/).length < 45);
  assert.doesNotMatch(facade, /ADDON_CORE_ACTION_DEPS|configureBootstrap|createActionInvoker/);
  assert.match(scope, /getCurrentAddonPageScopes/);
  assert.match(scope, /getAddonAvailabilityBlockReason/);
  assert.match(invocation, /getAddonActionDependencies\(action\)/);
  assert.match(state, /removeAddonInstallationTrace/);
  assert.match(lifecycle, /shutdownAddonsBridgeServer/);
  assert.doesNotMatch(bootstrap, /let _|configureBootstrap|from .*addonsService/);
  assert.deepStrictEqual(Object.keys(deps).sort(), ["idb", "lifecycle", "observer", "page", "storage", "toast", "ui"]);
  assert.ok(Object.values(deps).every((entries) => entries.length < 20));
});

runTest("ADDON-SERVICE-FACADE-01 introduces no service import cycle", () => {
  const files = ["actionRuntime.js", "apiPolicy.js", "bootstrap.js", "invocation.js", "runtimeLifecycle.js"];
  const sources = Object.fromEntries(files.map((file) => [
    file.replace(/\.js$/, ""),
    fs.readFileSync(path.join(ROOT, "src/services/addons", file), "utf8"),
  ]));
  assert.doesNotMatch(sources.bootstrap, /from .*addonsService|actionRuntime/);
  assert.doesNotMatch(sources.invocation, /from .*bootstrap|from .*addonsService/);
  assert.doesNotMatch(sources.actionRuntime, /from .*invocation|from .*bootstrap|from .*addonsService/);
  assert.doesNotMatch(sources.runtimeLifecycle, /from .*invocation|from .*bootstrap|from .*actionRuntime|from .*addonsService/);
});

runTest("ADDON-API-EXTENSIONS-01 keeps approved descriptors bounded and cancellable", async () => {
  const descriptors = new Map(getRegisteredAddonActionSnapshot().map((entry) => [entry.id, entry]));
  assert.deepStrictEqual(
    ["page.getContext", "observer.waitFor", "ui.dialog.update"].map((id) => descriptors.get(id)?.id),
    ["page.getContext", "observer.waitFor", "ui.dialog.update"],
  );
  assert.deepStrictEqual(descriptors.get("page.getContext"), {
    id: "page.getContext",
    protocolVersion: 1,
    requiredCapabilities: ["page"],
    timeoutMs: 5000,
    auditCategory: "page",
    scopePolicy: "runtime",
    ownership: "request-scoped-read-only",
    cleanup: "none; no live references or resources are returned",
  });
  assert.deepStrictEqual(descriptors.get("observer.waitFor"), {
    id: "observer.waitFor",
    protocolVersion: 1,
    requiredCapabilities: ["observer"],
    timeoutMs: 5000,
    auditCategory: "observer",
    scopePolicy: "runtime",
    ownership: "addon-scoped one-shot observer subscription",
    cleanup: "remove on match, timeout, unwatch, or addon teardown",
  });
  assert.deepStrictEqual(descriptors.get("ui.dialog.update"), {
    id: "ui.dialog.update",
    protocolVersion: 1,
    requiredCapabilities: ["ui", "ui.dialog"],
    timeoutMs: 5000,
    auditCategory: "ui",
    scopePolicy: "runtime",
    ownership: "addon-owned dialog content",
    cleanup: "dialog teardown removes the owned entry; update fails after ownership ends",
  });
  assert.strictEqual(isAddonActionAllowed(new Set(["storage"]), "page.getContext"), false);
  assert.strictEqual(isAddonActionAllowed(new Set(["page"]), "page.getContext"), true);
  assert.strictEqual(normalizeObserverWaitSelector(".content-block_filter-title"), ".content-block_filter-title");
  assert.strictEqual(normalizeObserverWaitSelector("div, body"), "");
  assert.strictEqual(normalizeObserverWaitSelector(":has(*)"), "");

  let fallbackCalled = false;
  const fallbackResult = await invokeOptionalCoreAction(
    {
      invokeCoreAction: async (action, payload, timeoutMs) => {
        assert.strictEqual(action, "observer.waitFor");
        assert.deepStrictEqual(payload, { observerId: "legacy", selector: "body", timeoutMs: 3000 });
        assert.strictEqual(timeoutMs, 3500);
        return { ok: false, reason: "unsupported_action" };
      },
    },

    "observer.waitFor",
    { observerId: "legacy", selector: "body", timeoutMs: 3000 },
    async () => {
      fallbackCalled = true;
      return { ok: true, value: { matched: true, fallback: true } };
    },
    3500,
  );
  assert.strictEqual(fallbackCalled, true);
  assert.deepStrictEqual(fallbackResult, { ok: true, value: { matched: true, fallback: true } });

  const pageResult = await invokeRegisteredAddonCoreAction({
    addonId: "example-addon",
    action: "page.getContext",
    payload: {},
    allowed: new Set(["page"]),
    deps: {},
    limits: {},
    authorize: () => null,
  });
  assert.strictEqual(pageResult.ok, true);
  assert.ok(Number.isInteger(pageResult.value.routeGeneration));
  assert.ok(Array.isArray(pageResult.value.pageScopes));

  const invalidWait = await invokeRegisteredAddonCoreAction({
    addonId: "example-addon",
    action: "observer.waitFor",
    payload: { observerId: "invalid", selector: "body" },
    allowed: new Set(["observer"]),
    deps: {},
    limits: {},
    authorize: () => null,
  });
  assert.deepStrictEqual(invalidWait, { ok: false, reason: "timeout_required" });

  const sandbox = createDomSandbox();
  try {
    const immediate = await waitForAddonObserver("api-test", {
      observerId: "immediate",
      selector: "body",
      timeoutMs: 1000,
    });
    assert.deepStrictEqual(immediate, {
      ok: true,
      value: { observerId: "immediate", matched: true },
    });

    const pending = waitForAddonObserver("api-test", {
      observerId: "cancelled",
      selector: ".api-test-never-mounted",
      timeoutMs: 1000,
    });
    assert.deepStrictEqual(unwatchAddonObserver("api-test", { observerId: "cancelled" }), {
      ok: true,
      observerId: "cancelled",
    });
    assert.deepStrictEqual(await pending, {
      ok: false,
      reason: "cancelled",
      value: { observerId: "cancelled" },
    });
  } finally {
    sandbox.restore();
  }
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

};

