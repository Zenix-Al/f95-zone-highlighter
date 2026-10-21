"use strict";

module.exports = ({ assert, fs, path, TMP_DIR, runTest }) => {
  const { createReportFixture, snapshotTrees } = require("../reportFixture.cjs");
  runTest("TEST-INFRASTRUCTURE-01 report evidence is isolated, invalidated and retryable", async () => {
    const root = fs.mkdtempSync(path.join(TMP_DIR, "report-fixture-"));
    const input = path.join(root, "input.json");
    try {
      fs.writeFileSync(input, "first");
      let calls = 0, fail = false;
      const report = createReportFixture({
        getSignature: () => snapshotTrees([root]),
        create: () => {
          calls += 1;
          if (fail) throw Error("fixture failure");
          return { values: [calls] };
        },
      });
      const first = await report();
      first.values.push(99);
      assert.deepStrictEqual(await report(), { values: [1] });
      assert.strictEqual(calls, 1);
      fs.writeFileSync(input, "second");
      assert.deepStrictEqual(await report(), { values: [2] });
      fs.writeFileSync(path.join(root, "added.json"), "{}");
      fail = true;
      await assert.rejects(report(), /fixture failure/);
      fail = false;
      assert.deepStrictEqual(await report(), { values: [4] });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
};
