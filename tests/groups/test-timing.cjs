"use strict";

module.exports = ({ assert, runTest, childProcess, fs, path, TMP_DIR, ROOT }) => {
  const { createTimingCollector } = require("../timing.cjs");
  runTest("TEST-TIMING-01 optional measurement records failures and nested work without changing time", () => {
    let now = 10;
    const clock = createTimingCollector({ enabled: true, now: () => now });
    const start = clock.start();
    now = 15;
    clock.record("module-load", "fixture", start, { group: "sample" });
    now = 20;
    clock.record("test", "failure", start, { status: "failed", group: "sample" });
    const report = clock.snapshot();
    assert.strictEqual(report.totalMs, 10);
    assert.deepStrictEqual(report.records.map((r) => r.durationMs), [5, 10]);
    assert.strictEqual(report.records[1].status, "failed");
    report.records[0].name = "mutated";
    assert.strictEqual(clock.snapshot().records[0].name, "fixture");
    const disabled = createTimingCollector({ now: () => now });
    disabled.record("test", "ignored", disabled.start());
    assert.deepStrictEqual(disabled.snapshot().records, []);
  });
  runTest("TEST-TIMING-02 profiling preserves failed-test exit status and attribution", () => {
    const output = path.join(TMP_DIR, "timing-failure-check.json");
    const result = childProcess.spawnSync(process.execPath, ["-e", `
      const h = require('./tests/harness.cjs');
      const previousWindow = global.window;
      h.runTest.registerGroup('fixture-group', () => {
        h.runTest('intentional failure', async () => {
          const sandbox = h.createDomSandbox();
          try { await Promise.resolve(); throw new Error('expected'); }
          finally { sandbox.restore(); }
        });
        h.runTest('following test', async () => { h.assert.strictEqual(global.window, previousWindow); });
      });
      h.finish();
    `], { cwd: ROOT, encoding: "utf8", env: { ...process.env, F95UE_TEST_TIMINGS: output } });
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /1 passed, 1 failed/);
    const report = JSON.parse(fs.readFileSync(output, "utf8"));
    const tests = report.records.filter((r) => r.kind === "test");
    assert.deepStrictEqual(tests.map((r) => r.status), ["failed", "passed"]);
    assert.ok(tests.every((r) => r.group === "fixture-group" && r.durationMs >= 0));
    assert.ok(report.records.some((r) => r.kind === "registration"));
  });
};
