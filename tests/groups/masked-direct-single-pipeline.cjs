"use strict";

module.exports = ({ assert, loadModule, runTest, createDomSandbox }) => {
  const base = "addons/masked-direct-addon/src/";
  const { isAutomationEnabled } = loadModule(base + "shared/utils.js");
  const policyModule = () => loadModule(base + "ports/automationSettingsRepository.js");
  function memoryGM(initial = null) {
    let value = initial;
    return {
      getValue: async () => value,
      setValue: async (_key, next) => {
        value = structuredClone(next);
      },
      snapshot: () => structuredClone(value),
    };
  }

  runTest(
    "MASKED-DIRECT-SINGLE-01 defaults on without core probes and preserves legacy false",
    async () => {
      const { createAutomationSettingsRepository: create, AUTOMATION_SETTINGS_KEY: key } =
        policyModule();
      assert.strictEqual(key, "f95ue.addon.maskedDirect.standaloneAutomationPolicy");
      const fresh = create({ GMApi: memoryGM() });
      const initial = await fresh.read();
      assert.strictEqual(initial.automateRegardless, true);
      assert.strictEqual(isAutomationEnabled(initial), true);
      assert.strictEqual(fresh.getEffectivePolicy, undefined);
      assert.strictEqual(initial.userPreference, undefined);
      assert.strictEqual(initial.observedAt, undefined);
      assert.strictEqual(initial.effectiveAutomateRegardless, undefined);
      assert.strictEqual(initial.autoCloseTabs, true);
      assert.strictEqual(initial.downloadPageCloseDelayMs, 3500);
      assert.strictEqual(fresh.recordMissingCore, undefined);
      assert.strictEqual(fresh.recordCoreProbing, undefined);
      for (const coreState of ["probing", "confirmed-missing", "available"]) {
        const repo = create({
          GMApi: memoryGM({
            version: 1,
            userPreference: false,
            forcedByMissingCore: true,
            coreState,
            observedAt: 1,
            expiresAt: Date.now() + 999999,
          }),
        });
        assert.strictEqual((await repo.read()).automateRegardless, false);
      }
      const saved = create({
        GMApi: memoryGM({ version: 1, userPreference: true, coreState: "probing" }),
      });
      assert.strictEqual((await saved.read()).needsSettingsRefresh, true);
      assert.strictEqual(isAutomationEnabled(await saved.read()), false);
      await saved.updateSettings({ enabled: true });
      assert.strictEqual(
        isAutomationEnabled(await saved.read()),
        false,
        "partial mirrors cannot discard unknown legacy host switches",
      );
      await saved.updateSettings({ automateRegardless: true, directDownloadPackages: {} });
      assert.strictEqual(
        isAutomationEnabled(await saved.read()),
        false,
        "unknown enabled choice also requires a full read",
      );
      await saved.updateSettings({
        enabled: true,
        automateRegardless: true,
        directDownloadPackages: { pixeldrain: false },
      });
      assert.strictEqual(isAutomationEnabled(await saved.read()), true);
      assert.strictEqual((await saved.read()).directDownloadPackages.pixeldrain, false);
    },
  );

  runTest(
    "MASKED-DIRECT-SINGLE-02 mirrors durable enabled host and close preferences and fails closed",
    async () => {
      const { createAutomationSettingsRepository: create } = policyModule();
      const gm = memoryGM();
      const repo = create({ GMApi: gm });
      await repo.updateSettings({
        enabled: false,
        automateRegardless: true,
        autoCloseTabs: false,
        directDownloadPackages: { pixeldrain: false },
        downloadPageCloseDelayMs: 100,
      });
      let automationSettings = await create({ GMApi: gm }).read();
      assert.strictEqual(isAutomationEnabled(automationSettings), false);
      assert.strictEqual(
        automationSettings.automateRegardless,
        true,
        "enabled and the automation preference remain distinct",
      );
      assert.strictEqual(automationSettings.directDownloadPackages.pixeldrain, false);
      assert.strictEqual(automationSettings.autoCloseTabs, false);
      assert.strictEqual(automationSettings.downloadPageCloseDelayMs, 3000);
      await repo.updateSettings({ enabled: true });
      automationSettings = await repo.read();
      assert.strictEqual(isAutomationEnabled(automationSettings), true);
      assert.strictEqual(automationSettings.directDownloadPackages.pixeldrain, false);
      for (const raw of [
        { version: 99 },
        [],
        "invalid",
        { version: 2, userPreference: true, enabled: "false" },
      ]) {
        assert.strictEqual(
          (await create({ GMApi: memoryGM(raw) }).read()).automateRegardless,
          false,
        );
      }
      assert.strictEqual(
        (
          await create({
            GMApi: {
              getValue: async () => {
                throw new Error("unavailable");
              },
            },
          }).read()
        ).automateRegardless,
        false,
      );
      assert.strictEqual((await create().read()).automateRegardless, false);
      const stored = gm.snapshot();
      assert.strictEqual(stored.version, 2);
      assert.strictEqual(
        stored.userPreference,
        true,
        "existing wire preference is preserved for older copies",
      );
      assert.strictEqual(stored.observedAt, undefined, "no unused timestamp is written");
      assert.strictEqual(stored.effectiveAutomateRegardless, undefined);
    },
  );

  runTest(
    "MASKED-DIRECT-SETTINGS-07 preserves v2 false choices without rewriting on read",
    async () => {
      const { createAutomationSettingsRepository: create } = policyModule();
      const raw = {
        version: 2,
        enabled: true,
        userPreference: false,
        skipMaskedPage: false,
        autoCloseTabs: false,
        downloadPageCloseDelayMs: 6000,
        directDownloadPackages: { gofile: false },
        observedAt: 42,
        forcedByMissingCore: true,
        coreState: "available",
      };
      const gm = memoryGM(raw),
        repo = create({ GMApi: gm });
      const initial = await repo.read();
      assert.strictEqual(isAutomationEnabled(initial), false);
      assert.deepStrictEqual(gm.snapshot(), raw, "reading is not a migration/write");
      await repo.updateSettings({ downloadPageCloseDelayMs: 7000 });
      const saved = await repo.read();
      assert.strictEqual(saved.automateRegardless, false);
      assert.strictEqual(saved.skipMaskedPage, false);
      assert.strictEqual(saved.autoCloseTabs, false);
      assert.strictEqual(saved.directDownloadPackages.gofile, false);
      assert.strictEqual(saved.downloadPageCloseDelayMs, 7000);
      assert.strictEqual(gm.snapshot().coreState, undefined);
      assert.strictEqual(gm.snapshot().observedAt, undefined);
      assert.strictEqual(gm.snapshot().userPreference, false);
    },
  );

  runTest("MASKED-DIRECT-SETTINGS-08 write failure retains saved preferences", async () => {
    const { createAutomationSettingsRepository: create } = policyModule();
    const raw = {
      version: 2,
      enabled: false,
      userPreference: false,
      autoCloseTabs: false,
      directDownloadPackages: { pixeldrain: false },
    };
    const repo = create({
      GMApi: {
        getValue: async () => raw,
        setValue: async () => {
          throw new Error("write failed");
        },
      },
    });
    const before = await repo.read();
    const result = await repo.updateSettings({
      enabled: true,
      automateRegardless: true,
      autoCloseTabs: true,
    });
    assert.deepStrictEqual(result, before);
    assert.deepStrictEqual(await repo.read(), before);
    assert.strictEqual(isAutomationEnabled(result), false);
  });

  runTest(
    "MASKED-DIRECT-SINGLE-03 gates hosts and list routes without origin or core authorization",
    async () => {
      for (const [href, expected] of [
        ["https://pixeldrain.com/u/fixture", "standalone"],
        ["https://pixeldrain.com/l/fixture", "blocked"],
        ["https://drive.google.com/drive/u/0/folders/fixture", "blocked"],
        ["https://unlisted.pixeldrain.com/u/fixture", "blocked"],
      ]) {
        const sandbox = createDomSandbox(href);
        try {
          const { createDownloadPageController } = loadModule(
            base + "app/contexts/downloadPageController.js",
          );
          const { normalizeDirectDownloadHost } = loadModule(base + "hosts/metadata.js");
          const host = normalizeDirectDownloadHost(location.hostname);
          let automationSettings = {
            enabled: true,
            automateRegardless: true,
            directDownloadPackages: {},
          };
          const controller = createDownloadPageController({
            addonId: "test",
            debugLog() {},
            handlers: {},
            getIsEnabled: () => true,
            getIsBlockedByCore: () => {
              throw new Error("core must not be consulted");
            },
            getAutomationSettings: async () => automationSettings,
          });
          assert.strictEqual((await controller.decideHostAutomation(host)).mode, expected, href);
          automationSettings = {
            ...automationSettings,
            directDownloadPackages: { pixeldrain: false },
          };
          if (href === "https://pixeldrain.com/u/fixture") {
            assert.strictEqual(
              (await controller.decideHostAutomation(host)).reason,
              "host_disabled",
            );
          }
        } finally {
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-SINGLE-04 closing requires final-action evidence and honors delay/settings/teardown",
    async () => {
      const { createDirectDownloadFlowController } = loadModule(
        base + "domain/directDownload/flowController.js",
      );
      const defaults = {
        enabled: true,
        automateRegardless: true,
        autoCloseTabs: true,
        downloadPageCloseDelayMs: 4500,
      };
      for (const scenario of [
        "success",
        "healthy-only",
        "disabled",
        "automation-off",
        "refresh-needed",
        "unavailable",
        "host-off",
        "close-off",
        "challenge",
        "dispose",
        "failure",
        "refused",
      ]) {
        let closes = 0,
          callback = null,
          delay,
          settled = 0,
          cleared = 0;
        let automationSettings = { ...defaults };
        const flow = createDirectDownloadFlowController({
          addonId: "test",
          diagnostics: { warn() {} },
          getAutomationSettings: async () => automationSettings,
          closeTab: () => {
            closes += 1;
            if (scenario === "refused") throw new Error("browser refused");
          },
          setTimeoutFn: (fn, ms) => {
            callback = fn;
            delay = ms;
            return 1;
          },
          clearTimeoutFn: () => {
            cleared += 1;
          },
        });
        const context = flow.createHostExecutionContext(
          { host: "pixeldrain.com", automationSettings },
          {
            canClose: () => scenario !== "challenge",
            onSettled: () => {
              settled += 1;
            },
          },
        );
        context.reportAddonHealthy(scenario === "healthy-only" ? {} : { downloadTriggered: true });
        context.reportAddonHealthy({ downloadTriggered: true });
        if (scenario === "healthy-only") {
          assert.strictEqual(callback, null);
          continue;
        }
        assert.strictEqual(delay, 4500);
        if (scenario === "disabled") automationSettings.enabled = false;
        if (scenario === "automation-off") automationSettings.automateRegardless = false;
        if (scenario === "refresh-needed") automationSettings.needsSettingsRefresh = true;
        if (scenario === "unavailable") automationSettings = null;
        if (scenario === "host-off")
          automationSettings.directDownloadPackages = { pixeldrain: false };
        if (scenario === "close-off") automationSettings.autoCloseTabs = false;
        if (scenario === "dispose") context.dispose();
        if (scenario === "failure") await context.notifyMainFailure("host", "failed");
        await callback();
        assert.strictEqual(closes, ["success", "refused"].includes(scenario) ? 1 : 0, scenario);
        assert.ok(settled > 0);
        if (["dispose", "failure"].includes(scenario)) assert.strictEqual(cleared, 1);
      }
    },
  );

  runTest(
    "MASKED-DIRECT-SINGLE-05 F95 settings preserve false choices and mirror changes",
    async () => {
      const { createMaskedDirectSettings, ADDON_SETTINGS_DEFAULT } = loadModule(
        base + "app/settings.js",
      );
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.automateRegardless, true);
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.autoCloseTabs, true);
      let mirrored,
        enabled,
        ok = true;
      const settings = createMaskedDirectSettings({
        bridge: {
          invokeCoreAction: async (action) => ({
            ok,
            value:
              action === "storage.get"
                ? {
                    automateRegardless: false,
                    autoCloseTabs: false,
                    directDownloadPackages: { gofile: false },
                  }
                : null,
          }),
        },
        onSettingsRead: (flags) => {
          mirrored = flags;
        },
        onEnabledChanged: (value) => {
          enabled = value;
        },
      });
      await settings.read(true);
      assert.strictEqual(mirrored.automateRegardless, false);
      assert.strictEqual(mirrored.autoCloseTabs, false);
      assert.strictEqual(mirrored.directDownloadPackages.gofile, false);
      await settings.storageSet("enabled", false);
      assert.strictEqual(enabled, false);
      mirrored = null;
      ok = false;
      await settings.read(true);
      assert.strictEqual(
        mirrored,
        null,
        "failed reads cannot overwrite a saved automationSettings with defaults",
      );
    },
  );

  runTest(
    "MASKED-DIRECT-SINGLE-06 controller passes automationSettings to local closing and cancels on pagehide",
    async () => {
      for (const leavePage of [false, true]) {
        const sandbox = createDomSandbox("https://krakenfiles.com/view/fixture/file.html");
        try {
          Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
          const { createDownloadPageController } = loadModule(
            base + "app/contexts/downloadPageController.js",
          );
          const { createDirectDownloadFlowController } = loadModule(
            base + "domain/directDownload/flowController.js",
          );
          const automationSettings = {
            enabled: true,
            automateRegardless: true,
            autoCloseTabs: true,
            downloadPageCloseDelayMs: 3500,
          };
          let callback,
            closes = 0,
            handlerRuns = 0,
            disposed = 0;
          const flow = createDirectDownloadFlowController({
            addonId: "test",
            diagnostics: { warn() {} },
            getAutomationSettings: async () => automationSettings,
            closeTab: () => {
              closes += 1;
            },
            setTimeoutFn: (fn) => {
              callback = fn;
              return 1;
            },
            clearTimeoutFn() {},
          });
          const controller = createDownloadPageController({
            addonId: "test",
            debugLog() {},
            getIsEnabled: () => true,
            getAutomationSettings: async () => automationSettings,
            createHostExecutionContext: flow.createHostExecutionContext,
            createChallengeMonitor: () => ({
              start() {},
              waitUntilClear: async () => true,
              isBlocked: () => false,
              dispose: () => {
                disposed += 1;
              },
            }),
            handlers: {
              "krakenfiles.com": async (_gate, decision, context) => {
                handlerRuns += 1;
                assert.strictEqual(decision.automationSettings, automationSettings);
                context.reportAddonHealthy({ downloadTriggered: true });
              },
            },
          });
          await controller.runDownloadPageHooks();
          await controller.runDownloadPageHooks();
          assert.strictEqual(handlerRuns, 1, "one-shot guard prevents repeating the final action");
          assert.strictEqual(typeof callback, "function");
          if (leavePage) window.dispatchEvent(new window.Event("pagehide"));
          await callback();
          assert.strictEqual(closes, leavePage ? 0 : 1);
          assert.ok(disposed > 0);
        } finally {
          sandbox.restore();
        }
      }
    },
  );
};
