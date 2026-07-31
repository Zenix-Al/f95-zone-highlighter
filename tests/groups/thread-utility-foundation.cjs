"use strict";

module.exports = function registerThreadUtilityFoundation(context) {
  const {
    ADDON_MANIFEST,
    ROOT,
    TRUSTED_ADDON_CATALOG,
    assert,
    createDomSandbox,
    fs,
    loadModule,
    path,
    runTest,
  } = context;

  const addonId = "thread-utility-addon";
  const expectedCapabilities = [
    "feature",
    "page",
    "storage",
    "toast",
    "ui.style",
    "ui.mount",
    "ui.dock",
    "ui.dialog",
  ];

  function runtime() {
    return {
      addonId,
      addonName: "F95UE Thread Utility Add-on",
      addonVersion: "0.1.0",
      addonDescription: "Thread utility fixture",
      capabilities: expectedCapabilities,
      requiresCore: true,
      pageScopes: ["thread"],
      runtimeMode: "core-required",
      matches: ["*://f95zone.to/threads/*"],
    };
  }

  function createCore({
    access = { ok: true, value: { blocked: false, enabled: true } },
    pageScopes = ["f95zone", "thread"],
  } = {}) {
    const actions = [];
    let commandHandler = null;
    const core = {
      actions,
      registerAddon(descriptor) {
        actions.push({ action: "register", descriptor });
        return { ok: true };
      },
      updateStatus(status, statusMessage) {
        actions.push({ action: "status", status, statusMessage });
        return { ok: true };
      },
      bindAddonCommands(handler) {
        commandHandler = handler;
        return () => {
          commandHandler = null;
        };
      },
      notifyTeardownComplete(reason) {
        actions.push({ action: "teardown-ack", reason });
        return { ok: true };
      },
      async invokeCoreAction(action, payload) {
        actions.push({ action, payload });
        if (action === "addon.access") return access;
        if (action === "page.getContext") {
          return { ok: true, value: { pageScopes, pageType: pageScopes.at(-1) || "other" } };
        }
        if (action === "storage.get") {
          return { ok: true, value: { showLauncher: true } };
        }
        return { ok: true, value: {} };
      },
      command(detail) {
        commandHandler?.(detail);
      },
    };
    return core;
  }

  function loadApp() {
    return loadModule(
      "addons/thread-utility-addon/src/app/createThreadUtilityApp.js",
      { loader: { ".css": "text" } },
    ).createThreadUtilityApp;
  }

  runTest("THREAD-UTILITY-FOUNDATION-01 validates manifest metadata and catalog projection", () => {
    const manifestEntry = ADDON_MANIFEST.addons.find((entry) => entry.id === addonId);
    const catalogEntry = TRUSTED_ADDON_CATALOG.find((entry) => entry.id === addonId);
    assert.ok(manifestEntry, "Thread Utility manifest entry is missing");
    assert.ok(catalogEntry, "Thread Utility trusted catalog entry is missing");
    assert.strictEqual(manifestEntry.name, "F95UE Thread Utility Add-on");
    assert.match(manifestEntry.version, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(manifestEntry.runtimeMode, "core-required");
    assert.deepStrictEqual(manifestEntry.pageScopes, ["thread"]);
    assert.deepStrictEqual(manifestEntry.matches, ["*://f95zone.to/threads/*"]);
    assert.deepStrictEqual(manifestEntry.grants, ["none"]);
    assert.strictEqual(manifestEntry.runAt, "document-idle");
    assert.deepStrictEqual(manifestEntry.capabilities, expectedCapabilities);
    for (const field of [
      "id",
      "name",
      "description",
      "version",
      "runtimeMode",
      "pageScopes",
      "matches",
      "capabilities",
    ]) {
      assert.deepStrictEqual(catalogEntry[field], manifestEntry[field], `Catalog drift: ${field}`);
    }
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 exposes core enable recovery while disabled", () => {
    const sandbox = createDomSandbox();
    try {
      const { createAddonPanelActions } = loadModule(
        "src/ui/components/addons/addonPanelActions.js",
      );
      const actions = createAddonPanelActions(document, {
        id: addonId,
        status: "disabled",
        capabilities: expectedCapabilities,
        canEnable: true,
        activeOnPage: true,
        installedSeenAt: Date.now(),
        panelActions: [],
      });
      const button = actions.querySelector('[data-addon-action="toggle-addon-feature"]');
      assert.ok(button, "Disabled Thread Utility must expose an Enable control");
      assert.strictEqual(button.textContent, "Enable");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 authorizes its page dock launcher", () => {
    const { actionUiMount } = loadModule(
      "src/services/addons/actions/families/ui.js",
    );
    let mounted = null;
    const result = actionUiMount(
      addonId,
      {
        mountId: "thread-utility-launcher",
        slot: "page.dock",
        html: "<button>Thread Utility</button>",
      },
      10_000,
      (value) => String(value || ""),
      (id, payload) => {
        mounted = { id, payload };
        return { ok: true };
      },
      new Set(expectedCapabilities),
    );
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(mounted?.id, addonId);
    assert.strictEqual(mounted?.payload?.slot, "page.dock");
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 follows canonical source boundaries", () => {
    const sourceRoot = path.join(ROOT, "addons", addonId, "src");
    for (const relativePath of [
      "main.js",
      "constants.js",
      "core/adaptor.js",
      "app/createThreadUtilityApp.js",
      "app/commands.js",
      "app/lifecycle.js",
      "app/registration.js",
      "app/settings.js",
      "app/uiController.js",
      "domain/state.js",
      "ui/bindings.js",
      "ui/launcher.js",
      "ui/palette.js",
      "ui/threadUtility.css",
    ]) {
      assert.ok(fs.existsSync(path.join(sourceRoot, relativePath)), `Missing ${relativePath}`);
    }
    const foundationSources = [
      "main.js",
      "app/createThreadUtilityApp.js",
      "app/uiController.js",
      "ui/bindings.js",
    ].map((entry) => fs.readFileSync(path.join(sourceRoot, entry), "utf8"))
      .join("\n");
    assert.doesNotMatch(foundationSources, /MutationObserver|indexedDB|setInterval|GM[._]/);
    assert.doesNotMatch(foundationSources, /threadStarterPost|bbWrapper/);
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 exits quietly when required core ping fails", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "addons", addonId, "src", "main.js"),
      "utf8",
    );
    const pingIndex = source.indexOf("await waitForCorePing(core)");
    const returnIndex = source.indexOf('runtime.runtimeMode === "core-required") return');
    const bootstrapIndex = source.indexOf("await app.bootstrap()");
    assert.ok(pingIndex >= 0 && returnIndex > pingIndex && bootstrapIndex > returnIndex);
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 blocks UI before access and outside thread scope", async () => {
    const sandbox = createDomSandbox();
    try {
      const createThreadUtilityApp = loadApp();
      for (const options of [
        { access: { ok: true, value: { blocked: true, enabled: true } } },
        { access: { ok: true, value: { blocked: false, enabled: false } } },
        { pageScopes: ["f95zone"] },
      ]) {
        const core = createCore(options);
        const app = createThreadUtilityApp({ core, runtime: runtime() });
        await app.bootstrap();
        assert.strictEqual(app.getState().enabled, false);
        assert.strictEqual(
          core.actions.some(({ action }) => action === "ui.dock.setButtons"),
          false,
        );
        await app.getLifecycle().teardown("foundation-test");
      }
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 keeps initial registration active until persisted access resolves", async () => {
    const sandbox = createDomSandbox();
    try {
      let resolveAccess;
      const access = new Promise((resolve) => {
        resolveAccess = resolve;
      });
      const core = createCore({ access });
      const app = loadApp()({ core, runtime: runtime() });
      const bootstrap = app.bootstrap();
      const firstRegistration = core.actions.find(({ action }) => action === "register");
      assert.ok(firstRegistration, "Thread Utility must register before requesting access");
      assert.strictEqual(
        firstRegistration.descriptor.status,
        "installed",
        "Initial registration must not disable its own core handshake",
      );
      resolveAccess({ ok: true, value: { blocked: false, enabled: true } });
      await bootstrap;
      assert.strictEqual(app.getState().enabled, true);
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.dock.setButtons").length,
        1,
      );
      await app.getLifecycle().teardown("handshake-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-FOUNDATION-01 mounts once and opens one empty palette", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore();
      const app = loadApp()({ core, runtime: runtime() });
      await app.bootstrap();
      assert.strictEqual(app.getState().enabled, true);
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.style.register").length,
        1,
      );
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.dock.setButtons").length,
        1,
      );

      await app.getLifecycle().enable("duplicate-enable");
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.style.register").length,
        1,
      );
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.dock.setButtons").length,
        1,
      );

      core.command({ command: "dock-action", actionId: "open-palette" });
      await new Promise((resolve) => setImmediate(resolve));

      const dialogActions = core.actions.filter(({ action }) => action === "ui.dialog.open");
      assert.strictEqual(dialogActions.length, 1);
      assert.strictEqual(dialogActions[0].payload.dialogId, "thread-utility-palette");
      assert.match(dialogActions[0].payload.html, /threadUtilityPalette/);
      assert.doesNotMatch(dialogActions[0].payload.html, /download|description/i);
      await app.getLifecycle().teardown("foundation-test");
    } finally {
      sandbox.restore();
    }
  });
};
