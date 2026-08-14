"use strict";

module.exports = function registerMaskedDirectStandaloneSignalGate(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createFlow({ events, diagnostics, gm }) {
    const { createDirectDownloadFlowController } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/flowController.js",
    );
    return createDirectDownloadFlowController({
      addonId: "masked-direct-addon",
      bridge: {
        dispatchCoreCommand: (...args) => events.push(["core", ...args]),
      },
      GMApi: gm,
      openInTab: null,
      normalizeUrl: (value) => value,
      withAutomationMarker: (value) => value,
      diagnostics,
      publishDirectDownloadEvent: async (event) =>
        events.push(["event", event]),
      ownerTabId: "origin",
      originTabQueryKey: "f95ue_tab",
      getDownloadHost: () => "download.gg",
      getDownloadPageCloseDelayMs: () => 3000,
    });
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-SIGNAL-GATE-01 keeps standalone outcomes local",
    async () => {
      const events = [];
      const writes = [];
      const warnings = [];
      const flow = createFlow({
        events,
        diagnostics: {
          warn: (reason, details) => warnings.push([reason, details]),
          error() {},
        },
        gm: {
          async getValue() {
            return null;
          },
          async setValue(...args) {
            writes.push(["set", ...args]);
          },
          async deleteValue(...args) {
            writes.push(["delete", ...args]);
          },
        },
      });
      const execution = flow.createHostExecutionContext({
        mode: "standalone",
        host: "download.gg",
        request: null,
      });

      await execution.notifyMainFailure(
        "download.gg",
        "signed URL and private message must not be logged",
      );
      await execution.notifyChallenge("download.gg", "challenge details");
      execution.reportAddonHealthy();

      assert.strictEqual(execution.request, null);
      assert.deepStrictEqual(events, []);
      assert.deepStrictEqual(writes, []);
      assert.deepStrictEqual(warnings, [
        ["standalone_download_failed", { host: "download.gg" }],
        ["standalone_challenge", { host: "download.gg" }],
      ]);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SIGNAL-GATE-01 handler callbacks cannot bypass standalone gate",
    async () => {
      const sandbox = createDomSandbox("https://download.gg/file-example");
      try {
        const events = [];
        const warnings = [];
        const flow = createFlow({
          events,
          diagnostics: {
            warn: (reason) => warnings.push(reason),
            error() {},
          },
          gm: {
            async getValue() {
              return null;
            },
          },
        });
        const execution = flow.createHostExecutionContext({
          mode: "standalone",
          host: "download.gg",
        });
        const { createDirectDownloadHostHandlers } = loadModule(
          "addons/masked-direct-addon/src/hosts/handlers.js",
        );
        const handlers = createDirectDownloadHostHandlers({
          debugLog() {},
          createHostExecutionContext: (decision) =>
            flow.createHostExecutionContext(decision),
          getSettings: () => ({}),
          getDownloadCloseDelay: async () => 3000,
        });
        sandbox.document.body.innerHTML = "<p>No download control</p>";
        await handlers["download.gg"](
          { waitUntilClear: async () => true },
          { mode: "standalone", host: "download.gg" },
          execution,
        );
        assert.deepStrictEqual(events, []);
        assert.deepStrictEqual(warnings, ["standalone_download_failed"]);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-SIGNAL-GATE-01 controller suppresses standalone lease and challenge signaling",
    async () => {
      const sandbox = createDomSandbox("https://download.gg/file-example");
      const previousSessionStorage = global.sessionStorage;
      global.sessionStorage = sandbox.window.sessionStorage;
      try {
        const events = [];
        const writes = [];
        const warnings = [];
        const gm = {
          async getValue() {
            return null;
          },
          async setValue(...args) {
            writes.push(["set", ...args]);
          },
          async deleteValue(...args) {
            writes.push(["delete", ...args]);
          },
        };
        const flow = createFlow({
          events,
          diagnostics: {
            warn: (reason) => warnings.push(reason),
            error() {},
          },
          gm,
        });
        let handlerRuns = 0;
        const { createDownloadPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
        );
        const controller = createDownloadPageController({
          addonId: "masked-direct-addon",
          debugLog() {},
          GMApi: gm,
          getIsBlockedByCore: () => false,
          getIsEnabled: () => true,
          getStandalonePolicy: async () => ({
            effectiveAutomateRegardless: true,
          }),
          createHostExecutionContext: (decision) =>
            flow.createHostExecutionContext(decision),
          createChallengeMonitor(options) {
            return {
              start() {},
              dispose() {},
              async waitUntilClear() {
                await options.preserveRequest();
                await options.notifyChallenge("download.gg", "private detail");
                return true;
              },
            };
          },
          handlers: {
            "download.gg": async (_gate, decision, execution) => {
              handlerRuns += 1;
              assert.strictEqual(decision.mode, "standalone");
              execution.reportAddonHealthy();
            },
          },
          originTabQueryKey: "f95ue_tab",
        });

        await controller.runDownloadPageHooks();
        assert.strictEqual(handlerRuns, 1);
        assert.deepStrictEqual(events, []);
        assert.deepStrictEqual(writes, []);
        assert.deepStrictEqual(warnings, ["standalone_challenge"]);
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );
};
