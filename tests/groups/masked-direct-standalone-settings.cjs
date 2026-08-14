"use strict";

module.exports = function registerMaskedDirectStandaloneSettings(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createBridge(value) {
    return {
      async invokeCoreAction(action) {
        assert.strictEqual(action, "storage.get");
        return { ok: true, value };
      },
    };
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-01 exposes a default-off user-intent toggle",
    () => {
      const { ADDON_PANEL_SETTINGS, ADDON_SETTINGS_DEFAULT } = loadModule(
        "addons/masked-direct-addon/src/app/settings.js",
      );
      const setting = ADDON_PANEL_SETTINGS.find(
        (entry) => entry.path === "automateRegardless",
      );
      assert.ok(setting);
      assert.strictEqual(
        setting.text,
        "Automate supported hosts regardless of F95 request",
      );
      assert.match(setting.tooltip, /manually opened tabs remain open/i);
      assert.match(setting.tooltip, /saved preference stays off by default/i);
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.automateRegardless, false);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-01 sanitizes old settings without enabling standalone",
    async () => {
      const mirrored = [];
      const { createMaskedDirectSettings } = loadModule(
        "addons/masked-direct-addon/src/app/settings.js",
      );
      const settings = createMaskedDirectSettings({
        bridge: createBridge({
          skipMaskedLink: true,
          directDownloadLinks: true,
        }),
        GMApi: null,
        onSettingsRead: async (value) => mirrored.push(value.automateRegardless),
      });
      const value = await settings.read(true);
      assert.strictEqual(value.automateRegardless, false);
      assert.deepStrictEqual(mirrored, [false]);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-01 mirrors explicit intent without effective override",
    async () => {
      const { createMaskedDirectSettings } = loadModule(
        "addons/masked-direct-addon/src/app/settings.js",
      );
      for (const userPreference of [false, true]) {
        const mirrored = [];
        const settings = createMaskedDirectSettings({
          bridge: createBridge({ automateRegardless: userPreference }),
          GMApi: null,
          onSettingsRead: async (value) =>
            mirrored.push(value.automateRegardless),
        });
        const value = await settings.read(true);
        assert.strictEqual(value.automateRegardless, userPreference);
        assert.deepStrictEqual(mirrored, [userPreference]);
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-01 refresh rereads and mirrors saved intent",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
      const events = [];
      try {
        const { ADDON_COMMAND_EVENT } = loadModule(
          "addons/masked-direct-addon/src/constants.js",
        );
        const { createMaskedDirectLifecycle } = loadModule(
          "addons/masked-direct-addon/src/app/lifecycle.js",
        );
        const lifecycle = createMaskedDirectLifecycle({
          bridge: {},
          runtime: { addonId: "masked-direct-addon" },
          state: { blockedByCore: false, enabled: true },
          settings: {
            invalidate: () => events.push("invalidate"),
            read: async () => events.push("mirror"),
            storageSet: async () => {},
          },
          styles: { register: async () => {}, unregister: async () => {} },
          registration: { publishStatus() {}, acknowledgeTeardown() {} },
          pageBehavior: { apply: async () => events.push("apply") },
          clearOwnedResources() {},
          diagnostics: { warn() {} },
        });
        lifecycle.bindCommands();
        sandbox.window.dispatchEvent(
          new CustomEvent(ADDON_COMMAND_EVENT, {
            detail: { addonId: "masked-direct-addon", command: "refresh" },
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepStrictEqual(events, ["invalidate", "mirror", "apply"]);
        await lifecycle.teardown("test");
      } finally {
        sandbox.restore();
      }
    },
  );
};
