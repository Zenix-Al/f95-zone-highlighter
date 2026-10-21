"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest, createDomSandbox }) => {
  const base = "addons/masked-direct-addon/";
  runTest("MASKED-DIRECT-RETIRE-01 bundles exclude masked and managed ownership code", () => {
    const esbuild = require("esbuild");
    for (const release of [false, true]) {
      const result = esbuild.buildSync({
        entryPoints: [path.join(ROOT, base, "src/main.js")], bundle: true,
        write: false, metafile: true, format: "iife", minify: release,
        loader: { ".css": "text", ".html": "text" },
        define: { __F95UE_DEBUG__: String(!release) },
      });
      const graph = Object.keys(result.metafile.inputs).join("\n").replaceAll("\\", "/");
      assert.doesNotMatch(graph, /\/archive\//);
      assert.doesNotMatch(graph, /maskedPageController|maskedResolutionTransport|maskedDestinationDelivery|threadPageController|managedTabs|managedClose|processingTrigger|processingDownloadRepository|routeContextRepository|directDownload\/attention|shared\/managedNavigation|ui\/controller|styleController/);
      assert.doesNotMatch(result.outputFiles[0].text, /GM_openInTab|f95ue\.addon\.maskedDirect\.request\./);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8")).addons.find((a) => a.id === "masked-direct-addon");
    assert.strictEqual(manifest.name, "F95UE Masked + Direct Download Add-on");
    assert.ok(!manifest.grants.includes("GM_openInTab"));
    assert.ok(!manifest.matches.some((match) => /masked|recaptcha/.test(match)));
    assert.ok(fs.existsSync(path.join(ROOT, base, "archive/app/contexts/maskedPageController.js")));
  });


  runTest("MASKED-DIRECT-RETIRE-03 old markers do not bypass standalone policy or create ownership", async () => {
    const sandbox = createDomSandbox("https://krakenfiles.com/view/fixture/file.html?f95ue_dd=1&f95ue_dd_req=old&f95ue_tab=origin");
    try {
      const { createDownloadPageController } = loadModule(base + "src/app/contexts/downloadPageController.js");
      let allowed = false;
      const controller = createDownloadPageController({
        addonId: "masked-direct-addon", debugLog() {}, handlers: {},
        getIsEnabled: () => true, getIsBlockedByCore: () => false,
        GMApi: { getValue: () => { throw new Error("retired ownership must not be read"); } },
        getStandalonePolicy: async () => ({ effectiveAutomateRegardless: allowed }),
      });
      assert.strictEqual((await controller.decideHostAutomation("krakenfiles.com")).mode, "blocked");
      allowed = true;
      const decision = await controller.decideHostAutomation("krakenfiles.com");
      assert.strictEqual(decision.mode, "standalone");
      assert.strictEqual(decision.request, null);
      assert.strictEqual(await controller.shouldRunHostAutomation("krakenfiles.com"), true);
    } finally { sandbox.restore(); }
  });

  runTest("MASKED-DIRECT-RETIRE-04 host callbacks retain local guard hooks without origin actions", () => {
    const { createDirectDownloadFlowController } = loadModule(base + "src/domain/directDownload/flowController.js");
    const flow = createDirectDownloadFlowController({ addonId: "test", diagnostics: { warn() {} } });
    let succeeded = 0;
    const context = flow.createHostExecutionContext({ mode: "managed", host: "pixeldrain.com" }, { onStandaloneSuccess: () => { succeeded += 1; } });
    assert.strictEqual(context.mode, "standalone");
    assert.strictEqual(context.request, null);
    context.reportAddonHealthy();
    assert.strictEqual(succeeded, 1);
    assert.strictEqual(flow.routeToDirectDownload, undefined);
    assert.strictEqual(flow.setActiveManagedRequest, undefined);
  });
};
