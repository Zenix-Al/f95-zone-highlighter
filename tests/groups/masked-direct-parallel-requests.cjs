"use strict";

module.exports = function registerMaskedDirectParallelRequests(context) {
  const {
    assert,
    createDomSandbox,
    createFakeClock,
    loadModule,
    runTest,
  } = context;

  function createGM(initial = {}) {
    const values = new Map(Object.entries(initial));
    const writes = [];
    return {
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
      snapshot(key) {
        return structuredClone(values.get(key));
      },
      values,
      writes,
    };
  }

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 isolates concurrent request records", async () => {
    const {
      __processingDownloadTestInternals,
      clearProcessingDownloadTrigger,
      readProcessingDownloadTrigger,
      setProcessingDownloadTrigger,
      updateProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const gm = createGM();
    await Promise.all([
      setProcessingDownloadTrigger(gm, {
        requestId: "request-a",
        ownerTabId: "tab-a",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/a?token=one",
        closeDelayMs: 1000,
      }),
      setProcessingDownloadTrigger(gm, {
        requestId: "request-b",
        ownerTabId: "tab-b",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/b?token=two",
        closeDelayMs: 9000,
      }),
    ]);
    const keyA = `${__processingDownloadTestInternals.requestKeyPrefix}request-a`;
    const keyB = `${__processingDownloadTestInternals.requestKeyPrefix}request-b`;
    const beforeB = gm.snapshot(keyB);
    assert.strictEqual((await readProcessingDownloadTrigger(gm, { requestId: "request-a" })).closeDelayMs, 3000);
    assert.strictEqual((await readProcessingDownloadTrigger(gm, { requestId: "request-b" })).closeDelayMs, 9000);
    assert.strictEqual((await readProcessingDownloadTrigger(gm, { requestId: "missing" })).active, false);
    await clearProcessingDownloadTrigger(gm, { requestId: "request-a" });
    assert.strictEqual(gm.values.has(keyA), false);
    assert.deepStrictEqual(gm.snapshot(keyB), beforeB);
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-long-delay",
      host: "uploadnow.io",
      sourceUrl: "https://uploadnow.io/file/share",
      closeDelayMs: 3_600_000,
    });
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-short-delay",
      host: "uploadnow.io",
      sourceUrl: "https://uploadnow.io/other/share",
      closeDelayMs: 100,
    });
    assert.strictEqual(
      (
        await readProcessingDownloadTrigger(gm, {
          requestId: "request-long-delay",
        })
      ).closeDelayMs,
      3_600_000,
      "large configured close delays must not be capped",
    );
    assert.strictEqual(
      (
        await readProcessingDownloadTrigger(gm, {
          requestId: "request-short-delay",
        })
      ).closeDelayMs,
      3000,
      "close delay must retain the three-second safety minimum",
    );
    await Promise.all([
      setProcessingDownloadTrigger(gm, {
        requestId: "request-c",
        ownerTabId: "tab-same",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/c",
      }),
      setProcessingDownloadTrigger(gm, {
        requestId: "request-d",
        ownerTabId: "tab-same",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/d",
      }),
    ]);
    assert.strictEqual(
      (await readProcessingDownloadTrigger(gm, { requestId: "request-c" }))
        .ownerTabId,
      "tab-same",
    );
    assert.strictEqual(
      (await readProcessingDownloadTrigger(gm, { requestId: "request-d" }))
        .ownerTabId,
      "tab-same",
    );
    const beforeD = gm.snapshot(
      `${__processingDownloadTestInternals.requestKeyPrefix}request-d`,
    );
    await updateProcessingDownloadTrigger(gm, "request-c", {
      status: "failed",
    });
    assert.deepStrictEqual(
      gm.snapshot(`${__processingDownloadTestInternals.requestKeyPrefix}request-d`),
      beforeD,
    );
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 no-ID cleanup cannot touch siblings", async () => {
    const {
      clearProcessingDownloadTrigger,
      setProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const gm = createGM();
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-a",
      host: "gofile.io",
      sourceUrl: "https://gofile.io/d/a",
    });
    const writesBefore = gm.writes.length;
    assert.strictEqual(await clearProcessingDownloadTrigger(gm), false);
    assert.strictEqual(gm.writes.length, writesBefore);
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 reads legacy state by exact ID only", async () => {
    const {
      __processingDownloadTestInternals,
      readProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const now = Date.now();
    const gm = createGM({
      [__processingDownloadTestInternals.legacyKey]: {
        items: [
          {
            active: true,
            requestId: "legacy-a",
            ownerTabId: "tab-a",
            host: "gofile.io",
            createdAt: now,
            expiresAt: now + 60000,
            sourceUrl: "https://gofile.io/d/a",
          },
          {
            active: true,
            requestId: "legacy-b",
            ownerTabId: "tab-b",
            host: "gofile.io",
            createdAt: now,
            expiresAt: now + 60000,
            sourceUrl: "https://gofile.io/d/b",
          },
        ],
      },
    });
    assert.strictEqual((await readProcessingDownloadTrigger(gm, { requestId: "legacy-a" })).requestId, "legacy-a");
    assert.strictEqual((await readProcessingDownloadTrigger(gm)).active, false);
    assert.strictEqual((await readProcessingDownloadTrigger(gm, { requestId: "unknown" })).active, false);
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 expires only the addressed stale record", async () => {
    const {
      __processingDownloadTestInternals,
      readProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const prefix = __processingDownloadTestInternals.requestKeyPrefix;
    const stale = {
      active: true,
      requestId: "request-stale",
      ownerTabId: "tab-a",
      host: "gofile.io",
      createdAt: Date.now() - 120000,
      expiresAt: Date.now() - 1,
      sourceUrl: "https://gofile.io/d/stale",
    };
    const live = {
      ...stale,
      requestId: "request-live",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      sourceUrl: "https://gofile.io/d/live",
    };
    const gm = createGM({
      [`${prefix}request-stale`]: stale,
      [`${prefix}request-live`]: live,
    });
    assert.strictEqual(
      (await readProcessingDownloadTrigger(gm, {
        requestId: "request-stale",
      })).active,
      false,
    );
    assert.strictEqual(gm.values.has(`${prefix}request-stale`), false);
    assert.deepStrictEqual(gm.snapshot(`${prefix}request-live`), live);
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 route context requires matching fresh identity", () => {
    const sandbox = createDomSandbox("https://gofile.io/d/a");
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const { readRouteContext, writeRouteContext } = loadModule(
        "addons/masked-direct-addon/src/ports/routeContextRepository.js",
      );
      writeRouteContext({
        ownerTabId: "tab-a",
        requestId: "request-a",
        host: "gofile.io",
        createdAt: Date.now(),
      });
      assert.strictEqual(
        readRouteContext("f95ue_tab", {
          expectedRequestId: "request-a",
          expectedHost: "gofile.io",
        })?.requestId,
        "request-a",
      );
      assert.strictEqual(
        readRouteContext("f95ue_tab", { expectedRequestId: "request-b" }),
        null,
      );
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 automation claims only exact URL or session identity", async () => {
    const sandbox = createDomSandbox(
      `https://gofile.io/d/a?f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${Date.now()}`,
    );
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const {
        __processingDownloadTestInternals,
        setProcessingDownloadTrigger,
      } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-a",
        ownerTabId: "tab-a",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/a",
      });
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-b",
        ownerTabId: "tab-b",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/b",
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
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("gofile.io"),
        true,
      );
      const prefix = __processingDownloadTestInternals.requestKeyPrefix;
      await gm.deleteValue(`${prefix}request-a`);
      assert.strictEqual(
        await controller.shouldRunHostAutomation("gofile.io"),
        false,
        "a missing exact record must not claim request B",
      );
      sandbox.window.location.href = "https://gofile.io/d/b";
      const { writeRouteContext } = loadModule(
        "addons/masked-direct-addon/src/ports/routeContextRepository.js",
      );
      writeRouteContext({
        ownerTabId: "tab-b",
        requestId: "request-b",
        host: "gofile.io",
        createdAt: Date.now(),
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("gofile.io"),
        true,
        "a marker-stripped redirect may recover only its fresh session request",
      );
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 preserves Datanodes identity across stripped redirect", async () => {
    const now = Date.now();
    const sandbox = createDomSandbox(
      `https://datanodes.to/file/example?f95ue_dd=1&f95ue_tab=tab-a&f95ue_dd_req=request-a&f95ue_dd_ts=${now}`,
    );
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const { setProcessingDownloadTrigger } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-a",
        ownerTabId: "tab-a",
        host: "datanodes.to",
        sourceUrl: sandbox.window.location.href,
      });
      const controller = createDownloadPageController({
        addonId: "masked-direct-addon",
        debugLog() {},
        GMApi: gm,
        getIsBlockedByCore: () => false,
        getIsEnabled: () => true,
        handlers: {},
        originTabQueryKey: "f95ue_tab",
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("datanodes.to"),
        true,
      );
      sandbox.window.history.replaceState(
        {},
        "",
        "https://datanodes.to/download",
      );
      assert.strictEqual(
        await controller.shouldRunHostAutomation("datanodes.to"),
        true,
        "same-tab session identity must survive Datanodes stripping query parameters",
      );
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 recovers an immediate Datanodes redirect by exact source", async () => {
    const sandbox = createDomSandbox("https://datanodes.to/download");
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      sandbox.document.body.innerHTML = `
        <section>
          <div><h4>Downloading</h4></div>
          <div class="font-bold">Game.Build.123.zip</div>
        </section>
      `;
      const {
        readProcessingDownloadTriggerBySource,
        setProcessingDownloadTrigger,
      } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-immediate",
        ownerTabId: "tab-a",
        host: "datanodes.to",
        sourceUrl: "https://datanodes.to/file/Game.Build.123.zip",
      });
      assert.strictEqual(
        (
          await readProcessingDownloadTriggerBySource(gm, {
            host: "datanodes.to",
            sourceIdentifier: "Game.Build.123.zip",
          })
        ).requestId,
        "request-immediate",
      );
      const controller = createDownloadPageController({
        addonId: "masked-direct-addon",
        debugLog() {},
        GMApi: gm,
        getIsBlockedByCore: () => false,
        getIsEnabled: () => true,
        handlers: {},
        originTabQueryKey: "f95ue_tab",
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("datanodes.to"),
        true,
        "the first userscript execution may occur only after the redirect",
      );
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 refuses ambiguous same-source Datanodes recovery", async () => {
    const {
      readProcessingDownloadTriggerBySource,
      setProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const gm = createGM();
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-a",
      ownerTabId: "tab-a",
      host: "datanodes.to",
      sourceUrl: "https://datanodes.to/file/Same.Game.zip",
    });
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-b",
      ownerTabId: "tab-b",
      host: "datanodes.to",
      sourceUrl: "https://datanodes.to/file/Same.Game.zip",
    });
    assert.strictEqual(
      (
        await readProcessingDownloadTriggerBySource(gm, {
          host: "datanodes.to",
          sourceIdentifier: "Same.Game.zip",
        })
      ).active,
      false,
      "an indistinguishable markerless redirect must remain manual",
    );
  });

  runTest("Google Drive recovers a stripped cross-origin redirect by exact file ID", async () => {
    const sandbox = createDomSandbox(
      "https://drive.usercontent.google.com/download?id=file_ABC-123&export=download",
    );
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const {
        readProcessingDownloadTriggerBySource,
        setProcessingDownloadTrigger,
      } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-drive",
        ownerTabId: "tab-drive",
        host: "drive.google.com",
        sourceUrl:
          "https://drive.google.com/file/d/file_ABC-123/view?usp=sharing",
        closeDelayMs: 27000,
      });
      assert.strictEqual(
        (
          await readProcessingDownloadTriggerBySource(gm, {
            host: "drive.google.com",
            sourceIdentifier: "file_ABC-123",
          })
        ).requestId,
        "request-drive",
      );

      let resolvedRequest = null;
      const controller = createDownloadPageController({
        addonId: "masked-direct-addon",
        debugLog() {},
        GMApi: gm,
        getIsBlockedByCore: () => false,
        getIsEnabled: () => true,
        handlers: {},
        originTabQueryKey: "f95ue_tab",
        onManagedRequestResolved(request) {
          resolvedRequest = request;
        },
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("drive.google.com"),
        true,
      );
      assert.strictEqual(resolvedRequest.requestId, "request-drive");
      assert.strictEqual(resolvedRequest.ownerTabId, "tab-drive");
      assert.strictEqual(resolvedRequest.closeDelayMs, 27000);
      assert.strictEqual(
        new URL(sandbox.window.location.href).searchParams.has("f95ue_dd"),
        false,
        "recovery must not rewrite Google's query string",
      );
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("Google Drive opens and authorizes clean preview URLs without route markers", async () => {
    const href = "https://drive.google.com/file/d/file_CLEAN-123/view";
    const sandbox = createDomSandbox(href);
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const { createDirectDownloadFlowController } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/flowController.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      const gm = createGM();
      let openedUrl = "";
      const flow = createDirectDownloadFlowController({
        addonId: "masked-direct-addon",
        bridge: { dispatchCoreCommand() {} },
        GMApi: gm,
        openInTab(url) {
          openedUrl = url;
          return { close() {} };
        },
        normalizeUrl: (url) => new URL(url).href,
        withAutomationMarker(url) {
          const parsed = new URL(url);
          parsed.searchParams.set("f95ue_dd", "1");
          return parsed.href;
        },
        diagnostics: { error() {} },
        publishDirectDownloadEvent() {},
        registerManagedTab() {},
        ownerTabId: "tab-clean",
        originTabQueryKey: "f95ue_tab",
        getDownloadHost: () => "",
        getDownloadPageCloseDelayMs: () => 3500,
      });
      await flow.routeToDirectDownload(href);
      const opened = new URL(openedUrl);
      assert.strictEqual(opened.search, "");

      const controller = createDownloadPageController({
        addonId: "masked-direct-addon",
        debugLog() {},
        GMApi: gm,
        getIsBlockedByCore: () => false,
        getIsEnabled: () => true,
        handlers: {},
        originTabQueryKey: "f95ue_tab",
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("drive.google.com"),
        true,
      );
      assert.strictEqual(new URL(sandbox.window.location.href).search, "");
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("Google Drive refuses ambiguous same-file markerless recovery", async () => {
    const {
      readProcessingDownloadTriggerBySource,
      setProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const gm = createGM();
    for (const suffix of ["a", "b"]) {
      await setProcessingDownloadTrigger(gm, {
        requestId: `request-drive-${suffix}`,
        ownerTabId: `tab-${suffix}`,
        host: "drive.google.com",
        sourceUrl: "https://drive.google.com/file/d/same-file/view",
      });
    }
    assert.strictEqual(
      (
        await readProcessingDownloadTriggerBySource(gm, {
          host: "drive.google.com",
          sourceIdentifier: "same-file",
        })
      ).active,
      false,
    );
  });

  runTest("Google Drive supersedes an older same-tab request for the same file", async () => {
    const {
      readProcessingDownloadTrigger,
      readProcessingDownloadTriggerBySource,
      setProcessingDownloadTrigger,
    } = loadModule(
      "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
    );
    const gm = createGM();
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-drive-old",
      ownerTabId: "tab-drive",
      host: "drive.google.com",
      sourceUrl:
        "https://drive.google.com/file/d/retried-file/view?usp=sharing",
    });
    await setProcessingDownloadTrigger(gm, {
      requestId: "request-drive-new",
      ownerTabId: "tab-drive",
      host: "drive.google.com",
      sourceUrl: "https://drive.google.com/file/d/retried-file/view",
    });
    assert.strictEqual(
      (
        await readProcessingDownloadTriggerBySource(gm, {
          host: "drive.google.com",
          sourceIdentifier: "retried-file",
        })
      ).requestId,
      "request-drive-new",
    );
    assert.strictEqual(
      (
        await readProcessingDownloadTrigger(gm, {
          requestId: "request-drive-old",
        })
      ).active,
      false,
    );
  });

  runTest("download.gg uses a clean route and recovers its exact GM request", async () => {
    const href =
      "https://download.gg/en/file-18951734_18e45a29da12f63a";
    const sandbox = createDomSandbox(href);
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const {
        readProcessingDownloadTriggerBySource,
        setProcessingDownloadTrigger,
      } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "request-download-gg",
        ownerTabId: "tab-download-gg",
        host: "download.gg",
        sourceUrl: href,
      });
      assert.strictEqual(
        (
          await readProcessingDownloadTriggerBySource(gm, {
            host: "download.gg",
            sourceIdentifier: "/en/file-18951734_18e45a29da12f63a",
          })
        ).requestId,
        "request-download-gg",
      );
      const controller = createDownloadPageController({
        addonId: "masked-direct-addon",
        debugLog() {},
        GMApi: gm,
        getIsBlockedByCore: () => false,
        getIsEnabled: () => true,
        handlers: {},
        originTabQueryKey: "f95ue_tab",
      });
      assert.strictEqual(
        await controller.shouldRunHostAutomation("download.gg"),
        true,
      );
      assert.strictEqual(sandbox.window.location.search, "");
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 dedupes per event and accepts reverse-order siblings", () => {
    const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const { createDirectDownloadAttentionController } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/attention.js",
      );
      let listener;
      const handled = [];
      const controller = createDirectDownloadAttentionController({
        addTeardown() {},
        diagnostics: { error: (_reason, value) => handled.push(value.requestId) },
        showCoreToast() {},
        GMApi: null,
        addValueChangeListener(_key, callback) {
          listener = callback;
          return 1;
        },
        removeValueChangeListener() {},
        closeManagedTab() {},
      });
      controller.enableDirectDownloadAttentionListener({ shouldListen: () => true });
      const targetTabId = controller.localAttentionTabId;
      const newer = { id: "event-b", ts: Date.now() + 2, type: "failure", targetTabId, requestId: "request-b" };
      const older = { id: "event-a", ts: Date.now() + 1, type: "failure", targetTabId, requestId: "request-a" };
      listener("event", null, newer, true);
      listener("event", null, older, true);
      listener("event", null, older, true);
      listener("event", null, { ...older, id: "local" }, false);
      listener("event", null, { ...older, id: "other", targetTabId: "tab-other" }, true);
      assert.deepStrictEqual(handled, ["request-b", "request-a"]);
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("direct-download events honor the resolved request owner explicitly", async () => {
    const sandbox = createDomSandbox("https://uploadnow.io/example/share");
    const previousSessionStorage = global.sessionStorage;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      const writes = [];
      const { createDirectDownloadAttentionController } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/attention.js",
      );
      const controller = createDirectDownloadAttentionController({
        addTeardown() {},
        diagnostics: { error() {} },
        showCoreToast() {},
        GMApi: {
          async setValue(_key, value) {
            writes.push(value);
          },
        },
        addValueChangeListener() {},
        removeValueChangeListener() {},
        closeManagedTab() {},
      });
      await controller.publishDirectDownloadEvent({
        type: "success",
        host: "uploadnow.io",
        requestId: "request-uploadnow",
        targetTabId: "origin-uploadnow",
      });
      assert.strictEqual(writes[0].requestId, "request-uploadnow");
      assert.strictEqual(writes[0].targetTabId, "origin-uploadnow");
    } finally {
      global.sessionStorage = previousSessionStorage;
      sandbox.restore();
    }
  });

  runTest("origin tab closes a successful managed request at its fallback delay", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
    const clock = createFakeClock();
    const previousSessionStorage = global.sessionStorage;
    const previousSetTimeout = global.setTimeout;
    const previousClearTimeout = global.clearTimeout;
    try {
      global.sessionStorage = sandbox.window.sessionStorage;
      global.setTimeout = clock.setTimeout;
      global.clearTimeout = clock.clearTimeout;
      let listener;
      const closed = [];
      const { createDirectDownloadAttentionController } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/attention.js",
      );
      const controller = createDirectDownloadAttentionController({
        addTeardown() {},
        diagnostics: { error() {} },
        showCoreToast() {},
        GMApi: null,
        addValueChangeListener(_key, callback) {
          listener = callback;
          return 1;
        },
        removeValueChangeListener() {},
        closeManagedTab: (requestId) => closed.push(requestId),
      });
      controller.enableDirectDownloadAttentionListener({
        shouldListen: () => true,
      });
      listener(
        "event",
        null,
        {
          id: "success-event",
          ts: Date.now(),
          type: "success",
          targetTabId: controller.localAttentionTabId,
          requestId: "request-success",
          closeDelayMs: 45000,
        },
        true,
      );
      await clock.tick(44999);
      assert.deepStrictEqual(closed, []);
      await clock.tick(1);
      assert.deepStrictEqual(closed, ["request-success"]);
    } finally {
      global.sessionStorage = previousSessionStorage;
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-PARALLEL-REQUESTS-01 closes only the correlated managed tab", () => {
    const { createManagedDownloadTabs } = loadModule(
      "addons/masked-direct-addon/src/app/managedTabs.js",
    );
    const closed = [];
    const tabs = createManagedDownloadTabs();
    tabs.register("request-a", { close: () => closed.push("a") });
    tabs.register("request-b", { close: () => closed.push("b") });
    assert.strictEqual(tabs.close("request-a"), true);
    assert.deepStrictEqual(closed, ["a"]);
    assert.strictEqual(tabs.close("request-a"), false);
    assert.strictEqual(tabs.close("request-b"), true);
    assert.deepStrictEqual(closed, ["a", "b"]);
  });
};
