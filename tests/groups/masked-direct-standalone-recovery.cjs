"use strict";

module.exports = function registerMaskedDirectStandaloneRecovery(context) {
  const { assert, loadModule, runTest } = context;

  function createGM() {
    const values = new Map();
    const writes = [];
    return {
      values,
      writes,
      async getValue(key, fallback) {
        return values.has(key) ? structuredClone(values.get(key)) : fallback;
      },
      async setValue(key, value) {
        values.set(key, structuredClone(value));
        writes.push([key, structuredClone(value)]);
      },
    };
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-RECOVERY-01 exhausts ping and access before missing-core result",
    async () => {
      const calls = [];
      const { probeMaskedDirectCore } = loadModule(
        "addons/masked-direct-addon/src/app/coreAvailability.js",
      );
      const result = await probeMaskedDirectCore({
        bridge: {
          async waitForCorePing(timeout) {
            calls.push(["ping", timeout]);
            return { ok: false, reason: "timeout" };
          },
          async getAddonAccess() {
            calls.push(["access"]);
            return { ok: false };
          },
        },
        async sleep(delay) {
          calls.push(["sleep", delay]);
        },
      });
      assert.strictEqual(result.ok, false);
      assert.deepStrictEqual(calls, [
        ["ping", 2200],
        ["sleep", 300],
        ["ping", 2800],
        ["sleep", 550],
        ["ping", 3400],
        ["sleep", 800],
        ["access"],
      ]);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-RECOVERY-01 accepts access fallback without missing-core publication",
    async () => {
      const { probeMaskedDirectCore } = loadModule(
        "addons/masked-direct-addon/src/app/coreAvailability.js",
      );
      const result = await probeMaskedDirectCore({
        bridge: {
          async waitForCorePing() {
            return { ok: false };
          },
          async getAddonAccess() {
            return { ok: true, value: { enabled: true } };
          },
        },
        async sleep() {},
      });
      assert.deepStrictEqual(result, { ok: true, apiVersion: "probed" });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-RECOVERY-01 core revisit clears force and retains both intent values",
    async () => {
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      for (const userPreference of [false, true]) {
        let timestamp = 1000;
        const gm = createGM();
        const repository = createStandaloneAutomationPolicyRepository({
          GMApi: gm,
          now: () => timestamp,
        });
        await repository.recordCoreAvailable({ userPreference });
        timestamp = 2000;
        await repository.recordMissingCore();
        timestamp = 3000;
        await repository.recordCoreAvailable();
        const restored = await repository.getEffectivePolicy();
        assert.strictEqual(restored.userPreference, userPreference);
        assert.strictEqual(restored.forcedByMissingCore, false);
        assert.strictEqual(
          restored.effectiveAutomateRegardless,
          userPreference,
        );
        assert.strictEqual(gm.writes.length, 3);
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-RECOVERY-01 same-time recovery beats missing-core tab",
    async () => {
      let timestamp = 5000;
      const gm = createGM();
      const { createStandaloneAutomationPolicyRepository } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const recoveredTab = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      const missingTab = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      await recoveredTab.recordCoreAvailable({ userPreference: false });
      await missingTab.recordMissingCore();
      const policy = await recoveredTab.getEffectivePolicy();
      assert.strictEqual(policy.forcedByMissingCore, false);
      assert.strictEqual(policy.effectiveAutomateRegardless, false);
      assert.strictEqual(gm.writes.length, 1);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-RECOVERY-01 expiry removes force without deleting true intent",
    async () => {
      let timestamp = 1000;
      const gm = createGM();
      const {
        createStandaloneAutomationPolicyRepository,
        MISSING_CORE_OVERRIDE_TTL_MS,
      } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      await repository.recordCoreAvailable({ userPreference: true });
      timestamp = 2000;
      await repository.recordMissingCore();
      const writesBeforeExpiry = gm.writes.length;
      timestamp += MISSING_CORE_OVERRIDE_TTL_MS + 1;
      const expired = await repository.getEffectivePolicy();
      assert.strictEqual(expired.userPreference, true);
      assert.strictEqual(expired.forcedByMissingCore, false);
      assert.strictEqual(expired.effectiveAutomateRegardless, true);
      assert.strictEqual(
        gm.writes.length,
        writesBeforeExpiry,
        "external reads must not create heartbeat writes",
      );
    },
  );
};
