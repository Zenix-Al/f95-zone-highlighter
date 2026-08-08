"use strict";

module.exports = function registerMaskedDirectStandaloneHostGuards(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  runTest(
    "MASKED-DIRECT-STANDALONE-HOST-GUARDS-01 classifies only approved exact routes",
    () => {
      const { classifyStandaloneHostRoute, getStandaloneApprovedHosts } =
        loadModule(
          "addons/masked-direct-addon/src/hosts/standaloneEligibility.js",
        );
      const cases = [
        ["krakenfiles.com", "https://krakenfiles.com/view/a/file.html"],
        ["delafil.se", "https://delafil.se/0123456789abcdef/file.zip"],
        ["download.gg", "https://download.gg/en-us/file-example"],
        ["uploadhaven.com", "https://uploadhaven.com/download/example"],
        ["pixeldrain.com", "https://pixeldrain.com/u/K3kVDJSJ"],
      ];
      assert.deepStrictEqual(getStandaloneApprovedHosts(), [
        "krakenfiles.com",
        "delafil.se",
        "download.gg",
        "uploadhaven.com",
        "pixeldrain.com",
      ]);
      for (const [host, url] of cases) {
        const sandbox = createDomSandbox(url);
        try {
          assert.strictEqual(
            classifyStandaloneHostRoute(host, url).eligible,
            true,
            `${host} representative file route`,
          );
        } finally {
          sandbox.restore();
        }
      }
      const sandbox = createDomSandbox("https://krakenfiles.com/view/a");
      try {
        assert.strictEqual(
          classifyStandaloneHostRoute(
            "krakenfiles.com",
            "https://krakenfiles.com/view/a",
          ).eligible,
          false,
        );
        assert.strictEqual(
          classifyStandaloneHostRoute(
            "uploadnow.io",
            "https://uploadnow.io/a/share",
          ).eligible,
          false,
        );
        assert.strictEqual(
          classifyStandaloneHostRoute(
            "pixeldrain.com",
            "https://pixeldrain.com/collection/example",
          ).eligible,
          false,
        );
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-HOST-GUARDS-01 claims a route once and permits retry after failure",
    () => {
      const sandbox = createDomSandbox("https://download.gg/file-example");
      try {
        let timestamp = 1000;
        const { createStandaloneRunGuard } = loadModule(
          "addons/masked-direct-addon/src/ports/standaloneRunGuard.js",
        );
        const guard = createStandaloneRunGuard({
          storage: sandbox.window.sessionStorage,
          now: () => timestamp,
        });
        assert.strictEqual(guard.claim("download.gg"), true);
        assert.strictEqual(guard.claim("download.gg"), false);
        assert.strictEqual(guard.release("download.gg"), true);
        assert.strictEqual(guard.claim("download.gg"), true);
        timestamp = 2000;
        assert.strictEqual(guard.complete("download.gg"), true);
        assert.strictEqual(guard.claim("download.gg"), false);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-HOST-GUARDS-01 normalizes aliases and ignores query churn",
    () => {
      const { getStandaloneRunGuardKey } = loadModule(
        "addons/masked-direct-addon/src/ports/standaloneRunGuard.js",
      );
      assert.strictEqual(
        getStandaloneRunGuardKey(
          "vikingfile.com",
          "https://vikingfile.com/f/Example?token=one",
        ),
        getStandaloneRunGuardKey(
          "vik1ngfile.site",
          "https://vik1ngfile.site/f/Example?token=two",
        ),
      );
      assert.strictEqual(
        getStandaloneRunGuardKey(
          "download.gg",
          "https://download.gg/file-example?first=1",
        ),
        getStandaloneRunGuardKey(
          "download.gg",
          "https://download.gg/file-example?second=2",
        ),
      );
    },
  );
};
