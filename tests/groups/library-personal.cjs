"use strict";

module.exports = function registerLibraryPersonalGroup(context) {
  const {
    assert,
    addonBaseline,
    fs,
    loadModule,
    path,
    ROOT,
    runTest,
  } = context;
  const baselineTool = require("../../scripts/library-personal-baseline.cjs");
  const fixtures = require("../fixtures/libraryPersonalBaselineFixtures.cjs");
  const reportPath = path.join(
    ROOT,
    "docs/architecture/library-personal-baseline.json",
  );

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 produces a deterministic non-mutating report",
    async () => {
      const before = addonBaseline.snapshotWorkingTree();
      const first = await baselineTool.createLibraryPersonalBaseline();
      const second = await baselineTool.createLibraryPersonalBaseline();
      assert.deepStrictEqual(second, first);
      assert.deepStrictEqual(addonBaseline.snapshotWorkingTree(), before);
      const serialized = JSON.stringify(first);
      assert.doesNotMatch(serialized, /[A-Za-z]:[\\/]/);
      assert.strictEqual(first.productionMutation, false);
      assert.deepStrictEqual(first.deterministic, {
        timestamps: false,
        absolutePaths: false,
        network: false,
        indexedDbOpened: false,
      });
      assert.deepStrictEqual(
        JSON.parse(fs.readFileSync(reportPath, "utf8")),
        first,
      );
    },
  );

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 records the current IDB and record contracts",
    async () => {
      const report = await baselineTool.createLibraryPersonalBaseline();
      assert.strictEqual(
        report.source.database.physicalName,
        "f95ue-addon:library-addon:library",
      );
      assert.strictEqual(report.source.database.version, 1);
      assert.deepStrictEqual(report.source.database.stores, [
        {
          name: "records",
          keyPath: "threadId",
          indexes: [
            { name: "updatedAt", keyPath: "updatedAt" },
            { name: "userStatus", keyPath: "userStatus" },
            { name: "titleNormalized", keyPath: "titleNormalized" },
            { name: "prefix", keyPath: "prefix" },
            { name: "tags", keyPath: "tags", multiEntry: true },
          ],
        },
      ]);
      for (const field of [
        "threadRating",
        "userScore",
        "gameVersion",
        "userStatus",
        "note",
        "schemaVersion",
      ]) {
        assert.ok(report.source.recordShape.includes(field), field);
      }
    },
  );

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 characterizes fixtures without changing normalization",
    () => {
      const { normalizeRecord } = loadModule(
        "addons/library-addon/src/library/recordModel.js",
      );
      const source = fixtures.createFixtures();
      const legacy = normalizeRecord(source.legacy);
      const version3 = normalizeRecord(source.version3);
      const malformed = normalizeRecord(source.malformed);
      assert.strictEqual(legacy.thread.currentVersion, "v0.7");
      assert.strictEqual(legacy.thread.developer, "Legacy Dev");
      assert.strictEqual(legacy.personal.rating, 4);
      assert.strictEqual(version3.schemaVersion, 5);
      assert.strictEqual(version3.thread.threadRating, source.version3.threadRating);
      assert.strictEqual(version3.personal.rating, source.version3.userScore / 2);
      assert.strictEqual(malformed.thread.threadRating, null);
      assert.deepStrictEqual(malformed.thread.tags, ["valid", "7"]);
      assert.strictEqual(malformed.schemaVersion, 5);
      assert.ok(Number.isFinite(malformed.personal.addedAt));
    },
  );

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 snapshots table actions and current rating behavior",
    async () => {
      const report = await baselineTool.createLibraryPersonalBaseline();
      const behavior = report.source.behavior;
      assert.deepStrictEqual(behavior.tableHeadings, [
        "",
        "Title",
        "Status",
        "My Rating",
        "Updated",
        "Prefixes",
        "Version",
        "Developer",
        "Tags",
        "Note",
        "Action",
      ]);
      for (const action of [
        "edit-note",
        "note-input",
        "note-done",
        "rating-input",
        "row-menu-toggle",
        "row-update-thread",
        "remove",
      ]) {
        assert.ok(behavior.rowActions.includes(action), action);
      }
      assert.strictEqual(behavior.displayedRating, "personal.rating");
      assert.strictEqual(behavior.personalRatingField, "personal.rating");
      assert.strictEqual(behavior.personalRatingRendered, true);
      assert.deepStrictEqual(behavior.noteEditing, {
        inline: true,
        doneAction: true,
      });
      assert.deepStrictEqual(behavior.managerReopen, {
        stableDialogId: true,
        generationGuard: true,
        closeResetsRoot: true,
      });
      assert.deepStrictEqual(behavior.importExport, {
        acceptsArray: true,
        acceptsRecordsDocument: true,
        exportsRecords: true,
      });
    },
  );

  runTest("Library manager keeps bulk and transfer controls in one compact row", () => {
    const html = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/assets/manager.html"),
      "utf8",
    );
    assert.match(html, /<summary>Bulk actions<\/summary>/);
    assert.match(html, /<summary>Export<\/summary>/);
    assert.match(html, /data-field="bulkAction"/);
    assert.match(html, /data-field="exportScope"/);
    assert.match(html, /value="selected">Selected records/);
    assert.match(html, /data-action="import"/);
    assert.doesNotMatch(html, /<summary>Advanced<\/summary>/);
    assert.doesNotMatch(html, /data-field="bulkStatus"/);
    assert.doesNotMatch(html, /data-field="bulkPin"/);
    assert.ok(
      html.indexOf('id="f95ue-library-rows-status"') <
        html.indexOf("f95ue-library-export-actions"),
    );
    assert.strictEqual(
      (html.match(/id="f95ue-library-rows-status"/g) || []).length,
      1,
    );
  });

  runTest("Library compact bulk menu applies status and clears selection", async () => {
    const { createBulkHandlers } = loadModule(
      "addons/library-addon/src/ui/manager/handlers/bulkHandlers.js",
    );
    let selectedAction = "status:paused";
    const updates = [];
    const state = { selectedIds: new Set(["1", "2"]) };
    const handlers = createBulkHandlers({
      api: {
        bulkUpdateStatus: async (ids, status) => {
          updates.push({ ids, status });
          return { updated: ids.length, skipped: 0 };
        },
      },
      deps: { askConfirmFn: async () => true },
      getRoot: () => ({
        querySelector(selector) {
          if (selector === '[data-field="bulkAction"]') return { value: selectedAction };
          return null;
        },
      }),
      notifyMutated() {},
      reloadRows: async () => {},
      state,
    });
    await handlers["bulk-apply"]();
    assert.deepStrictEqual(updates, [{ ids: ["1", "2"], status: "paused" }]);
    selectedAction = "clear";
    await handlers["bulk-apply"]();
    assert.strictEqual(state.selectedIds.size, 0);
  });

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 characterizes sorting filtering and thread patches",
    () => {
      const { getSortConfig, matchesLibraryFilters } = loadModule(
        "addons/library-addon/src/library/querying.js",
      );
      const { normalizeRecord } = loadModule(
        "addons/library-addon/src/library/recordModel.js",
      );
      const record = fixtures.createRecord(7);
      assert.deepStrictEqual(getSortConfig("updatedAt", "desc"), {
        index: "pinnedUpdatedDesc",
        direction: "prev",
      });
      const normalized = normalizeRecord(record);
      assert.strictEqual(
        matchesLibraryFilters(normalized, { status: normalized.personal.status }),
        true,
      );
      assert.strictEqual(
        matchesLibraryFilters(record, { status: "missing-status" }),
        false,
      );
      const report = baselineTool.characterizeSource();
      assert.deepStrictEqual(report.behavior.threadUpdateFields, [
        "url",
        "title",
        "canonicalTitle",
        "titleNormalized",
        "prefix",
        "gameVersion",
        "prefixes",
        "developer",
        "threadRating",
        "tags",
        "sourcePage",
      ]);
    },
  );

  runTest(
    "LIBRARY-PERSONAL-BASELINE-01 measures deterministic record scales",
    async () => {
      const report = await baselineTool.createLibraryPersonalBaseline();
      assert.deepStrictEqual(
        report.scaleMeasurements.map((entry) => entry.count),
        [10, 1000, 10000],
      );
      for (const measurement of report.scaleMeasurements) {
        const records = fixtures.createRecords(measurement.count);
        assert.strictEqual(
          measurement.serializedBytes,
          Buffer.byteLength(JSON.stringify(records), "utf8"),
        );
        assert.ok(measurement.averageRecordBytes > 0);
      }
      assert.ok(report.build.authoredBytes > 0);
      assert.ok(report.build.regular.bytes > 0);
      assert.ok(report.build.release.bytes > 0);
      assert.ok(report.build.regular.gzipBytes > 0);
      assert.ok(report.build.release.gzipBytes > 0);
      assert.ok(report.build.regular.contributors.length > 0);
      assert.ok(report.build.release.contributors.length > 0);
    },
  );
};
