module.exports = function registerAddonSizeTests(context) {
  const { path, fs, assert, childProcess, ROOT, TMP_DIR, runTest } = context;
  const reportPath = path.join(ROOT, "docs/architecture/addon-service-size-audit.json");
  const auditScript = path.join(ROOT, "scripts/addon-service-size-audit.cjs");

  runTest("ADDON-SERVICE-SIZE-AUDIT-01 report is deterministic and complete", () => {
    const firstPath = path.join(TMP_DIR, "addon-size-audit-first.json");
    const secondPath = path.join(TMP_DIR, "addon-size-audit-second.json");
    const before = childProcess.execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
    for (const outputPath of [firstPath, secondPath]) {
      childProcess.execFileSync(process.execPath, [auditScript, "--output", outputPath], { cwd: ROOT, stdio: "ignore" });
    }
    const first = fs.readFileSync(firstPath, "utf8");
    const second = fs.readFileSync(secondPath, "utf8");
    const after = childProcess.execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
    assert.strictEqual(first, second);
    assert.strictEqual(before, after);
    assert.doesNotMatch(first, /[A-Za-z]:[\\/]/);
    assert.doesNotMatch(first, /(?:^|[" ])\/(?:Users|home|tmp)\//);
    fs.rmSync(firstPath, { force: true });
    fs.rmSync(secondPath, { force: true });
  });

  runTest("ADDON-SERVICE-SIZE-AUDIT-01 covers production boundaries and public contracts", () => {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "addons/addons.manifest.json"), "utf8")).addons;
    assert.strictEqual(report.addons.length, manifest.length);
    assert.deepStrictEqual(report.addons.map((entry) => entry.addonId).sort(), manifest.map((entry) => entry.id).sort());
    assert.strictEqual(report.publicApiConsumers.allActions.length, 30);
    assert.strictEqual(new Set(report.publicApiConsumers.allActions.map((entry) => entry.action)).size, 30);
    assert.ok(report.helperConsumers.every((helper) => Array.isArray(helper.consumers)));
    assert.strictEqual(report.summary.testsExcludedFromProductionTotals, true);
    const productionPaths = report.coreAddOnService.source.files.map((file) => file.path).concat(
      report.addons.flatMap((addon) => addon.source.files.map((file) => file.path)),
    );
    assert.ok(productionPaths.every((file) => !file.includes("/tests/") && !file.includes("/dist/")));
  });

  runTest("ADDON-SERVICE-SIZE-AUDIT-01 preserves the deferred handshake decision and names owners", () => {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.deepStrictEqual(report.security.registrationHandshake.status, "deferred");
    assert.strictEqual(report.security.registrationHandshake.changed, false);
    assert.ok(report.security.registrationHandshake.owners.includes("src/services/addons/bridgeServer.js"));
    assert.ok(report.security.registrationHandshake.owners.includes("addons/shared/coreBridge.js"));
    assert.strictEqual(report.validation.handshakeRedesigned, false);
    assert.ok(report.beforeAfter.coreService.owningFiles.length > 0);
    assert.ok(report.addons.every((addon) => addon.baseline.owningFiles.length > 0));
  });
};
