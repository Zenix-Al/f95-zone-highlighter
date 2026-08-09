"use strict";

module.exports = function registerMaskedDirectStandaloneExpansionStaged(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createStorage() {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      raw: values,
    };
  }

  function createController({ store, enabled = true } = {}) {
    const { createDownloadPageController } = loadModule(
      "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
    );
    return createDownloadPageController({
      addonId: "masked-direct-addon",
      debugLog() {},
      GMApi: { getValue: async (_key, fallback) => fallback },
      getIsBlockedByCore: () => false,
      getIsEnabled: () => enabled,
      handlers: {},
      originTabQueryKey: "f95ue_tab",
      getStandalonePolicy: async () => ({ effectiveAutomateRegardless: true }),
      createContinuationStore: () => store,
    });
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 classifies exact staged entries",
    () => {
      const { classifyDatanodesStandaloneEntry } = loadModule(
        "addons/masked-direct-addon/src/hosts/datanodes/index.js",
      );
      const { classifyVikingStandaloneEntry, classifyVikingStandaloneContinuation } =
        loadModule("addons/masked-direct-addon/src/hosts/vik1ngfile.js");
      const { getWorkuploadStandaloneEntry, getWorkuploadStandaloneContinuation } =
        loadModule("addons/masked-direct-addon/src/hosts/workupload.js");
      assert.deepStrictEqual(
        classifyDatanodesStandaloneEntry(
          "https://datanodes.to/82wqqwwmstb7/Dating_Sim-0.2-pc.zip",
        ),
        { identity: "82wqqwwmstb7:Dating_Sim-0.2-pc.zip", nextStage: "datanodes-download" },
      );
      assert.strictEqual(
        classifyDatanodesStandaloneEntry("https://datanodes.to/82wqqwwmstb7"),
        null,
      );
      assert.deepStrictEqual(
        classifyVikingStandaloneEntry("https://vikingfile.com/f/swBmSwbeK2"),
        { identity: "swBmSwbeK2", nextStage: "vik1ngfile-page" },
      );
      assert.strictEqual(
        classifyVikingStandaloneEntry("https://vik1ngfile.site/f/swBmSwbeK2")?.identity,
        "swBmSwbeK2",
      );
      assert.deepStrictEqual(
        classifyVikingStandaloneContinuation("https://vik1ngfile.site/f/swBmSwbeK2"),
        { identity: "swBmSwbeK2", nextStage: "vik1ngfile-page" },
      );
      assert.strictEqual(
        classifyVikingStandaloneContinuation("https://example.com/f/swBmSwbeK2"),
        null,
      );
      assert.deepStrictEqual(
        getWorkuploadStandaloneEntry("https://workupload.com/file/JVuuyQMKU3p"),
        { identity: "JVuuyQMKU3p", nextStage: "workupload-start" },
      );
      assert.deepStrictEqual(
        getWorkuploadStandaloneContinuation("https://workupload.com/start/JVuuyQMKU3p"),
        { identity: "JVuuyQMKU3p", nextStage: "workupload-start" },
      );
      const { classifyStandaloneHostRoute } = loadModule(
        "addons/masked-direct-addon/src/hosts/standaloneEligibility.js",
      );
      assert.strictEqual(
        classifyStandaloneHostRoute(
          "datanodes.to",
          "https://datanodes.to/download",
        ).eligible,
        true,
      );
      assert.strictEqual(
        classifyStandaloneHostRoute(
          "vik1ngfile.site",
          "https://vik1ngfile.site/f/swBmSwbeK2",
        ).eligible,
        true,
      );
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 blocks direct continuation visits",
    async () => {
      for (const [host, url] of [
        ["workupload.com", "https://workupload.com/start/JVuuyQMKU3p"],
        ["drive.google.com", "https://drive.usercontent.google.com/download?confirm=token"],
      ]) {
        const sandbox = createDomSandbox(url);
        const previousSessionStorage = global.sessionStorage;
        global.sessionStorage = sandbox.window.sessionStorage;
        try {
          const storage = createStorage();
          const { createStandaloneContinuationStore } = loadModule(
            "addons/masked-direct-addon/src/ports/standaloneContinuation.js",
          );
          const store = createStandaloneContinuationStore({ storage, nameTransport: null });
          const decision = await createController({ store }).decideHostAutomation(host);
          assert.strictEqual(decision.mode, "blocked", url);
          assert.strictEqual(decision.reason, "standalone_continuation_not_owned", url);
        } finally {
          global.sessionStorage = previousSessionStorage;
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 consumes same-tab stages once",
    async () => {
      const cases = [
        ["workupload.com", "JVuuyQMKU3p", "workupload-start", "https://workupload.com/start/JVuuyQMKU3p"],
        ["drive.google.com", "file-id", "drive-confirmation", "https://drive.usercontent.google.com/download?confirm=token"],
      ];
      for (const [host, identity, nextStage, url] of cases) {
        const storage = createStorage();
        const { createStandaloneContinuationStore } = loadModule(
          "addons/masked-direct-addon/src/ports/standaloneContinuation.js",
        );
        const store = createStandaloneContinuationStore({
          storage,
          now: () => 1000,
          createNonce: () => "operation-a",
          nameTransport: null,
        });
        assert.ok(store.claim({ host, identity, nextStage }));
        const sandbox = createDomSandbox(url);
        const previousSessionStorage = global.sessionStorage;
        global.sessionStorage = sandbox.window.sessionStorage;
        try {
          const controller = createController({ store });
          const first = await controller.decideHostAutomation(host);
          assert.strictEqual(first.mode, "standalone", url);
          assert.strictEqual(first.reason, "standalone_owned_continuation", url);
          assert.strictEqual(
            store.consume({
              host,
              identity: first.standaloneContinuation.identity,
              stage: first.standaloneContinuation.nextStage,
            })?.nonce,
            "operation-a",
          );
          const replay = await controller.decideHostAutomation(host);
          assert.strictEqual(replay.mode, "blocked", `${url} replay`);
        } finally {
          global.sessionStorage = previousSessionStorage;
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 rejects sibling mismatch expiry and malformed state",
    () => {
      let timestamp = 1000;
      const storage = createStorage();
      const siblingStorage = createStorage();
      const { createStandaloneContinuationStore, STANDALONE_CONTINUATION_PREFIX } =
        loadModule("addons/masked-direct-addon/src/ports/standaloneContinuation.js");
      const store = createStandaloneContinuationStore({
        storage,
        now: () => timestamp,
        createNonce: () => "operation-a",
        nameTransport: null,
      });
      const sibling = createStandaloneContinuationStore({
        storage: siblingStorage,
        now: () => timestamp,
        nameTransport: null,
      });
      const originalClaim = store.claim({
        host: "workupload.com",
        identity: "file-a",
        nextStage: "workupload-start",
      });
      assert.strictEqual(
        store.claim({
          host: "workupload.com",
          identity: "file-a",
          nextStage: "workupload-start",
        })?.nonce,
        originalClaim.nonce,
      );
      assert.strictEqual(
        store.claim({ host: "workupload.com", identity: "file-b", nextStage: "workupload-start" }),
        null,
      );
      assert.strictEqual(
        sibling.consume({ host: "workupload.com", identity: "file-a", stage: "workupload-start" }),
        null,
      );
      assert.strictEqual(
        store.consume({ host: "workupload.com", identity: "file-b", stage: "workupload-start" }),
        null,
      );
      store.claim({ host: "workupload.com", identity: "file-a", nextStage: "workupload-start" });
      timestamp += 3 * 60 * 1000;
      assert.strictEqual(
        store.consume({ host: "workupload.com", identity: "file-a", stage: "workupload-start" }),
        null,
      );
      storage.setItem(
        `${STANDALONE_CONTINUATION_PREFIX}${encodeURIComponent("workupload.com")}`,
        "{broken",
      );
      assert.strictEqual(
        store.consume({ host: "workupload.com", identity: "file-a", stage: "workupload-start" }),
        null,
      );
      assert.strictEqual(store.clear("workupload.com"), true);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 carries a claim across origins in one tab",
    () => {
      let envelope = null;
      const nameTransport = {
        read: () => envelope,
        write(record) {
          envelope = structuredClone(record);
          return true;
        },
        clear() {
          envelope = null;
        },
      };
      const { createStandaloneContinuationStore } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneContinuation.js",
      );
      const source = createStandaloneContinuationStore({
        storage: createStorage(),
        nameTransport,
        now: () => 1000,
        createNonce: () => "cross-origin-a",
      });
      assert.ok(source.claim({
        host: "vik1ngfile.site",
        identity: "swBmSwbeK2",
        nextStage: "vik1ngfile-page",
      }));
      const destination = createStandaloneContinuationStore({
        storage: createStorage(),
        nameTransport,
        now: () => 1001,
      });
      assert.strictEqual(
        destination.consume({
          host: "vik1ngfile.site",
          identity: "swBmSwbeK2",
          stage: "vik1ngfile-page",
        })?.nonce,
        "cross-origin-a",
      );
      assert.strictEqual(envelope, null);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 preserves ownership across a challenge reload",
    async () => {
      const sandbox = createDomSandbox("https://workupload.com/start/JVuuyQMKU3p");
      const previousSessionStorage = global.sessionStorage;
      global.sessionStorage = sandbox.window.sessionStorage;
      try {
        const storage = createStorage();
        const { createStandaloneContinuationStore } = loadModule(
          "addons/masked-direct-addon/src/ports/standaloneContinuation.js",
        );
        const store = createStandaloneContinuationStore({
          storage,
          nameTransport: null,
          now: () => 1000,
          createNonce: () => "challenge-a",
        });
        store.claim({
          host: "workupload.com",
          identity: "JVuuyQMKU3p",
          nextStage: "workupload-start",
        });
        let handlerRuns = 0;
        const makeController = (challengeClears) => {
          const { createDownloadPageController } = loadModule(
            "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
          );
          return createDownloadPageController({
            addonId: "masked-direct-addon",
            debugLog() {},
            GMApi: { getValue: async (_key, fallback) => fallback },
            getIsBlockedByCore: () => false,
            getIsEnabled: () => true,
            handlers: {
              "workupload.com": async () => { handlerRuns += 1; },
            },
            originTabQueryKey: "f95ue_tab",
            getStandalonePolicy: async () => ({ effectiveAutomateRegardless: true }),
            createContinuationStore: () => store,
            createChallengeMonitor: () => ({
              dispose() {},
              isBlocked: () => !challengeClears,
              start() {},
              waitUntilClear: async () => challengeClears,
            }),
          });
        };
        await makeController(false).runDownloadPageHooks();
        assert.strictEqual(handlerRuns, 0);
        assert.strictEqual(
          store.inspect({
            host: "workupload.com",
            identity: "JVuuyQMKU3p",
            stage: "workupload-start",
          })?.nonce,
          "challenge-a",
        );
        await makeController(true).runDownloadPageHooks();
        assert.strictEqual(handlerRuns, 1);
        assert.strictEqual(
          store.inspect({
            host: "workupload.com",
            identity: "JVuuyQMKU3p",
            stage: "workupload-start",
          }),
          null,
        );
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 refuses ambiguous Datanodes actions",
    async () => {
      const sandbox = createDomSandbox(
        "https://datanodes.to/82wqqwwmstb7/Dating_Sim-0.2-pc.zip",
      );
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
        for (let index = 0; index < 2; index += 1) {
          const button = sandbox.document.createElement("button");
          button.textContent = "Download now";
          sandbox.document.body.append(button);
        }
        const { findBestDatanodesAction } = loadModule(
          "addons/masked-direct-addon/src/hosts/datanodes/index.js",
        );
        assert.strictEqual(
          await findBestDatanodesAction({ frameBudgetMs: 100, isDone: () => false }),
          null,
        );
      } finally {
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 bounds Viking standalone stages",
    async () => {
      for (const [url, decision] of [
        ["https://vikingfile.com/f/swBmSwbeK2", { mode: "standalone", standaloneEntry: {} }],
        ["https://vik1ngfile.site/f/swBmSwbeK2", { mode: "standalone", standaloneContinuation: {} }],
      ]) {
        const sandbox = createDomSandbox(url);
        const previousAnchor = global.HTMLAnchorElement;
        const previousGetComputedStyle = global.getComputedStyle;
        try {
          global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
          global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
          const button = sandbox.document.createElement("a");
          button.href = "#";
          button.textContent = "Download";
          sandbox.document.body.append(button);
          let clicks = 0;
          button.addEventListener("click", (event) => { event.preventDefault(); clicks += 1; });
          let healthy = 0;
          const { processVik1ngfileDownload } = loadModule(
            "addons/masked-direct-addon/src/hosts/vik1ngfile.js",
          );
          await processVik1ngfileDownload({
            challengeGate: { waitUntilClear: async () => true },
            notifyMainFailure: async (_host, message) => assert.fail(message),
            reportAddonHealthy: () => { healthy += 1; },
            automationDecision: decision,
            stepDelayMs: 0,
          });
          assert.strictEqual(clicks, 1);
          assert.strictEqual(healthy, decision.standaloneEntry ? 0 : 1);
        } finally {
          global.HTMLAnchorElement = previousAnchor;
          global.getComputedStyle = previousGetComputedStyle;
          sandbox.restore();
        }
      }
    },
  );
};
