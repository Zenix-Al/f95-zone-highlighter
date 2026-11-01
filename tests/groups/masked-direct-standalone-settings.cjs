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
    "MASKED-DIRECT-STANDALONE-SETTINGS-01 exposes default-on automation and independent local closing",
    () => {
      const { ADDON_PANEL_SETTINGS, ADDON_SETTINGS_DEFAULT } = loadModule(
        "addons/masked-direct-addon/src/app/settings.js",
      );
      const setting = ADDON_PANEL_SETTINGS.find((entry) => entry.path === "automateRegardless");
      assert.ok(setting);
      assert.strictEqual(setting.text, "Automate supported host pages");
      assert.match(setting.tooltip, /regardless of where the tab came from/i);
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.automateRegardless, true);
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.autoCloseTabs, true);
      const { TIMINGS } = loadModule("addons/masked-direct-addon/src/hosts/constants.js");
      const { DEFAULT_DOWNLOAD_CLOSE_DELAY_MS, MIN_DOWNLOAD_CLOSE_DELAY_MS } = loadModule(
        "addons/masked-direct-addon/src/shared/downloadCloseDelay.js",
      );
      assert.strictEqual(DEFAULT_DOWNLOAD_CLOSE_DELAY_MS, TIMINGS.DOWNLOAD_PAGE_CLOSE_DELAY);
      assert.strictEqual(MIN_DOWNLOAD_CLOSE_DELAY_MS, TIMINGS.MIN_DOWNLOAD_PAGE_CLOSE_DELAY);
      assert.strictEqual(
        ADDON_SETTINGS_DEFAULT.downloadPageCloseDelayMs,
        TIMINGS.DOWNLOAD_PAGE_CLOSE_DELAY,
      );
      assert.ok(ADDON_PANEL_SETTINGS.some((entry) => entry.path === "autoCloseTabs"));
      assert.ok(
        !ADDON_PANEL_SETTINGS.some((entry) =>
          ["skipMaskedLink", "directDownloadLinks"].includes(entry.id),
        ),
      );
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-02 uses defaults only when no automation choice exists",
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
      assert.strictEqual(value.automateRegardless, true);
      assert.deepStrictEqual(mirrored, [true]);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-03 mirrors explicit intent without effective override",
    async () => {
      const { createMaskedDirectSettings } = loadModule(
        "addons/masked-direct-addon/src/app/settings.js",
      );
      for (const userPreference of [false, true]) {
        const mirrored = [];
        const settings = createMaskedDirectSettings({
          bridge: createBridge({ automateRegardless: userPreference }),
          GMApi: null,
          onSettingsRead: async (value) => mirrored.push(value.automateRegardless),
        });
        const value = await settings.read(true);
        assert.strictEqual(value.automateRegardless, userPreference);
        assert.deepStrictEqual(mirrored, [userPreference]);
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SETTINGS-04 refresh rereads and mirrors saved intent",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
      const events = [];
      try {
        const { ADDON_COMMAND_EVENT } = loadModule(
          "addons/masked-direct-addon/src/app/lifecycle.js",
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
