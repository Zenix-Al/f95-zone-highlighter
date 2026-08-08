"use strict";

module.exports = function registerMaskedDirectStandaloneEngine(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

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
        writes.push(["set", key]);
      },
      async deleteValue(key) {
        values.delete(key);
        writes.push(["delete", key]);
      },
    };
  }

  async function withController({ href, policy, setup, run }) {
    const sandbox = createDomSandbox(href);
    const previousSessionStorage = global.sessionStorage;
    global.sessionStorage = sandbox.window.sessionStorage;
    try {
      const gm = createGM();
      if (setup) await setup(gm);
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
        getStandalonePolicy: async () => ({
          effectiveAutomateRegardless: policy,
        }),
      });
      await run({ controller, gm });
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  }

  async function addManagedRequest(gm, sourceUrl) {
    const { setProcessingDownloadTrigger } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-a",
      ownerTabId: "tab-a",
      host: "krakenfiles.com",
      sourceUrl,
    });
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 managed identity wins with policy off or on",
    async () => {
      for (const policy of [false, true]) {
        const now = Date.now();
        const href =
          "https://krakenfiles.com/view/example/file.html" +
          `?f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${now}`;
        await withController({
          href,
          policy,
          setup: (gm) => addManagedRequest(gm, href),
          run: async ({ controller }) => {
            const decision = await controller.decideHostAutomation(
              "krakenfiles.com",
            );
            assert.strictEqual(decision.mode, "managed");
            assert.strictEqual(decision.request.requestId, "request-a");
          },
        });
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 authorizes only approved standalone routes",
    async () => {
      const cases = [
        ["krakenfiles.com", "https://krakenfiles.com/view/a/file.html", "standalone"],
        ["delafil.se", "https://delafil.se/0123456789abcdef/file.zip", "standalone"],
        ["download.gg", "https://download.gg/file-example", "standalone"],
        ["uploadhaven.com", "https://uploadhaven.com/download/example", "standalone"],
        ["krakenfiles.com", "https://krakenfiles.com/view/a", "blocked"],
        ["mediafire.com", "https://mediafire.com/file/a/file", "blocked"],
      ];
      for (const [host, href, expected] of cases) {
        await withController({
          href,
          policy: true,
          run: async ({ controller, gm }) => {
            const before = [...gm.writes];
            const decision = await controller.decideHostAutomation(host);
            assert.strictEqual(decision.mode, expected, `${host} ${href}`);
            assert.strictEqual(decision.request, null);
            assert.deepStrictEqual(
              gm.writes,
              before,
              "standalone decision must not mutate request storage",
            );
          },
        });
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 blocks requestless safe routes when policy is off",
    async () => {
      await withController({
        href: "https://download.gg/file-example",
        policy: false,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("download.gg");
          assert.strictEqual(decision.mode, "blocked");
          assert.strictEqual(decision.reason, "standalone_policy_disabled");
        },
      });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 may fall through from stale identity only by independent policy",
    async () => {
      const stale = Date.now() - 60 * 60 * 1000;
      const href =
        "https://download.gg/file-example" +
        `?f95ue_dd=1&f95ue_tab=old&f95ue_dd_req=missing&f95ue_dd_ts=${stale}`;
      await withController({
        href,
        policy: true,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("download.gg");
          assert.strictEqual(decision.mode, "standalone");
          assert.strictEqual(decision.request, null);
        },
      });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 keeps unapproved ambiguous recovery blocked",
    async () => {
      await withController({
        href: "https://datanodes.to/file/example",
        policy: true,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("datanodes.to");
          assert.strictEqual(decision.mode, "blocked");
          assert.strictEqual(decision.reason, "host_not_standalone_approved");
        },
      });
    },
  );
};
