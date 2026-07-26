"use strict";

module.exports = function registerMaskedDirectParallelBaseline(context) {
  const { ROOT, assert, fs, path, runTest } = context;

  runTest("MASKED-DIRECT-PARALLEL-BASELINE-01 report remains stable and complete", () => {
    const report = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          "docs",
          "architecture",
          "masked-direct-parallel-baseline.json",
        ),
        "utf8",
      ),
    );
    assert.strictEqual(report.packageId, "MASKED-DIRECT-PARALLEL-BASELINE-01");
    assert.strictEqual(report.productionChanges, false);
    assert.deepStrictEqual(
      report.characterizedOutcomes.map(({ id, currentOutcome }) => [
        id,
        currentOutcome,
      ]),
      [
        ["two-tab-create", "request-a-lost"],
        ["cleanup-versus-create", "request-b-lost"],
        ["healthy-tab-broad-clear", "all-live-requests-lost"],
        ["shared-close-delay", "last-writer-wins"],
        ["out-of-order-result", "older-sibling-discarded"],
        ["different-target-tabs", "non-target-event-ignored"],
        ["same-tab-sequential", "both-requests-retained"],
      ],
    );
  });
};
