"use strict";

module.exports = function registerMaskedDirectStandaloneExpansionSimple(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createGM() {
    const values = new Map();
    return {
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

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 classifies exact entry routes",
    () => {
      const { isBuzzheavierFilePage } = loadModule(
        "addons/masked-direct-addon/src/hosts/buzzheavier.js",
      );
      const { isGofileContentPage } = loadModule(
        "addons/masked-direct-addon/src/hosts/gofile.js",
      );
      const { isMediafireFilePage } = loadModule(
        "addons/masked-direct-addon/src/hosts/mediafire.js",
      );
      const { isWorkuploadFilePage, isWorkuploadStartPage } = loadModule(
        "addons/masked-direct-addon/src/hosts/workupload.js",
      );
      for (const url of [
        "https://buzzheavier.com/s3xk3ngyzkx6",
        "https://bzzhr.to/s3xk3ngyzkx6",
      ]) assert.strictEqual(isBuzzheavierFilePage(url), true, url);
      assert.strictEqual(isGofileContentPage("https://gofile.io/d/r6RPqz"), true);
      for (const url of [
        "https://mediafire.com/file/abc123/file.zip/file",
        "https://mediafire.com/file/y4f1esr2kqgmzev",
        "https://www.mediafire.com/file_premium/abc123/file.zip/file",
      ]) assert.strictEqual(isMediafireFilePage(url), true, url);
      assert.strictEqual(isWorkuploadFilePage("https://workupload.com/file/JVuuyQMKU3p"), true);
      assert.strictEqual(isWorkuploadStartPage("https://workupload.com/start/JVuuyQMKU3p"), true);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 rejects broad and continuation routes",
    () => {
      const modules = {
        buzz: loadModule("addons/masked-direct-addon/src/hosts/buzzheavier.js"),
        gofile: loadModule("addons/masked-direct-addon/src/hosts/gofile.js"),
        mediafire: loadModule("addons/masked-direct-addon/src/hosts/mediafire.js"),
        workupload: loadModule("addons/masked-direct-addon/src/hosts/workupload.js"),
      };
      for (const url of [
        "https://buzzheavier.com/",
        "https://buzzheavier.com/login",
        "https://bzzhr.to/s3xk3ngyzkx6/preview",
        "https://example.com/s3xk3ngyzkx6",
      ]) assert.strictEqual(modules.buzz.isBuzzheavierFilePage(url), false, url);
      for (const url of ["https://gofile.io/", "https://gofile.io/d/", "https://example.com/d/r6RPqz"])
        assert.strictEqual(modules.gofile.isGofileContentPage(url), false, url);
      for (const url of [
        "https://mediafire.com/",
        "https://mediafire.com/folder/abc",
        "https://mediafire.com/file/abc/file",
      ]) assert.strictEqual(modules.mediafire.isMediafireFilePage(url), false, url);
      for (const url of [
        "https://workupload.com/",
        "https://workupload.com/start/JVuuyQMKU3p",
        "https://example.com/file/JVuuyQMKU3p",
      ]) assert.strictEqual(modules.workupload.isWorkuploadFilePage(url), false, url);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 authorizes only registered entry routes",
    () => {
      const { classifyStandaloneHostRoute } = loadModule(
        "addons/masked-direct-addon/src/hosts/standaloneEligibility.js",
      );
      for (const [host, url] of [
        ["buzzheavier.com", "https://bzzhr.to/s3xk3ngyzkx6"],
        ["gofile.io", "https://gofile.io/d/r6RPqz"],
        ["mediafire.com", "https://www.mediafire.com/file_premium/abc123/file.zip/file"],
        ["workupload.com", "https://workupload.com/file/JVuuyQMKU3p"],
      ]) {
        const sandbox = createDomSandbox(url);
        try {
          assert.deepStrictEqual(classifyStandaloneHostRoute(host, url), {
            eligible: true,
            reason: "standalone_safe_route",
          });
        } finally {
          sandbox.restore();
        }
      }
      const start = "https://workupload.com/start/JVuuyQMKU3p";
      const sandbox = createDomSandbox(start);
      try {
        assert.strictEqual(
          classifyStandaloneHostRoute("workupload.com", start).eligible,
          false,
        );
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 managed requests remain authoritative",
    async () => {
      for (const [host, baseUrl] of [
        ["buzzheavier.com", "https://buzzheavier.com/s3xk3ngyzkx6"],
        ["gofile.io", "https://gofile.io/d/r6RPqz"],
        ["mediafire.com", "https://mediafire.com/file/abc123/file.zip/file"],
        ["workupload.com", "https://workupload.com/file/JVuuyQMKU3p"],
      ]) {
        const now = Date.now();
        const separator = baseUrl.includes("?") ? "&" : "?";
        const href =
          baseUrl + separator +
          `f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${now}`;
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
            host,
            sourceUrl: href,
          });
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
            getStandalonePolicy: async () => ({ effectiveAutomateRegardless: true }),
          });
          const decision = await controller.decideHostAutomation(host);
          assert.strictEqual(decision.mode, "managed", host);
          assert.strictEqual(decision.request.requestId, "request-a", host);
        } finally {
          global.sessionStorage = previousSessionStorage;
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 Gofile triggers the single-file page action",
    async () => {
      const sandbox = createDomSandbox("https://gofile.io/d/5krbciLL");
      try {
        sandbox.document.body.innerHTML =
          '<button type="button" data-action="download">Download</button>';
        const button = sandbox.document.querySelector('[data-action="download"]');
        let clicks = 0;
        let healthy = 0;
        button.addEventListener("click", () => { clicks += 1; });
        const { processGofileDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/gofile.js",
        );
        await processGofileDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (host, reason) => assert.fail(`${host}: ${reason}`),
          reportAddonHealthy: () => { healthy += 1; },
          postReadyWaitMs: 0,
        });
        assert.strictEqual(clicks, 1);
        assert.strictEqual(healthy, 1);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 Gofile triggers one file inside a folder",
    async () => {
      const sandbox = createDomSandbox("https://gofile.io/d/5krbciLL");
      try {
        sandbox.document.body.innerHTML =
          '<div class="fm-row" data-id="file-a" data-type="file"><button type="button" data-action="download">Download</button></div>';
        const button = sandbox.document.querySelector('[data-action="download"]');
        let clicks = 0;
        button.addEventListener("click", () => { clicks += 1; });
        const { processGofileDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/gofile.js",
        );
        await processGofileDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (host, reason) => assert.fail(`${host}: ${reason}`),
          reportAddonHealthy() {},
          postReadyWaitMs: 0,
        });
        assert.strictEqual(clicks, 1);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 Gofile refuses multiple items",
    async () => {
      const sandbox = createDomSandbox("https://gofile.io/d/r6RPqz");
      try {
        sandbox.document.body.innerHTML =
          '<div id="fm-list"><div class="fm-row" data-id="a" data-type="file"></div><div class="fm-row" data-id="b" data-type="file"></div></div>';
        const failures = [];
        let healthy = 0;
        const { processGofileDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/gofile.js",
        );
        await processGofileDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => { healthy += 1; },
          postReadyWaitMs: 0,
        });
        assert.strictEqual(healthy, 0);
        assert.match(failures[0][1], /exactly one file/i);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 Gofile refuses an empty page",
    async () => {
      const sandbox = createDomSandbox("https://gofile.io/d/r6RPqz");
      try {
        sandbox.document.body.innerHTML = '<div id="fm-list"></div>';
        const failures = [];
        const { processGofileDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/gofile.js",
        );
        await processGofileDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy() {
            throw new Error("empty page must not succeed");
          },
          contentReadyTimeoutMs: 10,
          pollIntervalMs: 2,
          postReadyWaitMs: 0,
        });
        assert.match(failures[0][1], /failed to load a download action/i);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 MediaFire rejects non-HTTP final links",
    async () => {
      const sandbox = createDomSandbox(
        "https://mediafire.com/file/abc123/file.zip/file",
      );
      const previousAnchor = global.HTMLAnchorElement;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        const anchor = sandbox.document.createElement("a");
        anchor.id = "downloadButton";
        anchor.href = "javascript:void(0)";
        anchor.textContent = "Download";
        sandbox.document.body.append(anchor);
        const failures = [];
        const { processMediafireDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/mediafire.js",
        );
        await processMediafireDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy() {
            throw new Error("invalid final link must not succeed");
          },
          downloadAnchorTimeoutMs: 10,
          pollIntervalMs: 2,
        });
        assert.match(failures[0][1], /button not found/i);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        sandbox.restore();
      }
    },
  );
};
