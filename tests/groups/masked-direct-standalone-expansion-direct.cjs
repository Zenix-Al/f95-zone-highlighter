"use strict";

module.exports = function registerMaskedDirectStandaloneExpansionDirect(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function createGM() {
    const values = new Map();
    let writes = 0;
    return {
      async getValue(key, fallback) {
        return values.has(key) ? structuredClone(values.get(key)) : fallback;
      },
      async setValue(key, value) {
        writes += 1;
        values.set(key, structuredClone(value));
      },
      async deleteValue(key) {
        writes += 1;
        values.delete(key);
      },
      get writes() {
        return writes;
      },
    };
  }

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 classifies exact Drive entries",
    () => {
      const { isGoogleDriveStandaloneEntryPage } = loadModule(
        "addons/masked-direct-addon/src/hosts/googleDrive.js",
      );
      for (const url of [
        "https://drive.google.com/file/d/file_ABC-123/view",
        "https://drive.google.com/file/d/file_ABC-123",
        "https://drive.google.com/open?id=file_ABC-123",
        "https://drive.google.com/uc?export=download&id=file_ABC-123",
        "https://drive.usercontent.google.com/download?id=file_ABC-123&confirm=token",
      ]) assert.strictEqual(isGoogleDriveStandaloneEntryPage(url), true, url);
      for (const url of [
        "https://drive.google.com/file/d/",
        "https://drive.google.com/open",
        "https://drive.google.com/uc?export=download",
        "https://drive.google.com/drive/u/0/folders/folder-id",
        "https://drive.google.com/",
        "https://drive.usercontent.google.com/download?confirm=token",
        "https://example.com/open?id=file_ABC-123",
      ]) assert.strictEqual(isGoogleDriveStandaloneEntryPage(url), false, url);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 keeps Drive navigation clean and local",
    async () => {
      const href = "https://drive.google.com/file/d/file_ABC-123/view";
      const sandbox = createDomSandbox(href);
      const previousSessionStorage = global.sessionStorage;
      global.sessionStorage = sandbox.window.sessionStorage;
      try {
        const { buildGoogleDriveDownloadUrl } = loadModule(
          "addons/masked-direct-addon/src/hosts/googleDrive.js",
        );
        const target = new URL(buildGoogleDriveDownloadUrl(href));
        assert.strictEqual(target.searchParams.get("id"), "file_ABC-123");
        for (const key of ["f95ue_dd", "f95ue_tab", "f95ue_dd_req", "f95ue_dd_ts"])
          assert.strictEqual(target.searchParams.has(key), false, key);

        const gm = createGM();
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
        const decision = await controller.decideHostAutomation("drive.google.com");
        assert.strictEqual(decision.mode, "standalone");
        assert.strictEqual(gm.writes, 0);
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 classifies only exact MixDrop aliases",
    () => {
      const { isMixdropFilePage, MIXDROP_HOST_ALIASES } = loadModule(
        "addons/masked-direct-addon/src/hosts/mixdrop.js",
      );
      assert.deepStrictEqual(MIXDROP_HOST_ALIASES, [
        "mixdrop.ag",
        "miixdrop.com",
        "miiixdrop.net",
        "miiiixdrop.net",
      ]);
      for (const host of MIXDROP_HOST_ALIASES)
        assert.strictEqual(isMixdropFilePage(`https://${host}/f/file-id`), true, host);
      for (const url of [
        "https://mixdrop.ag/e/file-id",
        "https://mixdrop.ag/f/",
        "https://mixdrop.com/f/file-id",
        "https://miiiiixdrop.net/f/file-id",
        "https://example.com/f/file-id",
      ]) assert.strictEqual(isMixdropFilePage(url), false, url);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 bounds MixDrop to two clicks",
    async () => {
      const sandbox = createDomSandbox("https://miixdrop.com/f/file-id");
      const previousAnchor = global.HTMLAnchorElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
        const button = sandbox.document.createElement("a");
        button.href = "#";
        button.className = "download-btn";
        button.textContent = "Download";
        sandbox.document.body.append(button);
        let clicks = 0;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          clicks += 1;
          button.href = "https://cdn.example/file.zip";
        });
        let healthy = 0;
        const { processMixdropDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/mixdrop.js",
        );
        await processMixdropDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (_host, message) => assert.fail(message),
          reportAddonHealthy: () => { healthy += 1; },
          secondStageDelayMs: 0,
          postClickGraceMs: 0,
        });
        assert.strictEqual(clicks, 2);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 guards UploadNow locale shares",
    async () => {
      const sandbox = createDomSandbox("https://uploadnow.io/en/share");
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
        const { isUploadNowSharePage, processUploadNowDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/uploadnow.js",
        );
        for (const url of [
          "https://uploadnow.io/en/share",
          "https://www.uploadnow.io/en-us/share",
        ]) assert.strictEqual(isUploadNowSharePage(url), true, url);
        for (const url of [
          "https://uploadnow.io/share",
          "https://uploadnow.io/en/",
          "https://example.com/en/share",
        ]) assert.strictEqual(isUploadNowSharePage(url), false, url);

        const failures = [];
        const options = {
          challengeGate: { isBlocked: () => false, waitUntilClear: async () => true },
          notifyMainFailure: async (_host, message) => failures.push(message),
          reportAddonHealthy: () => assert.fail("ambiguous share must not succeed"),
          timeoutMs: 5,
          intervalMs: 1,
          stableChecksRequired: 1,
        };
        await processUploadNowDownload(options);
        assert.match(failures.pop(), /no download buttons/i);
        for (let index = 0; index < 2; index += 1) {
          const button = sandbox.document.createElement("button");
          button.className = "file_browser_alt_options__fixture";
          button.innerHTML = '<svg data-icon="arrow-down-to-line"></svg>';
          sandbox.document.body.append(button);
        }
        await processUploadNowDownload(options);
        assert.match(failures.pop(), /exactly one file; found 2/i);
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 registers exact entries only",
    () => {
      const { classifyStandaloneHostRoute } = loadModule(
        "addons/masked-direct-addon/src/hosts/standaloneEligibility.js",
      );
      for (const [host, url] of [
        ["drive.google.com", "https://drive.google.com/open?id=file-id"],
        ["miiiixdrop.net", "https://miixdrop.com/f/file-id"],
        ["uploadnow.io", "https://uploadnow.io/en/share"],
      ]) assert.strictEqual(classifyStandaloneHostRoute(host, url).eligible, true, url);
      for (const [host, url] of [
        ["drive.google.com", "https://drive.usercontent.google.com/download"],
        ["miiiixdrop.net", "https://mixdrop.ag/e/file-id"],
        ["uploadnow.io", "https://uploadnow.io/share"],
      ]) assert.strictEqual(classifyStandaloneHostRoute(host, url).eligible, false, url);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 keeps managed ownership authoritative",
    async () => {
      for (const [host, baseUrl] of [
        ["drive.google.com", "https://drive.google.com/open?id=file-id"],
        ["miiiixdrop.net", "https://miixdrop.com/f/file-id"],
        ["uploadnow.io", "https://uploadnow.io/en/share"],
      ]) {
        const now = Date.now();
        const href = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}` +
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
};
