"use strict";
module.exports = ({
  assert,
  fs,
  path,
  ROOT,
  loadModule,
  runTest,
  createDomSandbox,
  createFakeGM,
  createFakeClock,
}) => {
  const base = "addons/masked-direct-addon/src/";
  runTest(
    "QUICK-RESOLVE-15 leaving while the tab API is pending cannot resurrect a success link",
    async () => {
      await environment(async ({ window }) => {
        const { createQuickResolveController } = loadModule(
          base + "app/contexts/quickResolveController.js",
        );
        document.body.innerHTML = `<a href="${source}">Host</a>`;
        let finish;
        const controller = createQuickResolveController({
          getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: true }),
          resolve: async () => destination,
          openTab: async () =>
            new Promise((done) => {
              finish = done;
            }),
        });
        try {
          await controller.start();
          document.querySelector("button").click();
          await flush();
          assert.strictEqual(typeof finish, "function");
          assert.strictEqual(document.querySelector("a.is-resolved"), null);
          window.dispatchEvent(new window.Event("pagehide"));
          finish({});
          await flush();
          assert.strictEqual(document.querySelector(".f95ue-quick-resolve"), null);
        } finally {
          controller.stop();
        }
      });
    },
  );
  runTest(
    "QUICK-RESOLVE-13 core panel exposes the default-on toggle and mirrors changes locally",
    async () => {
      const { ADDON_PANEL_SETTINGS, ADDON_SETTINGS_DEFAULT, createMaskedDirectSettings } =
        loadModule(base + "app/settings.js");
      const { createAutomationSettingsRepository } = loadModule(
        base + "ports/automationSettingsRepository.js",
      );
      const repository = createAutomationSettingsRepository({ GMApi: createFakeGM() });
      assert.strictEqual(ADDON_SETTINGS_DEFAULT.quickResolveEnabled, true);
      assert.ok(
        ADDON_PANEL_SETTINGS.some(
          (entry) => entry.id === "quickResolveEnabled" && entry.path === "quickResolveEnabled",
        ),
      );
      let quickResolveEnabled = false;
      const settings = createMaskedDirectSettings({
        bridge: {
          invokeCoreAction: async () => ({
            ok: true,
            value: { ...ADDON_SETTINGS_DEFAULT, quickResolveEnabled },
          }),
        },
        onSettingsRead: (flags) => repository.updateSettings({ ...flags, enabled: true }),
      });
      await settings.read(true);
      assert.strictEqual((await repository.read()).quickResolveEnabled, false);
      quickResolveEnabled = true;
      await settings.read(true);
      assert.strictEqual((await repository.read()).quickResolveEnabled, true);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8"),
      );
      const grants = manifest.addons.find((entry) => entry.id === "masked-direct-addon").grants;
      assert.ok(grants.includes("GM.openInTab"));
      assert.ok(!grants.includes("GM.registerMenuCommand"));
    },
  );

  runTest(
    "QUICK-RESOLVE-14 new-tab success or failure never navigates the original thread",
    async () => {
      for (const mode of ["success", "refused", "rejected"]) {
        await environment(async ({ window }) => {
          const { createQuickResolveController } = loadModule(
            base + "app/contexts/quickResolveController.js",
          );
          document.body.innerHTML = `<a href="${source}">Host</a>`;
          const original = window.location.href;
          let opened = 0;
          const controller = createQuickResolveController({
            getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: true }),
            resolve: async () => destination,
            openTab: async (url) => {
              assert.strictEqual(url, destination);
              opened += 1;
              if (mode === "rejected") throw new Error("permission denied");
              return mode === "success" ? {} : null;
            },
          });
          try {
            await controller.start();
            document.querySelector("button").click();
            await flush();
            assert.strictEqual(opened, 1);
            assert.strictEqual(window.location.href, original);
            const resolved = document.querySelector("a.is-resolved");
            if (mode === "success") {
              assert.strictEqual(document.querySelector("button"), null);
              assert.strictEqual(resolved.textContent, "Resolved");
              assert.strictEqual(resolved.href, destination);
              assert.strictEqual(resolved.target, "_blank");
              assert.strictEqual(resolved.rel, "noopener");
            } else {
              assert.strictEqual(resolved, null, "failure must never turn green");
              assert.strictEqual(document.querySelector("button").disabled, true);
            }
          } finally {
            controller.stop();
          }
        });
      }
    },
  );
  runTest("QUICK-RESOLVE-11 bootstrap defaults on with no core response or menu", async () => {
    await environment(async ({ window }) => {
      const previous = {
        GM: global.GM,
        setTimeout: global.setTimeout,
        clearTimeout: global.clearTimeout,
        now: Date.now,
      };
      const clock = createFakeClock();
      const windowTimers = { setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
      window.setTimeout = clock.setTimeout;
      window.clearTimeout = clock.clearTimeout;
      const definitions = {
        __ADDON_CAPABILITIES__: [],
        __ADDON_REQUIRES_CORE__: true,
        __ADDON_PAGE_SCOPES__: ["f95zone"],
        __ADDON_MATCHES__: ["*://f95zone.to/*"],
      };
      const previousDefinitions = Object.fromEntries(
        Object.keys(definitions).map((key) => [key, global[key]]),
      );
      Object.assign(global, definitions);
      const gm = createFakeGM();
      gm.registerMenuCommand = () => assert.fail("no userscript menu toggle");
      global.GM = gm;
      global.setTimeout = clock.setTimeout;
      global.clearTimeout = clock.clearTimeout;
      Date.now = clock.now;
      window.alert = () => {};
      document.body.innerHTML = `<a href="${source}">Host</a>`;
      try {
        const { bootstrapMaskedDirectAddon } = loadModule(base + "app/createMaskedDirectApp.js");
        let finished = false;
        const boot = bootstrapMaskedDirectAddon().then(() => {
          finished = true;
        });
        await flush();
        assert.strictEqual(
          document.querySelectorAll(".f95ue-quick-resolve").length,
          1,
          "buttons must mount before core readiness resolves",
        );
        for (let i = 0; i < 160 && !finished; i += 1) {
          await clock.tick(250);
          await flush();
        }
        assert.strictEqual(finished, true);
        await boot;
        assert.strictEqual(document.querySelectorAll(".f95ue-quick-resolve").length, 1);
        window.dispatchEvent(new window.Event("pagehide"));
        assert.strictEqual(document.querySelector(".f95ue-quick-resolve"), null);
      } finally {
        global.GM = previous.GM;
        global.setTimeout = previous.setTimeout;
        global.clearTimeout = previous.clearTimeout;
        Date.now = previous.now;
        Object.assign(global, previousDefinitions);
        Object.assign(window, windowTimers);
      }
    });
  });

  runTest("QUICK-RESOLVE-12 core disable and teardown remove optional controls", async () => {
    await environment(async () => {
      const { createQuickResolveController } = loadModule(
        base + "app/contexts/quickResolveController.js",
      );
      const { createMaskedDirectPageBehavior } = loadModule(base + "app/pageBehavior.js");
      document.body.innerHTML = `<a href="${source}">Host</a>`;
      let enabled = true;
      const quickResolver = createQuickResolveController({
        getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: true }),
        isAllowed: () => enabled,
      });
      const behavior = createMaskedDirectPageBehavior({
        clearOwnedResources: () => quickResolver.stop(),
        quickResolver,
        getIsEnabled: () => enabled,
      });
      try {
        await behavior.apply();
        assert.strictEqual(document.querySelectorAll("button").length, 1);
        enabled = false;
        await behavior.apply();
        assert.strictEqual(document.querySelector("button"), null);
        await quickResolver.start();
        assert.strictEqual(document.querySelector("button"), null);
      } finally {
        quickResolver.stop();
      }
    });
  });
  const source = "https://f95zone.to/dl/123/?u=7&k=signed";
  const destination = "https://pixeldrain.com/u/fixture";
  const form = `<html data-csrf="csrf-token"><body><main data-xf-init="f95dl-page" data-code="c${Buffer.from("terces").toString("base64")}">
    <form class="f95dl-box" method="post"><input class="js-f95dlCode" name="code"><input name="_xfToken"><input name="had_check">
    <div class="f95dl-go"><button type="submit" name="continue" value="1" class="js-f95dlContinue">Continue</button></div></form></main></body></html>`;
  const result = `<div data-xf-init="f95dl-go" data-url="${destination}"></div>`;
  const response = (html, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  });
  const flush = async () => {
    for (let i = 0; i < 48; i += 1) await Promise.resolve();
  };
  async function environment(run) {
    const sandbox = createDomSandbox("https://f95zone.to/threads/fixture.1/");
    const previous = { DOMParser: global.DOMParser, FormData: global.FormData };
    global.DOMParser = sandbox.window.DOMParser;
    global.FormData = sandbox.window.FormData;
    try {
      await run(sandbox);
    } finally {
      Object.assign(global, previous);
      sandbox.restore();
    }
  }

  runTest(
    "QUICK-RESOLVE-01 resolves with one GET, conservative delay and one native-form POST",
    async () => {
      await environment(async () => {
        const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
        const calls = [],
          waits = [];
        const value = await resolveQuickDownload(source, {
          fetchFn: async (url, options) => {
            calls.push({ url, options });
            return response(calls.length === 1 ? form : result);
          },
          wait: async (ms) => {
            assert.strictEqual(calls.length, 1);
            waits.push(ms);
          },
        });
        assert.strictEqual(value, destination);
        assert.deepStrictEqual(waits, [2200]);
        assert.strictEqual(calls.length, 2);
        assert.ok(
          calls.every(
            (call) =>
              call.url === source &&
              call.options.credentials === "same-origin" &&
              call.options.redirect === "error",
          ),
        );
        const post = calls[1].options;
        assert.strictEqual(post.method, "POST");
        assert.strictEqual(post.body.get("code"), "secret");
        assert.strictEqual(post.body.get("_xfToken"), "csrf-token");
        assert.strictEqual(post.body.get("had_check"), "1");
        assert.strictEqual(post.body.get("continue"), "1");
      });
    },
  );

  runTest(
    "QUICK-RESOLVE-02 unsupported links and form destinations never cause a POST",
    async () => {
      await environment(async () => {
        const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
        for (const value of [
          "https://evil.example/dl/123/",
          "/masked/old",
          "javascript:alert(1)",
          "/dl/123/extra",
          "/dl/123/#other",
        ]) {
          await assert.rejects(
            resolveQuickDownload(value, { fetchFn: () => assert.fail("unsupported request") }),
          );
        }
        for (const action of ["https://evil.example/dl/123/", "/dl/999/", "/login/"]) {
          let calls = 0;
          await assert.rejects(
            resolveQuickDownload(source, {
              fetchFn: async () => {
                calls += 1;
                return response(form.replace('method="post"', `method="post" action="${action}"`));
              },
              wait: () => assert.fail("unsafe form wait"),
            }),
          );
          assert.strictEqual(calls, 1);
        }
      });
    },
  );

  runTest(
    "QUICK-RESOLVE-03 verification or blocked responses stop without retry or automatic fallback",
    async () => {
      await environment(async () => {
        const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
        for (const marker of [
          '<div class="h-captcha"></div>',
          '<div class="g-recaptcha"></div>',
          '<div class="cf-turnstile"></div>',
          '<input name="had_check" value="1">',
          '<div data-xf-init="unknown-captcha"></div>',
        ]) {
          let calls = 0;
          await assert.rejects(
            resolveQuickDownload(source, {
              fetchFn: async () => {
                calls += 1;
                return response(form.replace('<input name="had_check">', marker));
              },
              wait: () => assert.fail("must not submit verification"),
            }),
            /Verification/,
          );
          assert.strictEqual(calls, 1);
        }
        for (const status of [403, 429, 503]) {
          let calls = 0;
          await assert.rejects(
            resolveQuickDownload(source, {
              fetchFn: async () => {
                calls += 1;
                return response("blocked", status);
              },
            }),
          );
          assert.strictEqual(calls, 1);
        }
        let calls = 0;
        await assert.rejects(
          resolveQuickDownload(source, {
            fetchFn: async () => response(++calls === 1 ? form : '<div class="h-captcha"></div>'),
            wait: async () => {},
          }),
          /Verification/,
        );
        assert.strictEqual(calls, 2);
      });
    },
  );

  runTest(
    "QUICK-RESOLVE-04 missing facts and unsafe destinations never navigate or retry",
    async () => {
      await environment(async () => {
        const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
        for (const html of [
          "login page",
          form.replace('name="_xfToken"', 'name="missing"'),
          form.replace(/data-code="[^"]+"/, 'data-code="!"'),
          form.replace('class="js-f95dlCode"', 'class="missing"'),
        ]) {
          let calls = 0;
          await assert.rejects(
            resolveQuickDownload(source, {
              fetchFn: async () => {
                calls += 1;
                return response(html);
              },
              wait: async () => {},
            }),
          );
          assert.strictEqual(calls, 1);
        }
        for (const target of [
          "javascript:alert(1)",
          "/relative",
          "https://f95zone.to/dl/123/",
          "https://user:password@host.example/file",
        ]) {
          let calls = 0;
          await assert.rejects(
            resolveQuickDownload(source, {
              fetchFn: async () =>
                response(
                  ++calls === 1 ? form : `<div data-xf-init="f95dl-go" data-url="${target}"></div>`,
                ),
              wait: async () => {},
            }),
          );
          assert.strictEqual(calls, 2);
        }
      });
    },
  );

  runTest("QUICK-RESOLVE-05 cancellation during the allowance prevents POST", async () => {
    await environment(async () => {
      const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
      const controller = new AbortController();
      let calls = 0;
      await assert.rejects(
        resolveQuickDownload(source, {
          signal: controller.signal,
          fetchFn: async () => {
            calls += 1;
            return response(form);
          },
          wait: async () => controller.abort(),
        }),
        { name: "AbortError" },
      );
      assert.strictEqual(calls, 1);
    });
  });

  runTest("QUICK-RESOLVE-06 request timeout aborts transport and clears owned timers", async () => {
    await environment(async () => {
      const { resolveQuickDownload } = loadModule(base + "domain/quickResolve.js");
      const clock = createFakeClock(),
        old = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
      global.setTimeout = clock.setTimeout;
      global.clearTimeout = clock.clearTimeout;
      try {
        const operation = resolveQuickDownload(source, {
          fetchFn: async (_url, options) =>
            new Promise((_resolve, reject) =>
              options.signal.addEventListener("abort", () => reject(options.signal.reason), {
                once: true,
              }),
            ),
        });
        const rejected = assert.rejects(operation, { name: "AbortError" });
        await clock.tick(20000);
        await rejected;
        assert.strictEqual(clock.pending(), 0);
      } finally {
        Object.assign(global, old);
      }
    });
  });

  runTest("QUICK-RESOLVE-07 storage defaults on and preserves explicit choices", async () => {
    const { createAutomationSettingsRepository } = loadModule(
      base + "ports/automationSettingsRepository.js",
    );
    const repository = createAutomationSettingsRepository({ GMApi: createFakeGM() });
    assert.strictEqual((await repository.read()).quickResolveEnabled, true);
    await repository.updateSettings({ quickResolveEnabled: true });
    await repository.updateSettings({
      enabled: true,
      automateRegardless: true,
      directDownloadPackages: {},
    });
    assert.strictEqual((await repository.read()).quickResolveEnabled, true);
    await repository.updateSettings({ quickResolveEnabled: false });
    assert.strictEqual((await repository.read()).quickResolveEnabled, false);
    assert.strictEqual(
      (
        await createAutomationSettingsRepository({
          GMApi: createFakeGM({}, { failGet: true }),
        }).read()
      ).enabled,
      false,
    );
  });

  runTest(
    "QUICK-RESOLVE-08 red controls leave native links alone and serialize user requests",
    async () => {
      await environment(async () => {
        const { createQuickResolveController } = loadModule(
          base + "app/contexts/quickResolveController.js",
        );
        document.body.innerHTML = `<a href="${source}" target="_blank">Host</a><a href="https://ads.example/dl/123/">Decoy</a><div hidden><a href="${source}">Hidden</a></div>`;
        const link = document.querySelector("a"),
          before = link.outerHTML;
        let enabled = false,
          calls = 0,
          release;
        const navigations = [];
        const controller = createQuickResolveController({
          getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: enabled }),
          resolve: async () => {
            calls += 1;
            return new Promise((done) => {
              release = done;
            });
          },
          openTab: (url) => {
            navigations.push(url);
            return {};
          },
        });
        try {
          await controller.start();
          assert.strictEqual(document.querySelector("button"), null);
          enabled = true;
          await controller.start();
          assert.strictEqual(document.querySelectorAll("button").length, 1);
          assert.strictEqual(link.outerHTML, before);
          const button = document.querySelector("button");
          button.click();
          button.click();
          await flush();
          assert.strictEqual(calls, 1);
          release(destination);
          await flush();
          assert.deepStrictEqual(navigations, [destination]);
          assert.strictEqual(link.outerHTML, before);
          const resolved = document.querySelector("a.is-resolved");
          assert.strictEqual(resolved.href, destination);
          assert.match(resolved.style.backgroundColor, /^(#388e3c|rgb\(56, 142, 60\))$/);
          resolved.addEventListener("click", (event) => event.preventDefault());
          resolved.click();
          await flush();
          assert.strictEqual(
            calls,
            1,
            "the green link reuses the processed URL without another resolution",
          );
          enabled = false;
          await controller.start();
          assert.strictEqual(document.querySelector("button"), null);
          assert.strictEqual(document.querySelector("a.is-resolved"), null);
        } finally {
          controller.stop();
        }
      });
    },
  );

  runTest(
    "QUICK-RESOLVE-09 pagehide cancels resolution and pageshow restores controls without a request",
    async () => {
      await environment(async ({ window }) => {
        const { createQuickResolveController } = loadModule(
          base + "app/contexts/quickResolveController.js",
        );
        document.body.innerHTML = `<a href="${source}">Host</a>`;
        let signal,
          finish,
          calls = 0;
        const controller = createQuickResolveController({
          getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: true }),
          resolve: async (_url, options) => {
            calls += 1;
            signal = options.signal;
            return new Promise((done) => {
              finish = done;
            });
          },
          openTab: () => assert.fail("late new tab"),
        });
        try {
          await controller.start();
          document.querySelector("button").click();
          await flush();
          window.dispatchEvent(new window.Event("pagehide"));
          assert.strictEqual(signal.aborted, true);
          finish(destination);
          await flush();
          assert.strictEqual(document.querySelector("button"), null);
          window.dispatchEvent(new window.Event("pageshow"));
          await flush();
          assert.strictEqual(document.querySelectorAll("button").length, 1);
          assert.strictEqual(calls, 1);
        } finally {
          controller.stop();
        }
      });
    },
  );

  runTest(
    "QUICK-RESOLVE-10 dynamic links are discovered on focus and errors retain the normal route",
    async () => {
      await environment(async ({ window }) => {
        const { createQuickResolveController } = loadModule(
          base + "app/contexts/quickResolveController.js",
        );
        const controller = createQuickResolveController({
          getAutomationSettings: async () => ({ enabled: true, quickResolveEnabled: true }),
          resolve: async () => {
            throw new Error("Verification required. Use the original link.");
          },
          openTab: () => assert.fail("unexpected new tab"),
        });
        try {
          await controller.start();
          document.body.innerHTML = `<a href="${source}">Host</a>`;
          const link = document.querySelector("a");
          link.dispatchEvent(new window.Event("focusin", { bubbles: true }));
          link.dispatchEvent(new window.Event("focusin", { bubbles: true }));
          assert.strictEqual(document.querySelectorAll("button").length, 1);
          document.querySelector("button").click();
          await flush();
          assert.strictEqual(document.querySelector("button").textContent, "Use normal link");
          assert.strictEqual(document.querySelector("button").disabled, true);
          assert.strictEqual(link.href, source);
        } finally {
          controller.stop();
        }
      });
    },
  );
};
