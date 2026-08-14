"use strict";

module.exports = function registerMaskedDirectStandaloneBaseline(context) {
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
      async deleteValue(key) {
        values.delete(key);
      },
    };
  }

  function withSessionStorage(sandbox, callback) {
    const previous = global.sessionStorage;
    global.sessionStorage = sandbox.window.sessionStorage;
    return Promise.resolve()
      .then(callback)
      .finally(() => {
        global.sessionStorage = previous;
        sandbox.restore();
      });
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-BASELINE-01 blocks manual visits for every canonical host",
    async () => {
      const cases = [
        ["buzzheavier.com", "https://buzzheavier.com/f/example"],
        ["gofile.io", "https://gofile.io/d/example"],
        ["drive.google.com", "https://drive.google.com/file/d/example/view"],
        ["pixeldrain.com", "https://pixeldrain.com/u/example"],
        ["krakenfiles.com", "https://krakenfiles.com/view/example/file.html"],
        ["datanodes.to", "https://datanodes.to/file/example"],
        ["delafil.se", "https://delafil.se/0123456789abcdef/file.zip"],
        ["download.gg", "https://download.gg/file-example"],
        ["vik1ngfile.site", "https://vik1ngfile.site/f/example"],
        ["mediafire.com", "https://mediafire.com/file/example/file"],
        ["miiiixdrop.net", "https://miiiixdrop.net/f/example"],
        ["uploadhaven.com", "https://uploadhaven.com/download/example"],
        ["uploadnow.io", "https://uploadnow.io/example/share"],
        ["workupload.com", "https://workupload.com/file/example"],
      ];
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );

      for (const [host, href] of cases) {
        const sandbox = createDomSandbox(href);
        await withSessionStorage(sandbox, async () => {
          const controller = createDownloadPageController({
            addonId: "masked-direct-addon",
            debugLog() {},
            GMApi: createGM(),
            getIsBlockedByCore: () => false,
            getIsEnabled: () => true,
            handlers: {},
            originTabQueryKey: "f95ue_tab",
          });
          assert.strictEqual(
            await controller.shouldRunHostAutomation(host),
            false,
            `${host} must require managed identity at baseline`,
          );
        });
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-BASELINE-01 accepts and exposes only the exact managed request",
    async () => {
      const now = Date.now();
      const sandbox = createDomSandbox(
        `https://gofile.io/d/example?f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${now}`,
      );
      await withSessionStorage(sandbox, async () => {
        const gm = createGM();
        const { setProcessingDownloadTrigger } = loadModule(
          "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
        );
        await setProcessingDownloadTrigger(gm, {
          requestId: "request-a",
          ownerTabId: "tab-a",
          host: "gofile.io",
          sourceUrl: "https://gofile.io/d/example",
        });
        await setProcessingDownloadTrigger(gm, {
          requestId: "request-b",
          ownerTabId: "tab-b",
          host: "gofile.io",
          sourceUrl: "https://gofile.io/d/other",
        });
        let resolved = null;
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
          onManagedRequestResolved(request) {
            resolved = request;
          },
        });

        assert.strictEqual(
          await controller.shouldRunHostAutomation("gofile.io"),
          true,
        );
        assert.strictEqual(resolved?.requestId, "request-a");
        assert.strictEqual(resolved?.ownerTabId, "tab-a");
      });
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-BASELINE-01 refuses managed close without request identity",
    async () => {
      const sandbox = createDomSandbox("https://gofile.io/d/example");
      await withSessionStorage(sandbox, async () => {
        let closeRequests = 0;
        let localCloses = 0;
        sandbox.window.close = () => {
          localCloses += 1;
        };
        const { closeManagedDownloadTabAfterDelay } = loadModule(
          "addons/masked-direct-addon/src/domain/directDownload/managedClose.js",
        );
        const result = await closeManagedDownloadTabAfterDelay(0, "f95ue_tab", {
          requestManagedTabClose() {
            closeRequests += 1;
          },
        });
        assert.strictEqual(result, false);
        assert.strictEqual(closeRequests, 0);
        assert.strictEqual(localCloses, 0);
      });
    },
  );
};
