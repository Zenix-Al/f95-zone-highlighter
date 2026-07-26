"use strict";

module.exports = function registerMaskedDirectReliability(context) {
  const { ROOT, assert, createDomSandbox, fs, loadModule, path, runTest } =
    context;

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

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 covers every runtime context",
    () => {
      const { classifyMaskedDirectContext } = loadModule(
        "addons/masked-direct-addon/src/app/context.js",
      );
      const external = (hostname) =>
        ["gofile.io", "pixeldrain.com"].includes(hostname);
      const cases = [
        [
          "f95-core",
          "https://f95zone.to/threads/example.1/",
          "f95-core",
          "thread",
        ],
        ["/masked/", "https://f95zone.to/masked/abc", "f95-core", "masked"],
        [
          "external standalone",
          "https://gofile.io/d/a",
          "external-standalone",
          "download-host",
        ],
        [
          "Google reCAPTCHA frame",
          "https://www.google.com/recaptcha/api2/anchor?k=fixture",
          "external-standalone",
          "recaptcha-frame",
        ],
        [
          "recaptcha.net frame",
          "https://www.recaptcha.net/recaptcha/api2/anchor?k=fixture",
          "external-standalone",
          "recaptcha-frame",
        ],
        [
          "unsupported F95",
          "https://f95zone.to/forums/games.2/",
          "unsupported",
          "unsupported",
        ],
        [
          "unsupported host",
          "https://example.com/file",
          "unsupported",
          "unsupported",
        ],
      ];
      for (const [label, href, kind, route] of cases) {
        const result = classifyMaskedDirectContext(new URL(href), {
          isSupportedExternalHost: external,
        });
        assert.deepStrictEqual(
          [result.kind, result.route],
          [kind, route],
          label,
        );
      }

      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8"),
      );
      const addon = manifest.addons.find(
        (entry) => entry.id === "masked-direct-addon",
      );
      assert.ok(addon.matches.includes("https://www.google.com/recaptcha/*"));
      assert.ok(
        addon.matches.includes("https://www.recaptcha.net/recaptcha/*"),
      );
    },
  );

  runTest(
    "Masked Direct indexes supported hosts without partial-domain matches",
    () => {
      const {
        findDirectDownloadHost,
        isSupportedDirectDownloadHost,
      } = loadModule(
        "addons/masked-direct-addon/src/hosts/metadata.js",
      );
      assert.strictEqual(findDirectDownloadHost("cdn.vikingfile.com")?.id, "vik1ngfile");
      assert.strictEqual(findDirectDownloadHost("files.datanodes.to")?.id, "datanodes");
      assert.strictEqual(findDirectDownloadHost("www.download.gg")?.id, "downloadgg");
      assert.strictEqual(
        findDirectDownloadHost("drive.usercontent.google.com")?.id,
        "googleDrive",
      );
      assert.strictEqual(
        findDirectDownloadHost("miiiixdrop.net")?.id,
        "mixdrop",
      );
      assert.strictEqual(findDirectDownloadHost("mixdrop.ag")?.id, "mixdrop");
      assert.strictEqual(
        findDirectDownloadHost("miiixdrop.net")?.id,
        "mixdrop",
      );
      assert.strictEqual(
        findDirectDownloadHost("www.uploadhaven.com")?.id,
        "uploadhaven",
      );
      assert.strictEqual(
        findDirectDownloadHost("www.krakenfiles.com")?.id,
        "krakenfiles",
      );
      assert.strictEqual(
        findDirectDownloadHost("www.uploadnow.io")?.id,
        "uploadnow",
      );
      assert.strictEqual(isSupportedDirectDownloadHost("evilvikingfile.com"), false);
      assert.strictEqual(isSupportedDirectDownloadHost("datanodes.to.example.com"), false);
    },
  );

  runTest(
    "Masked Direct delegates F95 thread observation to the core observer API",
    () => {
      const controller = fs.readFileSync(
        path.join(
          ROOT,
          "addons/masked-direct-addon/src/app/contexts/threadPageController.js",
        ),
        "utf8",
      );
      assert.doesNotMatch(controller, /new MutationObserver/);
      assert.match(controller, /watchElements\(THREAD_LINK_OBSERVER_ID\)/);
      assert.match(controller, /unwatchElements\(THREAD_LINK_OBSERVER_ID\)/);
      assert.match(controller, /const flags = await readThreadFlags\(false\)/);
    },
  );

  runTest(
    "Masked Direct clicks only DelaFil token links on recognized file pages",
    async () => {
      const fileUrl =
        "https://delafil.se/22f066decb5b9361/MelodyMuse_V0.10a_Windows.zip";
      const sandbox = createDomSandbox(fileUrl);
      const previousAnchor = global.HTMLAnchorElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const { classifyDelafilPage, processDelafilDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/delafil.js",
        );
        assert.strictEqual(classifyDelafilPage(fileUrl), "file");
        assert.strictEqual(
          classifyDelafilPage(`${fileUrl}?pt=generated`),
          "tokenized",
        );
        assert.strictEqual(
          classifyDelafilPage("https://delafil.se/about"),
          "unsupported",
        );

        const unrelated = sandbox.document.createElement("a");
        unrelated.href = "https://delafil.se/about?pt=wrong";
        unrelated.className = "btn";
        unrelated.textContent = "Download";
        sandbox.document.body.append(unrelated);

        const download = sandbox.document.createElement("a");
        download.href = `${fileUrl}?pt=generated`;
        download.className = "btn btn-default";
        download.textContent = "Ladda ner";
        sandbox.document.body.append(download);

        let clicked = 0;
        download.addEventListener("click", (event) => {
          event.preventDefault();
          clicked += 1;
        });
        const failures = [];
        let healthy = 0;
        await processDelafilDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
        });

        assert.strictEqual(clicked, 1);
        assert.strictEqual(download.target, "_self");
        assert.deepStrictEqual(failures, []);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct activates download.gg only on recognized file routes",
    async () => {
      const fileUrl = "https://download.gg/en/file-18951734_18e45a29da12f63a";
      const sandbox = createDomSandbox(fileUrl);
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const {
          DOWNLOAD_GG_POST_CLICK_GRACE_MS,
          isDownloadGgFilePage,
          processDownloadGg,
        } = loadModule("addons/masked-direct-addon/src/hosts/downloadgg.js");
        assert.strictEqual(DOWNLOAD_GG_POST_CLICK_GRACE_MS, 8000);
        assert.strictEqual(isDownloadGgFilePage(fileUrl), true);
        assert.strictEqual(
          isDownloadGgFilePage(
            "https://download.gg/fr-fr/file-18951734_18e45a29da12f63a/",
          ),
          true,
        );
        assert.strictEqual(
          isDownloadGgFilePage("https://download.gg/en/about"),
          false,
        );

        const button = sandbox.document.createElement("button");
        button.type = "submit";
        button.className = "downloadAttachment";
        button.textContent = "Download";
        sandbox.document.body.append(button);
        let clicked = 0;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          clicked += 1;
        });
        const failures = [];
        let healthy = 0;
        await processDownloadGg({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
          postClickGraceMs: 0,
        });

        assert.strictEqual(clicked, 1);
        assert.deepStrictEqual(failures, []);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct keeps Google Drive navigation clean and confirms one file",
    async () => {
      const preview =
        "https://drive.google.com/file/d/file_ABC-123/view" +
        "?f95ue_dd=1&f95ue_tab=tab-1&f95ue_dd_req=req-1&f95ue_dd_ts=123";
      const sandbox = createDomSandbox(
        "https://drive.usercontent.google.com/download" +
          "?id=file_ABC-123&f95ue_dd=1&f95ue_tab=tab-1" +
          "&f95ue_dd_req=req-1&f95ue_dd_ts=123",
      );
      const previousAnchor = global.HTMLAnchorElement;
      const previousForm = global.HTMLFormElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        global.HTMLFormElement = sandbox.window.HTMLFormElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const {
          buildGoogleDriveDownloadUrl,
          classifyGoogleDrivePage,
          processGoogleDriveDownload,
        } = loadModule(
          "addons/masked-direct-addon/src/hosts/googleDrive.js",
        );
        const direct = new URL(buildGoogleDriveDownloadUrl(preview));
        assert.strictEqual(direct.pathname, "/uc");
        assert.strictEqual(direct.searchParams.get("export"), "download");
        assert.strictEqual(direct.searchParams.get("id"), "file_ABC-123");
        assert.strictEqual(direct.searchParams.get("f95ue_dd_req"), null);
        assert.strictEqual(direct.searchParams.get("f95ue_dd"), null);
        assert.strictEqual(classifyGoogleDrivePage(preview), "preview");
        assert.strictEqual(
          classifyGoogleDrivePage(sandbox.window.location.href),
          "confirmation",
        );

        const unrelated = sandbox.document.createElement("a");
        unrelated.href = "https://example.com/download?confirm=no";
        unrelated.textContent = "Download";
        sandbox.document.body.append(unrelated);
        const confirmation = sandbox.document.createElement("a");
        confirmation.href =
          "https://drive.usercontent.google.com/download?confirm=yes&id=file_ABC-123";
        confirmation.textContent = "Download anyway";
        sandbox.document.body.append(confirmation);
        let clicked = 0;
        confirmation.addEventListener("click", (event) => {
          event.preventDefault();
          clicked += 1;
        });
        const failures = [];
        let healthy = 0;
        await processGoogleDriveDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
        });

        assert.strictEqual(clicked, 1);
        assert.deepStrictEqual(failures, []);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        global.HTMLFormElement = previousForm;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct completes both MixDrop download stages exactly once",
    async () => {
      const sandbox = createDomSandbox("https://miiiixdrop.net/f/file-123");
      const previousAnchor = global.HTMLAnchorElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const {
          MIXDROP_POST_CLICK_GRACE_MS,
          isMixdropFilePage,
          processMixdropDownload,
        } = loadModule("addons/masked-direct-addon/src/hosts/mixdrop.js");
        assert.strictEqual(MIXDROP_POST_CLICK_GRACE_MS, 10000);
        assert.strictEqual(
          isMixdropFilePage("https://miiiixdrop.net/f/file-123"),
          true,
        );
        assert.strictEqual(
          isMixdropFilePage("https://mixdrop.ag/f/file-123"),
          true,
        );
        assert.strictEqual(
          isMixdropFilePage("https://miiixdrop.net/f/file-123"),
          true,
        );
        assert.strictEqual(
          isMixdropFilePage("https://miiiixdrop.net/e/file-123"),
          false,
        );

        const button = sandbox.document.createElement("a");
        button.href = "#";
        button.className = "btn btn3 download-btn";
        button.textContent = "Download";
        sandbox.document.body.append(button);
        let clicks = 0;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          clicks += 1;
          if (clicks === 1) {
            button.href = "https://cdn.example.com/generated-file.zip";
          }
        });
        const failures = [];
        let healthy = 0;
        await processMixdropDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
          secondStageDelayMs: 0,
          postClickGraceMs: 0,
        });

        assert.strictEqual(clicks, 2);
        assert.strictEqual(button.target, "_self");
        assert.deepStrictEqual(failures, []);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct delays UploadHaven completion after the final click",
    async () => {
      const sandbox = createDomSandbox(
        "https://uploadhaven.com/download/file-123",
      );
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const {
          UPLOADHAVEN_POST_CLICK_GRACE_MS,
          isUploadHavenDownloadPage,
          processUploadHavenDownload,
        } = loadModule(
          "addons/masked-direct-addon/src/hosts/uploadhaven.js",
        );
        assert.strictEqual(UPLOADHAVEN_POST_CLICK_GRACE_MS, 10000);
        assert.strictEqual(
          isUploadHavenDownloadPage(
            "https://www.uploadhaven.com/download/file-123",
          ),
          true,
        );
        assert.strictEqual(
          isUploadHavenDownloadPage("https://uploadhaven.com/account"),
          false,
        );

        const button = sandbox.document.createElement("button");
        button.id = "submitFree";
        button.className = "uh-dl-btn-free ready";
        sandbox.document.body.append(button);
        let clicked = 0;
        let healthy = 0;
        button.addEventListener("click", () => {
          clicked += 1;
        });

        const startedAt = Date.now();
        await processUploadHavenDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (host, reason) => {
            assert.fail(`${host}: ${reason}`);
          },
          reportAddonHealthy: () => {
            healthy += 1;
          },
          initialWaitMs: 0,
          postClickGraceMs: 30,
        });

        assert.strictEqual(clicked, 1);
        assert.strictEqual(healthy, 1);
        assert.ok(
          Date.now() - startedAt >= 25,
          "close/failure countdown must begin after the post-click grace",
        );
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct does not repeat UploadHaven after a successful route click",
    async () => {
      const sandbox = createDomSandbox(
        "https://uploadhaven.com/download/file-123?f95ue_dd=1",
      );
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      const previousSessionStorage = global.sessionStorage;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        global.sessionStorage = sandbox.window.sessionStorage;
        const { processUploadHavenDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/uploadhaven.js",
        );
        sandbox.window.sessionStorage.setItem(
          "f95ue-uploadhaven-download:/download/file-123",
          String(Date.now()),
        );
        let healthy = 0;
        await processUploadHavenDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (host, reason) => {
            assert.fail(`${host}: ${reason}`);
          },
          reportAddonHealthy: () => {
            healthy += 1;
          },
          initialWaitMs: 0,
          postClickGraceMs: 0,
        });
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct pauses KrakenFiles at the shared challenge gate and clicks once",
    async () => {
      const sandbox = createDomSandbox(
        "https://krakenfiles.com/view/file-123/file.html",
      );
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const {
          isKrakenFilesFilePage,
          processKrakenFilesDownload,
        } = loadModule(
          "addons/masked-direct-addon/src/hosts/krakenfiles.js",
        );
        assert.strictEqual(
          isKrakenFilesFilePage(
            "https://www.krakenfiles.com/view/file-123/file.html?download=1",
          ),
          true,
        );
        assert.strictEqual(
          isKrakenFilesFilePage("https://krakenfiles.com/view/file-123"),
          false,
        );

        const button = sandbox.document.createElement("button");
        button.type = "submit";
        button.className = "btn btn-primary";
        button.innerHTML = '<span class="btn-text">Download now</span>';
        sandbox.document.body.append(button);
        let clicked = 0;
        let healthy = 0;
        let gateChecks = 0;
        button.addEventListener("click", () => {
          clicked += 1;
        });

        const startedAt = Date.now();
        await processKrakenFilesDownload({
          challengeGate: {
            waitUntilClear: async () => {
              gateChecks += 1;
              return true;
            },
          },
          notifyMainFailure: async (host, reason) => {
            assert.fail(`${host}: ${reason}`);
          },
          reportAddonHealthy: () => {
            healthy += 1;
          },
          postClickGraceMs: 30,
        });

        assert.strictEqual(gateChecks, 2);
        assert.strictEqual(clicked, 1);
        assert.strictEqual(healthy, 1);
        assert.ok(
          Date.now() - startedAt >= 25,
          "close/failure countdown must begin after KrakenFiles' grace",
        );
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct clicks one UploadNow file and refuses multi-file shares",
    async () => {
      const sandbox = createDomSandbox(
        "https://uploadnow.io/share-123/share",
      );
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle =
          sandbox.window.getComputedStyle.bind(sandbox.window);
        const { isUploadNowSharePage, processUploadNowDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/uploadnow.js",
        );
        assert.strictEqual(
          isUploadNowSharePage("https://www.uploadnow.io/share-123/share?x=1"),
          true,
        );
        assert.strictEqual(
          isUploadNowSharePage("https://uploadnow.io/share-123/files"),
          false,
        );

        const makeButton = () => {
          const button = sandbox.document.createElement("button");
          button.className = "file_browser_alt_options__fixture";
          button.innerHTML =
            '<svg data-icon="arrow-down-to-line"></svg>';
          sandbox.document.body.append(button);
          return button;
        };
        const first = makeButton();
        let clicks = 0;
        first.addEventListener("click", () => {
          clicks += 1;
        });
        let healthy = 0;
        const failures = [];
        const common = {
          challengeGate: {
            isBlocked: () => false,
            waitUntilClear: async () => true,
          },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
          intervalMs: 1,
          stableChecksRequired: 1,
          timeoutMs: 100,
        };

        await processUploadNowDownload(common);
        assert.strictEqual(clicks, 1);
        assert.strictEqual(healthy, 1);
        assert.deepStrictEqual(failures, []);

        makeButton();
        await processUploadNowDownload(common);
        assert.strictEqual(clicks, 1, "multi-file share must not click");
        assert.strictEqual(healthy, 1);
        assert.deepStrictEqual(failures, [
          [
            "uploadnow.io",
            "Automatic download requires exactly one file; found 2.",
          ],
        ]);
      } finally {
        global.HTMLButtonElement = previousButton;
        global.getComputedStyle = previousGetComputedStyle;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 dispatches every current host only when managed",
    async () => {
      const { DIRECT_DOWNLOAD_HOSTS } = loadModule(
        "addons/masked-direct-addon/src/hosts/metadata.js",
      );
      const { setProcessingDownloadTrigger } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const { createDownloadPageController } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
      );
      for (const [index, host] of DIRECT_DOWNLOAD_HOSTS.entries()) {
        const requestId = `host-${host.id}`;
        const ownerTabId = `tab-${index}`;
        const href =
          `https://${host.canonicalHost}/file/example?` +
          `f95ue_dd=1&f95ue_tab=${ownerTabId}&f95ue_dd_req=${requestId}` +
          `&f95ue_dd_ts=${Date.now()}`;
        const sandbox = createDomSandbox(href);
        const previousSessionStorage = global.sessionStorage;
        try {
          global.sessionStorage = sandbox.window.sessionStorage;
          const gm = createGM();
          await setProcessingDownloadTrigger(gm, {
            requestId,
            ownerTabId,
            host: host.canonicalHost,
            sourceUrl: href,
          });
          const calls = [];
          const controller = createDownloadPageController({
            addonId: "masked-direct-addon",
            debugLog() {},
            GMApi: gm,
            getIsBlockedByCore: () => false,
            getIsEnabled: () => true,
            handlers: {
              [host.canonicalHost]: async () => {
                calls.push(host.id);
              },
            },
            originTabQueryKey: "f95ue_tab",
          });
          await controller.runDownloadPageHooks();
          assert.deepStrictEqual(calls, [host.id], `${host.id}: managed`);
          sandbox.window.sessionStorage.clear();
          sandbox.window.history.replaceState(
            {},
            "",
            `https://${host.canonicalHost}/file/unmanaged`,
          );
          await controller.runDownloadPageHooks();
          assert.deepStrictEqual(calls, [host.id], `${host.id}: standalone`);
        } finally {
          global.sessionStorage = previousSessionStorage;
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 acknowledges terminal teardown once",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
      try {
        const { createMaskedDirectLifecycle } = loadModule(
          "addons/masked-direct-addon/src/app/lifecycle.js",
        );
        const events = [];
        const state = { blockedByCore: false, enabled: false };
        const lifecycle = createMaskedDirectLifecycle({
          bridge: {
            getAddonAccess: async () => ({
              ok: true,
              value: { enabled: true },
            }),
          },
          runtime: { addonId: "masked-direct-addon" },
          state,
          settings: {
            invalidate: () => events.push("invalidate"),
            storageGet: async () => true,
            storageSet: async (_key, value) => events.push(`stored:${value}`),
          },
          styles: {
            register: async () => events.push("style:on"),
            unregister: async () => events.push("style:off"),
          },
          registration: {
            acknowledgeTeardown: () => events.push("ack"),
            publishStatus: () => events.push(`status:${state.enabled}`),
          },
          pageBehavior: { apply: async () => events.push("apply") },
          clearOwnedResources: () => events.push("clear"),
          diagnostics: { warn: () => {} },
        });
        lifecycle.bindCommands();
        lifecycle.bindCommands();
        await lifecycle.initializeEnabledState();
        await lifecycle.setEnabled(false);
        await lifecycle.setEnabled(true);
        sandbox.window.dispatchEvent(
          new sandbox.window.CustomEvent("f95ue:addon-command", {
            detail: { addonId: "masked-direct-addon", command: "refresh" },
          }),
        );
        await lifecycle.teardown("route");
        await lifecycle.teardown("duplicate");
        await lifecycle.setEnabled(true);
        assert.strictEqual(events.filter((value) => value === "ack").length, 1);
        assert.strictEqual(
          events.filter((value) => value === "clear").length,
          2,
        );

        const secondEvents = [];
        const second = createMaskedDirectLifecycle({
          bridge: { getAddonAccess: async () => ({ ok: true, value: {} }) },
          runtime: { addonId: "masked-direct-addon" },
          state: { blockedByCore: false, enabled: false },
          settings: {
            invalidate() {},
            storageGet: async () => false,
            storageSet: async () => {},
          },
          styles: { register: async () => {}, unregister: async () => {} },
          registration: {
            acknowledgeTeardown: () => secondEvents.push("ack"),
            publishStatus() {},
          },
          pageBehavior: { apply: async () => {} },
          clearOwnedResources() {},
          diagnostics: { warn() {} },
        });
        second.bindCommands();
        await second.teardown("re-registration");
        assert.deepStrictEqual(secondEvents, ["ack"]);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 owns one listener and dedupes missed cleanup",
    () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
      const previousSessionStorage = global.sessionStorage;
      try {
        global.sessionStorage = sandbox.window.sessionStorage;
        const { createDirectDownloadAttentionController } = loadModule(
          "addons/masked-direct-addon/src/domain/directDownload/attention.js",
        );
        const teardowns = [];
        const errors = [];
        const toasts = [];
        let callback;
        let registrations = 0;
        let removals = 0;
        const controller = createDirectDownloadAttentionController({
          addTeardown: (teardown) => teardowns.push(teardown),
          diagnostics: {
            error: (_code, details) => errors.push(details.requestId),
          },
          showCoreToast: (message, type) => toasts.push([message, type]),
          GMApi: null,
          addValueChangeListener: (_key, nextCallback) => {
            registrations += 1;
            callback = nextCallback;
            return 17;
          },
          removeValueChangeListener: (id) => {
            assert.strictEqual(id, 17);
            removals += 1;
          },
          closeManagedTab() {},
        });
        controller.enableDirectDownloadAttentionListener({
          shouldListen: () => true,
        });
        controller.enableDirectDownloadAttentionListener({
          shouldListen: () => true,
        });
        const payload = {
          id: "event-one",
          ts: Date.now(),
          type: "failure",
          targetTabId: controller.localAttentionTabId,
          requestId: "request-one",
        };
        callback("key", null, payload, true);
        callback("key", null, payload, true);
        teardowns[0]();
        teardowns[0]();
        assert.deepStrictEqual(
          { registrations, removals, errors, toasts },
          {
            registrations: 1,
            removals: 1,
            errors: ["request-one"],
            toasts: [
              [
                "Direct Download (unknown): Direct download needs manual action.",
                "error",
              ],
            ],
          },
        );
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct pauses for a Cloudflare challenge and resumes after it clears",
    async () => {
      const sandbox = createDomSandbox("https://datanodes.to/download");
      try {
        const { isCloudflareChallengePage, waitForCloudflareChallenge } =
          loadModule(
            "addons/masked-direct-addon/src/hosts/shared/cloudflareChallenge.js",
          );
        const challenge = sandbox.window.document.createElement("div");
        challenge.id = "cf-chl-widget";
        sandbox.window.document.body.append(challenge);
        assert.strictEqual(isCloudflareChallengePage(), true);

        const events = [];
        setTimeout(() => challenge.remove(), 0);
        const result = await waitForCloudflareChallenge({
          host: "datanodes.to",
          pollMs: 1,
          timeoutMs: 100,
          notifyChallenge: (host, message) =>
            events.push(["notify", host, message]),
          preserveRequest: () => events.push(["preserve"]),
        });
        assert.deepStrictEqual(result, { detected: true, cleared: true });
        assert.strictEqual(events[0][0], "notify");
        assert.strictEqual(events[0][1], "datanodes.to");
        assert.strictEqual(
          events.filter(([type]) => type === "preserve").length,
          1,
        );
        assert.strictEqual(isCloudflareChallengePage(), false);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct detects a Cloudflare challenge that appears after automation starts",
    async () => {
      const sandbox = createDomSandbox("https://datanodes.to/download");
      try {
        const { createCloudflareChallengeMonitor } = loadModule(
          "addons/masked-direct-addon/src/hosts/shared/cloudflareChallenge.js",
        );
        const events = [];
        const monitor = createCloudflareChallengeMonitor({
          host: "datanodes.to",
          pollMs: 1000,
          timeoutMs: 100,
          notifyChallenge: () => events.push("notify"),
          preserveRequest: () => events.push("preserve"),
        });
        monitor.start();
        assert.strictEqual(monitor.isBlocked(), false);

        const challenge = sandbox.window.document.createElement("div");
        challenge.className = "cf-turnstile";
        sandbox.window.document.body.append(challenge);
        assert.strictEqual(monitor.isBlocked(), true);
        setTimeout(() => challenge.remove(), 0);
        assert.strictEqual(await monitor.waitUntilClear(), true);
        assert.deepStrictEqual(events, ["notify", "preserve"]);
        monitor.dispose();
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct resumes when the user completes an embedded Turnstile challenge",
    async () => {
      const sandbox = createDomSandbox("https://datanodes.to/download");
      try {
        const { createCloudflareChallengeMonitor, isCloudflareChallengePage } =
          loadModule(
            "addons/masked-direct-addon/src/hosts/shared/cloudflareChallenge.js",
          );
        const widget = sandbox.window.document.createElement("div");
        widget.className = "cf-turnstile";
        const response = sandbox.window.document.createElement("input");
        response.name = "cf-turnstile-response";
        widget.append(response);
        sandbox.window.document.body.append(widget);

        const monitor = createCloudflareChallengeMonitor({
          host: "datanodes.to",
          pollMs: 1000,
          timeoutMs: 100,
        });
        monitor.start();
        assert.strictEqual(isCloudflareChallengePage(), true);
        setTimeout(() => {
          response.value = "verified-token";
        }, 0);
        assert.strictEqual(await monitor.waitUntilClear(), true);
        assert.strictEqual(isCloudflareChallengePage(), false);
        monitor.dispose();
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "Masked Direct renders challenge attention through the core toast only",
    () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/example.1/");
      const previousSessionStorage = global.sessionStorage;
      try {
        global.sessionStorage = sandbox.window.sessionStorage;
        const { createDirectDownloadAttentionController } = loadModule(
          "addons/masked-direct-addon/src/domain/directDownload/attention.js",
        );
        const toasts = [];
        let callback;
        const controller = createDirectDownloadAttentionController({
          addTeardown() {},
          diagnostics: {
            error: () => assert.fail("challenge is not an error"),
          },
          showCoreToast: (message, type) => toasts.push([message, type]),
          GMApi: null,
          addValueChangeListener: (_key, nextCallback) => {
            callback = nextCallback;
            return 1;
          },
          removeValueChangeListener() {},
          closeManagedTab() {},
        });
        controller.enableDirectDownloadAttentionListener({
          shouldListen: () => true,
        });
        callback(
          "key",
          null,
          {
            id: "challenge-one",
            ts: Date.now(),
            type: "challenge",
            host: "datanodes.to",
            message: "Complete verification.",
            targetTabId: controller.localAttentionTabId,
            requestId: "request-one",
          },
          true,
        );
        assert.deepStrictEqual(toasts, [
          ["Direct Download (datanodes.to): Complete verification.", "warning"],
        ]);
      } finally {
        global.sessionStorage = previousSessionStorage;
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 isolates overlapping outcomes and abandoned tabs",
    async () => {
      const {
        __processingDownloadTestInternals,
        clearProcessingDownloadTrigger,
        readProcessingDownloadTrigger,
        setProcessingDownloadTrigger,
        updateProcessingDownloadTrigger,
      } = loadModule(
        "addons/masked-direct-addon/src/domain/directDownload/processingTrigger.js",
      );
      const scenarios = [
        ["two successes", "completed", "completed", ["a", "b"]],
        ["success and failure", "completed", "failed", ["b", "a"]],
        ["timeout and success", "timed-out", "completed", ["b", "a"]],
      ];
      for (const [label, statusA, statusB, order] of scenarios) {
        const gm = createGM();
        await setProcessingDownloadTrigger(gm, {
          requestId: "a",
          ownerTabId: "tab-a",
          host: "gofile.io",
          sourceUrl: "https://gofile.io/d/a",
        });
        await setProcessingDownloadTrigger(gm, {
          requestId: "b",
          ownerTabId: "tab-b",
          host: "gofile.io",
          sourceUrl: "https://gofile.io/d/b",
        });
        const statuses = { a: statusA, b: statusB };
        for (const id of order) {
          await updateProcessingDownloadTrigger(gm, id, {
            status: statuses[id],
          });
        }
        assert.strictEqual(
          (await readProcessingDownloadTrigger(gm, { requestId: "a" })).status,
          statusA,
          `${label}: A`,
        );
        assert.strictEqual(
          (await readProcessingDownloadTrigger(gm, { requestId: "b" })).status,
          statusB,
          `${label}: B`,
        );
        await clearProcessingDownloadTrigger(gm, { requestId: order[0] });
        assert.strictEqual(
          (await readProcessingDownloadTrigger(gm, { requestId: order[1] }))
            .status,
          statuses[order[1]],
          `${label}: sibling`,
        );
      }
      const gm = createGM();
      await setProcessingDownloadTrigger(gm, {
        requestId: "abandoned",
        ownerTabId: "closed-tab",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/left-open",
      });
      await setProcessingDownloadTrigger(gm, {
        requestId: "live",
        ownerTabId: "live-tab",
        host: "gofile.io",
        sourceUrl: "https://gofile.io/d/live",
      });
      await updateProcessingDownloadTrigger(gm, "live", {
        status: "completed",
      });
      assert.strictEqual(
        (await readProcessingDownloadTrigger(gm, { requestId: "abandoned" }))
          .active,
        true,
      );
      assert.strictEqual(
        (await readProcessingDownloadTrigger(gm, { requestId: "live" })).status,
        "completed",
      );
      assert.ok(
        gm.values.has(
          `${__processingDownloadTestInternals.requestKeyPrefix}abandoned`,
        ),
      );
    },
  );

  runTest(
    "MASKED-DIRECT-RELIABILITY-VERIFY-01 documents compatibility and contains no toast surface",
    () => {
      const docs = fs.readFileSync(
        path.join(ROOT, "docs/architecture/masked-direct-reliability.md"),
        "utf8",
      );
      for (const key of [
        "f95ue.addon.maskedDirect.request.",
        "f95ue.addon.maskedDirect.processingDownload",
        "f95ue.addon.maskedDirect.directDownloadEvent",
        "f95ue.addon.directDownload.tabId",
        "f95ue.addon.maskedDirect.routeContext",
        "f95ue.addon.maskedDirect.source.<normalized-file-identifier>",
        "redirect to `/download` before the userscript executes",
        "must never select",
      ]) {
        assert.ok(docs.includes(key), `missing compatibility note for ${key}`);
      }
      const sourceRoot = path.join(ROOT, "addons/masked-direct-addon/src");
      const source = fs
        .readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
        .map((entry) =>
          fs.readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
        )
        .join("\n");
      assert.doesNotMatch(source, /f95ue-addon-toast|toastEl/);
      assert.match(source, /toast\.show/);
    },
  );
};
