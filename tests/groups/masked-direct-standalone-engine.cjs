"use strict";
const approvedRoutes = require("../fixtures/masked-direct-approved-routes.cjs");

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

  async function withController({ href, automationSettings, setup, run }) {
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
        getAutomationSettings: async () => ({
          enabled: true,
          automateRegardless: automationSettings,
        }),
      });
      await run({ controller, gm });
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-01 authorizes only approved standalone routes",
    async () => {
      const cases = [
        ...approvedRoutes.map(([host, href]) => [host, href, "standalone"]),
        ["download.gg", "https://download.gg/file-example", "standalone"],
        ["krakenfiles.com", "https://krakenfiles.com/view/a", "blocked"],
        ["mediafire.com", "https://mediafire.com/file/a/file", "blocked"],
      ];
      for (const [host, href, expected] of cases) {
        await withController({
          href,
          automationSettings: true,
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
    "MASKED-DIRECT-STANDALONE-ENGINE-02 blocks requestless safe routes when automationSettings is off",
    async () => {
      await withController({
        href: "https://download.gg/file-example",
        automationSettings: false,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("download.gg");
          assert.strictEqual(decision.mode, "blocked");
          assert.strictEqual(decision.reason, "automation_disabled");
        },
      });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-03 may fall through from stale identity only by independent automationSettings",
    async () => {
      const stale = Date.now() - 60 * 60 * 1000;
      const href =
        "https://download.gg/file-example" +
        `?f95ue_dd=1&f95ue_tab=old&f95ue_dd_req=missing&f95ue_dd_ts=${stale}`;
      await withController({
        href,
        automationSettings: true,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("download.gg");
          assert.strictEqual(decision.mode, "standalone");
          assert.strictEqual(decision.request, null);
        },
      });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-ENGINE-04 keeps unapproved ambiguous recovery blocked",
    async () => {
      await withController({
        href: "https://datanodes.to/file/example",
        automationSettings: true,
        run: async ({ controller }) => {
          const decision = await controller.decideHostAutomation("datanodes.to");
          assert.strictEqual(decision.mode, "blocked");
          assert.strictEqual(decision.reason, "unsafe_or_unsupported_route");
        },
      });
    },
  );
};
