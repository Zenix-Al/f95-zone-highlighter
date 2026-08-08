"use strict";

module.exports = function registerMaskedDirectMaskedStandaloneContext(context) {
  const { ROOT, assert, fs, loadModule, path, runTest } = context;

  function createGM() {
    const values = new Map();
    const writes = [];
    return {
      writes,
      async getValue(key, fallback) {
        return values.has(key) ? structuredClone(values.get(key)) : fallback;
      },
      async setValue(key, value) {
        values.set(key, structuredClone(value));
        writes.push(structuredClone(value));
      },
    };
  }

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01 separates required and optional core routes",
    () => {
      const { classifyMaskedDirectContext } = loadModule(
        "addons/masked-direct-addon/src/app/context.js",
      );
      assert.deepStrictEqual(
        classifyMaskedDirectContext(
          new URL("https://f95zone.to/threads/example.1/"),
        ),
        { kind: "f95-core", route: "thread", usesCore: true },
      );
      assert.deepStrictEqual(
        classifyMaskedDirectContext(
          new URL("https://f95zone.to/masked/example"),
        ),
        { kind: "f95-optional-core", route: "masked", usesCore: true },
      );
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01 probing lease blocks stale standalone until missing settles",
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
      timestamp = 2000;
      await repository.recordMissingCore();
      timestamp = 3000;
      await repository.recordCoreProbing();

      let waits = 0;
      const effective = await repository.getEffectivePolicy({
        async sleep() {
          waits += 1;
          timestamp = 4000;
          await repository.recordMissingCore();
        },
      });
      assert.strictEqual(waits, 1);
      assert.strictEqual(effective.coreState, "confirmed-missing");
      assert.strictEqual(effective.effectiveAutomateRegardless, true);
      assert.deepStrictEqual(
        gm.writes.map((entry) => entry.coreState),
        ["available", "confirmed-missing", "probing", "confirmed-missing"],
      );
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01 expired probing fails closed",
    async () => {
      let timestamp = 1000;
      const gm = createGM();
      const {
        CORE_PROBE_LEASE_TTL_MS,
        createStandaloneAutomationPolicyRepository,
      } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneAutomationPolicyRepository.js",
      );
      const repository = createStandaloneAutomationPolicyRepository({
        GMApi: gm,
        now: () => timestamp,
      });
      await repository.recordCoreAvailable({ userPreference: true });
      timestamp = 2000;
      await repository.recordCoreProbing();
      timestamp += CORE_PROBE_LEASE_TTL_MS + 1;
      const effective = await repository.getEffectivePolicy();
      assert.strictEqual(effective.coreState, "probe-expired");
      assert.strictEqual(effective.effectiveAutomateRegardless, false);
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01 bootstrap publishes probing before probe and limits local mode to masked",
    () => {
      const source = fs.readFileSync(
        path.join(
          ROOT,
          "addons",
          "masked-direct-addon",
          "src",
          "app",
          "createMaskedDirectApp.js",
        ),
        "utf8",
      );
      const probing = source.indexOf(
        "standaloneAutomationPolicy.recordCoreProbing()",
      );
      const ownershipPromise = source.indexOf(
        "const coreOwnershipPromise",
      );
      const probe = source.indexOf("probeMaskedDirectCore", probing);
      const ownershipAwait = source.indexOf(
        "await coreOwnershipPromise",
        probe,
      );
      const missing = source.indexOf(
        "standaloneAutomationPolicy.recordMissingCore()",
        probe,
      );
      const maskedBranch = source.indexOf(
        'if (context.route === "masked")',
        missing,
      );
      const localEnable = source.indexOf(
        "maskedPageController.enableMaskedPageHooks",
        maskedBranch,
      );
      const threadSkip = source.indexOf("Add-on skipped on F95 thread route", localEnable);
      assert.ok(ownershipPromise >= 0 && ownershipPromise < probing);
      assert.ok(probing < probe && probe < ownershipAwait);
      assert.ok(ownershipAwait < missing && missing < maskedBranch);
      assert.ok(maskedBranch < localEnable && localEnable < threadSkip);
      assert.strictEqual(
        source.slice(maskedBranch, localEnable).includes("registration.register"),
        false,
      );
    },
  );
};
