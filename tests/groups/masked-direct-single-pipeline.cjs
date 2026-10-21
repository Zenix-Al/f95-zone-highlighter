"use strict";

module.exports = ({ assert, loadModule, runTest, createDomSandbox }) => {
  const base = "addons/masked-direct-addon/src/";
  const policyModule = () => loadModule(base + "ports/standaloneAutomationPolicyRepository.js");
  function memoryGM(initial = null) {
    let value = initial;
    return { getValue: async () => value, setValue: async (_key, next) => { value = structuredClone(next); } };
  }

  runTest("MASKED-DIRECT-SINGLE-01 defaults on without core probes and preserves legacy false", async () => {
    const { createStandaloneAutomationPolicyRepository: create, STANDALONE_AUTOMATION_POLICY_KEY: key } = policyModule();
    assert.strictEqual(key, "f95ue.addon.maskedDirect.standaloneAutomationPolicy");
    const fresh = create({ GMApi: memoryGM() });
    const initial = await fresh.getEffectivePolicy();
    assert.strictEqual(initial.effectiveAutomateRegardless, true);
    assert.strictEqual(initial.autoCloseTabs, true);
    assert.strictEqual(initial.downloadPageCloseDelayMs, 3500);
    assert.strictEqual(fresh.recordMissingCore, undefined);
    assert.strictEqual(fresh.recordCoreProbing, undefined);
    for (const coreState of ["probing", "confirmed-missing", "available"]) {
      const repo = create({ GMApi: memoryGM({ version: 1, userPreference: false,
        forcedByMissingCore: true, coreState, observedAt: 1, expiresAt: Date.now() + 999999 }) });
      assert.strictEqual((await repo.getEffectivePolicy()).effectiveAutomateRegardless, false);
    }
    const saved = create({ GMApi: memoryGM({ version: 1, userPreference: true, coreState: "probing" }) });
    assert.strictEqual((await saved.getEffectivePolicy()).needsSettingsRefresh, true);
    assert.strictEqual((await saved.getEffectivePolicy()).effectiveAutomateRegardless, false);
    await saved.updateSettings({ enabled: true });
    assert.strictEqual((await saved.getEffectivePolicy()).effectiveAutomateRegardless, false, "partial mirrors cannot discard unknown legacy host switches");
    await saved.updateSettings({ enabled: true, automateRegardless: true, directDownloadPackages: { pixeldrain: false } });
    assert.strictEqual((await saved.getEffectivePolicy()).effectiveAutomateRegardless, true);
    assert.strictEqual((await saved.getEffectivePolicy()).directDownloadPackages.pixeldrain, false);
  });

  runTest("MASKED-DIRECT-SINGLE-02 mirrors durable enabled host and close preferences and fails closed", async () => {
    const { createStandaloneAutomationPolicyRepository: create } = policyModule();
    const gm = memoryGM();
    const repo = create({ GMApi: gm });
    await repo.updateSettings({ enabled: false, automateRegardless: true, autoCloseTabs: false,
      directDownloadPackages: { pixeldrain: false }, downloadPageCloseDelayMs: 100 });
    let policy = await create({ GMApi: gm }).getEffectivePolicy();
    assert.strictEqual(policy.effectiveAutomateRegardless, false);
    assert.strictEqual(policy.directDownloadPackages.pixeldrain, false);
    assert.strictEqual(policy.autoCloseTabs, false);
    assert.strictEqual(policy.downloadPageCloseDelayMs, 3000);
    await repo.updateSettings({ enabled: true });
    policy = await repo.getEffectivePolicy();
    assert.strictEqual(policy.effectiveAutomateRegardless, true);
    assert.strictEqual(policy.directDownloadPackages.pixeldrain, false);
    for (const raw of [{ version: 99 }, [], "invalid", { version: 2, userPreference: true, enabled: "false" }]) {
      assert.strictEqual((await create({ GMApi: memoryGM(raw) }).getEffectivePolicy()).effectiveAutomateRegardless, false);
    }
    assert.strictEqual((await create({ GMApi: { getValue: async () => { throw new Error("unavailable"); } } }).getEffectivePolicy()).effectiveAutomateRegardless, false);
    assert.strictEqual((await create().getEffectivePolicy()).effectiveAutomateRegardless, false);
  });

  runTest("MASKED-DIRECT-SINGLE-03 gates hosts and list routes without origin or core authorization", async () => {
    for (const [href, expected] of [
      ["https://pixeldrain.com/u/fixture", "standalone"],
      ["https://pixeldrain.com/l/fixture", "blocked"],
      ["https://drive.google.com/drive/u/0/folders/fixture", "blocked"],
      ["https://unlisted.pixeldrain.com/u/fixture", "blocked"],
    ]) {
      const sandbox = createDomSandbox(href);
      try {
        const { createDownloadPageController } = loadModule(base + "app/contexts/downloadPageController.js");
        const { normalizeDirectDownloadHost } = loadModule(base + "hosts/metadata.js");
        const host = normalizeDirectDownloadHost(location.hostname);
        let policy = { effectiveAutomateRegardless: true, directDownloadPackages: {} };
        const controller = createDownloadPageController({ addonId: "test", debugLog() {}, handlers: {},
          getIsEnabled: () => true, getIsBlockedByCore: () => { throw new Error("core must not be consulted"); },
          getStandalonePolicy: async () => policy });
        assert.strictEqual((await controller.decideHostAutomation(host)).mode, expected, href);
        policy = { ...policy, directDownloadPackages: { pixeldrain: false } };
        if (href === "https://pixeldrain.com/u/fixture") {
          assert.strictEqual((await controller.decideHostAutomation(host)).reason, "host_disabled");
        }
      } finally { sandbox.restore(); }
    }
  });

  runTest("MASKED-DIRECT-SINGLE-04 closing requires final-action evidence and honors delay/settings/teardown", async () => {
    const { createDirectDownloadFlowController } = loadModule(base + "domain/directDownload/flowController.js");
    const defaults = { effectiveAutomateRegardless: true, autoCloseTabs: true, downloadPageCloseDelayMs: 4500 };
    for (const scenario of ["success", "healthy-only", "disabled", "host-off", "close-off", "challenge", "dispose", "failure", "refused"]) {
      let closes = 0, callback = null, delay, settled = 0, cleared = 0;
      let policy = { ...defaults };
      const flow = createDirectDownloadFlowController({ addonId: "test", diagnostics: { warn() {} },
        getPolicy: async () => policy,
        closeTab: () => { closes += 1; if (scenario === "refused") throw new Error("browser refused"); },
        setTimeoutFn: (fn, ms) => { callback = fn; delay = ms; return 1; },
        clearTimeoutFn: () => { cleared += 1; },
      });
      const context = flow.createHostExecutionContext({ host: "pixeldrain.com", policy }, {
        canClose: () => scenario !== "challenge", onSettled: () => { settled += 1; },
      });
      context.reportAddonHealthy(scenario === "healthy-only" ? {} : { downloadTriggered: true });
      context.reportAddonHealthy({ downloadTriggered: true });
      if (scenario === "healthy-only") { assert.strictEqual(callback, null); continue; }
      assert.strictEqual(delay, 4500);
      if (scenario === "disabled") policy.effectiveAutomateRegardless = false;
      if (scenario === "host-off") policy.directDownloadPackages = { pixeldrain: false };
      if (scenario === "close-off") policy.autoCloseTabs = false;
      if (scenario === "dispose") context.dispose();
      if (scenario === "failure") await context.notifyMainFailure("host", "failed");
      await callback();
      assert.strictEqual(closes, ["success", "refused"].includes(scenario) ? 1 : 0, scenario);
      assert.ok(settled > 0);
      if (["dispose", "failure"].includes(scenario)) assert.strictEqual(cleared, 1);
    }
  });

  runTest("MASKED-DIRECT-SINGLE-05 F95 settings preserve false choices and mirror changes", async () => {
    const { createMaskedDirectSettings, ADDON_SETTINGS_DEFAULT } = loadModule(base + "app/settings.js");
    assert.strictEqual(ADDON_SETTINGS_DEFAULT.automateRegardless, true);
    assert.strictEqual(ADDON_SETTINGS_DEFAULT.autoCloseTabs, true);
    let mirrored, enabled, ok = true;
    const settings = createMaskedDirectSettings({
      bridge: { invokeCoreAction: async (action) => ({ ok, value: action === "storage.get"
        ? { automateRegardless: false, autoCloseTabs: false, directDownloadPackages: { gofile: false } } : null }) },
      onSettingsRead: (flags) => { mirrored = flags; }, onEnabledChanged: (value) => { enabled = value; },
    });
    await settings.read(true);
    assert.strictEqual(mirrored.automateRegardless, false);
    assert.strictEqual(mirrored.autoCloseTabs, false);
    assert.strictEqual(mirrored.directDownloadPackages.gofile, false);
    await settings.storageSet("enabled", false);
    assert.strictEqual(enabled, false);
    mirrored = null; ok = false;
    await settings.read(true);
    assert.strictEqual(mirrored, null, "failed reads cannot overwrite a saved policy with defaults");
  });

  runTest("MASKED-DIRECT-SINGLE-06 controller passes policy to local closing and cancels on pagehide", async () => {
    for (const leavePage of [false, true]) {
      const sandbox = createDomSandbox("https://krakenfiles.com/view/fixture/file.html");
      try {
        Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
        const { createDownloadPageController } = loadModule(base + "app/contexts/downloadPageController.js");
        const { createDirectDownloadFlowController } = loadModule(base + "domain/directDownload/flowController.js");
        const policy = { effectiveAutomateRegardless: true, autoCloseTabs: true, downloadPageCloseDelayMs: 3500 };
        let callback, closes = 0, handlerRuns = 0, disposed = 0;
        const flow = createDirectDownloadFlowController({ addonId: "test", diagnostics: { warn() {} },
          getPolicy: async () => policy, closeTab: () => { closes += 1; },
          setTimeoutFn: (fn) => { callback = fn; return 1; }, clearTimeoutFn() {},
        });
        const controller = createDownloadPageController({ addonId: "test", debugLog() {},
          getIsEnabled: () => true, getStandalonePolicy: async () => policy,
          createHostExecutionContext: flow.createHostExecutionContext,
          createChallengeMonitor: () => ({ start() {}, waitUntilClear: async () => true,
            isBlocked: () => false, dispose: () => { disposed += 1; } }),
          handlers: { "krakenfiles.com": async (_gate, decision, context) => {
            handlerRuns += 1;
            assert.strictEqual(decision.policy, policy);
            context.reportAddonHealthy({ downloadTriggered: true });
          } },
        });
        await controller.runDownloadPageHooks();
        await controller.runDownloadPageHooks();
        assert.strictEqual(handlerRuns, 1, "one-shot guard prevents repeating the final action");
        assert.strictEqual(typeof callback, "function");
        if (leavePage) window.dispatchEvent(new window.Event("pagehide"));
        await callback();
        assert.strictEqual(closes, leavePage ? 0 : 1);
        assert.ok(disposed > 0);
      } finally { sandbox.restore(); }
    }
  });
};
