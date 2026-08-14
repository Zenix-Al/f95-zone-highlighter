"use strict";

module.exports = function registerMaskedDirectStandaloneExpansionBaseline(context) {
  const { ROOT, assert, createDomSandbox, fs, loadModule, path, runTest } = context;

  const routes = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        "tests",
        "fixtures",
        "masked-direct",
        "standalone-expansion-routes.json",
      ),
      "utf8",
    ),
  );
  const evidence = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        "docs",
        "architecture",
        "masked-direct-standalone-expansion-baseline.json",
      ),
      "utf8",
    ),
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 records every proposed host route",
    () => {
      const expected = [
        "buzzheavier.com",
        "gofile.io",
        "drive.google.com",
        "datanodes.to",
        "mediafire.com",
        "miiiixdrop.net",
        "uploadnow.io",
        "vik1ngfile.site",
        "workupload.com",
      ];
      assert.deepStrictEqual(Object.keys(routes), expected);
      assert.deepStrictEqual(Object.keys(evidence.hosts), expected);
      for (const host of expected) {
        assert.ok(routes[host].entry.length > 0, `${host} entry fixture`);
        assert.ok(routes[host].unsafe.length > 0, `${host} unsafe fixture`);
        assert.ok(evidence.hosts[host].sideEffects.length > 0, `${host} effects`);
        assert.ok(evidence.hosts[host].guards.length > 0, `${host} guards`);
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 records initial expansion denial",
    () => {
      assert.strictEqual(
        evidence.currentExpansionEligibility,
        "All expansion hosts remain blocked without managed identity.",
      );
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 retains existing approved routes",
    () => {
      const { classifyStandaloneHostRoute } = loadModule(
        "addons/masked-direct-addon/src/hosts/standaloneEligibility.js",
      );
      for (const [host, url] of [
        ["krakenfiles.com", "https://krakenfiles.com/view/a/file.html"],
        ["delafil.se", "https://delafil.se/0123456789abcdef/file.zip"],
        ["download.gg", "https://download.gg/en-us/file-example"],
        ["uploadhaven.com", "https://uploadhaven.com/download/example"],
        ["pixeldrain.com", "https://pixeldrain.com/u/K3kVDJSJ"],
      ]) {
        const sandbox = createDomSandbox(url);
        try {
          assert.strictEqual(
            classifyStandaloneHostRoute(host, url).eligible,
            true,
            host,
          );
        } finally {
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 records continuation requirements",
    () => {
      const continuationHosts = Object.entries(evidence.hosts)
        .filter(([, value]) => value.continuationRequired)
        .map(([host]) => host);
      assert.deepStrictEqual(continuationHosts, [
        "drive.google.com",
        "datanodes.to",
        "vik1ngfile.site",
        "workupload.com",
      ]);
      assert.ok(routes["drive.google.com"].continuation.length > 0);
      assert.ok(routes["workupload.com"].continuation.length > 0);
      assert.deepStrictEqual(routes["miiiixdrop.net"].observedUnmatched, [
        "https://miixdrop.com/f/k0mpjgvgt31r9zv",
      ]);
    },
  );

  runTest(
    "MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 preserves managed-first source ordering",
    () => {
      const source = fs.readFileSync(
        path.join(
          ROOT,
          "addons",
          "masked-direct-addon",
          "src",
          "app",
          "contexts",
          "downloadPageController.js",
        ),
        "utf8",
      );
      const managedRead = source.indexOf("readProcessingDownloadTrigger");
      const policyRead = source.indexOf("getStandalonePolicy", managedRead);
      const routeRead = source.indexOf("classifyStandaloneHostRoute", policyRead);
      assert.ok(managedRead >= 0 && managedRead < policyRead);
      assert.ok(policyRead < routeRead);
    },
  );
};
