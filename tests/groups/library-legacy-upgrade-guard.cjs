"use strict";

module.exports = function registerLibraryLegacyUpgradeGuardGroup(context) {
  const { assert, createDomSandbox, fs, loadModule, path, ROOT, runTest } = context;

  function storage(values) {
    let writes = 0;
    return {
      async get(key, fallback) {
        return Object.hasOwn(values, key) ? values[key] : fallback;
      },
      async set() { writes += 1; },
      writes: () => writes,
    };
  }

  runTest("LIBRARY-LEGACY-UPGRADE-GUARD-01 classifies bridge fresh and legacy states read-only", async () => {
    const { detectLegacyUpgradeState } = loadModule(
      "addons/library-addon/src/app/legacyUpgradeGuard.js",
    );
    const bridge = storage({ libraryMigrationV1Done: true, libraryRecords: null });
    assert.strictEqual((await detectLegacyUpgradeState(bridge)).state, "supported_bridge");
    const fresh = storage({});
    assert.strictEqual((await detectLegacyUpgradeState(fresh)).state, "fresh");
    const legacy = storage({ libraryRecords: [{ threadId: "42" }] });
    const blocked = await detectLegacyUpgradeState(legacy);
    assert.strictEqual(blocked.reason, "upgrade_required");
    assert.strictEqual(blocked.bridgeVersion, "1.2.2");
    assert.strictEqual(bridge.writes() + fresh.writes() + legacy.writes(), 0);
  });

  runTest("LIBRARY-LEGACY-UPGRADE-GUARD-01 treats inconsistent marker plus payload as unsupported", async () => {
    const { detectLegacyUpgradeState } = loadModule(
      "addons/library-addon/src/app/legacyUpgradeGuard.js",
    );
    const result = await detectLegacyUpgradeState(storage({
      libraryMigrationV1Done: true,
      libraryRecords: { 42: { threadId: "42" } },
    }));
    assert.strictEqual(result.reason, "upgrade_required");
    assert.strictEqual(result.markerPresent, true);
  });

  runTest("LIBRARY-LEGACY-UPGRADE-GUARD-01 removes conversion and guards before schema writes", () => {
    const service = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/library/service.js"),
      "utf8",
    );
    const guard = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/app/legacyUpgradeGuard.js"),
      "utf8",
    );
    assert.doesNotMatch(service, /runLegacyMigration|storage\.set\(LIBRARY_LEGACY_KEY/);
    assert.ok(guard.indexOf("detectLegacyUpgradeState(storage)") < guard.indexOf("ensureLibrarySchema(core)"));
    assert.ok(guard.indexOf("ensureLibrarySchema(core)") < guard.indexOf("runPinnedIndexMigration()"));
  });

  runTest("LIBRARY-LEGACY-UPGRADE-GUARD-01 message preserves data and names the bridge", () => {
    const { getLegacyUpgradeMessage } = loadModule(
      "addons/library-addon/src/app/legacyUpgradeGuard.js",
    );
    const message = getLegacyUpgradeMessage();
    assert.match(message, /upgrade_required/);
    assert.match(message, /not modified/);
    assert.match(message, /v1\.2\.2/);
  });

  runTest("LIBRARY-LEGACY-UPGRADE-GUARD-01 bootstrap blocks writes and lifecycle activation", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/threads/legacy.42/");
    try {
      const { createLibraryAddonApp } = loadModule(
        "addons/library-addon/src/app/createLibraryAddonApp.js",
        { loader: { ".css": "text", ".html": "text" } },
      );
      const actions = [];
      let commandHandler = null;
      const core = {
        registerAddon(payload) { actions.push(["register", payload]); },
        updateStatus(status, message) { actions.push(["status", { status, message }]); },
        bindAddonCommands(handler) { commandHandler = handler; return () => {}; },
        notifyTeardownComplete() {},
        async invokeCoreAction(action, payload) {
          actions.push([action, payload]);
          if (action === "addon.access") {
            return { ok: true, value: { blocked: false, enabled: true } };
          }
          if (action === "storage.get") {
            if (payload.key === "libraryRecords") {
              return { ok: true, value: [{ threadId: "42", title: "Legacy" }] };
            }
            return { ok: true, value: payload.defaultValue };
          }
          return { ok: true, value: null };
        },
      };
      const app = createLibraryAddonApp({
        core,
        runtime: {
          addonId: "library-addon",
          addonName: "Library",
          addonVersion: "next",
          addonDescription: "Library",
          capabilities: [],
          requiresCore: true,
          pageScopes: ["f95zone"],
          runtimeMode: "core-required",
          matches: ["*://f95zone.to/*"],
        },
      });
      await app.bootstrap();
      commandHandler?.({ addonId: "library-addon", command: "enable" });
      commandHandler?.({ addonId: "library-addon", command: "panel-action", actionId: "save-current-thread" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(app.getRuntimeSnapshot().upgradeRequired, true);
      assert.strictEqual(app.getRuntimeSnapshot().enabled, false);
      assert.ok(actions.some(([action, value]) => action === "status" && value.status === "broken" && /upgrade_required/.test(value.message)));
      assert.strictEqual(actions.some(([action]) => action.startsWith("idb.")), false);
      assert.strictEqual(actions.some(([action]) => action === "storage.set"), false);
      assert.strictEqual(actions.some(([action]) => action === "ui.mount"), false);
    } finally {
      sandbox.restore();
    }
  });
};
