"use strict";

module.exports = function registerMaskedDirectReliability(context) {
  const { assert, createDomSandbox, createFakeClock, loadModule, runTest } = context;
  const routeOf = (processor, url, role) =>
    loadModule("addons/masked-direct-addon/src/hosts/shared/routes.js").findHostRoute(
      processor.definition,
      url,
      role,
    );

  runTest(
    "MASKED-DIRECT-DOWNLOADGG-FAILURE-01 missing controls fail without final-action success",
    async () => {
      const sandbox = createDomSandbox("https://download.gg/file-example");
      const original = {
        now: Date.now,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
      };
      const clock = createFakeClock();
      try {
        const { processDownloadGg } = loadModule(
          "addons/masked-direct-addon/src/hosts/downloadgg.js",
        );
        Date.now = clock.now;
        global.setTimeout = clock.setTimeout;
        global.clearTimeout = clock.clearTimeout;
        const failures = [];
        let healthy = 0,
          settled = false;
        const operation = processDownloadGg({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => {
            failures.push(args);
          },
          reportAddonHealthy: () => {
            healthy += 1;
          },
        }).then(() => {
          settled = true;
        });
        for (let step = 0; step < 50 && !settled; step += 1) {
          await Promise.resolve();
          await clock.tick(500);
        }
        assert.strictEqual(settled, true, "missing control must settle within its virtual timeout");
        await operation;
        assert.deepStrictEqual(failures, [["download.gg", "Download button not found."]]);
        assert.strictEqual(healthy, 0, "no initiation/auto-close success may be reported");
        assert.strictEqual(clock.pending(), 0);
      } finally {
        Date.now = original.now;
        global.setTimeout = original.setTimeout;
        global.clearTimeout = original.clearTimeout;
        sandbox.restore();
      }
    },
  );

  runTest("MASKED-DIRECT-DATANODES-01 flow does not patch window.setInterval", async () => {
    const sandbox = createDomSandbox("https://datanodes.to/download");
    const originalSetInterval = global.window.setInterval;
    try {
      const { processDatanodesDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/datanodes/index.js",
      );
      let failure = "";
      await processDatanodesDownload({
        challengeGate: null,
        notifyMainFailure: async (_host, message) => {
          failure = message;
        },
        reportAddonHealthy: () => {},
        settings: { datanodes: { totalFlowTimeout: 1, pollInterval: 100 } },
      });
      assert.strictEqual(global.window.setInterval, originalSetInterval);
      assert.strictEqual(
        Object.keys(global.window).some((key) => key.includes("f95ue_datanodes")),
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 650));
      assert.match(failure, /timed out/);
    } finally {
      sandbox.restore();
    }
  });

  runTest("Masked Direct indexes supported hosts without partial-domain matches", () => {
    const { findDirectDownloadHost, isSupportedDirectDownloadHost } = loadModule(
      "addons/masked-direct-addon/src/hosts/metadata.js",
    );
    assert.strictEqual(findDirectDownloadHost("cdn.vikingfile.com")?.id, "vik1ngfile");
    assert.strictEqual(findDirectDownloadHost("files.datanodes.to")?.id, "datanodes");
    assert.strictEqual(findDirectDownloadHost("www.download.gg")?.id, "downloadgg");
    assert.strictEqual(findDirectDownloadHost("drive.usercontent.google.com")?.id, "googleDrive");
    assert.strictEqual(findDirectDownloadHost("miiiixdrop.net")?.id, "mixdrop");
    assert.strictEqual(findDirectDownloadHost("mixdrop.ag")?.id, "mixdrop");
    assert.strictEqual(findDirectDownloadHost("miixdrop.com")?.id, "mixdrop");
    assert.strictEqual(findDirectDownloadHost("miiixdrop.net")?.id, "mixdrop");
    assert.strictEqual(findDirectDownloadHost("www.uploadhaven.com")?.id, "uploadhaven");
    assert.strictEqual(findDirectDownloadHost("www.krakenfiles.com")?.id, "krakenfiles");
    assert.strictEqual(findDirectDownloadHost("www.uploadnow.io")?.id, "uploadnow");
    assert.strictEqual(isSupportedDirectDownloadHost("evilvikingfile.com"), false);
    assert.strictEqual(isSupportedDirectDownloadHost("datanodes.to.example.com"), false);
  });

  runTest("Masked Direct clicks only DelaFil token links on recognized file pages", async () => {
    const fileUrl = "https://delafil.se/22f066decb5b9361/MelodyMuse_V0.10a_Windows.zip";
    const sandbox = createDomSandbox(fileUrl);
    const previousAnchor = global.HTMLAnchorElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { processDelafilDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/delafil.js",
      );
      const classifyDelafilPage = (url) =>
        routeOf(processDelafilDownload, url)?.kind || "unsupported";
      assert.strictEqual(classifyDelafilPage(fileUrl), "file");
      assert.strictEqual(classifyDelafilPage(`${fileUrl}?pt=generated`), "tokenized");
      assert.strictEqual(classifyDelafilPage("https://delafil.se/about"), "unsupported");

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
  });

  runTest("Masked Direct activates download.gg only on recognized file routes", async () => {
    const fileUrl = "https://download.gg/en/file-18951734_18e45a29da12f63a";
    const sandbox = createDomSandbox(fileUrl);
    const previousButton = global.HTMLButtonElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { DOWNLOAD_GG_POST_CLICK_GRACE_MS, processDownloadGg } = loadModule(
        "addons/masked-direct-addon/src/hosts/downloadgg.js",
      );
      const isDownloadGgFilePage = (url) => routeOf(processDownloadGg, url)?.kind === "file";
      assert.strictEqual(DOWNLOAD_GG_POST_CLICK_GRACE_MS, 8000);
      assert.strictEqual(isDownloadGgFilePage(fileUrl), true);
      assert.strictEqual(
        isDownloadGgFilePage("https://download.gg/fr-fr/file-18951734_18e45a29da12f63a/"),
        true,
      );
      assert.strictEqual(isDownloadGgFilePage("https://download.gg/en/about"), false);

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
  });

  runTest("Masked Direct keeps Google Drive navigation clean and confirms one file", async () => {
    const preview =
      "https://drive.google.com/file/d/file_ABC-123/view" +
      "?f95ue_dd=1&f95ue_tab=tab-1&f95ue_dd_req=req-1&f95ue_dd_ts=123";
    const sandbox = createDomSandbox(
      "https://drive.usercontent.google.com/download" +
        "?confirm=yes&f95ue_dd=1&f95ue_tab=tab-1" +
        "&f95ue_dd_req=req-1&f95ue_dd_ts=123",
    );
    const previousAnchor = global.HTMLAnchorElement;
    const previousForm = global.HTMLFormElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
      global.HTMLFormElement = sandbox.window.HTMLFormElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { buildGoogleDriveDownloadUrl, classifyGoogleDrivePage, processGoogleDriveDownload } =
        loadModule("addons/masked-direct-addon/src/hosts/googleDrive.js");
      const direct = new URL(buildGoogleDriveDownloadUrl(preview));
      assert.strictEqual(direct.pathname, "/uc");
      assert.strictEqual(direct.searchParams.get("export"), "download");
      assert.strictEqual(direct.searchParams.get("id"), "file_ABC-123");
      assert.strictEqual(direct.searchParams.get("f95ue_dd_req"), null);
      assert.strictEqual(direct.searchParams.get("f95ue_dd"), null);
      assert.strictEqual(classifyGoogleDrivePage(preview), "preview");
      assert.strictEqual(classifyGoogleDrivePage(sandbox.window.location.href), "confirmation");
      assert.strictEqual(
        classifyGoogleDrivePage(
          "https://drive.usercontent.google.com/download?id=file_ABC-123&export=download",
        ),
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
  });

  runTest(
    "Masked Direct shared click helper prefers the element realm and safely falls back",
    () => {
      const { clickElement } = loadModule("addons/masked-direct-addon/src/hosts/shared/dom.js");
      const calls = [];
      const direct = {
        isConnected: true,
        getAttribute: () => null,
        click() {
          calls.push("direct");
        },
      };
      assert.strictEqual(clickElement(direct), true);

      const fallback = {
        isConnected: true,
        getAttribute: () => null,
        click() {
          calls.push("throw");
          throw new Error("wrapped_click_failed");
        },
        ownerDocument: {
          defaultView: {
            HTMLElement: {
              prototype: {
                click() {
                  calls.push("owner-realm");
                },
              },
            },
          },
        },
      };
      assert.strictEqual(clickElement(fallback), true);
      assert.deepStrictEqual(calls, ["direct", "throw", "owner-realm"]);
    },
  );

  runTest("Masked Direct waits for the dynamically rendered Buzzheavier download row", async () => {
    const sandbox = createDomSandbox("https://buzzheavier.com/s3xk3ngyzkx6");
    const previousAnchor = global.HTMLAnchorElement;
    const previousHTMLElement = global.HTMLElement;
    try {
      global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
      global.HTMLElement = sandbox.window.HTMLElement;
      let clicks = 0;
      setTimeout(() => {
        const row = sandbox.document.createElement("div");
        row.className = "download-row";
        row.innerHTML =
          '<a class="download-btn gay-button" hx-get="/s3x3/download?t=signed">Download File</a>' +
          '<a class="link-button gay-button" hx-get="/s3x3/download?t=signed&amp;alt=true">Slow? Try mirror 2</a>';
        row.firstElementChild.addEventListener("click", (event) => {
          event.preventDefault();
          clicks += 1;
        });
        sandbox.document.body.append(row);
      }, 10);
      const failures = [];
      const { processBuzzheavierDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/buzzheavier.js",
      );
      await processBuzzheavierDownload({
        challengeGate: { waitUntilClear: async () => true },
        notifyMainFailure: async (...args) => failures.push(args),
        reportAddonHealthy() {},
        buttonWaitTimeoutMs: 100,
        pollIntervalMs: 5,
      });
      assert.strictEqual(clicks, 1);
      assert.deepStrictEqual(failures, []);
    } finally {
      global.HTMLAnchorElement = previousAnchor;
      global.HTMLElement = previousHTMLElement;
      sandbox.restore();
    }
  });

  runTest("Masked Direct clicks the signed Buzzheavier HTMX download action once", async () => {
    for (const hostname of ["buzzheavier.com", "bzzhr.to"]) {
      const sandbox = createDomSandbox(`https://${hostname}/s3xk3ngyzkx6`);
      const previousAnchor = global.HTMLAnchorElement;
      const previousHTMLElement = global.HTMLElement;
      try {
        global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
        global.HTMLElement = sandbox.window.HTMLElement;
        const button = sandbox.document.createElement("a");
        button.className = "download-btn gay-button";
        button.setAttribute("hx-get", "/s3xk3ngyzkx6/download?t=signed-token");
        button.textContent = "Download File";
        sandbox.document.body.append(button);
        let clicks = 0;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          clicks += 1;
        });
        const failures = [];
        let healthy = 0;
        const { processBuzzheavierDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/buzzheavier.js",
        );
        await processBuzzheavierDownload({
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: async (...args) => failures.push(args),
          reportAddonHealthy: () => {
            healthy += 1;
          },
        });
        assert.strictEqual(clicks, 1, hostname);
        assert.deepStrictEqual(failures, []);
        assert.strictEqual(healthy, 1);
      } finally {
        global.HTMLAnchorElement = previousAnchor;
        global.HTMLElement = previousHTMLElement;
        sandbox.restore();
      }
    }
  });

  runTest("Masked Direct completes both MixDrop download stages exactly once", async () => {
    const sandbox = createDomSandbox("https://miiiixdrop.net/f/file-123");
    const previousAnchor = global.HTMLAnchorElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { MIXDROP_POST_CLICK_GRACE_MS, processMixdropDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/mixdrop.js",
      );
      const isMixdropFilePage = (url) => routeOf(processMixdropDownload, url)?.kind === "file";
      assert.strictEqual(MIXDROP_POST_CLICK_GRACE_MS, 10000);
      assert.strictEqual(isMixdropFilePage("https://miiiixdrop.net/f/file-123"), true);
      assert.strictEqual(isMixdropFilePage("https://mixdrop.ag/f/file-123"), true);
      assert.strictEqual(isMixdropFilePage("https://miiixdrop.net/f/file-123"), true);
      assert.strictEqual(isMixdropFilePage("https://miiiixdrop.net/e/file-123"), false);

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
  });

  runTest("Masked Direct delays UploadHaven completion after the final click", async () => {
    const sandbox = createDomSandbox("https://uploadhaven.com/download/file-123");
    const previousButton = global.HTMLButtonElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { UPLOADHAVEN_POST_CLICK_GRACE_MS, processUploadHavenDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/uploadhaven.js",
      );
      const isUploadHavenDownloadPage = (url) =>
        routeOf(processUploadHavenDownload, url)?.kind === "file";
      assert.strictEqual(UPLOADHAVEN_POST_CLICK_GRACE_MS, 10000);
      assert.strictEqual(
        isUploadHavenDownloadPage("https://www.uploadhaven.com/download/file-123"),
        true,
      );
      assert.strictEqual(isUploadHavenDownloadPage("https://uploadhaven.com/account"), false);

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
  });

  runTest("Masked Direct does not repeat UploadHaven after a successful route click", async () => {
    const sandbox = createDomSandbox("https://uploadhaven.com/download/file-123?f95ue_dd=1");
    const previousButton = global.HTMLButtonElement;
    const previousGetComputedStyle = global.getComputedStyle;
    const previousSessionStorage = global.sessionStorage;
    try {
      global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
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
  });

  runTest(
    "Masked Direct pauses KrakenFiles at the shared challenge gate and clicks once",
    async () => {
      const sandbox = createDomSandbox("https://krakenfiles.com/view/file-123/file.html");
      const previousButton = global.HTMLButtonElement;
      const previousGetComputedStyle = global.getComputedStyle;
      try {
        global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
        global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
        const { processKrakenFilesDownload } = loadModule(
          "addons/masked-direct-addon/src/hosts/krakenfiles.js",
        );
        const isKrakenFilesFilePage = (url) =>
          routeOf(processKrakenFilesDownload, url)?.kind === "file";
        assert.strictEqual(
          isKrakenFilesFilePage("https://www.krakenfiles.com/view/file-123/file.html?download=1"),
          true,
        );
        assert.strictEqual(isKrakenFilesFilePage("https://krakenfiles.com/view/file-123"), false);

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

        assert.strictEqual(gateChecks, 3, "entry, pre-click, and post-grace gates");
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

  runTest("Masked Direct clicks one UploadNow file and refuses multi-file shares", async () => {
    const sandbox = createDomSandbox("https://uploadnow.io/en/share");
    const previousButton = global.HTMLButtonElement;
    const previousGetComputedStyle = global.getComputedStyle;
    try {
      global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
      global.getComputedStyle = sandbox.window.getComputedStyle.bind(sandbox.window);
      const { processUploadNowDownload } = loadModule(
        "addons/masked-direct-addon/src/hosts/uploadnow.js",
      );
      const isUploadNowSharePage = (url) => routeOf(processUploadNowDownload, url)?.kind === "file";
      assert.strictEqual(isUploadNowSharePage("https://www.uploadnow.io/en/share?x=1"), true);
      assert.strictEqual(isUploadNowSharePage("https://uploadnow.io/share-123/files"), false);

      const makeButton = () => {
        const button = sandbox.document.createElement("button");
        button.className = "file_browser_alt_options__fixture";
        button.innerHTML = '<svg data-icon="arrow-down-to-line"></svg>';
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
        ["uploadnow.io", "Automatic download requires exactly one file; found 2."],
      ]);
    } finally {
      global.HTMLButtonElement = previousButton;
      global.getComputedStyle = previousGetComputedStyle;
      sandbox.restore();
    }
  });

  runTest("MASKED-DIRECT-RELIABILITY-VERIFY-01 acknowledges terminal teardown once", async () => {
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
      assert.strictEqual(events.filter((value) => value === "clear").length, 2);

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
  });

  runTest(
    "Masked Direct pauses for a Cloudflare challenge and resumes after it clears",
    async () => {
      const sandbox = createDomSandbox("https://datanodes.to/download");
      const clock = createFakeClock();
      const original = {
        now: Date.now,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
      };
      let monitor;
      try {
        Date.now = clock.now;
        global.setTimeout = clock.setTimeout;
        global.clearTimeout = clock.clearTimeout;
        const { isCloudflareChallengePage, createCloudflareChallengeMonitor } = loadModule(
          "addons/masked-direct-addon/src/hosts/shared/cloudflareChallenge.js",
        );
        const challenge = sandbox.window.document.createElement("div");
        challenge.id = "cf-chl-widget";
        sandbox.window.document.body.append(challenge);
        assert.strictEqual(isCloudflareChallengePage(), true);

        const events = [];
        setTimeout(() => challenge.remove(), 0);
        monitor = createCloudflareChallengeMonitor({
          host: "datanodes.to",
          pollMs: 1000,
          timeoutMs: 1000,
          notifyChallenge: (host, message) => events.push(["notify", host, message]),
        });
        const waiting = monitor.waitUntilClear();
        await Promise.resolve();
        await Promise.resolve();
        await clock.tick(500);
        assert.strictEqual(await waiting, true);
        assert.strictEqual(events[0][0], "notify");
        assert.strictEqual(events[0][1], "datanodes.to");
        assert.strictEqual(events.length, 1, "one notification per challenge episode");
        assert.strictEqual(isCloudflareChallengePage(), false);
      } finally {
        monitor?.dispose();
        Date.now = original.now;
        global.setTimeout = original.setTimeout;
        global.clearTimeout = original.clearTimeout;
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
        });
        monitor.start();
        assert.strictEqual(monitor.isBlocked(), false);

        const challenge = sandbox.window.document.createElement("div");
        challenge.className = "cf-turnstile";
        sandbox.window.document.body.append(challenge);
        assert.strictEqual(monitor.isBlocked(), true);
        setTimeout(() => challenge.remove(), 0);
        assert.strictEqual(await monitor.waitUntilClear(), true);
        assert.deepStrictEqual(events, ["notify"]);
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
        const { createCloudflareChallengeMonitor, isCloudflareChallengePage } = loadModule(
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
};
