"use strict";

module.exports = function registerMaskedDirectMaskedStandalonePreference(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createGM() {
    const values = new Map();
    return {
      values,
      async getValue(key, fallback) {
        return values.has(key) ? structuredClone(values.get(key)) : fallback;
      },
      async setValue(key, value) {
        values.set(key, structuredClone(value));
      },
    };
  }

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 defaults masked intent on while host intent stays off",
    async () => {
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const policy = await createStandaloneAutomationPolicyRepository({
        GMApi: createGM(),
      }).getEffectivePolicy();
      assert.strictEqual(policy.skipMaskedLink, true);
      assert.strictEqual(policy.effectiveAutomateRegardless, false);
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 mirrors and preserves independent intents",
    async () => {
      let timestamp = 1000;
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      for (const skipMaskedLink of [false, true]) {
        const repository = createStandaloneAutomationPolicyRepository({
          GMApi: createGM(),
          now: () => timestamp,
        });
        await repository.recordCoreAvailable({
          userPreference: false,
          skipMaskedLink,
        });
        timestamp += 1;
        await repository.recordMissingCore();
        let policy = await repository.getEffectivePolicy();
        assert.strictEqual(policy.skipMaskedLink, skipMaskedLink);
        assert.strictEqual(policy.userPreference, false);
        assert.strictEqual(policy.effectiveAutomateRegardless, true);
        timestamp += 1;
        await repository.recordCoreAvailable();
        policy = await repository.getEffectivePolicy();
        assert.strictEqual(policy.skipMaskedLink, skipMaskedLink);
        assert.strictEqual(policy.effectiveAutomateRegardless, false);
        timestamp += 10;
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 probing waits without changing masked intent",
    async () => {
      let timestamp = 1000;
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: createGM(),
        now: () => timestamp,
      });
      await repository.recordCoreAvailable({ skipMaskedLink: false });
      timestamp = 2000;
      await repository.recordCoreProbing();
      const policy = await repository.getEffectivePolicy({
        async sleep() {
          timestamp = 3000;
          await repository.recordCoreAvailable();
        },
      });
      assert.strictEqual(policy.skipMaskedLink, false);
      assert.strictEqual(policy.coreState, "available");
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 expiry retains masked and host intent",
    async () => {
      let timestamp = 1000;
      const {
        createStandaloneAutomationPolicyRepository,
        MISSING_CORE_OVERRIDE_TTL_MS,
      } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: createGM(),
        now: () => timestamp,
      });
      await repository.recordCoreAvailable({
        userPreference: true,
        skipMaskedLink: false,
      });
      timestamp = 2000;
      await repository.recordMissingCore();
      timestamp += MISSING_CORE_OVERRIDE_TTL_MS + 1;
      const policy = await repository.getEffectivePolicy();
      assert.strictEqual(policy.userPreference, true);
      assert.strictEqual(policy.skipMaskedLink, false);
      assert.strictEqual(policy.forcedByMissingCore, false);
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 managed request bypasses standalone policy reads",
    async () => {
      const now = Date.now();
      const href =
        "https://krakenfiles.com/view/example/file.html" +
        `?f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${now}`;
      const sandbox = createDomSandbox(href);
      const previousSessionStorage = global.sessionStorage;
      global.sessionStorage = sandbox.window.sessionStorage;
      try {
        const gm = createGM();
        const { setProcessingDownloadTrigger } = loadModule(
          "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
        );
        await setProcessingDownloadTrigger(gm, {
          requestId: "request-a",
          ownerTabId: "tab-a",
          host: "krakenfiles.com",
          sourceUrl: href,
        });
        let policyReads = 0;
        const { createDownloadPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
        );
        const controller = createDownloadPageController({
          addonId: "masked-direct-addon",
          debugLog() {},
          GMApi: gm,
          getIsBlockedByCore: () => false,
          getIsEnabled: () => true,
          handlers: {},
          originTabQueryKey: "f95ue_tab",
          async getStandalonePolicy() {
            policyReads += 1;
            return { effectiveAutomateRegardless: false };
          },
        });
        const decision = await controller.decideHostAutomation(
          "krakenfiles.com",
        );
        assert.strictEqual(decision.mode, "managed");
        assert.strictEqual(policyReads, 0);
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );
};
