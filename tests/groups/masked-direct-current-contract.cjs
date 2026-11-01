"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest, createDomSandbox }) => {
  const base = "addons/masked-direct-addon/src/";
  runTest(
    "MASKED-DIRECT-CURRENT-05 native intermediate clicks once, waits boundedly and never closes",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/dl/100/");
      try {
        const { createContinuePageController } = loadModule(
          base + "app/contexts/continuePageController.js",
        );
        let pending = null,
          clicks = 0,
          closes = 0,
          allowed = true,
          skip = true;
        const listeners = new Map();
        const make = () =>
          createContinuePageController({
            getAutomationSettings: async () => ({
              enabled: true, automateRegardless: allowed,
              skipMaskedPage: skip,
              autoCloseTabs: true,
            }),
            windowRef: {
              addEventListener: (key, fn) => listeners.set(key, fn),
              removeEventListener: (key) => listeners.delete(key),
              close: () => {
                closes += 1;
              },
            },
            setTimeoutFn: (fn, delay) => {
              assert.strictEqual(delay, 250);
              pending = fn;
              return 1;
            },
            clearTimeoutFn: () => {
              pending = null;
            },
          });
        const controller = make();
        await controller.run();
        document.body.innerHTML =
          '<div class="f95dl-go"><button type="submit" class="js-f95dlContinue">Continue</button></div>';
        document.querySelector("button").addEventListener("click", () => {
          clicks += 1;
        });
        await pending();
        assert.strictEqual(clicks, 0, "finding the button must not click immediately");
        await pending();
        await controller.run();
        assert.strictEqual(clicks, 1);
        assert.strictEqual(closes, 0);
        assert.strictEqual(listeners.size, 0);
        skip = false;
        await make().run();
        assert.strictEqual(clicks, 1, "skip switch off leaves native navigation alone");
        skip = true;
        const switched = make();
        await switched.run();
        skip = false;
        await pending();
        assert.strictEqual(clicks, 1, "automationSettings is rechecked after the click delay");
        skip = true;
        allowed = false;
        await make().run();
        assert.strictEqual(clicks, 1);
        allowed = true;
        document.body.innerHTML = "";
        const cancelled = make();
        await cancelled.run();
        const late = pending;
        listeners.get("pagehide")();
        await late();
        assert.strictEqual(pending, null);
        const bounded = make();
        await bounded.run();
        for (let i = 0; i < 39; i += 1) {
          const callback = pending;
          pending = null;
          await callback();
        }
        assert.strictEqual(listeners.size, 0);
        assert.strictEqual(pending, null);
      } finally {
        sandbox.restore();
      }
    },
  );
  runTest(
    "MASKED-DIRECT-CURRENT-06 disabled intermediate controls and leaving during the delay never submit",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/dl/100/");
      try {
        const { createContinuePageController } = loadModule(
          base + "app/contexts/continuePageController.js",
        );
        document.body.innerHTML =
          '<div class="f95dl-go"><button type="submit" class="js-f95dlContinue" disabled>Continue</button></div>';
        const button = document.querySelector("button");
        let pending,
          clicks = 0;
        button.addEventListener("click", () => {
          clicks += 1;
        });
        const controller = createContinuePageController({
          getAutomationSettings: async () => ({ enabled: true, automateRegardless: true }),
          setTimeoutFn: (fn, delay) => {
            assert.strictEqual(delay, 250);
            pending = fn;
            return 1;
          },
          clearTimeoutFn: () => {
            pending = null;
          },
        });
        await controller.run();
        assert.strictEqual(clicks, 0);
        button.disabled = false;
        await pending();
        assert.strictEqual(clicks, 0, "readiness schedules a delay rather than an immediate click");
        const delayed = pending;
        window.dispatchEvent(new window.Event("pagehide"));
        await delayed();
        assert.strictEqual(clicks, 0);
        assert.strictEqual(pending, null);
      } finally {
        sandbox.restore();
      }
    },
  );
  runTest(
    "MASKED-DIRECT-CURRENT-01 delayed and hidden native download links are never discovered or rewritten",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/fixture.100/");
      try {
        const { createMaskedDirectPageBehavior } = loadModule(base + "app/pageBehavior.js");
        let starts = 0,
          clears = 0;
        const page = createMaskedDirectPageBehavior({
          clearOwnedResources() {
            clears += 1;
          },
          feedback: {
            start: () => {
              starts += 1;
            },
          },
        });
        await page.apply();
        document.body.innerHTML = fs.readFileSync(
          path.join(ROOT, "tests/fixtures/masked-direct-native-links.html"),
          "utf8",
        );
        const before = document.body.innerHTML;
        await page.apply();
        assert.strictEqual(
          page.handleObservedNodes,
          undefined,
          "retired observer bridge is removed",
        );
        assert.strictEqual(document.body.innerHTML, before);
        assert.strictEqual(document.querySelectorAll("a").length, 2);
        assert.strictEqual(document.querySelectorAll("button").length, 0);
        assert.strictEqual(
          document.querySelector(".u-hidden a").getAttribute("href"),
          "/dl/100/?k=hidden-fixture",
        );
        assert.strictEqual(starts, 2, "page behavior only starts feedback, not link processing");
        assert.strictEqual(clears, 2, "every apply clears previously owned resources");
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-CURRENT-02 independent tabs retain isolated guard and local-close state",
    async () => {
      const { createStandaloneRunGuard } = loadModule(base + "ports/standaloneRunGuard.js");
      const { createDirectDownloadFlowController } = loadModule(
        base + "domain/directDownload/flowController.js",
      );
      const windows = [0, 1].map(() => {
        const map = new Map();
        const storage = {
          getItem: (key) => map.get(key),
          setItem: (key, value) => map.set(key, value),
          removeItem: (key) => map.delete(key),
        };
        const automationSettings = {
          enabled: true, automateRegardless: true,
          autoCloseTabs: true,
          downloadPageCloseDelayMs: 30000,
        };
        const state = { closes: 0, callback: null, delay: null };
        const flow = createDirectDownloadFlowController({
          addonId: "test",
          diagnostics: { warn() {} },
          getAutomationSettings: async () => automationSettings,
          closeTab: () => {
            state.closes += 1;
          },
          setTimeoutFn: (callback, delay) => {
            state.callback = callback;
            state.delay = delay;
            return 1;
          },
          clearTimeoutFn() {},
        });
        return {
          guard: createStandaloneRunGuard({ storage }),
          state,
          execution: flow.createHostExecutionContext({ host: "pixeldrain.com", automationSettings }),
        };
      });
      const url = "https://pixeldrain.com/u/fixture";
      for (const tab of windows) assert.strictEqual(tab.guard.claim("pixeldrain.com", url), true);
      windows[0].guard.complete("pixeldrain.com", url);
      windows[1].guard.release("pixeldrain.com", url);
      assert.strictEqual(windows[0].guard.claim("pixeldrain.com", url), false);
      assert.strictEqual(windows[1].guard.claim("pixeldrain.com", url), true);
      for (const tab of windows) tab.execution.reportAddonHealthy({ downloadTriggered: true });
      windows[0].execution.dispose();
      for (const tab of windows) {
        assert.strictEqual(tab.state.delay, 30000);
        await tab.state.callback();
      }
      assert.deepStrictEqual(
        windows.map((tab) => tab.state.closes),
        [0, 1],
      );
    },
  );

  runTest("MASKED-DIRECT-CURRENT-03 disposed challenge gates refuse late actions", async () => {
    const sandbox = createDomSandbox("https://pixeldrain.com/u/fixture");
    try {
      const { createCloudflareChallengeMonitor } = loadModule(
        base + "hosts/shared/cloudflareChallenge.js",
      );
      const gate = createCloudflareChallengeMonitor({ host: "pixeldrain.com" });
      gate.dispose();
      assert.strictEqual(await gate.waitUntilClear(), false);
    } finally {
      sandbox.restore();
    }
  });

  runTest(
    "MASKED-DIRECT-CURRENT-04 enabling a disabled upgrade refreshes the settings mirror",
    async () => {
      const { createMaskedDirectLifecycle } = loadModule(base + "app/lifecycle.js");
      let reads = 0;
      const state = { enabled: false, blockedByCore: false };
      const lifecycle = createMaskedDirectLifecycle({
        state,
        runtime: { addonId: "test" },
        bridge: {},
        diagnostics: { warn() {} },
        settings: {
          storageSet: async () => ({ ok: true }),
          read: async (force) => {
            assert.strictEqual(force, true);
            reads += 1;
          },
        },
        registration: { publishStatus() {} },
        pageBehavior: { apply: async () => {} },
        clearOwnedResources() {},
      });
      await lifecycle.setEnabled(true);
      assert.strictEqual(reads, 1);
      await lifecycle.setEnabled(false);
      assert.strictEqual(reads, 1);
    },
  );
};
