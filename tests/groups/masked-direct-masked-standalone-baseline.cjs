"use strict";

module.exports = function registerMaskedDirectMaskedStandaloneBaseline(context) {
  const { ROOT, assert, createDomSandbox, fs, loadModule, path, runTest } =
    context;

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 freezes route ownership",
    () => {
      const { classifyMaskedDirectContext } = loadModule(
        "addons/masked-direct-addon/src/app/context.js",
      );
      const external = (hostname) => hostname === "pixeldrain.com";
      const cases = [
        ["https://f95zone.to/threads/example.1/", "f95-core", "thread", true],
        [
          "https://f95zone.to/masked/example",
          "f95-optional-core",
          "masked",
          true,
        ],
        [
          "https://www.google.com/recaptcha/api2/anchor",
          "external-standalone",
          "recaptcha-frame",
          false,
        ],
        [
          "https://pixeldrain.com/u/example",
          "external-standalone",
          "download-host",
          false,
        ],
        ["https://f95zone.to/forums/2", "unsupported", "unsupported", false],
      ];
      for (const [url, kind, route, usesCore] of cases) {
        assert.deepStrictEqual(
          classifyMaskedDirectContext(new URL(url), {
            isSupportedExternalHost: external,
          }),
          { kind, route, usesCore },
          url,
        );
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 records canonical masked fixtures",
    () => {
      const fixtureRoot = path.join(
        ROOT,
        "tests",
        "fixtures",
        "masked-direct",
      );
      const html = fs.readFileSync(
        path.join(fixtureRoot, "masked-page.html"),
        "utf8",
      );
      const responses = JSON.parse(
        fs.readFileSync(
          path.join(fixtureRoot, "masked-responses.json"),
          "utf8",
        ),
      );
      for (const id of ["leaving", "loading", "captcha", "error"]) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
      }
      assert.match(html, /class="host_link"/);
      assert.deepStrictEqual(Object.keys(responses), [
        "success",
        "serverFailure",
        "malformedJson",
        "captcha",
        "invalidDestination",
        "continuePageSelector",
      ]);
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 verifies duplicate POST risk is guarded",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      const requests = [];
      const teardowns = [];
      try {
        let finish;
        const pending = new Promise((resolve) => { finish = resolve; });
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown: (teardown) => teardowns.push(teardown),
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink: (url) => {
            requests.push(url);
            return pending;
          },
          deliverDestination: async () => {},
        });
        const first = controller.enableMaskedPageHooks({
          isEnabled: true,
          isBlockedByCore: false,
        });
        const second = controller.enableMaskedPageHooks({
          isEnabled: true,
          isBlockedByCore: false,
        });
        await Promise.resolve();
        await Promise.resolve();
        assert.deepStrictEqual(requests, ["/masked/example"]);
        finish({ status: "ok", msg: "https://example.com/file" });
        await Promise.all([first, second]);
        assert.strictEqual(teardowns.length, 1);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 proves missing core returns before F95 lifecycle",
    () => {
      const source = fs.readFileSync(
        path.join(
          ROOT,
          "addons",
          "masked-direct-addon",
          "src",
          "app",
          "createMaskedDirectApp.js",
        ),
        "utf8",
      );
      const missingBranch = source.indexOf(
        'if (ownership.state === "confirmed-missing" && coreRequiredForPage)',
      );
      const missingReturn = source.indexOf("return;", missingBranch);
      const registration = source.indexOf("registration.register()", missingBranch);
      assert.ok(missingBranch >= 0);
      assert.ok(missingReturn > missingBranch);
      assert.ok(registration > missingReturn);
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 resolver has no managed storage or signaling dependency",
    () => {
      const controllerSource = fs.readFileSync(
        path.join(
          ROOT,
          "addons",
          "masked-direct-addon",
          "src",
          "app",
          "contexts",
          "maskedPageController.js",
        ),
        "utf8",
      );
      const transportSource = fs.readFileSync(
        path.join(
          ROOT,
          "addons",
          "masked-direct-addon",
          "src",
          "app",
          "contexts",
          "maskedResolutionTransport.js",
        ),
        "utf8",
      );
      assert.doesNotMatch(
        controllerSource + transportSource,
        /processingDownload|routeContext|publishDirectDownload|managedClose|GM\./,
      );
      assert.match(transportSource, /XMLHttpRequest/);
      assert.match(transportSource, /X-Requested-With/);
      assert.match(transportSource, /xhr=1&download=1/);
      assert.match(controllerSource, /api\.render/);
      assert.match(controllerSource, /addTeardown\(\(\) => clearInterval/);
    },
  );
};
