module.exports = function registerAddonMatrixTests(context) {
  const {
    path,
    fs,
    assert,
    ADDON_MANIFEST,
    TRUSTED_ADDON_CATALOG,
    ROOT,
    loadModule,
    runTest,
    collectJavaScriptFiles,
    createDomSandbox,
    addonBuildTools,
    addonBuilder,
  } = context;

  const scope = loadModule("src/services/addons/scope.js");
  const { resolveAddonAccess } = loadModule("src/services/addons/access.js");
  const { buildKnownAddonsSnapshot } = loadModule("src/services/addons/knownAddons.js");
  const { getAddonActionBlockReason } = loadModule("src/services/addonsService.js");
  const { createAddonRuntimeLifecycle } = loadModule("addons/shared/runtimeLifecycle.js");
  const { invokeOptionalCoreAction } = loadModule("addons/shared/apiFallback.js");
  const { classifyMaskedDirectContext } = loadModule("addons/masked-direct-addon/src/app/context.js");

  const routes = [
    { id: "ordinary", url: "https://f95zone.to/", scopes: ["f95zone"] },
    { id: "thread", url: "https://f95zone.to/threads/example.1/", scopes: ["f95zone", "thread"] },
    { id: "latest", url: "https://f95zone.to/sam/latest_alpha/", scopes: ["f95zone", "latest"] },
    { id: "masked", url: "https://f95zone.to/masked/example/", scopes: ["f95zone"] },
  ];

  function matrixAssert(value, { addon, route, transition, policy, message }) {
    assert.ok(
      value,
      `[addon=${addon} route=${route} transition=${transition} policy=${policy}] ${message}`,
    );
  }

  function catalogEntryFor(id) {
    return TRUSTED_ADDON_CATALOG.find((entry) => entry.id === id) || null;
  }

  runTest("TEST-ADDONS-01 covers deterministic manifest, header, catalog, and route support", () => {
    const coreEntries = ADDON_MANIFEST.addons.filter((entry) => entry.runtimeMode !== "standalone");
    assert.strictEqual(coreEntries.length, ADDON_MANIFEST.addons.length);

    for (const entry of coreEntries) {
      const catalogEntry = catalogEntryFor(entry.id);
      matrixAssert(Boolean(catalogEntry), {
        addon: entry.id, route: "all", transition: "registration", policy: "catalog",
        message: "manifest entry must have one generated catalog entry",
      });
      const metadata = scope.validateAddonRuntimeMetadata(entry, { registration: true });
      matrixAssert(metadata.ok, {
        addon: entry.id, route: "all", transition: "registration", policy: "metadata",
        message: metadata.errors?.join(",") || "runtime metadata rejected",
      });
      assert.strictEqual(metadata.runtimeMode, entry.runtimeMode, entry.id);
      assert.deepStrictEqual(metadata.pageScopes, entry.pageScopes, entry.id);
      assert.deepStrictEqual(metadata.matches, entry.matches, entry.id);

      const header = addonBuilder.headerForAddon(entry, { includeTimestamp: false });
      for (const match of entry.matches) assert.ok(header.includes(`// @match        ${match}`), `${entry.id}:${match}`);
      for (const grant of entry.grants) assert.ok(header.includes(`// @grant        ${grant}`), `${entry.id}:${grant}`);
      assert.ok(header.includes(`// @run-at       ${entry.runAt}`), entry.id);

      const sourceRoot = path.join(ROOT, path.dirname(entry.entry));
      const runtimeSource = collectJavaScriptFiles(sourceRoot)
        .map((filePath) => fs.readFileSync(filePath, "utf8"))
        .join("\n");
      matrixAssert(runtimeSource.includes("__ADDON_PAGE_SCOPES__") && runtimeSource.includes("__ADDON_RUNTIME_MODE__"), {
        addon: entry.id, route: "all", transition: "registration", policy: "runtime-metadata",
        message: "main entry must consume builder-injected scope and runtime mode",
      });

      for (const route of routes) {
        const matches = scope.matchesAnyUserscriptPattern(route.url, entry.matches);
        const supports = matches && scope.scopeAppliesToCurrentPage(entry.pageScopes, route.scopes);
        const expected = entry.id === "latest-filters-addon"
          ? route.id === "latest"
          : entry.id === "masked-direct-addon"
            ? ["thread", "masked"].includes(route.id)
            : true;
        matrixAssert(matches === expected, {
          addon: entry.id, route: route.id, transition: "activation-match", policy: "manifest",
          message: `expected activation=${expected}, received ${matches}`,
        });
        matrixAssert(supports === expected, {
          addon: entry.id, route: route.id, transition: "scope-support", policy: "pageScopes",
          message: `expected supportsCurrentPage=${expected}, received ${supports}`,
        });
        const access = resolveAddonAccess({
          id: entry.id,
          registered: entry,
          catalogEntry,
          currentScopes: route.scopes,
          currentUrl: route.url,
          allowUntrusted: false,
          desiredEnabled: true,
        });
        matrixAssert(access.supportsCurrentPage === expected && !access.isBlocked, {
          addon: entry.id, route: route.id, transition: "registration", policy: "trusted-runtime",
          message: `access projection is ${JSON.stringify(access)}`,
        });
      }
    }
  });

  runTest("TEST-ADDONS-01 covers trust, missing-catalog, disabled, and management/runtime policy", () => {
    const base = {
      id: "fixture-addon",
      registered: {
        id: "fixture-addon",
        status: "installed",
        pageScopes: ["thread"],
        matches: ["*://f95zone.to/threads/*"],
      },
      catalogEntry: { id: "fixture-addon", trusted: true },
      currentScopes: ["f95zone"],
      currentUrl: "https://f95zone.to/",
    };
    const cases = [
      { name: "trusted", input: {}, trusted: true, blocked: false, reason: null },
      { name: "user-trusted", input: { catalogEntry: null, trustedIds: ["fixture-addon"] }, trusted: true, blocked: false, reason: null },
      { name: "untrusted-policy-block", input: { catalogEntry: null }, trusted: false, blocked: true, reason: "untrusted_disallowed" },
      { name: "untrusted-allowed", input: { catalogEntry: null, allowUntrusted: true }, trusted: false, blocked: false, reason: null },
      { name: "missing-catalog", input: { catalogEntry: null }, trusted: false, blocked: true, reason: "untrusted_disallowed" },
      { name: "identity-mismatch", input: { catalogEntry: { id: "other-addon", trusted: true } }, trusted: false, blocked: true, reason: "identity_error" },
      { name: "disabled", input: { desiredEnabled: false }, trusted: true, blocked: false, reason: null, enabled: false },
    ];
    for (const item of cases) {
      const result = resolveAddonAccess({ ...base, ...item.input });
      matrixAssert(result.isTrusted === item.trusted && result.isBlocked === item.blocked && result.blockReason === item.reason, {
        addon: "fixture-addon", route: "thread", transition: item.name, policy: "access",
        message: JSON.stringify(result),
      });
      if (typeof item.enabled === "boolean") assert.strictEqual(result.isEnabled, item.enabled);
    }

    const outOfScope = { ...base, id: "fixture-addon", registered: { ...base.registered, pageScopes: ["thread"] } };
    assert.strictEqual(getAddonActionBlockReason({ trusted: true, blocked: false, status: "installed", pageScopes: ["thread"] }, "feature.enable"), null);
    const outOfScopeRuntime = { ...outOfScope.registered, id: "", trusted: true, blocked: false };
    assert.strictEqual(getAddonActionBlockReason(outOfScopeRuntime, "storage.get"), "addon_out_of_scope");
    assert.strictEqual(getAddonActionBlockReason({ ...outOfScopeRuntime, status: "disabled" }, "feature.enable"), null);

    const snapshot = buildKnownAddonsSnapshot({
      registered: [{ ...base.registered, id: "fixture-addon" }],
      catalog: [{ ...base.catalogEntry, pageScopes: ["thread"], matches: ["*://f95zone.to/threads/*"] }],
      currentScopes: ["f95zone"],
      currentUrl: "https://f95zone.to/",
      catalogFresh: true,
      getAddonState: () => ({ enabled: true }),
    })[0];
    assert.strictEqual(snapshot.status, "installed");
    assert.strictEqual(snapshot.isEnabled, true);
    assert.strictEqual(snapshot.isBlocked, false);
    assert.strictEqual(snapshot.supportsCurrentPage, false);
    assert.doesNotMatch(snapshot.statusMessage, /^Blocked/i);
  });

  runTest("TEST-ADDONS-01 repeats lifecycle transitions without duplicate resources or late commits", async () => {
    for (const entry of ADDON_MANIFEST.addons.filter((item) => item.runtimeMode !== "standalone")) {
      const commits = [];
      let cleanupCount = 0;
      let acknowledgeCount = 0;
      let releaseStaleEnable;
      const staleEnableGate = new Promise((resolve) => { releaseStaleEnable = resolve; });
      const lifecycle = createAddonRuntimeLifecycle({
        addonId: entry.id,
        onEnable: async (context) => {
          if (context.reason === "stale-route") {
            await staleEnableGate;
            if (!context.isCurrent()) return { ok: false, reason: "stale" };
          }
          if (!context.isCurrent()) return { ok: false, reason: "stale" };
          commits.push(`${entry.id}:enable:${context.generation}`);
          context.trackPendingOperation("fixture-pending", Promise.resolve());
          lifecycle.registerResource("fixture-resource", () => { cleanupCount += 1; });
          return { ok: true };
        },
        onDisable: async () => {
          lifecycle.releaseResource("fixture-resource");
          commits.push(`${entry.id}:disable`);
          return { ok: true };
        },
        onRefresh: async (context) => {
          if (context.isCurrent()) commits.push(`${entry.id}:refresh:${context.generation}`);
          return { ok: true };
        },
        onTeardown: async () => {
          commits.push(`${entry.id}:teardown`);
          return { ok: true };
        },
        onTeardownAcknowledged: async () => { acknowledgeCount += 1; },
      });

      const staleEnable = lifecycle.enable({ reason: "stale-route" });
      await Promise.resolve();
      lifecycle.invalidate("before-page-change", { route: "next" });
      releaseStaleEnable();
      assert.deepStrictEqual(await staleEnable, { ok: false, reason: "stale" });
      assert.deepStrictEqual(commits, []);

      assert.deepStrictEqual(await lifecycle.enable({ reason: "initial" }), { ok: true });
      assert.deepStrictEqual(await lifecycle.enable({ reason: "duplicate" }), { ok: true });
      assert.strictEqual(lifecycle.getResourceSnapshot().length, 1, entry.id);
      assert.deepStrictEqual(await lifecycle.refresh({ reason: "route-refresh" }), { ok: true });
      assert.deepStrictEqual(await lifecycle.disable({ reason: "user-disable" }), { ok: true });
      assert.deepStrictEqual(lifecycle.getResourceSnapshot(), []);
      assert.deepStrictEqual(await lifecycle.enable({ reason: "re-enable" }), { ok: true });
      assert.deepStrictEqual(await lifecycle.refresh({ reason: "before-page-change" }), { ok: true });
      assert.deepStrictEqual(await lifecycle.teardown({ reason: "terminal" }), { ok: true });
      assert.deepStrictEqual(await lifecycle.teardown({ reason: "duplicate-terminal" }), { ok: true });
      assert.strictEqual(acknowledgeCount, 1, entry.id);
      assert.deepStrictEqual(lifecycle.getResourceSnapshot(), []);
      assert.deepStrictEqual(lifecycle.getPendingOperationSnapshot(), []);
      assert.strictEqual(lifecycle.getState(), "terminated");
      assert.strictEqual(cleanupCount, 2, entry.id);
      matrixAssert(commits.includes(`${entry.id}:teardown`), {
        addon: entry.id, route: "f95zone", transition: "teardown", policy: "lifecycle",
        message: "terminal teardown did not commit",
      });
    }
  });

  runTest("TEST-ADDONS-01 core absence is quiet for core-required add-ons", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
    try {
      const { createCoreBridge } = loadModule("addons/shared/coreBridge.js");
      for (const entry of ADDON_MANIFEST.addons.filter((item) => item.runtimeMode !== "standalone")) {
        const core = createCoreBridge(entry.id);
        const ping = await core.waitForCorePing(1);
        matrixAssert(ping.ok === false && ping.apiVersion === "", {
          addon: entry.id, route: "thread", transition: "core-absent", policy: "quiet-exit",
          message: JSON.stringify(ping),
        });
      }
    } finally {
      sandbox.restore();
    }
  });

  runTest("TEST-ADDONS-01 covers every Masked Direct external host and route handoff policy", () => {
    const externalHosts = [
      "buzzheavier.com", "cdn.buzzheavier.com", "bzzhr.to", "cdn.bzzhr.to",
      "gofile.io", "pixeldrain.com", "datanodes.to", "www.mediafire.com",
      "mediafire.com", "workupload.com", "www.workupload.com", "cdn.workupload.com",
    ];
    const isExternalHost = (host) => externalHosts.includes(host) || host.endsWith(".workupload.com");
    for (const host of externalHosts) {
      const result = classifyMaskedDirectContext(new URL(`https://${host}/file/example`), { isSupportedExternalHost: isExternalHost });
      matrixAssert(result.kind === "external-standalone" && result.usesCore === false, {
        addon: "masked-direct-addon", route: host, transition: "external-bootstrap", policy: "no-core-bridge",
        message: JSON.stringify(result),
      });
    }
    for (const [url, route, usesCore] of [
      ["https://f95zone.to/threads/example.1/", "thread", true],
      ["https://f95zone.to/masked/example/", "masked", true],
      ["https://f95zone.to/", "unsupported", false],
      ["https://example.com/file/example", "unsupported", false],
    ]) {
      const result = classifyMaskedDirectContext(new URL(url), { isSupportedExternalHost: isExternalHost });
      assert.deepStrictEqual(result, { kind: usesCore ? "f95-core" : "unsupported", route, usesCore });
    }
    const sandbox = createDomSandbox("https://datanodes.to/file/example");
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const repository = loadModule("addons/masked-direct-addon/src/ports/routeContextRepository.js");
      const now = Date.now();
      repository.writeRouteContext({ ownerTabId: "tab-1", requestId: "req-1", host: "datanodes.to", createdAt: now });
      assert.strictEqual(repository.readRouteContext("f95ue_tab", { expectedRequestId: "req-1", expectedHost: "datanodes.to" }).requestId, "req-1");
      assert.strictEqual(repository.readRouteContext("f95ue_tab", { expectedRequestId: "wrong" }), null);
      repository.writeRouteContext({ ownerTabId: "tab-1", requestId: "expired", host: "datanodes.to", createdAt: now - 5 * 60 * 1000 });
      assert.strictEqual(repository.readRouteContext(), null);
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("TEST-ADDONS-01 aliases, storage compatibility, Site Repair ownership, and API fallbacks stay bounded", async () => {
    const catalog = loadModule("src/services/addons/catalog.js");
    assert.strictEqual(catalog.getCanonicalAddonId("image-repair-addon"), "site-repair-addon");
    assert.strictEqual(catalog.getCanonicalAddonId("example-addon-legacy"), "example-addon");
    const siteRepair = ADDON_MANIFEST.addons.find((entry) => entry.id === "site-repair-addon");
    assert.deepStrictEqual(siteRepair.legacyIds, ["image-repair-addon"]);
    const libraryConstants = fs.readFileSync(path.join(ROOT, "addons/library-addon/src/constants.js"), "utf8");
    assert.match(libraryConstants, /library|libraryRecords|libraryMigrationV1Done/);
    assert.ok(fs.existsSync(path.join(ROOT, "addons/site-repair-addon/src/repairs/imageAttachments/imageRepair.js")));

    for (const action of ["page.getContext", "observer.waitFor", "ui.dialog.update"]) {
      let fallbackCalls = 0;
      const result = await invokeOptionalCoreAction(
        { invokeCoreAction: async () => ({ ok: false, reason: "unsupported_action" }) },
        action,
        {},
        async () => { fallbackCalls += 1; return { ok: true, value: { fallback: true, action } }; },
      );
      assert.deepStrictEqual(result, { ok: true, value: { fallback: true, action } });
      assert.strictEqual(fallbackCalls, 1, action);
    }
    let fallbackCalls = 0;
    const rejected = await invokeOptionalCoreAction(
      { invokeCoreAction: async () => ({ ok: false, reason: "permission_denied" }) },
      "page.getContext",
      {},
      async () => { fallbackCalls += 1; return { ok: true }; },
    );
    assert.deepStrictEqual(rejected, { ok: false, reason: "permission_denied" });
    assert.strictEqual(fallbackCalls, 0);
  });

  runTest("TEST-ADDONS-01 smoke-builds every manifest entry without repository mutation", async () => {
    const result = await addonBuildTools.runSmokeBuild({ modes: ["regular", "release"] });
    assert.strictEqual(result.validation.unchanged, true);
    assert.strictEqual(result.validation.versionsUpdated, false);
    assert.strictEqual(result.validation.cacheUpdated, false);
    assert.strictEqual(result.validation.trackedDistUpdated, false);
    assert.strictEqual(result.builds.length, ADDON_MANIFEST.addons.length * 2);
    for (const entry of ADDON_MANIFEST.addons) {
      for (const mode of ["regular", "release"]) {
        const build = result.builds.find((candidate) => candidate.id === entry.id && candidate.mode === mode);
        matrixAssert(Boolean(build), {
          addon: entry.id, route: "all", transition: `smoke-${mode}`, policy: "non-mutating-build",
          message: "manifest entry did not produce a smoke bundle",
        });
        assert.strictEqual(build.outputHasTimestamps, false, `${entry.id}:${mode}`);
        assert.strictEqual(build.outputHasAbsolutePaths, false, `${entry.id}:${mode}`);
      }
    }
  });
};
