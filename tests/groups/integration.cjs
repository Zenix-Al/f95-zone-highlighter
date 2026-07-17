module.exports = function registerGroup(context) {
  const { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness } = context;

runTest("ADDON-UI fixed mount policy rejects body and selector targets", () => {
  assert.deepStrictEqual(Object.keys(ADDON_UI_SLOT_POLICY).sort(), [
    "latest.filters.after-title", "page.dock", "page.floating", "page.panel",
  ]);
  assert.strictEqual(normalizeAddonMountSlot("page.panel"), "page.panel");
  assert.strictEqual(normalizeAddonMountSlot("body"), "");
  assert.strictEqual(normalizeAddonMountSlot("selector:#victim"), "");
});

runTest("ADDON-UI dock mounts require the dock capability at execution", () => {
  const { actionUiMount } = loadModule("src/services/addons/actions/families/ui.js");
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

runTest("ADDON-UI preserves the Library Manager hidden JSON file picker", () => {
  const sandbox = createDomSandbox();
  try {
    const { sanitizeAddonHtml } = loadModule("src/services/addons/uiSanitizer.js");
    const managerHtml = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/assets/manager.html"),
      "utf8",
    );
    sandbox.document.body.innerHTML = sanitizeAddonHtml(managerHtml);
    const input = sandbox.document.querySelector('input[data-field="importFile"]');
    assert.ok(input, "Library Manager import input must survive sanitization");
    assert.strictEqual(input.hasAttribute("hidden"), true);
    assert.strictEqual(input.getAttribute("accept"), "application/json,.json");
    assert.strictEqual(input.getAttribute("type"), "file");
    const managerCss = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/assets/manager.css"),
      "utf8",
    );
    assert.match(
      managerCss,
      /input\[data-field=["']importFile["']\]\s*\{\s*display:\s*none\s*!important;/,
    );
  } finally { sandbox.restore(); }
});

runTest("ADDON-LIBRARY dialog can close and reopen without exposing its file picker", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/library-reopen.1/");
  const actions = [];
  let contentSequence = 0;
  try {
    const bridge = {
      async invokeCoreAction(action, payload) {
        actions.push({ action, payload });
        if (action === "ui.style.register" || action === "ui.style.unregister") {
          return { ok: true, value: {} };
        }
        if (action === "ui.dialog.open") {
          const content = document.createElement("div");
          content.id = `library-dialog-content-${++contentSequence}`;
          content.dataset.addonId = "library-addon";
          content.innerHTML = payload.html;
          document.body.appendChild(content);
          return { ok: true, value: { contentId: content.id } };
        }
        if (action === "ui.dialog.close") {
          document.querySelector('[data-addon-id="library-addon"]')?.remove();
          return { ok: true, value: { removed: 1 } };
        }
        if (action === "config.getTagPrefs") {
          return { ok: true, value: { tags: [], preferredTags: [], excludedTags: [], markedTags: [], color: {} } };
        }
        return { ok: true, value: {} };
      },
    };
    const library = {
      async queryEntries() { return []; },
      async getAllEntries() { return []; },
    };
    const { createLibraryManagerApp } = loadModule(
      "addons/library-addon/src/ui/manager/managerApp.js",
      { loader: { ".css": "text", ".html": "text" } },
    );
    const manager = createLibraryManagerApp({
      bridge,
      addonId: "library-addon",
      library,
      onMutated() {},
      getCurrentThreadSnapshot: () => null,
    });

    await manager.open();
    let input = document.querySelector('input[data-field="importFile"]');
    assert.ok(input);
    assert.strictEqual(input.hidden, true);
    assert.strictEqual(input.style.display, "none");

    await manager.close("test-close");
    await manager.open();
    input = document.querySelector('input[data-field="importFile"]');
    assert.ok(input, "manager must mount again after close");
    assert.strictEqual(input.hidden, true);
    assert.strictEqual(input.style.display, "none");

    await manager.handleDialogClosed({
      dialogId: "library-addon-manager",
      reason: "delayed-old-close",
    });
    assert.strictEqual(manager.getSnapshot().dialogOpen, true);
    assert.ok(document.querySelector('input[data-field="importFile"]'));
    assert.strictEqual(
      actions.filter((entry) => entry.action === "ui.dialog.open").length,
      2,
    );
  } finally {
    sandbox.restore();
  }
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

runTest("CORE-CONFIG-MIGRATION-RECOVERY-01 migrates a legacy complete config stored at the canonical key", async () => {
  const previousGM = global.GM;
  const fixture = loadModule("tests/fixtures/configMigrationHarness.js");
  const reference = fixture.loadConfigReference({ compactCatalogs: true });
  const gm = createFakeGM({ ["f95ue:config"]: reference });
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const loaded = await settings.loadConfig();
    const snapshot = gm.snapshot();
    const canonical = snapshot[settings.CONFIG_ENVELOPE_KEY];
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(loaded.source, "legacy-migration");
    assert.strictEqual(settings.isConfigReady(), true);
    assert.strictEqual(canonical.schemaVersion, 1);
    assert.strictEqual(canonical.data.addons.byAddon["example-addon"].state.enabled, true);
    assert.strictEqual(Object.hasOwn(canonical.data, "metrics"), false);
    assert.strictEqual(snapshot[settings.CONFIG_MIGRATION_VERSION_KEY], 1);
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
    assert.strictEqual(Object.hasOwn(loaded.data.globalSettings, "disableHelpMessage"), false);
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
    assert.strictEqual(Object.hasOwn(loaded.data.globalSettings, "disableHelpMessage"), false);
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
    const savePromise = settings.saveConfigKeys({ globalSettings: { configVisibility: false } });
    const [loaded, saved] = await Promise.all([loadPromise, savePromise]);
    assert.strictEqual(loaded.status, "migrated");
    assert.strictEqual(saved.committed, true);
    assert.deepStrictEqual(saved.config.preferredTags, [13]);
    assert.strictEqual(saved.config.globalSettings.configVisibility, false);
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

  const manifest = require("../../scripts/featureManifest.cjs").buildFeatureManifestState({ rootDir: ROOT });
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
    assert.strictEqual(host.updateAddonDialog("addon-b", { dialogId: "dialog", html: "stolen" }).reason, "dialog_not_found");
    assert.strictEqual(host.updateAddonDialog("addon-a", { dialogId: "dialog", html: "<p>Updated safely</p>" }).ok, true);
    host.cleanupAddonUi("addon-a");
    assert.strictEqual(host.updateAddonDialog("addon-a", { dialogId: "dialog", html: "late" }).reason, "dialog_not_found");
    const owners = host.getAddonUiPolicySnapshot().owners;
    assert.deepStrictEqual(owners, { docks: [], dialogs: [], mounts: [], pendingMounts: [], styles: [] });
    host.resetAddonUiHostForTests();
  } finally { sandbox.restore(); }
});

runTest("ADDON-SERVICE-FACADE-01 preserves trust block disable and scope rejection order", () => {
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

runTest("ADDON-LIBRARY-02 follows canonical boundaries and preserves persistence constants", () => {
  const addonRoot = path.join(ROOT, "addons/library-addon/src");
  for (const relativePath of [
    "main.js", "core/adaptor.js", "api/bridge.js", "api/storage.js",
    "app/commands.js", "app/lifecycle.js", "app/createLibraryAddonApp.js",
    "library/service.js", "thread/detector.js", "ui/manager/managerApp.js",
  ]) assert.ok(fs.existsSync(path.join(addonRoot, relativePath)), relativePath);
  assert.strictEqual(fs.existsSync(path.join(addonRoot, "coreBridge.js")), false);
  const mainSource = fs.readFileSync(path.join(addonRoot, "main.js"), "utf8");
  assert.ok(mainSource.split(/\r?\n/).length < 40);
  const domainFiles = [];
  for (const area of ["library", "thread", "ui"]) {
    const pending = [path.join(addonRoot, area)];
    while (pending.length) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(fullPath);
        else if (entry.name.endsWith(".js")) domainFiles.push(fullPath);
      }
    }
  }
  for (const filePath of domainFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /invokeCoreAction\s*\(/, path.relative(ROOT, filePath));
  }
  const constants = fs.readFileSync(path.join(addonRoot, "constants.js"), "utf8");
  for (const value of ["library", "records", "settings", "libraryRecords", "libraryMigrationV1Done"]) {
    assert.match(constants, new RegExp(`["]${value}["]`));
  }
  const manifestEntry = ADDON_MANIFEST.addons.find((entry) => entry.id === "library-addon");
  assert.deepStrictEqual(manifestEntry.pageScopes, ["f95zone"]);
  assert.deepStrictEqual(manifestEntry.matches, ["*://f95zone.to/*"]);
});

runTest("ADDON-LIBRARY-02 owns reversible lifecycle and exactly-once teardown", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/library-test.42/");
  const actions = [];
  const mounts = new Map();
  let commandHandler = null;
  let teardownAcknowledgements = 0;
  const stored = { settings: { enabled: true, showPageButtons: true }, libraryMigrationV1Done: true };
  const core = {
    registerAddon(addon) { actions.push({ action: "register", addon }); return { ok: true }; },
    updateStatus(status, message) { actions.push({ action: "status", status, message }); return { ok: true }; },
    bindAddonCommands(handler) { commandHandler = handler; return () => { commandHandler = null; }; },
    notifyTeardownComplete(reason) { teardownAcknowledgements += 1; actions.push({ action: "teardown", reason }); },
    async invokeCoreAction(action, payload) {
      actions.push({ action, payload });
      if (action === "addon.access") return { ok: true, value: { blocked: false, enabled: true } };
      if (action === "storage.get") return { ok: true, value: Object.hasOwn(stored, payload.key) ? stored[payload.key] : payload.defaultValue };
      if (action === "storage.set") { stored[payload.key] = payload.value; return { ok: true }; }
      if (action === "page.getContext") return { ok: true, value: { pageScopes: ["f95zone", "thread"], pageType: "thread", routeGeneration: 1, url: location.href } };
      if (action === "observer.waitFor") return { ok: false, reason: "unsupported_action" };
      if (action === "ui.mount") {
        const mount = document.createElement("div");
        mount.id = payload.mountId;
        mount.innerHTML = payload.html;
        document.body.appendChild(mount);
        mounts.set(payload.mountId, mount);
        return { ok: true, value: { mountId: payload.mountId } };
      }
      if (action === "ui.unmount") {
        mounts.get(payload.mountId)?.remove();
        mounts.delete(payload.mountId);
        return { ok: true, value: { removed: 1 } };
      }
      if (action === "idb.get") return { ok: true, value: null };
      return { ok: true, value: {} };
    },
  };
  try {
    const { createLibraryAddonApp } = loadModule("addons/library-addon/src/app/createLibraryAddonApp.js", { loader: { ".css": "text", ".html": "text" } });
    const app = createLibraryAddonApp({ core, runtime: {
      addonId: "library-addon", addonName: "Library", addonVersion: "test",
      addonDescription: "Library", capabilities: ADDON_MANIFEST.addons.find((entry) => entry.id === "library-addon").capabilities,
      requiresCore: true, pageScopes: ["f95zone"], runtimeMode: "core-required", matches: ["*://f95zone.to/*"],
    } });
    await app.bootstrap();
    assert.ok(commandHandler);
    assert.strictEqual(actions.filter((entry) => entry.action === "ui.mount").length, 1);
    assert.match(actions.find((entry) => entry.action === "ui.mount").payload.html, /Save to Library/);
    assert.ok(document.querySelector('[data-role="libraryDock"] [data-action="open-library"]'));
    await app.getLifecycle().disable({ commandId: "disable-1", reason: "test" });
    assert.strictEqual(document.getElementById("library-dock-widget"), null);
    assert.deepStrictEqual(app.getResourceSnapshot(), []);
    await app.getLifecycle().enable({ commandId: "enable-1", reason: "test" });
    assert.ok(document.querySelector('[data-role="libraryDock"] [data-action="open-library"]'));
    document.querySelector('[data-role="libraryDock"] [data-action="open-library"]')
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(actions.some((entry) => entry.action === "ui.dialog.open"), "re-enabled dock must open the manager");
    await app.getLifecycle().refresh({ commandId: "refresh-1", reason: "route" });
    assert.strictEqual(app.getResourceSnapshot().filter((entry) => entry.id === "library-dock-listener").length, 1);
    await app.getLifecycle().teardown({ commandId: "teardown-1", reason: "terminal" });
    await app.getLifecycle().teardown({ commandId: "teardown-2", reason: "duplicate" });
    assert.strictEqual(teardownAcknowledgements, 1);
    assert.deepStrictEqual(app.getResourceSnapshot(), []);
    assert.deepStrictEqual(app.getPendingOperationSnapshot(), []);
    assert.strictEqual(commandHandler, null);
  } finally { sandbox.restore(); }
});

runTest("ADDON-LIBRARY-02 keeps site-wide management and thread-only controls across routes", async () => {
  const routes = [
    ["https://f95zone.to/forums/games.2/", ["f95zone"], false],
    ["https://f95zone.to/threads/game.42/", ["f95zone", "thread"], true],
    ["https://f95zone.to/sam/latest_alpha/", ["f95zone", "latest"], false],
    ["https://f95zone.to/masked/abc", ["f95zone"], false],
  ];
  for (const [url, pageScopes, expectsThreadControls] of routes) {
    const sandbox = createDomSandbox(url);
    const actions = [];
    const stored = { settings: { enabled: true, showPageButtons: true }, libraryMigrationV1Done: true };
    const core = {
      registerAddon(addon) { actions.push({ action: "register", addon }); },
      updateStatus() {}, bindAddonCommands() { return () => {}; }, notifyTeardownComplete() {},
      async invokeCoreAction(action, payload) {
        actions.push({ action, payload });
        if (action === "addon.access") return { ok: true, value: { blocked: false, enabled: true } };
        if (action === "storage.get") return { ok: true, value: Object.hasOwn(stored, payload.key) ? stored[payload.key] : payload.defaultValue };
        if (action === "storage.set") { stored[payload.key] = payload.value; return { ok: true }; }
        if (action === "page.getContext") return { ok: true, value: { pageScopes, pageType: pageScopes.at(-1), routeGeneration: 1, url } };
        if (action === "idb.get") return { ok: true, value: null };
        return { ok: true, value: {} };
      },
    };
    try {
      const { createLibraryAddonApp } = loadModule("addons/library-addon/src/app/createLibraryAddonApp.js", { loader: { ".css": "text", ".html": "text" } });
      const app = createLibraryAddonApp({ core, runtime: {
        addonId: "library-addon", addonName: "Library", addonVersion: "test", addonDescription: "Library",
        capabilities: [], requiresCore: true, pageScopes: ["f95zone"], runtimeMode: "core-required", matches: ["*://f95zone.to/*"],
      } });
      await app.bootstrap();
      const registration = actions.find((entry) => entry.action === "register")?.addon;
      assert.deepStrictEqual(registration.pageScopes, ["f95zone"]);
      assert.ok(registration.panelSettings.some((setting) => setting.path === "showPageButtons"));
      const dock = actions.find((entry) => entry.action === "ui.mount")?.payload?.html || "";
      assert.strictEqual(/Save to Library/.test(dock), expectsThreadControls, url);
      await app.getLifecycle().teardown({ reason: "route-test" });
    } finally { sandbox.restore(); }
  }
});

runTest("ADDON-LIBRARY-02 suppresses import batches and progress after cancellation", async () => {
  const { executeLibraryImport } = loadModule("addons/library-addon/src/library/importWorkflow.js");
  let cancelled = false;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => { releaseFirst = resolve; });
  let continueFirst;
  const firstGate = new Promise((resolve) => { continueFirst = resolve; });
  const writes = [];
  const progress = [];
  const run = executeLibraryImport({
    records: [{ threadId: "1" }, { threadId: "2" }],
    plan: {
      total: 2, skipped: 0, totalBatches: 2, throttleInfo: {},
      batches: [[{ mode: "add", value: { threadId: "1" } }], [{ mode: "add", value: { threadId: "2" } }]],
    },
    shouldCancel: () => cancelled,
    onProgress: (value) => progress.push(value),
    bulkPutEntries: async (entries) => { writes.push(entries); releaseFirst(); await firstGate; return { ok: true }; },
    saveOperation: async () => ({ ok: true }),
  });
  await firstStarted;
  cancelled = true;
  continueFirst();
  const result = await run;
  assert.strictEqual(result.cancelled, true);
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(progress.some((entry) => entry.completedBatches > 0), false);
});

runTest("ADDON-MASKED-DIRECT-01 classifies core, standalone, and unsupported contexts", () => {
  const externalHosts = new Set([
    "buzzheavier.com", "cdn.buzzheavier.com", "bzzhr.to", "gofile.io",
    "pixeldrain.com", "datanodes.to", "www.mediafire.com", "workupload.com",

  ]);
  const classify = (url) => {
    const parsed = new URL(url);
    return classifyMaskedDirectContext(parsed, {
      isSupportedExternalHost: (host) =>
        externalHosts.has(host) || host.endsWith(".workupload.com"),
    });
  };
  assert.deepStrictEqual(classify("https://f95zone.to/threads/game.1/"), {
    kind: "f95-core", route: "thread", usesCore: true,
  });
  assert.deepStrictEqual(classify("https://f95zone.to/masked/abc"), {
    kind: "f95-core", route: "masked", usesCore: true,
  });
  assert.strictEqual(classify("https://f95zone.to/forums/games.2/").kind, "unsupported");
  assert.strictEqual(classify("https://gofile.io/d/abc").kind, "external-standalone");
  assert.strictEqual(classify("https://unknown.example/file").kind, "unsupported");
});

runTest("ADDON-MASKED-DIRECT-01 preserves hybrid headers and canonical boundaries", () => {
  const manifestEntry = ADDON_MANIFEST.addons.find(
    (entry) => entry.id === "masked-direct-addon",
  );
  assert.strictEqual(manifestEntry.runtimeMode, "hybrid");
  assert.deepStrictEqual(manifestEntry.pageScopes, ["f95zone"]);
  assert.strictEqual(manifestEntry.runAt, "document-idle");
  assert.deepStrictEqual(manifestEntry.grants, [
    "GM_openInTab", "GM.getValue", "GM.setValue",
    "GM_addValueChangeListener", "GM_removeValueChangeListener",
  ]);
  for (const relativePath of [
    "main.js", "app/context.js", "app/createMaskedDirectApp.js",
    "core/adaptor.js", "ports/routeContextRepository.js",
    "ports/processingDownloadRepository.js", "ports/downloadSettingsRepository.js",
  ]) {
    assert.ok(
      fs.existsSync(path.join(ROOT, "addons/masked-direct-addon/src", relativePath)),
      relativePath,
    );
  }
  const mainSource = fs.readFileSync(
    path.join(ROOT, "addons/masked-direct-addon/src/main.js"), "utf8",
  );
  assert.ok(mainSource.split(/\r?\n/).length < 20);
  for (const hostFile of fs.readdirSync(
    path.join(ROOT, "addons/masked-direct-addon/src/hosts"),
    { withFileTypes: true },
  ).filter((entry) => entry.isFile() && entry.name.endsWith(".js"))) {
    const source = fs.readFileSync(
      path.join(ROOT, "addons/masked-direct-addon/src/hosts", hostFile.name),
      "utf8",
    );
    assert.doesNotMatch(source, /invokeCoreAction|dispatchCoreCommand|createCoreBridge/);
  }
});

runTest("ADDON-MASKED-DIRECT-01 expires and rejects mismatched route handoffs", () => {
  const sandbox = createDomSandbox("https://datanodes.to/download/example");
  const previousSessionStorage = global.sessionStorage;
  try {
    global.sessionStorage = sandbox.window.sessionStorage;
    const repository = loadModule(
      "addons/masked-direct-addon/src/ports/routeContextRepository.js",
    );
    repository.writeRouteContext({
      ownerTabId: "origin-1", requestId: "request-1",
      createdAt: Date.now(), host: "datanodes.to", sourceUrl: "https://datanodes.to/file/a",
    });
    assert.strictEqual(repository.readRouteContext("f95ue_tab", {
      expectedRequestId: "request-1", expectedHost: "datanodes.to",
    }).requestId, "request-1");
    assert.strictEqual(repository.readRouteContext("f95ue_tab", {
      expectedRequestId: "request-2",
    }), null);
    assert.strictEqual(repository.readRouteContext("f95ue_tab", {
      expectedHost: "gofile.io",
    }), null);
    repository.writeRouteContext({
      ownerTabId: "origin-1", requestId: "expired",
      createdAt: Date.now() - (2 * 60 * 1000) - 1, host: "datanodes.to",
    });
    assert.strictEqual(repository.readRouteContext(), null);
    assert.strictEqual(sessionStorage.getItem("f95ue.addon.maskedDirect.routeContext"), null);
  } finally {
    global.sessionStorage = previousSessionStorage;
    sandbox.restore();
  }
});

runTest("SITE-REPAIR-01 preserves published namespace while changing canonical identity", () => {
  const siteRepair = ADDON_MANIFEST.addons.find((entry) => entry.id === "site-repair-addon");
  assert.ok(siteRepair);
  assert.deepStrictEqual(siteRepair.legacyIds, ["image-repair-addon"]);
  assert.strictEqual(siteRepair.name, "F95UE Site Repair");
  assert.deepStrictEqual(siteRepair.matches, ["*://f95zone.to/*"]);
  assert.deepStrictEqual(siteRepair.pageScopes, ["f95zone"]);
  assert.strictEqual(siteRepair.outfile, "addons/site-repair-addon/dist/site-repair-addon.user.js");
  const oldNamespace = "https://github.com/Zenix-Al/f95-zone-highlighter/addons/image-repair-addon";
  assert.strictEqual(siteRepair.namespace, oldNamespace);
  const header = addonBuilder.headerForAddon(siteRepair, { includeTimestamp: false });
  assert.match(header, /@name\s+F95UE Site Repair/);
  assert.ok(header.includes(`// @namespace    ${oldNamespace}`));
  assert.strictEqual(siteRepair.downloadUrl, "https://greasyfork.org/en/scripts/572502-f95ue-image-repair-add-on");
});

runTest("SITE-REPAIR-01 canonicalizes legacy state and preserves enabled preference", () => {
  const { canonicalizeAddonIdentityRoot } = loadModule("src/services/addons/state.js");
  const addons = {
    byAddon: {
      "image-repair-addon": {
        state: {
          enabled: false,
          settings: { repairs: { imageAttachments: { enabled: false } } },
        },
      },
    },
    installedMeta: {
      "image-repair-addon": { name: "F95UE Image Repair Add-on", installedSeenAt: 10 },
    },
  };
  const result = canonicalizeAddonIdentityRoot(addons);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(Object.hasOwn(addons.byAddon, "image-repair-addon"), false);
  assert.strictEqual(addons.byAddon["site-repair-addon"].state.enabled, false);
  assert.strictEqual(
    addons.byAddon["site-repair-addon"].state.settings.repairs.imageAttachments.enabled,
    false,
  );
  assert.strictEqual(Object.hasOwn(addons.installedMeta, "site-repair-addon"), true);
});

runTest("SITE-REPAIR-01 image scheduler covers success exhaustion cancellation removal and stable URLs", () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/site-repair.1/");
  try {
    const { createImageAttachmentRepair, stableOriginalUrl } = loadModule(
      "addons/site-repair-addon/src/repairs/imageAttachments/imageRepair.js",
    );
    const callbacks = new Map();
    const scheduler = {
      generation: 0,
      schedule(id, callback) { callbacks.set(id, callback); },
      cancel(id) { return callbacks.delete(id); },
      invalidate() { this.generation += 1; callbacks.clear(); },
      getSnapshot() { return [...callbacks.keys()]; },
    };
    const successes = [];
    const exhausted = [];
    const repair = createImageAttachmentRepair({
      imageHost: "https://attachments.f95zone.to/",
      retryDelayMs: 1,
      maxAttempts: 2,
      scheduler,
      onSuccess: (_image, attempts) => successes.push(attempts),
      onExhausted: (_image, attempts) => exhausted.push(attempts),
    });
    repair.configure({ maxAttempts: 2, retryDelayMs: 1 });
    const makeBroken = (id) => {
      const image = document.createElement("img");
      image.src = `https://attachments.f95zone.to/${id}.jpg?token=stable`;
      Object.defineProperty(image, "complete", { configurable: true, value: true });
      Object.defineProperty(image, "naturalWidth", { configurable: true, writable: true, value: 0 });
      document.body.appendChild(image);
      return image;
    };
    const successImage = makeBroken("success");
    repair.start();
    const successCallback = [...callbacks.values()][0];
    successImage.naturalWidth = 100;
    successCallback();
    assert.deepStrictEqual(successes, [1]);
    assert.strictEqual(
      stableOriginalUrl(successImage.dataset.siteRepairOriginalSrc),
      "https://attachments.f95zone.to/success.jpg?token=stable",
    );

    const exhaustedImage = makeBroken("exhausted");
    repair.attach(exhaustedImage);
    let callback = [...callbacks.values()][0];
    callback();
    callback = [...callbacks.values()][0];
    callback();
    assert.deepStrictEqual(exhausted, [2]);

    const rapidImage = document.createElement("img");
    rapidImage.src = "https://attachments.f95zone.to/rapid.jpg";
    Object.defineProperty(rapidImage, "complete", { configurable: true, value: false });
    Object.defineProperty(rapidImage, "naturalWidth", { configurable: true, writable: true, value: 0 });
    document.body.appendChild(rapidImage);
    repair.attach(rapidImage);
    rapidImage.dispatchEvent(new window.Event("error"));
    rapidImage.dispatchEvent(new window.Event("error"));
    rapidImage.dispatchEvent(new window.Event("error"));
    assert.deepStrictEqual(exhausted, [2, 2]);
    assert.strictEqual(repair.getSnapshot().pending, 0);

    const removedImage = makeBroken("removed");
    repair.attach(removedImage);
    callback = [...callbacks.values()][0];
    removedImage.remove();
    callback();
    assert.strictEqual(repair.getSnapshot().pending, 0);

    const cancelledImage = makeBroken("cancelled");
    repair.attach(cancelledImage);
    repair.stop();
    assert.deepStrictEqual(repair.getSnapshot().timers, []);
    cancelledImage.dispatchEvent(new window.Event("error"));
    assert.strictEqual(repair.getSnapshot().pending, 0);
  } finally {
    sandbox.restore();
  }
});

runTest("SITE-REPAIR-01 normalizes image retry settings for the core panel", () => {
  const { normalizeSiteRepairSettings } = loadModule(
    "addons/site-repair-addon/src/app/settings.js",
  );
  const settings = normalizeSiteRepairSettings({
    repairs: {
      imageAttachments: {
        enabled: true,
        maxAttempts: 999,
        retryDelayMs: 1,
      },
    },
  });
  assert.deepStrictEqual(settings.repairs.imageAttachments, {
    enabled: true,
    maxAttempts: 20,
    retryDelayMs: 250,
  });
});

runTest("SITE-REPAIR-01 follows canonical boundaries and keeps route-inapplicable repair idle", async () => {
  const addonRoot = path.join(ROOT, "addons/site-repair-addon/src");
  for (const relative of [
    "main.js", "core/adaptor.js", "api/bridge.js", "api/storage.js",
    "app/createSiteRepairApp.js", "app/commands.js", "app/lifecycle.js",
    "repairs/imageAttachments/imageRepair.js", "ui/imageStatus.js",
  ]) assert.ok(fs.existsSync(path.join(addonRoot, relative)), relative);
  assert.ok(fs.readFileSync(path.join(addonRoot, "main.js"), "utf8").split(/\r?\n/).length < 35);
  for (const area of ["repairs", "ui"]) {
    for (const file of collectJavaScriptFiles(path.join(addonRoot, area))) {
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), /invokeCoreAction\s*\(/, path.relative(ROOT, file));
    }
  }
  const sandbox = createDomSandbox("https://f95zone.to/forums/games.2/");
  const actions = [];
  let commandHandler = null;
  let acknowledgements = 0;
  try {
    const core = {
      registerAddon(addon) { actions.push({ action: "register", addon }); },
      updateStatus(status) { actions.push({ action: "status", status }); },
      notifyTeardownComplete() { acknowledgements += 1; },
      bindAddonCommands(handler) { commandHandler = handler; return () => { commandHandler = null; }; },
      async invokeCoreAction(action, payload) {
        actions.push({ action, payload });
        if (action === "addon.access") return { ok: true, value: { blocked: false, enabled: true } };
        if (action === "storage.get") return { ok: true, value: payload.defaultValue };
        if (action === "storage.set") return { ok: true };
        if (action === "page.getContext") return { ok: true, value: { pageScopes: ["f95zone"], url: location.href } };
        return { ok: true };
      },
    };
    const { createSiteRepairApp } = loadModule("addons/site-repair-addon/src/app/createSiteRepairApp.js");
    const app = createSiteRepairApp({ core, runtime: {
      addonId: "site-repair-addon", addonName: "F95UE Site Repair", addonVersion: "test",
      addonDescription: "repairs", capabilities: ["storage", "page", "observer", "ui.style"],
      requiresCore: true, pageScopes: ["f95zone"], runtimeMode: "core-required", matches: ["*://f95zone.to/*"],
    } });
    await app.bootstrap();
    assert.ok(commandHandler);
    assert.strictEqual(actions.some((entry) => entry.action === "observer.watch"), false);
    assert.strictEqual(app.getRuntimeSnapshot().routeApplicable, false);
    await app.getLifecycle().disable({ reason: "test" });
    await app.getLifecycle().enable({ reason: "test" });
    await app.getLifecycle().teardown({ reason: "terminal" });
    await app.getLifecycle().teardown({ reason: "duplicate" });
    assert.strictEqual(acknowledgements, 1);
    assert.deepStrictEqual(app.getLifecycle().getResourceSnapshot(), []);
    assert.deepStrictEqual(app.getLifecycle().getPendingOperationSnapshot(), []);
  } finally {
    sandbox.restore();
  }
});

runTest("SITE-REPAIR-02 retries eligible Latest failures exactly once and preserves terminal errors", () => {
  const { createLatestAjaxJqueryAdapter } = loadModule(
    "addons/site-repair-addon/src/repairs/latestAjax/jqueryAdapter.js",
  );
  const timeouts = new Map();
  let nextTimer = 1;
  const calls = [];
  function originalAjax(settingsOrUrl, maybeSettings) {
    const settings = typeof settingsOrUrl === "object" ? settingsOrUrl : { ...maybeSettings, url: settingsOrUrl };
    calls.push(settings);
    return settings;
  }
  const windowLike = {
    jQuery: { ajax: originalAjax },
    setTimeout(callback) { const id = nextTimer++; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval() { throw new Error("unexpected polling"); },
    clearInterval() {},
  };
  const adapter = createLatestAjaxJqueryAdapter({ window: windowLike });
  adapter.enable();
  const patched = windowLike.jQuery.ajax;
  adapter.enable();
  assert.strictEqual(windowLike.jQuery.ajax, patched, "duplicate enable must not double-patch");

  for (const fixture of [
    ["parsererror", 200, true], ["timeout", 0, true], ["error", 0, true],
    ["error", 503, true], ["error", 403, false], ["error", 429, false],
  ]) {
    const [textStatus, status, retry] = fixture;
    let terminalCalls = 0;
    patched({ url: "/sam/latest_data.php", error: () => { terminalCalls += 1; } });
    calls.at(-1).error({ status }, textStatus, new Error(textStatus));
    assert.strictEqual(timeouts.size > 0, retry, `${textStatus}/${status}`);
    if (retry) {
      const callback = [...timeouts.values()][0];
      timeouts.clear();
      callback();
      const retried = calls.at(-1);
      assert.strictEqual(retried.__f95ueSiteRepairRetried, true);
      retried.error({ status }, textStatus, new Error(textStatus));
      assert.strictEqual(timeouts.size, 0, "a retried request must not retry again");
      assert.strictEqual(terminalCalls, 1);
    } else {
      assert.strictEqual(terminalCalls, 1);
    }
  }
  adapter.disable();
  assert.strictEqual(windowLike.jQuery.ajax, originalAjax);
});

runTest("SITE-REPAIR-02 cancels retries and late-jQuery polling by generation", () => {
  const { createLatestAjaxJqueryAdapter } = loadModule(
    "addons/site-repair-addon/src/repairs/latestAjax/jqueryAdapter.js",
  );
  const intervals = new Map();
  const timeouts = new Map();
  let id = 0;
  const windowLike = {
    setInterval(callback) { const timer = ++id; intervals.set(timer, callback); return timer; },
    clearInterval(timer) { intervals.delete(timer); },
    setTimeout(callback) { const timer = ++id; timeouts.set(timer, callback); return timer; },
    clearTimeout(timer) { timeouts.delete(timer); },
  };
  const adapter = createLatestAjaxJqueryAdapter({ window: windowLike });
  adapter.enable();
  assert.strictEqual(intervals.size, 1);
  let requestedSettings = null;
  const originalAjax = (settings) => { requestedSettings = settings; return undefined; };
  windowLike.jQuery = { ajax: originalAjax };
  [...intervals.values()][0]();
  assert.notStrictEqual(windowLike.jQuery.ajax, originalAjax, "jQuery loaded later must be patched");
  windowLike.jQuery.ajax({ url: "/sam/latest_data.php" });
  requestedSettings.error({ status: 500 }, "error");
  assert.strictEqual(timeouts.size, 1);
  adapter.disable();
  assert.strictEqual(intervals.size, 0);
  assert.strictEqual(timeouts.size, 0);
  assert.strictEqual(windowLike.jQuery.ajax, originalAjax);
  assert.strictEqual(adapter.getSnapshot().pendingRetries, 0);
});

runTest("SITE-REPAIR-02 drops the obsolete core preference without importing it", async () => {
  const previousGM = global.GM;
  const gm = createFakeGM();
  global.GM = gm;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(gm, settings, config);
    const envelope = gm.snapshot()[settings.CONFIG_ENVELOPE_KEY];
    envelope.data.latestSettings.latestAjaxErrorRecovery = false;
    await gm.setValue(settings.CONFIG_ENVELOPE_KEY, envelope);
    const writes = gm.logs().writes.length;
    const loaded = await settings.loadConfig();
    assert.strictEqual(Object.hasOwn(loaded.data.latestSettings, "latestAjaxErrorRecovery"), false);
    assert.strictEqual(Object.hasOwn(loaded.data.addons.byAddon, "site-repair-addon"), false);
    assert.strictEqual(gm.logs().writes.length, writes);
    const committed = await settings.commitConfig(loaded.data, { origin: "SITE-REPAIR-02:drop-obsolete-key" });
    assert.strictEqual(committed.committed, true);
    assert.strictEqual(
      Object.hasOwn(gm.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.latestSettings, "latestAjaxErrorRecovery"),
      false,
    );
  } finally { global.GM = previousGM; }
});

runTest("SITE-REPAIR-02 leaves Site Repair as the sole patch owner", () => {
  const coreFeature = path.join(ROOT, "src/features/latest-ajax-error-recovery");
  assert.strictEqual(fs.existsSync(coreFeature), false);
  const generated = fs.readFileSync(path.join(ROOT, "src/generated/features.generated.js"), "utf8");
  assert.doesNotMatch(generated, /latestAjaxErrorRecoveryFeature|latest-ajax-error-recovery/);
  const matches = [];
  for (const file of collectJavaScriptFiles(path.join(ROOT, "src"))) {
    if (/f95ueSiteRepairLatestAjax|f95ueLatestAjaxRecovery/.test(fs.readFileSync(file, "utf8"))) matches.push(file);
  }
  for (const file of collectJavaScriptFiles(path.join(ROOT, "addons"))) {
    if (/f95ueSiteRepairLatestAjax|f95ueLatestAjaxRecovery/.test(fs.readFileSync(file, "utf8"))) matches.push(file);
  }
  assert.deepStrictEqual(matches.map((file) => path.relative(ROOT, file).replace(/\\/g, "/")), [
    "addons/site-repair-addon/src/repairs/latestAjax/jqueryAdapter.js",
  ]);
});

};
