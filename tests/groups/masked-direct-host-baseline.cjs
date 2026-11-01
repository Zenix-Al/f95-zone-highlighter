"use strict";

const pilots = require("../fixtures/masked-host-baseline.cjs");

// Durable engine/host regressions and offline operation-count measurements.
// Fixtures are retained here rather than depending on disposable reference files.
module.exports = ({
  assert,
  createDomSandbox,
  createFakeClock,
  loadModule,
  runTest,
  fs,
  path,
  ROOT,
}) => {
  const base = "addons/masked-direct-addon/src/";
  async function scenario(url, body, run) {
    const sandbox = createDomSandbox(url);
    const keys = [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "fetch",
      "getComputedStyle",
      "HTMLButtonElement",
      "HTMLAnchorElement",
    ];
    const original = Object.fromEntries(keys.map((key) => [key, global[key]]));
    const now = Date.now;
    const clock = createFakeClock();
    global.HTMLButtonElement = sandbox.window.HTMLButtonElement;
    global.HTMLAnchorElement = sandbox.window.HTMLAnchorElement;
    const intervals = new Set();
    const stats = { queries: 0, styles: 0, wakeups: 0 };
    const query = document.querySelectorAll.bind(document);
    document.querySelectorAll = (...args) => {
      stats.queries += 1;
      return query(...args);
    };
    document.body.innerHTML = body;
    global.setTimeout = (fn, ms) =>
      clock.setTimeout(() => {
        stats.wakeups += 1;
        return fn();
      }, ms);
    global.clearTimeout = clock.clearTimeout;
    global.setInterval = (fn, ms) => {
      const token = { timer: null };
      intervals.add(token);
      const next = () => {
        fn();
        if (intervals.has(token)) token.timer = global.setTimeout(next, ms);
      };
      token.timer = global.setTimeout(next, ms);
      return token;
    };
    global.clearInterval = (token) => {
      intervals.delete(token);
      clock.clearTimeout(token?.timer);
    };
    global.getComputedStyle = (...args) => {
      stats.styles += 1;
      return sandbox.window.getComputedStyle(...args);
    };
    Date.now = clock.now;
    const flush = async () => {
      for (let n = 0; n < 16; n += 1) await Promise.resolve();
    };
    const advance = async (ms, step = 100) => {
      await flush();
      for (let elapsed = 0; elapsed < ms; elapsed += step) {
        await clock.tick(Math.min(step, ms - elapsed));
        await flush();
      }
    };
    try {
      await run({ clock, stats, advance, flush, window: sandbox.window });
    } finally {
      sandbox.window.dispatchEvent(new sandbox.window.Event("pagehide"));
      Object.assign(global, original);
      Date.now = now;
      sandbox.restore();
    }
  }
  const fail = async (_host, message) => assert.fail(message);

  const akiraboxLink =
    '<div id="download-button" class="download-file-link"><a id="download" class="download-ready" aria-disabled="false" href="https://akirabox.com/download/signed-token/game.zip">Download</a></div>';

  runTest(
    "MASKED-AKIRABOX-01 waits for manual Turnstile completion then clicks the ready link once",
    async () => {
      await scenario(
        "https://akirabox.to/0PdzyXNW43eA/file",
        '<div class="cf-turnstile"><input name="cf-turnstile-response" value=""><button id="verify">Verify</button></div>',
        async ({ advance }) => {
          const { processAkiraboxDownload } = loadModule(base + "hosts/akirabox.js");
          const { createCloudflareChallengeMonitor } = loadModule(
            base + "hosts/shared/cloudflareChallenge.js",
          );
          const gate = createCloudflareChallengeMonitor();
          let clicks = 0,
            successes = 0;
          document.querySelector("#verify").click = () =>
            assert.fail("verification must remain manual");
          try {
            const operation = processAkiraboxDownload({
              challengeGate: gate,
              notifyMainFailure: fail,
              reportAddonHealthy: (result) => {
                assert.strictEqual(result.downloadTriggered, true);
                successes += 1;
              },
            });
            await advance(30000, 500);
            assert.strictEqual(successes, 0);
            document.querySelector("input").value = "user-completed-token";
            document.body.insertAdjacentHTML("beforeend", akiraboxLink);
            document.querySelector("#download").addEventListener("click", (event) => {
              event.preventDefault();
              clicks += 1;
            });
            await advance(1000);
            await operation;
            assert.strictEqual(clicks, 1);
            assert.strictEqual(successes, 1);
          } finally {
            gate.dispose();
          }
        },
      );
    },
  );

  runTest("MASKED-AKIRABOX-02 only authorizes the observed single-file routes", () => {
    const { classifyHostRoute } = loadModule(base + "hosts/hostRoutes.js");
    for (const id of ["0PdzyXNW43eA", "9AqGQZoREmMn", "2bJG8bXrQ3OB"]) {
      assert.strictEqual(
        classifyHostRoute("akirabox.to", `https://akirabox.to/${id}/file`).eligible,
        true,
      );
    }
    for (const url of [
      "https://akirabox.to/0PdzyXNW43eA/folder",
      "https://akirabox.to/folder/0PdzyXNW43eA",
      "https://akirabox.to/0PdzyXNW43eA/file/extra",
      "https://akirabox.to/short/file",
      "https://akirabox.to.evil.example/0PdzyXNW43eA/file",
      "https://akirabox.com/0PdzyXNW43eA/file",
    ]) {
      assert.strictEqual(classifyHostRoute("akirabox.to", url).eligible, false, url);
    }
  });

  runTest(
    "MASKED-AKIRABOX-03 never clicks hidden disabled unready or foreign download links",
    async () => {
      for (const mode of ["hidden", "disabled", "unready", "foreign"]) {
        await scenario(
          "https://akirabox.to/0PdzyXNW43eA/file",
          akiraboxLink,
          async ({ advance }) => {
            const { processAkiraboxDownload } = loadModule(base + "hosts/akirabox.js");
            const link = document.querySelector("#download");
            if (mode === "hidden") link.style.display = "none";
            if (mode === "disabled") link.setAttribute("aria-disabled", "true");
            if (mode === "unready") link.classList.remove("download-ready");
            if (mode === "foreign") link.href = "https://ads.example/download/token/game.zip";
            link.click = () => assert.fail("unsafe click");
            let failures = 0;
            const operation = processAkiraboxDownload({
              notifyMainFailure: async () => {
                failures += 1;
              },
              reportAddonHealthy: () => assert.fail("false success"),
            });
            await advance(20000, 250);
            await operation;
            assert.strictEqual(failures, 1);
          },
        );
      }
    },
  );

  runTest(
    "MASKED-AKIRABOX-04 changed links and disposed verification waits cannot trigger downloads",
    async () => {
      await scenario("https://akirabox.to/0PdzyXNW43eA/file", akiraboxLink, async () => {
        const { processAkiraboxDownload } = loadModule(base + "hosts/akirabox.js");
        let checks = 0,
          failures = 0;
        document.querySelector("#download").click = () => assert.fail("changed link");
        await processAkiraboxDownload({
          challengeGate: {
            waitUntilClear: async () => {
              if (++checks === 2)
                document.querySelector("#download").href =
                  "https://akirabox.com/download/replaced/game.zip";
              return true;
            },
          },
          notifyMainFailure: async () => {
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("false success"),
        });
        assert.strictEqual(failures, 1);
      });
      await scenario(
        "https://akirabox.to/0PdzyXNW43eA/file",
        '<div class="cf-turnstile"></div>',
        async ({ flush }) => {
          const { processAkiraboxDownload } = loadModule(base + "hosts/akirabox.js");
          const { createCloudflareChallengeMonitor } = loadModule(
            base + "hosts/shared/cloudflareChallenge.js",
          );
          const gate = createCloudflareChallengeMonitor();
          const operation = processAkiraboxDownload({
            challengeGate: gate,
            notifyMainFailure: fail,
            reportAddonHealthy: () => assert.fail("disposed success"),
          });
          await flush();
          gate.dispose();
          document.body.insertAdjacentHTML("beforeend", akiraboxLink);
          document.querySelector("#download").click = () => assert.fail("late click");
          await operation;
        },
      );
    },
  );

  runTest(
    "MASKED-QUAX-01 clicks the native download link once without changing its attributes",
    async () => {
      for (const id of ["rB4pT", "QgT6Z", "x3Jvd"]) {
        await scenario(
          `https://qu.ax/${id}`,
          `<a download href="/x/${id}.zip">Download</a>`,
          async ({ window }) => {
            const { processQuaxDownload } = loadModule(base + "hosts/quax.js");
            const link = document.querySelector("a"),
              before = link.outerHTML;
            let clicks = 0,
              successes = 0;
            window.open = () => assert.fail("must not open tabs");
            link.click = () => {
              assert.strictEqual(link.outerHTML, before);
              clicks += 1;
            };
            await processQuaxDownload({
              notifyMainFailure: fail,
              reportAddonHealthy: (result) => {
                assert.strictEqual(result.downloadTriggered, true);
                successes += 1;
              },
            });
            assert.strictEqual(clicks, 1);
            assert.strictEqual(successes, 1);
            assert.strictEqual(link.outerHTML, before);
          },
        );
      }
    },
  );

  runTest("MASKED-QUAX-02 a detached candidate cannot dispatch or report initiation", async () => {
    await scenario(
      "https://qu.ax/rB4pT",
      '<a download href="/x/rB4pT.zip">Download</a>',
      async () => {
        const { processQuaxDownload } = loadModule(base + "hosts/quax.js");
        // Detachment after readiness must be rejected before dispatch.
        let gates = 0,
          failures = 0;
        const link = document.querySelector("a");
        link.click = () => assert.fail("detached candidate clicked");
        await processQuaxDownload({
          challengeGate: {
            waitUntilClear: async () => {
              if (++gates === 2) link.remove();
              return true;
            },
          },
          notifyMainFailure: async () => {
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("false success"),
        });
        assert.strictEqual(failures, 1);
      },
    );
  });

  runTest(
    "MASKED-QUAX-03 refuses unsupported routes, unsafe destinations and ambiguity",
    async () => {
      const { classifyHostRoute } = loadModule(base + "hosts/hostRoutes.js");
      for (const path of ["/", "/abcd", "/abcdef", "/x/rB4pT.zip", "/rB4pT/extra", "/a-b_c"]) {
        assert.strictEqual(
          classifyHostRoute("qu.ax", `https://qu.ax${path}`).eligible,
          false,
          path,
        );
      }
      for (const href of [
        "https://evil.example/x/rB4pT.zip",
        "/x/QgT6Z.zip",
        "javascript:alert(1)",
        "/x/rB4pT.zip?bad=1",
        "/x/rb4pt.zip",
        "/x/rB4pT.zip#bad",
      ]) {
        await scenario(
          "https://qu.ax/rB4pT",
          `<a download href="${href}">Download</a>`,
          async ({ advance, window }) => {
            const { processQuaxDownload } = loadModule(base + "hosts/quax.js");
            let failures = 0;
            document.querySelector("a").click = () => assert.fail("unsafe destination");
            const operation = processQuaxDownload({
              notifyMainFailure: async () => {
                failures += 1;
              },
              reportAddonHealthy: () => assert.fail("false success"),
            });
            await advance(20000, 250);
            await operation;
            assert.strictEqual(failures, 1);
          },
        );
      }
      await scenario(
        "https://qu.ax/rB4pT",
        '<a download href="/x/rB4pT.zip">One</a><a download href="/x/rB4pT.rar">Two</a>',
        async ({ window }) => {
          const { processQuaxDownload } = loadModule(base + "hosts/quax.js");
          let failures = 0;
          for (const link of document.querySelectorAll("a"))
            link.click = () => assert.fail("ambiguous controls");
          await processQuaxDownload({
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("false success"),
          });
          assert.strictEqual(failures, 1);
        },
      );
    },
  );

  runTest(
    "MASKED-QUAX-04 revalidates destinations and cancellation after challenge waits",
    async () => {
      for (const mode of ["changed", "cancelled"]) {
        await scenario(
          "https://qu.ax/rB4pT",
          '<a download href="/x/rB4pT.zip">Download</a>',
          async ({ window }) => {
            const { processQuaxDownload } = loadModule(base + "hosts/quax.js");
            const controller = new AbortController();
            let gates = 0,
              failures = 0;
            document.querySelector("a").click = () => assert.fail("late tab");
            const operation = processQuaxDownload({
              signal: controller.signal,
              challengeGate: {
                waitUntilClear: async () => {
                  if (++gates === 2) {
                    if (mode === "cancelled") controller.abort();
                    else document.querySelector("a").href = "https://evil.example/file.zip";
                  }
                  return true;
                },
              },
              notifyMainFailure: async () => {
                failures += 1;
              },
              reportAddonHealthy: () => assert.fail("false success"),
            });
            if (mode === "cancelled") await assert.rejects(operation, { name: "AbortError" });
            else await operation;
            assert.strictEqual(failures, mode === "changed" ? 1 : 0);
          },
        );
      }
    },
  );

  runTest("MASKED-HOST-BASELINE-01 cancellation stops candidate polling immediately", async () => {
    await scenario(
      "https://download.gg/file-fixture",
      "",
      async ({ clock, stats, advance, window }) => {
        const { waitForCandidate } = loadModule(base + "hosts/shared/dom.js");
        let scans = 0;
        const cancellation = new AbortController();
        window.addEventListener("pagehide", () => cancellation.abort(), { once: true });
        const operation = waitForCandidate({
          signal: cancellation.signal,
          getCandidate: () => {
            scans += 1;
            return null;
          },
          timeoutMs: 1200,
          intervalMs: 400,
        });
        const rejected = assert.rejects(operation, { name: "AbortError" });
        window.dispatchEvent(new window.Event("pagehide"));
        await advance(1200);
        await rejected;
        assert.strictEqual(scans, 1);
        assert.strictEqual(clock.pending(), 0);
        console.log("HOST-BASELINE candidate", JSON.stringify({ scans, ...stats }));
      },
    );
  });

  runTest("MASKED-HOST-BASELINE-02 disposed in-flight challenge refuses progress", async () => {
    await scenario(
      "https://download.gg/file-fixture",
      '<div id="challenge-running"></div>',
      async ({ advance, flush, clock }) => {
        const { createCloudflareChallengeMonitor } = loadModule(
          base + "hosts/shared/cloudflareChallenge.js",
        );
        const gate = createCloudflareChallengeMonitor({ notifyChallenge: async () => {} });
        const waiting = gate.waitUntilClear();
        await flush();
        gate.dispose();
        assert.strictEqual(clock.pending(), 0);
        await advance(500);
        assert.strictEqual(await waiting, false);
        assert.strictEqual(await gate.waitUntilClear(), false);
        assert.strictEqual(clock.pending(), 0);
      },
    );
  });

  runTest(
    "MASKED-HOST-BASELINE-03 challenge monitor coalesces unchanged body reads between polls",
    async () => {
      await scenario(
        "https://download.gg/file-fixture",
        "ordinary page text ".repeat(1000),
        async ({ advance, clock, stats }) => {
          const descriptor = Object.getOwnPropertyDescriptor(window.Node.prototype, "textContent");
          let reads = 0;
          Object.defineProperty(document.body, "textContent", {
            configurable: true,
            get() {
              reads += 1;
              return descriptor.get.call(this);
            },
          });
          const { createCloudflareChallengeMonitor } = loadModule(
            base + "hosts/shared/cloudflareChallenge.js",
          );
          const gate = createCloudflareChallengeMonitor();
          gate.start();
          for (let n = 0; n < 5; n += 1) await gate.waitUntilClear();
          await advance(4000);
          gate.dispose();
          assert.strictEqual(reads, 3);
          assert.strictEqual(clock.pending(), 0);
          console.log("HOST-BASELINE challenge", JSON.stringify({ bodyReads: reads, ...stats }));
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-BASELINE-04 pagehide aborts Kraken readiness polling and late click",
    async () => {
      await scenario(
        "https://krakenfiles.com/view/fixture/file.html",
        "",
        async ({ advance, flush, stats, clock, window }) => {
          const { processKrakenFilesDownload } = loadModule(base + "hosts/krakenfiles.js");
          let disposed = false,
            clicks = 0,
            healthy = 0;
          const cancellation = new AbortController();
          window.addEventListener(
            "pagehide",
            () => {
              disposed = true;
              cancellation.abort();
            },
            { once: true },
          );
          const operation = processKrakenFilesDownload({
            signal: cancellation.signal,
            challengeGate: { waitUntilClear: async () => !disposed },
            notifyMainFailure: fail,
            reportAddonHealthy: () => {
              healthy += 1;
            },
            postClickGraceMs: 0,
          });
          const rejected = assert.rejects(operation, { name: "AbortError" });
          await flush();
          window.dispatchEvent(new window.Event("pagehide"));
          document.body.innerHTML =
            '<button type="button" class="btn btn-primary">Download now</button>';
          document.querySelector("button").setAttribute("type", "submit");
          document.querySelector("button").click = () => {
            clicks += 1;
          };
          await advance(400);
          await rejected;
          assert.strictEqual(clicks, 0);
          assert.strictEqual(healthy, 0);
          assert.strictEqual(clock.pending(), 0);
        },
      );
    },
  );

  runTest("MASKED-HOST-BASELINE-05 Kraken grace cancellation produces no late report", async () => {
    await scenario(
      "https://krakenfiles.com/view/fixture/file.html",
      '<button type="submit" class="btn btn-primary">Download now</button>',
      async ({ advance, flush, clock, window }) => {
        const { processKrakenFilesDownload } = loadModule(base + "hosts/krakenfiles.js");
        let clicks = 0,
          reports = 0;
        const cancellation = new AbortController();
        window.addEventListener("pagehide", () => cancellation.abort(), { once: true });
        document.querySelector("button").click = () => {
          clicks += 1;
        };
        const operation = processKrakenFilesDownload({
          signal: cancellation.signal,
          challengeGate: { waitUntilClear: async () => true },
          notifyMainFailure: fail,
          reportAddonHealthy: () => {
            reports += 1;
          },
        });
        const rejected = assert.rejects(operation, { name: "AbortError" });
        await flush();
        assert.strictEqual(clicks, 1);
        window.dispatchEvent(new window.Event("pagehide"));
        assert.strictEqual(clock.pending(), 0);
        await advance(3000);
        await rejected;
        assert.strictEqual(reports, 0);
        assert.strictEqual(clock.pending(), 0);
      },
    );
  });

  runTest(
    "MASKED-HOST-BASELINE-06 Pixeldrain HEAD is abortable without failure or navigation",
    async () => {
      await scenario("https://pixeldrain.com/u/fixture", "", async ({ flush, window }) => {
        const { processPixeldrainDownload } = loadModule(base + "hosts/pixeldrain.js");
        let resolveHead,
          options,
          blocked = false,
          healthy = 0;
        const cancellation = new AbortController();
        global.fetch = async (_url, init) => {
          options = init;
          return new Promise((resolve, reject) => {
            resolveHead = resolve;
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          });
        };
        const operation = processPixeldrainDownload({
          signal: cancellation.signal,
          debugLog() {},
          notifyMainFailure: fail,
          challengeGate: { waitUntilClear: async () => !blocked },
          reportAddonHealthy: () => {
            healthy += 1;
          },
        });
        const rejected = assert.rejects(operation, { name: "AbortError" });
        await flush();
        window.dispatchEvent(new window.Event("pagehide"));
        blocked = true;
        cancellation.abort();
        assert.strictEqual(options.signal, cancellation.signal);
        assert.strictEqual(options.method, "HEAD");
        resolveHead({ status: 200, headers: { get: () => "application/octet-stream" } });
        await rejected;
        assert.strictEqual(healthy, 0);
      });
    },
  );

  runTest("MASKED-HOST-BASELINE-07 controller early returns dispose owned resources", async () => {
    for (const kind of ["claim", "challenge", "consume", "reentry"]) {
      await scenario(
        kind === "consume"
          ? "https://workupload.com/start/fixture"
          : kind === "claim"
            ? "https://workupload.com/file/fixture"
            : "https://krakenfiles.com/view/fixture/file.html",
        "",
        async ({ window, flush }) => {
          Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
          const add = window.addEventListener.bind(window),
            remove = window.removeEventListener.bind(window);
          const listeners = new Set();
          window.addEventListener = (type, fn, options) => {
            if (type === "pagehide") listeners.add(fn);
            return add(type, fn, options);
          };
          window.removeEventListener = (type, fn, options) => {
            if (type === "pagehide") listeners.delete(fn);
            return remove(type, fn, options);
          };
          let disposed = 0,
            runs = 0,
            finish;
          const { createDownloadPageController } = loadModule(
            base + "app/contexts/downloadPageController.js",
          );
          const controller = createDownloadPageController({
            addonId: "baseline",
            debugLog() {},
            getIsEnabled: () => true,
            getAutomationSettings: async () => ({ enabled: true, automateRegardless: true }),
            createContinuationStore: () => ({
              claim: () => null,
              inspect: () => ({}),
              consume: () => null,
            }),
            createHostExecutionContext: () => ({ dispose() {}, notifyChallenge() {} }),
            createChallengeMonitor: () => ({
              start() {},
              dispose: () => {
                disposed += 1;
              },
              waitUntilClear: async () => kind !== "challenge",
            }),
            handlers: Object.fromEntries(
              ["workupload.com", "krakenfiles.com"].map((host) => [
                host,
                async () => {
                  runs += 1;
                  await new Promise((resolve) => {
                    finish = resolve;
                  });
                },
              ]),
            ),
          });
          const first = controller.runDownloadPageHooks();
          if (kind === "reentry") {
            assert.strictEqual(controller.runDownloadPageHooks(), first);
            await flush();
            assert.strictEqual(runs, 1);
            finish();
          }
          await first;
          assert.strictEqual(listeners.size, kind === "reentry" ? 1 : 0);
          assert.strictEqual(disposed, ["claim", "reentry"].includes(kind) ? 0 : 1);
          window.dispatchEvent(new window.Event("pagehide"));
          assert.strictEqual(disposed, kind === "claim" ? 0 : 1);
        },
      );
    }
  });

  runTest("MASKED-HOST-BASELINE-08 Workupload rejects substring foreign targets", async () => {
    await scenario(
      "https://workupload.com/file/fixture",
      '<a id="download" href="https://workupload.com.evil.invalid/start/fixture">Download</a>',
      async () => {
        // Test-only exposure avoids performing navigation to the accepted foreign URL.
        const { inspect } = loadModule(base + "hosts/workupload.js", {
          sourceReplacements: {
            "function isWorkuploadDownloadAnchor(anchor)":
              "export { isWorkuploadDownloadAnchor as inspect }; function isWorkuploadDownloadAnchor(anchor)",
          },
        });
        assert.strictEqual(inspect(document.querySelector("a")), false);
      },
    );
  });

  runTest(
    "MASKED-HOST-BASELINE-09 UploadNow timeout refuses an unproven stable candidate",
    async () => {
      await scenario(
        "https://uploadnow.io/en/share",
        '<button><svg data-icon="arrow-down-to-line"></svg></button>',
        async ({ advance }) => {
          const { processUploadNowDownload } = loadModule(base + "hosts/uploadnow.js");
          let clicks = 0,
            reports = 0;
          let failures = 0;
          document.querySelector("button").click = () => {
            clicks += 1;
          };
          const operation = processUploadNowDownload({
            challengeGate: { waitUntilClear: async () => true },
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => {
              reports += 1;
            },
            timeoutMs: 500,
            intervalMs: 500,
            stableChecksRequired: 4,
          });
          await advance(500);
          await operation;
          assert.strictEqual(clicks, 0);
          assert.strictEqual(reports, 0);
          assert.strictEqual(failures, 1);
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-BASELINE-10 idle Datanodes scans and releases resources on pagehide",
    async () => {
      await scenario(
        "https://datanodes.to/download",
        "",
        async ({ advance, stats, clock, window }) => {
          const { processDatanodesDownload } = loadModule(base + "hosts/datanodes/index.js");
          await processDatanodesDownload({
            challengeGate: { waitUntilClear: async () => true, isBlocked: () => false },
            notifyMainFailure: fail,
            reportAddonHealthy: () => assert.fail("empty page cannot succeed"),
          });
          await advance(2000);
          console.log(
            "HOST-BASELINE datanodes",
            JSON.stringify({ ...stats, pending: clock.pending() }),
          );
          assert.strictEqual(stats.queries, 3);
          window.dispatchEvent(new window.Event("pagehide"));
          assert.strictEqual(clock.pending(), 0);
          const scans = stats.queries;
          await advance(1000);
          assert.strictEqual(stats.queries, scans);
        },
      );
    },
  );

  runTest("MASKED-HOST-BASELINE-11 pilot idle loading and ready operation counters", async () => {
    for (const host of pilots)
      for (const mode of ["idle", "loading", "ready"]) {
        await scenario(
          host.url,
          mode === "ready" ? host.html : "",
          async ({ advance, clock, stats, flush }) => {
            let clicks = 0,
              healthy = 0,
              failures = 0;
            let clickAt = null,
              reportAt = null;
            const mount = () => {
              document.body.innerHTML = host.html;
              document.querySelector("button").click = () => {
                clicks += 1;
                clickAt = clock.now();
              };
            };
            if (mode === "ready") mount();
            if (mode === "loading") global.setTimeout(mount, 800);
            const module = loadModule(base + "hosts/" + host.host + ".js");
            const operation = module[host.entry]({
              challengeGate: { waitUntilClear: async () => true },
              notifyMainFailure: async () => {
                failures += 1;
              },
              reportAddonHealthy: () => {
                healthy += 1;
                reportAt = clock.now();
              },
            });
            await flush();
            await advance(host.timeout + 8000, 100);
            await operation;
            assert.strictEqual(clicks, mode === "idle" ? 0 : 1);
            assert.strictEqual(healthy, clicks);
            assert.strictEqual(failures, mode === "idle" ? 1 : 0);
            assert.strictEqual(clock.pending(), 0);
            assert.strictEqual(clickAt, mode === "idle" ? null : mode === "loading" ? 800 : 0);
            assert.strictEqual(reportAt, clickAt === null ? null : clickAt + host.grace);
            console.log(
              "HOST-BASELINE pilot",
              JSON.stringify({
                host: host.host,
                mode,
                ...stats,
                clicks,
                healthy,
                failures,
                clickAt,
                reportAt,
              }),
            );
          },
        );
      }
  });

  runTest(
    "MASKED-HOST-BASELINE-12 approved routes exclude Pixeldrain fallback and Viking legacy mode",
    async () => {
      await scenario("https://pixeldrain.com/u/fixture", "", async () => {
        const { classifyHostRoute } = loadModule(base + "hosts/hostRoutes.js");
        for (const path of ["/u/fixture", "/d/fixture", "/f/fixture"]) {
          assert.strictEqual(
            classifyHostRoute("pixeldrain.com", "https://pixeldrain.com" + path).eligible,
            true,
          );
        }
        for (const path of ["/", "/l/fixture", "/u/"])
          assert.strictEqual(
            classifyHostRoute("pixeldrain.com", "https://pixeldrain.com" + path).eligible,
            false,
          );
        const { createDownloadPageController } = loadModule(
          base + "app/contexts/downloadPageController.js",
        );
        const controller = createDownloadPageController({
          addonId: "baseline",
          debugLog() {},
          getIsEnabled: () => true,
          getAutomationSettings: async () => ({ enabled: true, automateRegardless: true }),
          handlers: {},
        });
        history.replaceState(null, "", "https://pixeldrain.com/u/fixture");
        assert.strictEqual(
          (await controller.decideHostAutomation("pixeldrain.com")).mode,
          "standalone",
        );
        // Viking's one-click entry/continuation distinction is exercised by the
        // existing expansion-staged group; the dispatcher never emits managed mode.
      });
    },
  );

  runTest(
    "MASKED-HOST-RUN-14 controller cancels real handler waits grace and delayed close",
    async () => {
      for (const stage of ["readiness", "grace", "close", "route", "disabled", "hash"]) {
        await scenario(
          pilots[0].url,
          stage === "readiness" ? "" : pilots[0].html,
          async ({ flush, advance, clock, window }) => {
            Object.defineProperty(document, "readyState", {
              configurable: true,
              value: "complete",
            });
            const { createDownloadPageController } = loadModule(
              base + "app/contexts/downloadPageController.js",
            );
            const { createDirectDownloadHostHandlers } = loadModule(base + "hosts/handlers.js");
            const { createDirectDownloadFlowController } = loadModule(
              base + "domain/directDownload/flowController.js",
            );
            let enabled = true,
              clicks = 0,
              closes = 0,
              disposed = 0;
            const feedback = [];
            const button = document.querySelector("button");
            if (button)
              button.click = () => {
                clicks += 1;
              };
            const automationSettings = {
              enabled: true,
              automateRegardless: true,
              autoCloseTabs: true,
              downloadPageCloseDelayMs: 3500,
            };
            const flow = createDirectDownloadFlowController({
              addonId: "run-test",
              diagnostics: { warn: () => assert.fail("cancellation is not failure") },
              getAutomationSettings: async () => automationSettings,
              closeTab: () => {
                closes += 1;
              },
              publishFeedback: async (item) => feedback.push(item),
            });
            const controller = createDownloadPageController({
              addonId: "run-test",
              debugLog() {},
              getIsEnabled: () => enabled,
              getAutomationSettings: async () => automationSettings,
              createHostExecutionContext: flow.createHostExecutionContext,
              handlers: createDirectDownloadHostHandlers({
                debugLog() {},
                createHostExecutionContext: flow.createHostExecutionContext,
              }),
              createChallengeMonitor: () => ({
                start() {},
                dispose: () => {
                  disposed += 1;
                },
                isBlocked: () => false,
                waitUntilClear: async () => true,
              }),
            });
            const operation = controller.runDownloadPageHooks();
            assert.strictEqual(controller.runDownloadPageHooks(), operation);
            await flush();
            if (stage === "close") {
              await advance(3000);
              await operation;
              assert.strictEqual(feedback.length, 1);
            }
            if (stage === "hash") {
              history.replaceState(null, "", "#changed");
              window.dispatchEvent(new window.Event("hashchange"));
            } else if (stage === "route") history.replaceState(null, "", "/view/other/file.html");
            else if (stage === "disabled") enabled = false;
            else window.dispatchEvent(new window.Event("pagehide"));
            if (["route", "disabled"].includes(stage)) await advance(3000);
            await operation;
            controller.dispose();
            controller.dispose();
            assert.strictEqual(clock.pending(), 0);
            await advance(10000);
            assert.strictEqual(closes, 0);
            assert.strictEqual(disposed, 1);
            assert.strictEqual(clicks, stage === "readiness" ? 0 : 1);
            assert.strictEqual(feedback.length, stage === "close" ? 1 : 0);
          },
        );
      }
    },
  );

  runTest(
    "MASKED-HOST-RUN-15 DOM readiness cancellation removes listener without host work",
    async () => {
      await scenario(pilots[0].url, "", async ({ window }) => {
        Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });
        const { createDownloadPageController } = loadModule(
          base + "app/contexts/downloadPageController.js",
        );
        const controller = createDownloadPageController({
          addonId: "ready-test",
          debugLog() {},
          getIsEnabled: () => true,
          getAutomationSettings: () => assert.fail("must not read automationSettings"),
          handlers: {},
        });
        const operation = controller.runDownloadPageHooks();
        window.dispatchEvent(new window.Event("pagehide"));
        await operation;
        document.dispatchEvent(new window.Event("DOMContentLoaded"));
        controller.dispose();
      });
    },
  );

  runTest(
    "MASKED-HOST-RUN-16 Datanodes returned handler remains owned until terminal or dispose",
    async () => {
      await scenario("https://datanodes.to/download", "", async ({ flush, clock, advance }) => {
        Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
        const { createDownloadPageController } = loadModule(
          base + "app/contexts/downloadPageController.js",
        );
        const { createDirectDownloadHostHandlers } = loadModule(base + "hosts/handlers.js");
        const { createDirectDownloadFlowController } = loadModule(
          base + "domain/directDownload/flowController.js",
        );
        const automationSettings = {
          enabled: true,
          automateRegardless: true,
          autoCloseTabs: false,
        };
        let disposed = 0,
          runs = 0;
        const flow = createDirectDownloadFlowController({
          addonId: "scan-test",
          diagnostics: { warn: () => assert.fail("unexpected failure") },
          getAutomationSettings: async () => automationSettings,
        });
        const handlers = createDirectDownloadHostHandlers({
          debugLog() {},
          createHostExecutionContext: flow.createHostExecutionContext,
        });
        const controller = createDownloadPageController({
          addonId: "scan-test",
          debugLog() {},
          getIsEnabled: () => true,
          getAutomationSettings: async () => automationSettings,
          createHostExecutionContext: flow.createHostExecutionContext,
          handlers: {
            "datanodes.to": (...args) => {
              runs += 1;
              return handlers["datanodes.to"](...args);
            },
          },
          createChallengeMonitor: () => ({
            start() {},
            dispose: () => {
              disposed += 1;
            },
            isBlocked: () => false,
            waitUntilClear: async () => true,
          }),
        });
        await controller.runDownloadPageHooks();
        await flush();
        assert.ok(clock.pending() > 0);
        assert.strictEqual(disposed, 0);
        await controller.runDownloadPageHooks();
        assert.strictEqual(runs, 1);
        controller.dispose();
        assert.strictEqual(clock.pending(), 0);
        assert.strictEqual(disposed, 1);
        await advance(1000);
      });
    },
  );

  runTest("MASKED-HOST-RUN-17 candidate disabled during gate wait cannot click", async () => {
    await scenario(pilots[0].url, pilots[0].html, async () => {
      const { processKrakenFilesDownload } = loadModule(base + "hosts/krakenfiles.js");
      let checks = 0,
        failures = 0;
      const button = document.querySelector("button");
      button.click = () => assert.fail("disabled candidate clicked");
      await processKrakenFilesDownload({
        challengeGate: {
          waitUntilClear: async () => {
            if (++checks === 2) button.disabled = true;
            return true;
          },
        },
        notifyMainFailure: async () => {
          failures += 1;
        },
        reportAddonHealthy: () => assert.fail("invalid success"),
      });
      assert.strictEqual(failures, 1);
    });
  });

  runTest("MASKED-HOST-RUN-18 later challenge refusal disposes the whole run", async () => {
    await scenario(pilots[0].url, "", async () => {
      Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
      const { createDownloadPageController } = loadModule(
        base + "app/contexts/downloadPageController.js",
      );
      let checks = 0,
        disposed = 0;
      const controller = createDownloadPageController({
        addonId: "late-gate",
        debugLog() {},
        getIsEnabled: () => true,
        getAutomationSettings: async () => ({ enabled: true, automateRegardless: true }),
        createChallengeMonitor: () => ({
          start() {},
          dispose: () => {
            disposed += 1;
          },
          waitUntilClear: async () => ++checks === 1,
        }),
        handlers: {
          "krakenfiles.com": async (gate) => {
            assert.strictEqual(await gate.waitUntilClear(), false);
            assert.strictEqual(gate.signal.aborted, true);
          },
        },
      });
      await controller.runDownloadPageHooks();
      controller.dispose();
      assert.strictEqual(disposed, 1);
    });
  });

  runTest(
    "MASKED-HOST-RUN-19 run cleanup is idempotent and does not skip later resources",
    async () => {
      const { createHostRunScope } = loadModule(base + "hosts/shared/runScope.js");
      const scope = createHostRunScope();
      let first = 0,
        second = 0;
      scope.own(() => {
        first += 1;
      });
      scope.own(() => {
        second += 1;
      });
      scope.dispose();
      scope.dispose();
      assert.strictEqual(scope.signal.aborted, true);
      assert.strictEqual(scope.current(), false);
      assert.strictEqual(first, 1);
      assert.strictEqual(second, 1);
      scope.own(() => {
        second += 1;
      });
      assert.strictEqual(second, 2);
    },
  );

  runTest(
    "MASKED-HOST-RUN-20 Datanodes cancels a pending frame without late scanning",
    async () => {
      await scenario(
        "https://datanodes.to/download",
        "<button>Continue</button>",
        async ({ clock, flush }) => {
          const originalFrame = global.requestAnimationFrame;
          const originalCancel = global.cancelAnimationFrame;
          try {
            global.requestAnimationFrame = (fn) => clock.setTimeout(fn, 16);
            global.cancelAnimationFrame = clock.clearTimeout;
            const { findBestDatanodesAction } = loadModule(base + "hosts/datanodes/index.js");
            const cancellation = new AbortController();
            const operation = findBestDatanodesAction({
              frameBudgetMs: 0,
              isDone: () => cancellation.signal.aborted,
              signal: cancellation.signal,
            });
            const rejected = assert.rejects(operation, { name: "AbortError" });
            await flush();
            assert.strictEqual(clock.pending(), 1);
            cancellation.abort();
            await rejected;
            assert.strictEqual(clock.pending(), 0);
          } finally {
            global.requestAnimationFrame = originalFrame;
            global.cancelAnimationFrame = originalCancel;
          }
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-RUN-21 cancellation during automationSettings lookup cannot start a handler",
    async () => {
      await scenario(pilots[0].url, "", async ({ flush }) => {
        Object.defineProperty(document, "readyState", { configurable: true, value: "complete" });
        const { createDownloadPageController } = loadModule(
          base + "app/contexts/downloadPageController.js",
        );
        let resolvePolicy;
        const controller = createDownloadPageController({
          addonId: "automationSettings-test",
          debugLog() {},
          getIsEnabled: () => true,
          getAutomationSettings: () =>
            new Promise((resolve) => {
              resolvePolicy = resolve;
            }),
          handlers: { "krakenfiles.com": () => assert.fail("late handler") },
        });
        const operation = controller.runDownloadPageHooks();
        await flush();
        controller.dispose();
        resolvePolicy({ enabled: true, automateRegardless: true });
        await operation;
      });
    },
  );

  runTest(
    "MASKED-HOST-CLICK-22 pilot validators and selector priority survive shared dispatch",
    async () => {
      const html =
        '<button id="disabled" disabled type="submit" class="btn btn-primary downloadAttachment">Download now</button>' +
        '<button id="hidden" style="display:none" type="submit" class="btn btn-primary downloadAttachment">Download now</button>' +
        '<button id="wrong" type="submit" class="btn btn-primary">Subscribe</button>' +
        '<button id="later" type="submit" class="btn-file">Download now</button>' +
        '<button id="chosen" type="submit" class="btn btn-primary downloadAttachment">Download now</button>';
      for (const host of pilots)
        await scenario(host.url, html, async ({ advance }) => {
          const clicks = [];
          for (const button of document.querySelectorAll("button"))
            button.click = () => clicks.push(button.id);
          const module = loadModule(base + "hosts/" + host.host + ".js");
          let healthy = 0;
          const operation = module[host.entry]({
            challengeGate: { waitUntilClear: async () => true },
            notifyMainFailure: fail,
            reportAddonHealthy: () => {
              healthy += 1;
            },
            postClickGraceMs: 0,
          });
          await advance(100);
          await operation;
          assert.deepStrictEqual(clicks, ["chosen"]);
          assert.strictEqual(healthy, 1);
        });
    },
  );

  runTest(
    "MASKED-HOST-CLICK-23 changed or failed candidate never retries or reports success",
    async () => {
      for (const host of pilots)
        for (const kind of ["detached", "disabled", "failed", "challenge"]) {
          await scenario(host.url, host.html, async ({ advance }) => {
            let gates = 0,
              attempts = 0,
              failures = 0;
            const button = document.querySelector("button");
            button.click = () => {
              attempts += 1;
              throw new Error("dispatch failed");
            };
            const prototype = button.ownerDocument.defaultView.HTMLElement.prototype;
            const originalClick = prototype.click;
            prototype.click = () => {
              attempts += 1;
              throw new Error("fallback failed");
            };
            try {
              const module = loadModule(base + "hosts/" + host.host + ".js");
              const operation = module[host.entry]({
                challengeGate: {
                  waitUntilClear: async () => {
                    if (++gates === 2) {
                      if (kind === "detached") button.remove();
                      if (kind === "disabled") button.disabled = true;
                      if (kind === "challenge") return false;
                    }
                    return true;
                  },
                },
                notifyMainFailure: async () => {
                  failures += 1;
                },
                reportAddonHealthy: () => assert.fail("invalid success"),
                postClickGraceMs: 0,
              });
              await advance(1000);
              await operation;
              assert.strictEqual(failures, kind === "challenge" ? 0 : 1);
              assert.strictEqual(
                attempts,
                kind === "failed" ? 2 : 0,
                "existing realm fallback only; runner never retries",
              );
            } finally {
              prototype.click = originalClick;
            }
          });
        }
    },
  );

  runTest(
    "MASKED-HOST-CLICK-24 unsupported route never selects or dispatches a control",
    async () => {
      for (const host of pilots)
        await scenario(new URL("/account", host.url).href, host.html, async ({ stats }) => {
          const module = loadModule(base + "hosts/" + host.host + ".js");
          let failures = 0;
          await module[host.entry]({
            challengeGate: { waitUntilClear: () => assert.fail("route gate must win") },
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("invalid success"),
          });
          assert.strictEqual(failures, 1);
          assert.strictEqual(stats.queries, 0);
        });
    },
  );

  runTest("MASKED-HOST-TOOLS-25 all hosts declare metadata or a justified unique method", () => {
    const { HOST_AUTOMATIONS } = loadModule(base + "hosts/handlers.js");
    assert.strictEqual(HOST_AUTOMATIONS.length, 16);
    const custom = [];
    for (const [host, processor] of HOST_AUTOMATIONS) {
      const definition = processor.definition;
      assert.ok(definition, host);
      if (definition.mode === "custom") {
        assert.ok(definition.reason.length > 40);
        custom.push(host);
      } else {
        assert.ok(Array.isArray(definition.actions));
        assert.ok(
          definition.actions.every((action) =>
            ["delay", "healthy", "click", "navigate"].includes(action.tool),
          ),
        );
      }
    }
    assert.deepStrictEqual(custom.sort(), ["drive.google.com", "pixeldrain.com"]);
    const filenames = [
      "buzzheavier",
      "delafil",
      "downloadgg",
      "gofile",
      "krakenfiles",
      "mediafire",
      "mixdrop",
      "uploadhaven",
      "uploadnow",
      "vik1ngfile",
      "workupload",
      "quax",
      "akirabox",
      "datanodes/index",
    ];
    for (const name of filenames) {
      const source = fs.readFileSync(path.join(ROOT, base, "hosts", name + ".js"), "utf8");
      assert.doesNotMatch(
        source,
        /\b(?:fetch|setTimeout|setInterval)\s*\(|new MutationObserver|\bawait\b|\.click\s*\(|location\.(?:assign|replace)\s*\(/,
        name,
      );
    }
    assert.strictEqual(fs.existsSync(path.join(ROOT, base, "api/observer.js")), false);
  });

  runTest(
    "MASKED-HOST-TOOLS-37 one host definition drives aliases, routes, settings and actions",
    () => {
      const { DIRECT_DOWNLOAD_HOSTS, HOST_PROCESSORS, createDirectDownloadPanelSettings } =
        loadModule(base + "hosts/metadata.js");
      const { findHostRoute } = loadModule(base + "hosts/shared/routes.js");
      const { classifyHostRoute, describeHostEntry, describeHostContinuation } = loadModule(
        base + "hosts/hostRoutes.js",
      );
      const samples = {
        buzzheavier: "/s3xk3ngyzkx6",
        gofile: "/d/r6RPqz",
        googleDrive: "/file/d/file123/view",
        pixeldrain: "/u/file123",
        krakenfiles: "/view/file123/file.html",
        datanodes: "/82wqqwwmstb7/game.zip",
        delafil: "/0123456789abcdef/game.zip",
        downloadgg: "/en/file-game",
        vik1ngfile: "/f/swBmSwbeK2",
        mediafire: "/file/y4f1esr2kqgmzev",
        mixdrop: "/f/file123",
        uploadhaven: "/download/file123",
        uploadnow: "/en/share",
        workupload: "/file/JVuuyQMKU3p",
        quax: "/rB4pT",
        akirabox: "/0PdzyXNW43eA/file",
      };
      assert.deepStrictEqual(
        createDirectDownloadPanelSettings().map((setting) => setting.id),
        Object.keys(samples),
      );
      for (const [index, definition] of DIRECT_DOWNLOAD_HOSTS.entries()) {
        assert.strictEqual(definition, HOST_PROCESSORS[index].definition);
        for (const host of definition.hostIncludes) {
          const route =
            definition.id === "googleDrive" && host.includes("usercontent")
              ? "/download?id=file123"
              : samples[definition.id];
          assert.strictEqual(
            classifyHostRoute(definition.canonicalHost, `https://${host}${route}`).eligible,
            true,
            host,
          );
          assert.strictEqual(
            findHostRoute(definition, `https://${host}.example.com${route}`),
            null,
          );
        }
        assert.strictEqual(findHostRoute(definition, "not a valid URL"), null);
      }
      assert.strictEqual(
        classifyHostRoute("workupload.com", "https://workupload.com/start/file123").eligible,
        false,
      );
      assert.deepStrictEqual(
        describeHostEntry("drive.google.com", "https://drive.google.com/uc?id=file123"),
        { identity: "file123", nextStage: "drive-confirmation", consumeExisting: true },
      );
      assert.deepStrictEqual(
        describeHostContinuation(
          "drive.google.com",
          "https://drive.usercontent.google.com/download",
        ),
        { identity: "", nextStage: "drive-confirmation" },
      );
      assert.strictEqual(
        describeHostEntry("drive.google.com", "https://drive.google.com/uc?id=bad%2Fid"),
        null,
      );
      assert.strictEqual(
        describeHostContinuation("vik1ngfile.site", "https://vikingfile.com/f/swBmSwbeK2"),
        null,
      );
      assert.strictEqual(
        describeHostEntry("datanodes.to", "https://datanodes.to/82wqqwwmstb7/%ZZ"),
        null,
      );
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-26 same-count replacement never satisfies single-file stability",
    async () => {
      const html = '<button><svg data-icon="arrow-down-to-line"></svg></button>';
      await scenario("https://uploadnow.io/en/share", html, async ({ advance }) => {
        const { processUploadNowDownload } = loadModule(base + "hosts/uploadnow.js");
        let failures = 0;
        const replace = () => {
          document.body.innerHTML = html;
          document.querySelector("button").click = () => assert.fail("unstable candidate clicked");
        };
        replace();
        for (const at of [400, 900, 1400, 1900]) setTimeout(replace, at);
        const operation = processUploadNowDownload({
          timeoutMs: 2500,
          intervalMs: 500,
          stableChecksRequired: 2,
          notifyMainFailure: async () => {
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("unstable success"),
        });
        await advance(2500);
        await operation;
        assert.strictEqual(failures, 1);
      });
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-27 repeat ambiguity and intermediate actions cannot report final success",
    async () => {
      await scenario(
        "https://datanodes.to/download",
        "<button>Continue</button><button>Continue</button>",
        async ({ advance, flush, clock }) => {
          const { processDatanodesDownload } = loadModule(base + "hosts/datanodes/index.js");
          let intermediate = 0,
            final = 0,
            reports = 0;
          const makeVisible = (element) => {
            element.getBoundingClientRect = () => ({ width: 10, height: 10 });
          };
          const buttons = document.querySelectorAll("button");
          for (const button of buttons) makeVisible(button);
          buttons[0].click = () => {
            intermediate += 1;
            buttons[0].remove();
            const next = document.createElement("button");
            next.textContent = "Start Download";
            makeVisible(next);
            next.click = () => {
              final += 1;
            };
            document.body.append(next);
          };
          await processDatanodesDownload({
            settings: { datanodes: { totalFlowTimeout: 4000 } },
            notifyMainFailure: fail,
            reportAddonHealthy: () => {
              reports += 1;
            },
          });
          await advance(400);
          assert.strictEqual(intermediate, 0);
          assert.strictEqual(reports, 0);
          buttons[1].remove();
          await advance(700);
          await flush();
          assert.strictEqual(intermediate, 1);
          await advance(1500);
          assert.strictEqual(final, 1);
          assert.strictEqual(reports, 1);
          assert.strictEqual(clock.pending(), 0);
          await advance(4000);
          assert.strictEqual(final, 1);
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-28 repeat deadline is terminal and cancels a blocked wait",
    async () => {
      await scenario("https://datanodes.to/download", "", async ({ advance, clock }) => {
        const { processDatanodesDownload, datanodesAutomation } = loadModule(
          base + "hosts/datanodes/index.js",
        );
        assert.strictEqual(datanodesAutomation.timeoutMs, 90000);
        let checks = 0,
          failures = 0;
        await processDatanodesDownload({
          settings: { datanodes: { totalFlowTimeout: 1000 } },
          challengeGate: {
            waitUntilClear: async () => {
              checks += 1;
              return true;
            },
          },
          notifyMainFailure: async (_host, _message, code) => {
            assert.strictEqual(code, "timeout");
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("empty repeat succeeded"),
        });
        await advance(1000);
        assert.strictEqual(failures, 1);
        assert.strictEqual(clock.pending(), 0);
        const before = checks;
        await advance(2000);
        assert.strictEqual(checks, before);
      });
    },
  );

  runTest("MASKED-HOST-TOOLS-29 challenge text cache observes same-turn text changes", async () => {
    await scenario("https://download.gg/file-fixture", "<p>ordinary</p>", async ({ flush }) => {
      const { createCloudflareChallengeMonitor } = loadModule(
        base + "hosts/shared/cloudflareChallenge.js",
      );
      const gate = createCloudflareChallengeMonitor();
      gate.start();
      assert.strictEqual(await gate.waitUntilClear(), true);
      document.querySelector("p").firstChild.data = "verify you are human";
      assert.strictEqual(
        gate.isBlocked(),
        true,
        "takeRecords must invalidate cached text before observer delivery",
      );
      document.querySelector("p").firstChild.data = "ordinary again";
      assert.strictEqual(gate.isBlocked(), false);
      gate.dispose();
      await flush();
    });
  });

  runTest("MASKED-HOST-TOOLS-30 uncertain final repeat dispatch is never retried", async () => {
    await scenario(
      "https://datanodes.to/download",
      "<button>Start Download</button>",
      async ({ advance, clock }) => {
        const { processDatanodesDownload } = loadModule(base + "hosts/datanodes/index.js");
        let attempts = 0,
          failures = 0;
        const button = document.querySelector("button");
        button.getBoundingClientRect = () => ({ width: 10, height: 10 });
        button.click = () => {
          attempts += 1;
          throw new Error("uncertain dispatch");
        };
        const prototype = button.ownerDocument.defaultView.HTMLElement.prototype;
        const original = prototype.click;
        prototype.click = () => {
          attempts += 1;
          throw new Error("fallback dispatch failed");
        };
        try {
          await processDatanodesDownload({
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("uncertain success"),
          });
          await advance(1000);
          assert.strictEqual(
            attempts,
            2,
            "one helper invocation, including its existing realm fallback",
          );
          assert.strictEqual(failures, 1);
          assert.strictEqual(clock.pending(), 0);
          await advance(4000);
          assert.strictEqual(attempts, 2);
        } finally {
          prototype.click = original;
        }
      },
    );
  });

  runTest(
    "MASKED-HOST-TOOLS-31 Gofile refuses an outside button on a multi-file page",
    async () => {
      await scenario(
        "https://gofile.io/d/fixture",
        '<button data-action="download">Download all</button><div class="fm-row" data-id="a" data-type="file"></div><div class="fm-row" data-id="b" data-type="file"></div>',
        async () => {
          const { processGofileDownload } = loadModule(base + "hosts/gofile.js");
          let failures = 0;
          document.querySelector("button").click = () => assert.fail("multi-file action clicked");
          await processGofileDownload({
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("multi-file success"),
          });
          assert.strictEqual(failures, 1);
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-32 blocked repeat has one gate wait and discards its late result",
    async () => {
      await scenario("https://datanodes.to/download", "", async ({ advance, flush, clock }) => {
        const { processDatanodesDownload } = loadModule(base + "hosts/datanodes/index.js");
        let resolveGate,
          calls = 0,
          failures = 0;
        await processDatanodesDownload({
          settings: { datanodes: { totalFlowTimeout: 1000, pollInterval: 100 } },
          challengeGate: {
            waitUntilClear: () => {
              calls += 1;
              return new Promise((resolve) => {
                resolveGate = resolve;
              });
            },
          },
          notifyMainFailure: async () => {
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("late success"),
        });
        await advance(1000);
        assert.strictEqual(calls, 1);
        assert.strictEqual(failures, 1);
        assert.strictEqual(clock.pending(), 0);
        resolveGate(true);
        await flush();
        await advance(2000);
        assert.strictEqual(calls, 1);
      });
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-33 repeat revalidates exclusion and stage after gate waits",
    async () => {
      await scenario(
        "https://datanodes.to/download",
        "<button>Start Download</button>",
        async ({ advance, clock }) => {
          const { processDatanodesDownload } = loadModule(base + "hosts/datanodes/index.js");
          const button = document.querySelector("button");
          button.getBoundingClientRect = () => ({ width: 10, height: 10 });
          button.click = () => assert.fail("premium control clicked");
          let gates = 0,
            failures = 0;
          await processDatanodesDownload({
            challengeGate: {
              waitUntilClear: async () => {
                if (++gates === 2) button.textContent = "Premium Download";
                return true;
              },
            },
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("invalid final success"),
          });
          await advance(1000);
          assert.strictEqual(failures, 1);
          assert.strictEqual(clock.pending(), 0);
        },
      );
    },
  );

  runTest("MASKED-HOST-TOOLS-34 initialization waits for a late site function", async () => {
    await scenario(
      "https://mediafire.com/file/fixture/file",
      '<a id="downloadButton" href="#">Download</a>',
      async ({ advance }) => {
        const { processMediafireDownload } = loadModule(base + "hosts/mediafire.js");
        let gates = 0,
          initialized = 0;
        setTimeout(() => {
          window.initDownload = () => {
            initialized += 1;
            document.querySelector("a").href = "https://download.example.invalid/file";
          };
        }, 600);
        const operation = processMediafireDownload({
          downloadAnchorTimeoutMs: 2000,
          pollIntervalMs: 400,
          challengeGate: { waitUntilClear: async () => ++gates === 1 },
          notifyMainFailure: fail,
          reportAddonHealthy: () => assert.fail("challenge refusal must win"),
        });
        await advance(1600);
        await operation;
        assert.strictEqual(initialized, 1);
      },
    );
  });

  runTest(
    "MASKED-HOST-TOOLS-35 metadata deadline cannot be extended by legacy settings",
    async () => {
      await scenario("https://datanodes.to/download", "", async ({ advance, clock }) => {
        const { datanodesAutomation } = loadModule(base + "hosts/datanodes/index.js");
        const { createHostAutomation } = loadModule(base + "hosts/shared/automation.js");
        const run = createHostAutomation({ ...datanodesAutomation, timeoutMs: 1000 });
        let failures = 0;
        await run({
          settings: { datanodes: { totalFlowTimeout: 5000 } },
          notifyMainFailure: async () => {
            failures += 1;
          },
          reportAddonHealthy: () => assert.fail("empty final"),
        });
        await advance(1000);
        assert.strictEqual(failures, 1);
        assert.strictEqual(clock.pending(), 0);
      });
    },
  );

  runTest(
    "MASKED-HOST-TOOLS-36 Pixeldrain list pages have no generic-button fallback",
    async () => {
      await scenario(
        "https://pixeldrain.com/l/fixture",
        '<button class="button_highlight">Download</button>',
        async () => {
          const { processPixeldrainDownload } = loadModule(base + "hosts/pixeldrain.js");
          let failures = 0;
          document.querySelector("button").click = () => assert.fail("list fallback clicked");
          global.fetch = () => assert.fail("list page must not probe a file");
          await processPixeldrainDownload({
            debugLog() {},
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => assert.fail("list success"),
          });
          assert.strictEqual(failures, 1);
        },
      );
    },
  );

  runTest(
    "MASKED-HOST-BASELINE-13 MediaFire initializes each placeholder candidate once",
    async () => {
      await scenario(
        "https://mediafire.com/file/fixture/file",
        '<a id="downloadButton" href="#">Download</a>',
        async ({ advance, clock }) => {
          let init = 0,
            failures = 0,
            healthy = 0;
          window.initDownload = () => {
            init += 1;
          };
          const { processMediafireDownload } = loadModule(base + "hosts/mediafire.js");
          const operation = processMediafireDownload({
            challengeGate: { waitUntilClear: async () => true },
            notifyMainFailure: async () => {
              failures += 1;
            },
            reportAddonHealthy: () => {
              healthy += 1;
            },
            downloadAnchorTimeoutMs: 1600,
            pollIntervalMs: 400,
          });
          await advance(1600);
          await operation;
          assert.strictEqual(init, 1);
          assert.strictEqual(failures, 1);
          assert.strictEqual(healthy, 0);
          assert.strictEqual(clock.pending(), 0);
          console.log(
            "HOST-BASELINE mediafire",
            JSON.stringify({ initCalls: init, virtualMs: 1600 }),
          );
        },
      );
    },
  );
};
