module.exports = function registerGroup(context) {
  const { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness } = context;

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

runTest("ADDON-API-AUDIT-01 covers every add-on and bounds the next API package", () => {
  const first = addonApiAudit.createAuditReport();
  const second = addonApiAudit.createAuditReport();
  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.inventory.coverage.everyManifestAddonInventoried, true);
  assert.strictEqual(first.inventory.coverage.rawActionIdsAccountedFor, true);
  assert.strictEqual(first.inventory.addOns.length, ADDON_MANIFEST.addons.length);
  assert.ok(first.rawActions.some((entry) => entry.id === "ui.dialog.close" && entry.callSites.length > 0));
  assert.ok(first.inventory.addOns.some((entry) => entry.id === "masked-direct-addon" && entry.directGmAccess.length > 0));
  assert.ok(first.inventory.addOns.some((entry) => entry.id === "latest-filters-addon" && entry.urlAndPageParsing.length > 0));
  for (const candidate of first.candidates.filter((entry) => entry.decision === "implement")) {
    assert.ok(candidate.consumerCount >= 2, `${candidate.candidateActionId} needs two consumers`);
    assert.ok(candidate.payloadBounds && candidate.resultBounds);
    assert.ok(candidate.ownershipCleanup);
  }
  assert.deepStrictEqual(first.approvedNextPackage, [
    "page.getContext",
    "observer.waitFor",
    "ui.dialog.update",
    "addons.shared.cancellableTask",
  ]);
  assert.strictEqual(first.security.publicActionChanges, 0);
  assert.match(first.security.registrationHandshake, /preserved/);
  assert.strictEqual(
    addonApiAudit.renderMarkdown(first),
    fs.readFileSync(path.join(ROOT, "docs/architecture/addon-api-audit.md"), "utf8"),
  );
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
  const addon = ADDON_MANIFEST.addons.find((entry) => entry.id === "example-addon");
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
    assert.strictEqual(require("../../build/stripDebugLogs").stripDebugLogs.name, "strip-debug-logs");
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

runTest("ADDON-GOLDEN-01 keeps Example Add-on composition and API boundaries", () => {
  const addonRoot = path.join(ROOT, "addons", "example-addon", "src");
  const mainSource = fs.readFileSync(path.join(addonRoot, "main.js"), "utf8");
  const bridgeSource = fs.readFileSync(path.join(addonRoot, "api", "bridge.js"), "utf8");
  const appSource = fs.readFileSync(path.join(addonRoot, "app", "createExampleAddonApp.js"), "utf8");
  const appSources = collectJavaScriptFiles(path.join(addonRoot, "app"))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const uiSources = collectJavaScriptFiles(path.join(addonRoot, "ui"))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const manifestEntry = ADDON_MANIFEST.addons.find((addon) => addon.id === "example-addon");

  assert.ok(manifestEntry);
  assert.deepStrictEqual(manifestEntry.pageScopes, ["f95zone"]);
  assert.match(mainSource, /__ADDON_ID__/);
  assert.match(mainSource, /waitForCorePing/);
  assert.match(mainSource, /createCoreAdaptor/);
  assert.match(mainSource, /createExampleAddonApp/);
  assert.match(mainSource, /app\.bootstrap\(\)/);
  assert.match(mainSource, /Handshake bootstrap started/);
  assert.match(bridgeSource, /Handshake ping dispatched/);
  assert.match(bridgeSource, /Registration command dispatched/);
  assert.match(bridgeSource, /Status command dispatched/);
  assert.doesNotMatch(mainSource, /invokeCoreAction|registerAddonRuntime|openDialog/);
  assert.match(appSource, /createExampleLifecycle/);
  assert.match(appSource, /createBulkImportController/);
  assert.doesNotMatch(appSources, /\.invokeCoreAction\(/);
  assert.doesNotMatch(uiSources, /\.invokeCoreAction\(/);
  assert.ok(fs.existsSync(path.join(addonRoot, "core", "adaptor.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "api", "bridge.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "app", "state.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "app", "lifecycle.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "app", "commands.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "ui", "panel.js")));
  assert.ok(fs.existsSync(path.join(addonRoot, "ui", "bindings.js")));
});

runTest("ADDON-RUNTIME-KIT-01 characterizes equivalent normalized runtime wrappers", () => {
  const normalizedAddons = [
    "example-addon",
    "halloween-theme-addon",
    "latest-filters-addon",
    "library-addon",
    "site-repair-addon",
  ];
  const core = {
    waitForCorePing: (timeoutMs) => ({ kind: "ping", timeoutMs }),
    registerAddon: (addon) => ({ kind: "register", addon }),
    updateStatus: (status, message) => ({ kind: "status", status, message }),
    bindAddonCommands: (handler) => ({ kind: "bind", handler }),
    notifyTeardownComplete: (reason) => ({ kind: "ack", reason }),
  };

  for (const addonId of normalizedAddons) {
    const adaptor = loadModule(`addons/${addonId}/src/core/adaptor.js`);
    const bridge = loadModule(`addons/${addonId}/src/api/bridge.js`);
    const runtime = { id: addonId, version: "fixture", status: "installed" };
    const adaptedCore = adaptor.createCoreAdaptor(addonId);
    for (const method of ["waitForCorePing", "registerAddon", "updateStatus", "bindAddonCommands", "notifyTeardownComplete"]) {
      assert.strictEqual(typeof adaptedCore[method], "function", `${addonId}:${method}`);
    }
    assert.deepStrictEqual(bridge.registerAddonRuntime?.(core, runtime) || bridge.registerRuntime?.(core, runtime), { kind: "register", addon: runtime }, addonId);
    assert.deepStrictEqual(bridge.updateAddonRuntimeStatus?.(core, "installed", "ready") || bridge.updateRuntimeStatus?.(core, "installed", "ready"), { kind: "status", status: "installed", message: "ready" }, addonId);
    assert.strictEqual(typeof bridge.bindRuntimeCommands, "function", addonId);
    assert.strictEqual(typeof (bridge.notifyTeardownComplete || bridge.acknowledgeTeardown), "function", addonId);
    assert.match(fs.readFileSync(path.join(ROOT, "addons", addonId, "src", "core", "adaptor.js"), "utf8"), /shared\/runtimeKit\.js/);
  }

  const kitSource = fs.readFileSync(path.join(ROOT, "addons", "shared", "runtimeKit.js"), "utf8");
  assert.match(kitSource, /createCoreBridge/);
  assert.strictEqual((kitSource.match(/export function/g) || []).length, 6);
  const hybridSource = collectJavaScriptFiles(path.join(ROOT, "addons", "masked-direct-addon", "src"))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  assert.doesNotMatch(hybridSource, /shared\/runtimeKit\.js/);
  assert.match(hybridSource, /external-standalone/);
});

runTest("ADDON-RUNTIME-KIT-01 keeps shared lifecycle handles idempotent", async () => {
  const { createAddonRuntimeLifecycle } = loadModule("addons/shared/runtimeLifecycle.js");
  let cleanups = 0;
  let acknowledgements = 0;
  const lifecycle = createAddonRuntimeLifecycle({
    addonId: "kit-fixture",
    onEnable: async () => ({ ok: true }),
    onDisable: async () => ({ ok: true }),
    onTeardownAcknowledged: async () => { acknowledgements += 1; },
  });
  await lifecycle.enable();
  lifecycle.registerResource("fixture-style", () => { cleanups += 1; }, "style");
  lifecycle.registerResource("fixture-style", () => { cleanups += 1; }, "style");
  assert.deepStrictEqual(lifecycle.getResourceSnapshot(), [{ id: "fixture-style", kind: "style" }]);
  assert.strictEqual(cleanups, 1);
  await lifecycle.disable();
  assert.strictEqual(cleanups, 1);
  await lifecycle.teardown("terminal");
  await lifecycle.teardown("duplicate");
  assert.strictEqual(cleanups, 2);
  assert.strictEqual(acknowledgements, 1);
  assert.deepStrictEqual(lifecycle.getResourceSnapshot(), []);
});

runTest("ADDON-API config.getTagPrefs reads canonical live config", async () => {
  const { actionConfigGetTagPrefs } = loadModule("src/services/addons/actions/families/storage.js");
  const result = await actionConfigGetTagPrefs(
    (value) => JSON.stringify(value).length,
    1024,
    () => ({
      tags: [{ id: 7, name: "Example" }],
      preferredTags: [7],
      excludedTags: [8],
      markedTags: [9],
      color: { preferred: "#00ff00" },
    }),
  );
  assert.deepStrictEqual(result, {
    ok: true,
    value: {
      tags: [{ id: 7, name: "Example" }],
      preferredTags: [7],
      excludedTags: [8],
      markedTags: [9],
      color: { preferred: "#00ff00" },
    },
  });
});

runTest("ADDON-GOLDEN-01 bounds large API results before panel rendering", () => {
  const { compactResultForPanel } = loadModule("addons/example-addon/src/app/state.js");
  const result = compactResultForPanel({ ok: true, value: [{ body: "X".repeat(20000) }] });
  assert.strictEqual(result.ok, true);
  assert.match(result.value, /large result omitted from panel/);
  assert.ok(JSON.stringify(result).length < 1000);
});

runTest("ADDON-HALLOWEEN-01 follows the Example boundaries and confines bridge actions", () => {
  const addonRoot = path.join(ROOT, "addons", "halloween-theme-addon", "src");
  const manifestEntry = ADDON_MANIFEST.addons.find((addon) => addon.id === "halloween-theme-addon");
  const mainSource = fs.readFileSync(path.join(addonRoot, "main.js"), "utf8");
  const sourceFiles = collectJavaScriptFiles(addonRoot);
  const nonBridgeSources = sourceFiles
    .filter((filePath) => !filePath.includes(`${path.sep}api${path.sep}`) && !filePath.includes(`${path.sep}core${path.sep}`))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.ok(manifestEntry);
  assert.deepStrictEqual(manifestEntry.pageScopes, ["f95zone"]);
  assert.deepStrictEqual(manifestEntry.capabilities, ["feature"]);
  assert.match(mainSource, /__ADDON_ID__/);
  assert.match(mainSource, /createCoreAdaptor/);
  assert.match(mainSource, /createHalloweenThemeApp/);
  assert.doesNotMatch(mainSource, /invokeCoreAction|dispatchCoreCommand|addEventListener|querySelectorAll/);
  assert.doesNotMatch(nonBridgeSources, /\.invokeCoreAction\(|\.dispatchCoreCommand\(/);
  for (const relativePath of [
    "core/adaptor.js",
    "api/bridge.js",
    "api/meta.js",
    "app/commands.js",
    "app/lifecycle.js",
    "app/createHalloweenThemeApp.js",
    "ui/theme.js",
  ]) {
    assert.ok(fs.existsSync(path.join(addonRoot, relativePath)), relativePath);
  }
});

runTest("ADDON-HALLOWEEN-01 preserves route behavior and owns reversible theme lifecycle", async () => {
  const manifestEntry = ADDON_MANIFEST.addons.find((addon) => addon.id === "halloween-theme-addon");
  const routeUrls = [
    "https://f95zone.to/",
    "https://f95zone.to/threads/example.1/",
    "https://f95zone.to/sam/latest_alpha/",
    "https://f95zone.to/masked/example/",
  ];
  assert.ok(routeUrls.every((url) => new URL(url).hostname === "f95zone.to"));
  assert.deepStrictEqual(manifestEntry.pageScopes, ["f95zone"]);
  assert.ok(manifestEntry.matches.every((match) => match === "*://f95zone.to/*"));

  const sandbox = createDomSandbox(routeUrls[0]);
  const actions = [];
  let commandHandler = null;
  let unbound = false;
  let teardownAcknowledgements = 0;
  const core = {
    registerAddon(addon) { actions.push({ action: "register", addon }); return { ok: true }; },
    updateStatus(status, message) { actions.push({ action: "status", status, message }); return { ok: true }; },
    bindAddonCommands(handler) { commandHandler = handler; return () => { unbound = true; commandHandler = null; }; },
    notifyTeardownComplete(reason) { teardownAcknowledgements += 1; actions.push({ action: "teardown-ack", reason }); return { ok: true }; },
    async getAddonAccess() { return { ok: true, value: { blocked: false } }; },
    async invokeCoreAction(action, payload) {
      actions.push({ action, payload });
      return { ok: true, value: {} };
    },
  };
  try {
    document.body.innerHTML = '<img id="logo" src="/assets/logo.png" srcset="/assets/logo.png 1x">';
    const { createHalloweenThemeApp } = loadModule("addons/halloween-theme-addon/src/app/createHalloweenThemeApp.js");
    const app = createHalloweenThemeApp({
      core,
      runtime: {
        addonId: "halloween-theme-addon",
        addonName: "Halloween Theme",
        addonVersion: "2.0.12",
        addonDescription: "Halloween",
        capabilities: ["feature"],
        pageScopes: ["f95zone"],
        runtimeMode: "core-required",
        matches: ["*://f95zone.to/*"],
      },
    });

    await app.bootstrap();
    const lifecycle = app.getLifecycle();
    const image = document.querySelector("#logo");
    assert.strictEqual(image.getAttribute("src"), "/assets/halloween/logo.png");
    assert.strictEqual(app.getState().restorationCount, 1);
    const backgroundStyle = document.getElementById("f95ue-halloween-theme-style");
    assert.ok(backgroundStyle);
    assert.match(backgroundStyle.textContent, /halloween\/web-left\.png/);
    assert.strictEqual(actions.filter((entry) => entry.action === "ui.style.register").length, 0);

    await lifecycle.enable({ reason: "repeat-enable" });
    assert.strictEqual(document.querySelectorAll("#f95ue-halloween-theme-style").length, 1);

    document.body.innerHTML = '<img id="replaced-logo" src="/assets/logo.png">';
    assert.ok(commandHandler);
    commandHandler({
      command: "before-page-change",
      reason: "route-refresh",
      routeContext: { url: routeUrls[2] },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    assert.strictEqual(lifecycle.getResourceSnapshot().some((entry) => entry.id === "route-refresh-timer"), true);
    await new Promise((resolve) => window.setTimeout(resolve, 125));
    const replacedImage = document.querySelector("#replaced-logo");
    assert.strictEqual(replacedImage.getAttribute("src"), "/assets/halloween/logo.png");

    document.body.innerHTML = '<img id="late-logo" src="/assets/logo.png">';
    commandHandler({ command: "refresh", reason: "late-refresh" });
    await lifecycle.disable({ reason: "test-disable" });
    await new Promise((resolve) => window.setTimeout(resolve, 125));
    assert.strictEqual(replacedImage.getAttribute("src"), "/assets/logo.png");
    assert.strictEqual(document.querySelector("#late-logo").getAttribute("src"), "/assets/logo.png");
    assert.strictEqual(app.getState().restorationCount, 0);
    assert.strictEqual(document.getElementById("f95ue-halloween-theme-style"), null);

    await lifecycle.enable({ reason: "test-reenable" });
    await lifecycle.teardown({ reason: "test-teardown" });
    await lifecycle.teardown({ reason: "duplicate-teardown" });
    assert.strictEqual(unbound, true);
    assert.strictEqual(teardownAcknowledgements, 1);
    assert.deepStrictEqual(lifecycle.getResourceSnapshot(), []);
    assert.deepStrictEqual(lifecycle.getPendingOperationSnapshot(), []);
    assert.deepStrictEqual(app.getResourceSnapshot(), []);
    assert.deepStrictEqual(app.getPendingOperationSnapshot(), []);
    assert.strictEqual(app.getState().restorationCount, 0);
    assert.strictEqual(document.getElementById("f95ue-halloween-theme-style"), null);
    assert.strictEqual(commandHandler, null);
  } finally {
    sandbox.restore();
  }
});

runTest("ADDON-LATEST-FILTERS-01 keeps Latest scope and canonical module boundaries", () => {
  const addonRoot = path.join(ROOT, "addons", "latest-filters-addon", "src");
  const manifestEntry = ADDON_MANIFEST.addons.find((addon) => addon.id === "latest-filters-addon");
  const mainSource = fs.readFileSync(path.join(addonRoot, "main.js"), "utf8");
  const nonBridgeSources = collectJavaScriptFiles(addonRoot)
    .filter((filePath) => !filePath.includes(`${path.sep}api${path.sep}`) && !filePath.includes(`${path.sep}core${path.sep}`))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.ok(manifestEntry);
  assert.deepStrictEqual(manifestEntry.pageScopes, ["latest"]);
  assert.deepStrictEqual(manifestEntry.matches, ["*://f95zone.to/sam/latest_alpha/*"]);
  assert.deepStrictEqual(manifestEntry.grants, ["GM.getValue", "GM.setValue"]);
  assert.strictEqual(manifestEntry.runAt, "document-idle");
  assert.ok(manifestEntry.capabilities.includes("page"));
  assert.ok(manifestEntry.capabilities.includes("observer"));
  assert.match(mainSource, /__ADDON_ID__/);
  assert.match(mainSource, /createCoreAdaptor/);
  assert.match(mainSource, /createLatestFiltersApp/);
  assert.match(mainSource, /app\.bootstrap\(\)/);
  assert.doesNotMatch(mainSource, /invokeCoreAction|registerAddonRuntime|renderPanelContent|addEventListener/);
  assert.doesNotMatch(nonBridgeSources, /\.invokeCoreAction\(|\.dispatchCoreCommand\(/);
  assert.doesNotMatch(fs.readFileSync(path.join(addonRoot, "constants.js"), "utf8"), /export const state/);
  for (const relativePath of [
    "core/adaptor.js",
    "api/bridge.js",
    "api/storage.js",
    "api/page.js",
    "api/observer.js",
    "api/ui/dialog.js",
    "app/state.js",
    "app/repository.js",
    "app/lifecycle.js",
    "app/commands.js",
    "app/createLatestFiltersApp.js",
    "ui/bindings.js",
    "ui/renderer.js",
  ]) {
    assert.ok(fs.existsSync(path.join(addonRoot, relativePath)), relativePath);
  }
  assert.strictEqual(fs.existsSync(path.join(addonRoot, "coreBridge.js")), false);
});

runTest("ADDON-LATEST-FILTERS-01 preserves preset formats and storage keys behind adapters", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/");
  try {

  const { createStorageAdapter } = loadModule("addons/latest-filters-addon/src/api/storage.js");
  const { createLatestFiltersRepository } = loadModule("addons/latest-filters-addon/src/app/repository.js");
  const localKey = "addon:latest-filters-addon:presets";
  const rawPreset = { id: "legacy-preset", name: "Safe", url: "https://f95zone.to/sam/latest_alpha/?tags=1&page=3" };
  const gm = createFakeGM({ [localKey]: [rawPreset] });
  const coreWrites = [];
  const core = {
    async invokeCoreAction(action, payload) {
      if (action === "storage.get") {
        if (payload.key === "settings") return { ok: true, value: { enabled: true, state: { showPageButton: false } } };
        return { ok: true, value: payload.defaultValue };
      }
      if (action === "storage.set") { coreWrites.push(payload); return { ok: true }; }
      if (action === "config.getTagPrefs") return { ok: true, value: { tags: [] } };
      return { ok: false, reason: "unknown_test_action" };
    },
  };
  const repository = createLatestFiltersRepository(createStorageAdapter({ core, addonId: "latest-filters-addon", gm }));
  const settings = await repository.loadSettings();
  const presets = await repository.loadPresets();
  assert.strictEqual(settings.state.showPageButton, false);
  assert.strictEqual(presets[0].id, "legacy-preset");
  assert.strictEqual(presets[0].normalizedUrl, "https://f95zone.to/sam/latest_alpha/?tags=1");

  await repository.savePresets(presets);
  assert.deepStrictEqual(gm.logs().writes, [localKey]);
  assert.ok(gm.snapshot()[localKey][0].summary);

  const failingGm = createFakeGM({}, { failSet: true });
  const fallbackRepository = createLatestFiltersRepository(createStorageAdapter({ core, addonId: "latest-filters-addon", gm: failingGm }));
  await fallbackRepository.savePresets(presets);
  assert.ok(coreWrites.some((entry) => entry.key === "presets"));
  } finally {
    sandbox.restore();
  }
});

runTest("ADDON-LATEST-FILTERS-01 owns repeated lifecycle and suppresses canceled mount retries", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/");
  const clock = createFakeClock();
  const actions = [];
  let commandHandler = null;
  let teardownAcknowledgements = 0;
  const settings = { enabled: true, state: { showPageButton: true } };
  const core = {
    registerAddon(addon) { actions.push({ action: "register", addon }); return { ok: true }; },
    updateStatus(status, message) { actions.push({ action: "status", status, message }); return { ok: true }; },
    bindAddonCommands(handler) { commandHandler = handler; return () => { commandHandler = null; }; },
    notifyTeardownComplete() { teardownAcknowledgements += 1; return { ok: true }; },
    async getAddonAccess() { return { ok: true, value: { blocked: false } }; },
    async invokeCoreAction(action, payload) {
      actions.push({ action, payload });
      if (action === "storage.get" && payload.key === "settings") return { ok: true, value: settings };
      if (action === "storage.get" && payload.key === "presets") return { ok: true, value: [] };
      if (action === "storage.set") return { ok: true };
      if (action === "config.getTagPrefs") return { ok: true, value: { tags: [], preferredTags: [], excludedTags: [], markedTags: [], color: {} } };
      if (action === "page.getContext") return { ok: true, value: { pageScopes: ["latest"], pageType: "latest", url: location.href } };
      if (action === "observer.waitFor") return { ok: false, reason: "unsupported_action" };
      return { ok: false, reason: "unsupported_action" };
    },
  };
  const previousSetTimeout = sandbox.window.setTimeout;
  const previousClearTimeout = sandbox.window.clearTimeout;
  sandbox.window.setTimeout = clock.setTimeout;
  sandbox.window.clearTimeout = clock.clearTimeout;
  try {
    document.body.innerHTML = "";
    const { createLatestFiltersApp } = loadModule("addons/latest-filters-addon/src/app/createLatestFiltersApp.js", {
      loader: { ".css": "text", ".html": "text" },
    });
    const app = createLatestFiltersApp({
      core,
      runtime: {
        addonId: "latest-filters-addon",
        addonName: "Latest Filters",
        addonVersion: "0.3.18",
        addonDescription: "Latest filters",
        capabilities: ADDON_MANIFEST.addons.find((entry) => entry.id === "latest-filters-addon").capabilities,
        pageScopes: ["latest"],
        runtimeMode: "core-required",
        matches: ["*://f95zone.to/sam/latest_alpha/*"],
      },
      gm: null,
    });

    await app.bootstrap();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(commandHandler);
    assert.strictEqual(app.getState().enabled, true);
    assert.strictEqual(app.getState().routeListenersBound, true);
    assert.strictEqual(clock.pending() > 0, true);

    commandHandler({ command: "before-page-change", commandId: "route-1", reason: "rapid-route-1", routeContext: { url: location.href } });
    commandHandler({ command: "before-page-change", commandId: "route-2", reason: "rapid-route-2", routeContext: { url: location.href } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(app.getResourceSnapshot().filter((entry) => entry.id === "latest-route-listeners").length, 1);

    await app.getLifecycle().disable({ commandId: "disable-1", reason: "test-disable" });
    await clock.tick(5000);
    assert.strictEqual(document.getElementById("f95ue-latest-filters-addon"), null);
    assert.deepStrictEqual(app.getResourceSnapshot(), []);
    assert.deepStrictEqual(app.getPendingOperationSnapshot(), []);

    await app.getLifecycle().enable({ commandId: "enable-1", reason: "test-enable" });
    await app.getLifecycle().disable({ commandId: "disable-2", reason: "test-disable-again" });
    await app.getLifecycle().teardown({ commandId: "teardown-1", reason: "test-teardown" });
    await app.getLifecycle().teardown({ commandId: "teardown-2", reason: "duplicate" });
    assert.strictEqual(teardownAcknowledgements, 1);
    assert.deepStrictEqual(app.getResourceSnapshot(), []);
    assert.deepStrictEqual(app.getPendingOperationSnapshot(), []);
    assert.strictEqual(commandHandler, null);
  } finally {
    sandbox.window.setTimeout = previousSetTimeout;
    sandbox.window.clearTimeout = previousClearTimeout;
    sandbox.restore();
  }
});

runTest("ADDON-LATEST-FILTERS-01 keeps management toggles available outside Latest", async () => {
  const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
  const actions = [];
  let commandHandler = null;
  const core = {
    registerAddon(addon) { actions.push({ action: "register", addon }); return { ok: true }; },
    updateStatus(status) { actions.push({ action: "status", status }); return { ok: true }; },
    bindAddonCommands(handler) { commandHandler = handler; return () => { commandHandler = null; }; },
    notifyTeardownComplete() { return { ok: true }; },
    async getAddonAccess() { return { ok: true, value: { blocked: false } }; },
    async invokeCoreAction(action, payload) {
      if (action === "storage.get" && payload.key === "settings") return { ok: true, value: { enabled: true, state: { showPageButton: true } } };
      if (action === "storage.get") return { ok: true, value: [] };
      if (action === "storage.set") return { ok: true };
      if (action === "config.getTagPrefs") return { ok: true, value: { tags: [] } };
      return { ok: false, reason: "unsupported_action" };
    },
  };
  try {
    const { createLatestFiltersApp } = loadModule("addons/latest-filters-addon/src/app/createLatestFiltersApp.js", {
      loader: { ".css": "text", ".html": "text" },
    });
    const app = createLatestFiltersApp({
      core,
      runtime: {
        addonId: "latest-filters-addon",
        addonName: "Latest Filters",
        addonVersion: "0.3.18",
        addonDescription: "Latest filters",
        capabilities: ["toast", "feature", "storage", "page", "observer", "ui", "ui.style", "ui.mount", "ui.dialog"],
        pageScopes: ["latest"],
        runtimeMode: "core-required",
        matches: ["*://f95zone.to/sam/latest_alpha/*"],
      },
      gm: null,
    });
    await app.bootstrap();
    assert.strictEqual(app.getState().enabled, true);
    assert.strictEqual(document.getElementById("f95ue-latest-filters-addon"), null);
    assert.strictEqual(actions.some((entry) => entry.action === "ui.mount"), false);
    commandHandler({ command: "disable", commandId: "outside-disable", reason: "user" });
    await new Promise((resolve) => setImmediate(resolve));
    commandHandler({ command: "enable", commandId: "outside-enable", reason: "user" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(app.getState().enabled, true);
    assert.ok(actions.some((entry) => entry.action === "status"));
    await app.getLifecycle().teardown({ reason: "test-teardown" });
  } finally {
    sandbox.restore();
  }
});

runTest("ADDON-GOLDEN-01 boots normally on the declared F95Zone scope", async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const domWindow = new Window();
  global.window = domWindow;
  global.document = domWindow.document;
  const registrations = [];
  const actions = [];
  let commandHandler = null;
  let resolveTeardown;
  const teardownAcknowledged = new Promise((resolve) => {
    resolveTeardown = resolve;
  });
  const core = {
    registerAddon: (addon) => {
      registrations.push(addon);
      return { ok: true };
    },
    updateStatus: (status, message) => {
      actions.push({ action: "status", status, message });
      return { ok: true };
    },
    bindAddonCommands: (handler) => {
      commandHandler = handler;
      return () => { commandHandler = null; };
    },
    notifyTeardownComplete: (reason) => {
      actions.push({ action: "teardown-ack", reason });
      resolveTeardown(reason);
      return { ok: true };
    },
    invokeCoreAction: async (action) => {
      actions.push({ action });
      if (action === "addon.access") return { ok: true, value: { blocked: false } };
      if (action === "addon.throttle") return { ok: true, value: {} };
      return { ok: true };
    },
  };
  try {
    const { createExampleAddonApp } = loadModule("addons/example-addon/src/app/createExampleAddonApp.js", {
      loader: { ".css": "text", ".html": "text" },
    });
    const app = createExampleAddonApp({
      core,
      runtime: {
        addonId: "example-addon",
        addonName: "Example Add-on",
        addonVersion: "0.2.8",
        addonDescription: "Example",
        capabilities: ADDON_MANIFEST.addons.find((addon) => addon.id === "example-addon").capabilities,
        requiresCore: true,
        pageScopes: ["f95zone"],
        runtimeMode: "core-required",
        matches: ["*://f95zone.to/*"],
      },
    });
    await app.bootstrap();
    assert.strictEqual(registrations.length, 2);
    assert.strictEqual(registrations[0].requiresCore, true);
    assert.deepStrictEqual(registrations[0].pageScopes, ["f95zone"]);
    assert.strictEqual(actions.some((entry) => entry.action === "scope.error"), false);
    assert.ok(actions.some((entry) => entry.action === "ui.style.register"));
    assert.ok(actions.some((entry) => entry.action === "ui.mount"));
    assert.strictEqual(actions.filter((entry) => entry.action === "ui.dock.setButtons").length, 0);

    const dockSetAction = document.createElement("button");
    dockSetAction.dataset.exampleAction = "dock-set";
    document.body.appendChild(dockSetAction);
    dockSetAction.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(actions.filter((entry) => entry.action === "ui.dock.setButtons").length, 1);

    commandHandler({ command: "disable", reason: "test-disable" });
    await new Promise((resolve) => setImmediate(resolve));
    commandHandler({ command: "enable", reason: "test-reenable" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(actions.filter((entry) => entry.action === "ui.dock.setButtons").length, 2);

    const dock = document.createElement("div");
    dock.setAttribute("data-role", "exampleDock");
    const dockButton = document.createElement("button");
    dockButton.type = "button";
    dockButton.dataset.action = "open-example";
    dock.appendChild(dockButton);
    document.body.appendChild(dock);
    dockButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(actions.some((entry) => entry.action === "ui.dialog.open"));

    commandHandler({ command: "teardown", reason: "terminal-bootstrap-test" });
    commandHandler({ command: "teardown", reason: "duplicate-terminal-bootstrap-test" });
    assert.strictEqual(await teardownAcknowledged, "terminal-bootstrap-test");
    assert.strictEqual(actions.filter((entry) => entry.action === "teardown-ack").length, 1);
    assert.ok(actions.some((entry) => entry.action === "ui.dock.removeButtons"));
    assert.ok(actions.some((entry) => entry.action === "ui.unmount"));
    assert.ok(actions.some((entry) => entry.action === "ui.style.unregister"));
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

runTest("ADDON-GOLDEN-01 serializes lifecycle, suppresses stale commits, and acknowledges teardown once", async () => {
  const { createExampleLifecycle } = loadModule("addons/example-addon/src/app/lifecycle.js");
  const events = [];
  let releaseEnable;
  let enableStarted;
  const enableStartedPromise = new Promise((resolve) => {
    enableStarted = resolve;
  });
  const enableGate = new Promise((resolve) => {
    releaseEnable = resolve;
  });
  const lifecycle = createExampleLifecycle({
    onEnable: async ({ isCurrent }) => {
      events.push("enable:start");
      enableStarted();
      await enableGate;
      if (!isCurrent()) {
        events.push("enable:stale");
        return { ok: false, reason: "enable_superseded" };
      }
      events.push("enable:commit");
      return { ok: true };
    },
    onDisable: async () => {
      events.push("disable");
      return { ok: true };
    },
    onRefresh: async () => {
      events.push("refresh");
      return { ok: true };
    },
    onTeardown: async ({ reason }) => {
      events.push(`teardown:${reason}`);
      return { ok: true };
    },
    onTeardownAcknowledged: async (reason) => {
      events.push(`ack:${reason}`);
    },
  });

  const enablePromise = lifecycle.enable();
  await enableStartedPromise;
  const disablePromise = lifecycle.disable();
  releaseEnable();
  assert.deepStrictEqual(await enablePromise, { ok: false, reason: "enable_superseded" });
  assert.deepStrictEqual(await disablePromise, { ok: true });

  assert.deepStrictEqual(await lifecycle.enable(), { ok: true });
  assert.deepStrictEqual(await lifecycle.refresh(), { ok: true });
  assert.deepStrictEqual(await lifecycle.teardown("terminal-test"), { ok: true });
  assert.deepStrictEqual(await lifecycle.teardown("ignored-second-reason"), { ok: true });
  assert.strictEqual(events.filter((event) => event.startsWith("teardown:")).length, 1);
  assert.deepStrictEqual(events.filter((event) => event.startsWith("ack:")), ["ack:terminal-test"]);
  assert.strictEqual(lifecycle.isTerminated(), true);
  assert.strictEqual(lifecycle.isTeardownAcknowledged(), true);
  assert.deepStrictEqual(await lifecycle.enable(), { ok: false, reason: "terminated" });
});

runTest("ADDON-GOLDEN-01 keeps owned cancellation and late-commit guards in the app", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "addons/example-addon/src/app/createExampleAddonApp.js"), "utf8");
  const bulkSource = fs.readFileSync(path.join(ROOT, "addons/example-addon/src/app/bulkImport.js"), "utf8");
  assert.match(appSource, /ownedTimeouts/);
  assert.match(appSource, /ownedObserverNodes/);
  assert.match(appSource, /cancelOwnedTimeouts/);
  assert.match(appSource, /bulkImport\.requestCancellation\(\)/);
  assert.match(appSource, /unregisterStyle/);
  assert.match(appSource, /commandController\.unbind\(\)/);
  assert.match(appSource, /notifyTeardownComplete/);
  assert.match(appSource, /if \(!state\.enabled \|\| terminal\)/);
  assert.match(bulkSource, /handleDialogClosed/);
  assert.match(bulkSource, /active\.closing = true/);
  assert.match(bulkSource, /finally \{\s*active = null;/s);
});

runTest("ADDON-RUNTIME-CONTRACT-01 exposes serialized command context and lifecycle snapshots", async () => {
  const { createAddonRuntimeLifecycle, LIFECYCLE_STATES } = loadModule("addons/shared/runtimeLifecycle.js");
  const contexts = [];
  let releaseEnable;
  const enableGate = new Promise((resolve) => { releaseEnable = resolve; });
  const lifecycle = createAddonRuntimeLifecycle({
    addonId: "runtime-fixture",
    onEnable: async (context) => {
      contexts.push(context);
      await enableGate;
      return context.isCurrent() ? { ok: true } : { ok: false, reason: "stale" };
    },
    onDisable: async (context) => {
      contexts.push(context);
      return { ok: true };
    },
    onRefresh: async (context) => {
      contexts.push(context);
      return { ok: true };
    },
    onTeardown: async (context) => {
      contexts.push(context);
      return { ok: true };
    },
  });

  assert.deepStrictEqual(lifecycle.states, LIFECYCLE_STATES);
  const enablePromise = lifecycle.enable({ commandId: "enable-1", routeContext: { route: "a" } });
  await Promise.resolve();
  const disablePromise = lifecycle.disable({ commandId: "disable-1", reason: "user" });
  releaseEnable();
  assert.deepStrictEqual(await enablePromise, { ok: false, reason: "stale" });
  assert.deepStrictEqual(await disablePromise, { ok: true });
  assert.strictEqual(lifecycle.getState(), "disabled");
  assert.strictEqual(contexts[0].commandId, "enable-1");
  assert.strictEqual(contexts[0].command, "enable");
  assert.ok(contexts[0].signal instanceof AbortSignal);
  assert.strictEqual(contexts[0].terminal, false);
  assert.strictEqual(contexts[1].generation > contexts[0].generation, true);

  const release = lifecycle.registerResource("fixture-style", () => {}, "style");
  const pending = lifecycle.trackPendingOperation("fixture-import", Promise.resolve("done"), { kind: "import" });
  assert.strictEqual(lifecycle.getSnapshot().resources[0].kind, "style");
  assert.strictEqual(lifecycle.getSnapshot().pendingOperations[0].kind, "import");
  release();
  await pending;
  assert.deepStrictEqual(lifecycle.getResourceSnapshot(), []);
  assert.deepStrictEqual(lifecycle.getPendingOperationSnapshot(), []);
  await lifecycle.teardown({ commandId: "teardown-1", reason: "test" });
  await lifecycle.teardown({ commandId: "teardown-2", reason: "ignored" });
  assert.strictEqual(lifecycle.getState(), "terminated");
  assert.strictEqual(lifecycle.isTeardownAcknowledged(), true);
  assert.deepStrictEqual(await lifecycle.enable(), { ok: false, reason: "terminated" });
});

runTest("ADDON-RUNTIME-CONTRACT-01 invalidates route work and keeps disable reversible", async () => {
  const { createAddonRuntimeLifecycle } = loadModule("addons/shared/runtimeLifecycle.js");
  const commits = [];
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const lifecycle = createAddonRuntimeLifecycle({
    onEnable: async () => { commits.push("enable"); return { ok: true }; },
    onDisable: async () => { commits.push("disable"); return { ok: true }; },
    onRefresh: async (context) => {
      await refreshGate;
      if (!context.isCurrent()) return { ok: false, reason: "route_stale" };
      commits.push("refresh");
      return { ok: true };
    },
  });
  await lifecycle.enable();
  const refresh = lifecycle.refresh({ routeContext: { route: "old" } });
  await Promise.resolve();
  lifecycle.invalidate("route-change", { route: "new" });
  releaseRefresh();
  assert.deepStrictEqual(await refresh, { ok: false, reason: "route_stale" });
  assert.deepStrictEqual(commits, ["enable"]);
  assert.strictEqual(lifecycle.getState(), "enabled");
  const disablePromise = lifecycle.disable({ reason: "user" });
  const refreshDuringDisable = lifecycle.refresh({ reason: "stale-refresh" });
  assert.deepStrictEqual(await disablePromise, { ok: true });
  assert.deepStrictEqual(await refreshDuringDisable, { ok: false, reason: "disabled" });
  await lifecycle.enable();
  assert.deepStrictEqual(commits, ["enable", "disable", "enable"]);
});

runTest("ADDON-RUNTIME-CONTRACT-01 core watchdog hard-cleans one owner and ignores duplicate acknowledgments", async () => {
  const sandbox = createDomSandbox();
  const cleaned = [];
  try {
    const { createAddonLifecycleOrchestrator } = loadModule("src/services/addons/lifecycle.js");
    const orchestrator = createAddonLifecycleOrchestrator({
      sanitizeAddonId: (value) => String(value || "").trim(),
      listRegisteredAddons: () => [{ id: "watchdog-fixture" }],
      cleanupAddonObserverSubscriptions: (addonId) => cleaned.push(`observer:${addonId}`),
      cleanupAddonUi: (addonId) => cleaned.push(`ui:${addonId}`),
      teardownWatchdogMs: 5,
    });
    orchestrator.requestTeardown("watchdog-fixture", "timeout-test");
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.deepStrictEqual(cleaned, ["ui:watchdog-fixture", "observer:watchdog-fixture", "ui:watchdog-fixture"]);
    const snapshot = orchestrator.getSnapshot();
    assert.strictEqual(snapshot.watchdogs.length, 0);
    assert.strictEqual(snapshot.owners[0].state, "terminated");
    assert.strictEqual(snapshot.owners[0].hardCleaned, true);
    assert.strictEqual(orchestrator.acknowledgeTeardown("watchdog-fixture"), false);
  } finally {
    sandbox.restore();
  }
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
  const header = fs.readFileSync(path.join(ROOT, "build", "header.txt"), "utf8");
  assert.ok(!header.includes("trustedAddonCatalog"));
  assert.ok(!header.includes("GM_getResourceText"));
  const artifacts = addonCatalog.buildCatalogArtifacts(manifest);
  assert.match(artifacts.identifier, /^[a-f0-9]{64}$/);
  assert.strictEqual(artifacts.catalogFile, `trusted-addon-catalog.${artifacts.identifier.slice(0, 16)}.json`);
  assert.strictEqual(addonCatalog.renderCatalog(manifest), addonCatalog.renderCatalog([...manifest].reverse()));
});

runTest("ADDON-SCOPE-02 injects manifest scope metadata without changing header metadata", async () => {
  const manifest = addonCatalog.readManifest();
  const relativeOutfile = "tests/.tmp/addon-scope-injection.user.js";
  const outfile = path.join(ROOT, relativeOutfile);
  try {
    await addonBuilder.buildAddon({ ...manifest.find((entry) => entry.id === "site-repair-addon"), outfile: relativeOutfile }, false);
    const output = fs.readFileSync(outfile, "utf8");
    assert.ok(output.includes("core-required"));
    assert.ok(output.includes("f95zone"));
    assert.ok(output.includes("*://f95zone.to/*"));
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

runTest("ADDON-IDENTITY-01 canonicalizes catalog aliases and runtime conflicts", () => {
  const catalog = loadModule("src/services/addons/catalog.js");
  assert.strictEqual(catalog.getCanonicalAddonId("EXAMPLE.ADDON-LEGACY"), "example-addon");
  assert.strictEqual(catalog.getTrustedCatalogEntry("example-addon-legacy"), null);
  assert.deepStrictEqual(catalog.listTrustedAddonAliases(), [
    { legacyId: "example-addon-legacy", id: "example-addon" },
    { legacyId: "image-repair-addon", id: "site-repair-addon" },
  ]);

  const registry = loadModule("src/services/addons/registry.js");
  const metadata = {
    name: "Example Runtime",
    version: "1.0.0",
    description: "fixture",
    runtimeMode: "core-required",
    requiresCore: true,
    pageScopes: ["f95zone"],
    matches: ["*://f95zone.to/*"],
    capabilities: ["toast"],
  };
  registry.registerAddon({ ...metadata, id: "example-addon-legacy" });
  registry.registerAddon({ ...metadata, id: "example-addon", name: "Canonical Runtime" });
  const snapshot = registry.listRegisteredAddons();
  assert.strictEqual(snapshot.length, 1);
  assert.strictEqual(snapshot[0].id, "example-addon");
  assert.strictEqual(snapshot[0].name, "Canonical Runtime");
  assert.strictEqual(registry.getRegisteredAddon("example-addon-legacy").id, "example-addon");

  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const cards = buildKnownAddonsSnapshot({
    registered: [{ ...metadata, id: "example-addon-legacy", name: "Old Runtime" }, { ...metadata, id: "example-addon", name: "Canonical Runtime" }],
    catalog: [{ id: "example-addon", legacyIds: ["example-addon-legacy"], name: "Catalog Example", trusted: true, pageScopes: ["f95zone"], matches: ["*://f95zone.to/*"] }],
    installedMeta: { "example-addon-legacy": { name: "Old Installed", installedSeenAt: 2, lastSeenAt: 3 } },
    currentScopes: ["f95zone"],
    currentUrl: "https://f95zone.to/",
    catalogFresh: true,
  });
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].id, "example-addon");
  assert.strictEqual(cards[0].name, "Canonical Runtime");
});

runTest("ADDON-IDENTITY-01 merges state atomically with deterministic precedence and retry", async () => {
  const previousGM = global.GM;
  const seedGM = createFakeGM();
  global.GM = seedGM;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(seedGM, settings, config);

    const state = loadModule("src/services/addons/state.js");
    const committed = await state.persistAddonsState({
      byAddon: {
        "example-addon-legacy": { state: { enabled: false, legacyOnly: true, shared: "old" } },
        "example-addon": { state: { enabled: true, shared: "canonical" } },
      },
      installedMeta: {
        "example-addon-legacy": { name: "Old", installedSeenAt: 20, lastSeenAt: 30 },
        "example-addon": { name: "Canonical", installedSeenAt: 10, lastSeenAt: 40 },
      },
    });
    assert.strictEqual(committed.ok, true);
    assert.deepStrictEqual(state.getAddonState("example-addon-legacy"), { enabled: true, legacyOnly: true, shared: "canonical" });
    const normalizedMeta = state.getInstalledAddonMeta("example-addon-legacy");
    assert.strictEqual(normalizedMeta.name, "Canonical");
    assert.strictEqual(normalizedMeta.installedSeenAt, 10);
    assert.strictEqual(normalizedMeta.lastSeenAt, 40);
    assert.deepStrictEqual(Object.keys(state.listInstalledAddonMeta()), ["example-addon"]);
    const writesAfterCommit = seedGM.logs().writes.length;
    assert.deepStrictEqual(await state.normalizeAddonIdentities(), { ok: true, changed: false });
    assert.strictEqual(seedGM.logs().writes.length, writesAfterCommit);

    const failingSeed = createFakeGM();
    global.GM = failingSeed;
    const seedSettings = loadModule("src/services/settingsService.js");
    const seedConfig = loadModule("src/config.js").config;
    await seedReadyConfig(failingSeed, seedSettings, seedConfig);
    const seededEnvelope = failingSeed.snapshot()[seedSettings.CONFIG_ENVELOPE_KEY];
    seededEnvelope.data.addons.byAddon = { "example-addon-legacy": { state: { enabled: false } } };
    await failingSeed.setValue(seedSettings.CONFIG_ENVELOPE_KEY, seededEnvelope);
    const failingGM = createFakeGM(failingSeed.snapshot(), { failSet: true });
    global.GM = failingGM;
    const retryState = loadModule("src/services/addons/state.js");
    const failed = await retryState.persistAddonsState({
      byAddon: { "example-addon-legacy": { state: { enabled: false } } },
      installedMeta: {},
    });
    assert.strictEqual(failed.ok, false);
    assert.deepStrictEqual(retryState.getAddonState("example-addon"), { enabled: false });
    assert.ok(Object.hasOwn(failingGM.snapshot()[settings.CONFIG_ENVELOPE_KEY].data.addons.byAddon, "example-addon-legacy"));
  } finally {
    global.GM = previousGM;
  }
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

  const allowedUntrusted = resolveAddonAccess({
    ...common,
    id: "unknown-addon",
    registered: { ...common.registered, id: "unknown-addon" },
    allowUntrusted: true,
  });
  assert.deepStrictEqual(
    { trusted: allowedUntrusted.isTrusted, blocked: allowedUntrusted.isBlocked, reason: allowedUntrusted.blockReason },
    { trusted: false, blocked: false, reason: null },
  );

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

});

runTest("trusted catalog refresh checks metadata on interval and fetches content only on identifier change", async () => {
  const catalogModule = loadModule("src/services/addons/catalog.js");
  const values = new Map();
  const storage = {
    get: async (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: async (key, value) => { values.set(key, structuredClone(value)); },
  };
  let currentTime = 1000;
  let identifier = "a".repeat(64);
  let fetches = [];
  const catalog = [{
    id: "fixture-addon", name: "Fixture", trusted: true, pageScopes: ["f95zone"],
    matches: ["*://f95zone.to/*"], capabilities: ["feature"],
  }];
  const fetchImpl = async (url) => {
    fetches.push(url);
    return { ok: true, json: async () => url.includes(".meta.json")
      ? { schemaVersion: 1, identifier, catalogFile: `trusted-addon-catalog.${identifier.slice(0, 16)}.json` }
      : { schemaVersion: 1, identifier, catalog } };
  };
  const repository = catalogModule.createTrustedCatalogRepository({
    storage, fetchImpl, now: () => currentTime, hashCatalog: async () => identifier,
  });

  const first = await repository.load();
  assert.deepStrictEqual({ ok: first.ok, source: first.source, changed: first.changed }, { ok: true, source: "remote", changed: true });
  assert.strictEqual(fetches.length, 2);
  const firstCache = values.get(catalogModule.TRUSTED_CATALOG_CACHE_KEY);
  assert.strictEqual(firstCache.identifier, identifier);
  assert.strictEqual(firstCache.checkedAt, currentTime);
  assert.strictEqual(firstCache.updatedAt, currentTime);

  fetches = [];
  currentTime += catalogModule.TRUSTED_CATALOG_CHECK_INTERVAL_MS - 1;
  assert.strictEqual((await repository.load()).source, "cache");
  assert.deepStrictEqual(fetches, []);

  currentTime += 2;
  assert.strictEqual((await repository.load()).source, "not-modified");
  assert.strictEqual(fetches.length, 1);
  assert.strictEqual(values.get(catalogModule.TRUSTED_CATALOG_CACHE_KEY).updatedAt, firstCache.updatedAt);

  fetches = [];
  currentTime += catalogModule.TRUSTED_CATALOG_CHECK_INTERVAL_MS;
  identifier = "b".repeat(64);
  assert.strictEqual((await repository.load()).source, "remote");
  assert.strictEqual(fetches.length, 2);
  assert.strictEqual(values.get(catalogModule.TRUSTED_CATALOG_CACHE_KEY).identifier, identifier);
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
  const sharedRuntimeKit = fs.readFileSync(path.join(ROOT, "addons/shared/runtimeKit.js"), "utf8");
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
    assert.match(source, /requiresCore\s*:\s*(?:runtime\.)?requiresCore/, `${entry.id} must send requiresCore in registration metadata`);
    assert.ok(/getAddonAccess|addon\.access/.test(source), `${entry.id} must consume the shared access result`);
    assert.ok(
      source.includes("invokeCoreAction") || entry.capabilities.every((capability) => capability === "feature"),
      `${entry.id} must use permission-checked core actions unless its behavior is entirely local`,
    );
    assert.ok(/(?:detail|d)\.addonId|bindAddonCommands/.test(`${source}\n${sharedRuntimeKit}`), `${entry.id} must filter core commands by identity`);
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
  assert.strictEqual(getAddonActionBlockReason({ ...addon, status: "disabled" }, "feature.enable"), null);
  assert.strictEqual(getAddonActionBlockReason({ ...addon, status: "disabled" }, "feature.disable"), null);
  assert.strictEqual(getAddonActionBlockReason({ ...addon, status: "disabled" }, "storage.get"), "addon_disabled");
});

runTest("ADDON-RUNTIME-CONTRACT-01 keeps core disable reversible", async () => {
  const { actionFeatureEnableDisable } = loadModule("src/services/addons/actions/families/lifecycle.js");
  const commands = [];
  let cancelRequests = 0;
  let cleanupRequests = 0;
  const persist = async () => ({ ok: true });
  const meta = async () => ({ ok: true });
  const state = { enabled: true };
  const updateStatus = (addonId, status) => commands.push({ addonId, command: `status:${status}` });
  const emit = (addonId, command) => commands.push({ addonId, command });

  const disabled = await actionFeatureEnableDisable(
    "example-addon",
    "feature.disable",
    updateStatus,
    emit,
    () => state,
    persist,
    meta,
    () => { cancelRequests += 1; },
    undefined,
    () => { cleanupRequests += 1; },
  );
  assert.deepStrictEqual(disabled, { ok: true });
  assert.strictEqual(cancelRequests, 0);
  assert.strictEqual(cleanupRequests, 1);
  assert.deepStrictEqual(commands, [
    { addonId: "example-addon", command: "status:disabled" },
    { addonId: "example-addon", command: "before-disable" },
    { addonId: "example-addon", command: "disable" },
  ]);

  commands.length = 0;
  const enabled = await actionFeatureEnableDisable(
    "example-addon",
    "feature.enable",
    updateStatus,
    emit,
    () => state,
    persist,
    meta,
    () => { cancelRequests += 1; },
    undefined,
    () => { cleanupRequests += 1; },
  );
  assert.deepStrictEqual(enabled, { ok: true });
  assert.strictEqual(cancelRequests, 1);
  assert.strictEqual(cleanupRequests, 1);
  assert.deepStrictEqual(commands, [
    { addonId: "example-addon", command: "status:installed" },
    { addonId: "example-addon", command: "enable" },
  ]);
});

runTest("ADDON lifecycle keeps persisted disable authoritative and permits cleanup only", async () => {
  const previousGM = global.GM;
  const fakeGM = createFakeGM();
  global.GM = fakeGM;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(fakeGM, settings, config);
    const service = loadModule("src/services/addonsService.js");

    assert.strictEqual((await service.setAddonStateValue("example-addon", "enabled", false)).ok, true);
    service.replaceRegisteredAddons([]);
    service.registerAddon({
      id: "example-addon",
      name: "Example Add-on",
      version: "1.0.0",
      status: "installed",
      runtimeMode: "core-required",
      requiresCore: true,
      pageScopes: ["f95zone"],
      matches: ["*://f95zone.to/*"],
      capabilities: ["feature", "ui.mount"],
    });
    const access = await service.invokeAddonCoreAction("example-addon", "addon.access", {});
    assert.strictEqual(access.ok, true);
    assert.strictEqual(access.value.enabled, false);
    const registered = service.listRegisteredAddons()[0];
    assert.strictEqual(service.getAddonActionBlockReason(registered, "ui.mount"), "addon_disabled");
    assert.strictEqual(service.getAddonActionBlockReason(registered, "ui.unmount"), null);
  } finally {
    global.GM = previousGM;
  }
});

runTest("ADDON lifecycle persists desired state and status metadata in one commit", async () => {
  const previousGM = global.GM;
  const fakeGM = createFakeGM();
  global.GM = fakeGM;
  try {
    const settings = loadModule("src/services/settingsService.js");
    const { config } = loadModule("src/config.js");
    await seedReadyConfig(fakeGM, settings, config);
    const state = loadModule("src/services/addons/state.js");
    const beforeWrites = fakeGM.logs().writes.length;
    const result = await state.setAddonEnabledState("example-addon", false, {
      statusMessage: "Disabled from core.",
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(state.getAddonState("example-addon").enabled, false);
    assert.strictEqual(state.getInstalledAddonMeta("example-addon").statusMessage, "Disabled from core.");
    const writeKeys = fakeGM.logs().writes.slice(beforeWrites);
    assert.deepStrictEqual(writeKeys, [settings.CONFIG_BACKUP_KEY, settings.CONFIG_ENVELOPE_KEY]);

    await state.upsertInstalledAddonMeta("example-addon", { version: "1.2.3" });
    assert.strictEqual(state.getAddonState("example-addon").enabled, false);
    assert.strictEqual(state.getInstalledAddonMeta("example-addon").version, "1.2.3");

    const beforeRemovalWrites = fakeGM.logs().writes.length;
    assert.deepStrictEqual(await state.removeAddonInstallationTrace("example-addon"), { ok: true });
    assert.deepStrictEqual(state.getAddonState("example-addon"), {});
    assert.strictEqual(state.getInstalledAddonMeta("example-addon"), null);
    assert.deepStrictEqual(
      fakeGM.logs().writes.slice(beforeRemovalWrites),
      [settings.CONFIG_BACKUP_KEY, settings.CONFIG_ENVELOPE_KEY],
    );
  } finally {
    global.GM = previousGM;
  }
});

runTest("ADDON-SERVICE-FACADE-01 public init shutdown and re-init own one bridge listener", async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousCustomEvent = global.CustomEvent;
  const previousGM = global.GM;
  const previousFetch = global.fetch;
  const listeners = new Map();
  global.window = {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
  };
  global.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  global.document = { documentElement: { dataset: {}, appendChild(node) { return node; } }, createElement() { return { remove() {} }; } };
  global.GM = createFakeGM();
  global.fetch = async () => { throw new Error("offline-test"); };
  try {
    const service = loadModule("src/services/addonsService.js");
    assert.strictEqual(await service.initAddonsConsoleBridge(), true);
    assert.strictEqual(listeners.has("f95ue:addons-dev-command"), true);
    service.shutdownAddonsService("test-shutdown");
    assert.strictEqual(listeners.has("f95ue:addons-dev-command"), false);
    assert.strictEqual(await service.initAddonsConsoleBridge(), true);
    assert.strictEqual(listeners.has("f95ue:addons-dev-command"), true);
    service.shutdownAddonsService("test-complete");
    assert.strictEqual(listeners.has("f95ue:addons-dev-command"), false);
  } finally {
    global.window = previousWindow; global.document = previousDocument; global.CustomEvent = previousCustomEvent;
    global.GM = previousGM; global.fetch = previousFetch;
  }
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
  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const addon = { trusted: true, blocked: false, status: "installed", pageScopes: ["thread"] };
  assert.strictEqual(getAddonActionBlockReason(addon, "feature.disable"), null);
  assert.strictEqual(getAddonActionBlockReason(addon, "storage.get"), "addon_out_of_scope");

  const snapshot = buildKnownAddonsSnapshot({
    catalog: [{
      id: "scope-fixture-addon", name: "Scope Fixture", trusted: true,
      pageScopes: ["latest"], matches: ["*://f95zone.to/sam/latest_alpha/*"],
      capabilities: ["feature", "storage"],
    }],
    installedMeta: {
      "scope-fixture-addon": {
        installedSeenAt: 1, name: "Scope Fixture", pageScopes: ["latest"],
        matches: ["*://f95zone.to/sam/latest_alpha/*"], capabilities: ["feature", "storage"],
      },
    },
    getAddonState: () => ({ enabled: true }),
    currentScopes: ["thread"],
    currentUrl: "https://f95zone.to/threads/example.1/",
    catalogFresh: true,
  })[0];
  assert.strictEqual(snapshot.status, "installed");
  assert.strictEqual(snapshot.isEnabled, true);
  assert.strictEqual(snapshot.isBlocked, false);
  assert.strictEqual(snapshot.blockReason, null);
  assert.strictEqual(snapshot.supportsCurrentPage, false);
  assert.match(snapshot.statusMessage, /^Enabled\./);
});

};
