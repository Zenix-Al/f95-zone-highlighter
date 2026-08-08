"use strict";

module.exports = function registerMaskedDirectStandalonePolicy(context) {
  const { assert, loadModule, runTest } = context;

  function createGM(initial = {}) {
    const values = new Map(Object.entries(initial));
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

  runTest("MASKED-DIRECT-STANDALONE-POLICY-01 defaults user intent off", () => {
    const { ADDON_SETTINGS_DEFAULT } = loadModule(
      "addons/masked-direct-addon/src/app/settings.js",
    );
    assert.strictEqual(ADDON_SETTINGS_DEFAULT.automateRegardless, false);
  });

  runTest(
    "MASKED-DIRECT-STANDALONE-POLICY-01 separates user intent from missing-core force",
    async () => {
      let timestamp = 1000;
      const gm = createGM();
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });

      await repository.recordCoreAvailable({ userPreference: false });
      assert.deepStrictEqual(
        await repository.getEffectivePolicy(),
        {
          version: 1,
          userPreference: false,
          skipMaskedLink: true,
          forcedByMissingCore: false,
          observedAt: 1000,
          expiresAt: 0,
          coreState: "available",
          probeStartedAt: 0,
          probeExpiresAt: 0,
          effectiveAutomateRegardless: false,
        },
      );

      timestamp = 2000;
      await repository.recordMissingCore();
      const forced = await repository.getEffectivePolicy();
      assert.strictEqual(forced.userPreference, false);
      assert.strictEqual(forced.forcedByMissingCore, true);
      assert.strictEqual(forced.effectiveAutomateRegardless, true);

      timestamp = 3000;
      await repository.recordCoreAvailable();
      const restored = await repository.getEffectivePolicy();
      assert.strictEqual(restored.userPreference, false);
      assert.strictEqual(restored.forcedByMissingCore, false);
      assert.strictEqual(restored.effectiveAutomateRegardless, false);

      timestamp = 4000;
      await repository.recordCoreAvailable({ userPreference: true });
      assert.strictEqual(
        (await repository.getEffectivePolicy()).effectiveAutomateRegardless,
        true,
      );
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-POLICY-01 rejects missing malformed future and expired policy",
    async () => {
      const {
        createStandaloneAutomationPolicyRepository,
        MISSING_CORE_OVERRIDE_TTL_MS,
        STANDALONE_AUTOMATION_POLICY_KEY,
      } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      let timestamp = 10000;
      const gm = createGM();
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      assert.strictEqual(
        (await repository.getEffectivePolicy()).effectiveAutomateRegardless,
        false,
      );

      gm.values.set(STANDALONE_AUTOMATION_POLICY_KEY, { version: 2 });
      assert.strictEqual(
        (await repository.getEffectivePolicy()).effectiveAutomateRegardless,
        false,
      );
      gm.values.set(STANDALONE_AUTOMATION_POLICY_KEY, "invalid");
      assert.strictEqual(
        (await repository.getEffectivePolicy()).effectiveAutomateRegardless,
        false,
      );

      await repository.recordCoreAvailable({ userPreference: false });
      timestamp += 1;
      await repository.recordMissingCore();
      timestamp += MISSING_CORE_OVERRIDE_TTL_MS + 1;
      assert.strictEqual(
        (await repository.getEffectivePolicy()).effectiveAutomateRegardless,
        false,
      );
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-POLICY-01 ignores stale policy writes",
    async () => {
      let timestamp = 5000;
      const gm = createGM();
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      await repository.recordCoreAvailable({ userPreference: true });
      timestamp = 4000;
      await repository.recordMissingCore();
      const current = await repository.read();
      assert.strictEqual(current.observedAt, 5000);
      assert.strictEqual(current.userPreference, true);
      assert.strictEqual(current.forcedByMissingCore, false);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-POLICY-01 transient ping failure does not report missing core",
    async () => {
      const calls = [];
      const { probeMaskedDirectCore } = loadModule(
        "addons/masked-direct-addon/src/app/coreAvailability.js",
      );
      const responses = [{ ok: false }, { ok: true, apiVersion: "1" }];
      const result = await probeMaskedDirectCore({
        bridge: {
          async waitForCorePing() {
            calls.push("ping");
            return responses.shift();
          },
          async getAddonAccess() {
            calls.push("access");
            return { ok: false };
          },
        },
        async sleep() {
          calls.push("sleep");
        },
      });
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(calls, ["ping", "sleep", "ping"]);
    },
  );
};
