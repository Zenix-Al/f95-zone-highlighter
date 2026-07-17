module.exports = function registerGroup(context) {
  const { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness } = context;

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

runTest("ADDON-SCOPE-02 persists runtime metadata in installed add-on state", () => {
  const result = validateConfig({
    addons: {
      installedMeta: {
        "example-addon": {
          runtimeMode: "core-required",
          matches: ["*://f95zone.to/*"],
        },
      },
    },
  }, { mode: "strict", partial: true });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.data.addons.installedMeta["example-addon"].runtimeMode, "core-required");
  assert.deepStrictEqual(result.data.addons.installedMeta["example-addon"].matches, ["*://f95zone.to/*"]);
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

};

