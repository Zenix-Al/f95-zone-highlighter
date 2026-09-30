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
      const constants = loadModule("addons/library-addon/src/constants.js");
      assert.strictEqual(report.source.database.version, 4);
      assert.deepStrictEqual(report.source.database.stores, constants.LIBRARY_DB_STORES);
      assert.deepStrictEqual(
        report.source.database.stores.map(({ name }) => name),
        ["records", "updates", "activity", "meta", "update-cycles", "update-queue"],
      );
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

  runTest("Library manager keeps bulk and transfer controls in one compact disclosure", () => {
    const html = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/assets/manager.html"),
      "utf8",
    );
    assert.match(html, /<summary>Bulk actions<\/summary>/);
    assert.match(html, /<summary>More actions<\/summary>/);
    assert.match(html, /<summary>Import \/ export<\/summary>/);
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

  runTest("Library bulk actions expose live progress and block duplicate Apply clicks", async () => {
    const { createBulkHandlers } = loadModule("addons/library-addon/src/ui/manager/handlers/bulkHandlers.js");
    let finish;
    let calls = 0;
    const progress = [];
    const button = { disabled: false };
    const root = { querySelector(selector) {
      return {
        '[data-field="bulkAction"]': { value: "pin" },
        '[data-action="bulk-apply"]': button,
      }[selector] || null;
    } };
    const handlers = createBulkHandlers({
      api: { bulkSetPinned: (_ids, _pinned, options) => {
        calls += 1;
        options.onProgress({ total: 2, processed: 1, updated: 1, skipped: 0 });
        return new Promise((resolve) => { finish = resolve; });
      } },
      deps: { progressController: {
        open: async () => true,
        update: (value) => progress.push(value),
        finish: async () => {},
        isCancelled: () => false,
      } }, getRoot: () => root, notifyMutated() {}, reloadRows: async () => {},
      state: { selectedIds: new Set(["1", "2"]), page: 1 },
    });
    const pending = handlers["bulk-apply"]();
    await Promise.resolve();
    assert.strictEqual(progress.at(-1).processed, 1);
    assert.strictEqual(button.disabled, true);
    await handlers["bulk-apply"]();
    assert.strictEqual(calls, 1);
    finish({ ok: true, updated: 2, skipped: 0 });
    await pending;
    assert.strictEqual(button.disabled, false);
    assert.strictEqual(progress.at(-1).processed, 1);
  });

  runTest("Library operation progress uses sanitizer-safe shared markup and scoped styling", () => {
    const component = loadModule("addons/library-addon/src/ui/components/manager/importProgressDialog.js");
    const { sanitizeAddonCss } = loadModule("src/services/addons/uiSanitizer.js");
    const html = component.createOperationProgressMarkup();
    assert.match(html, /role="progressbar"/);
    assert.match(html, /data-action="cancel-operation"/);
    assert.doesNotMatch(html, /<progress\b|\sstyle=/);
    assert.strictEqual(sanitizeAddonCss("library-addon", component.operationProgressCss).ok, true);
  });

  runTest("LIBRARY-STATE-CALLERS-01 Manager inline status uses the canonical command", async () => {
    const { createStatusHandlers } = loadModule(
      "addons/library-addon/src/ui/manager/handlers/statusHandlers.js",
    );
    const calls = [];
    let reloads = 0;
    const state = { openStatusMenuId: "42", openRowMenuId: "" };
    const handlers = createStatusHandlers({
      api: {
        setPersonalStatus: async (threadId, status, options) => {
          calls.push({ threadId, status, commandId: options.commandId });
          return { ok: true, value: { threadId, personal: { status } } };
        },
      },
      getRoot: () => ({ querySelectorAll: () => [] }),
      notifyMutated() {},
      reloadRows: async () => { reloads += 1; },
      state,
    });

    await handlers["set-status"]("42", "playing");

    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(
      { threadId: calls[0].threadId, status: calls[0].status },
      { threadId: "42", status: "playing" },
    );
    assert.match(calls[0].commandId, /^status:/);
    assert.strictEqual(state.openStatusMenuId, "");
    assert.strictEqual(reloads, 1);
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
      assert.strictEqual(Object.hasOwn(report.build.regular, "gzipBytes"), false);
      assert.strictEqual(Object.hasOwn(report.build.release, "gzipBytes"), false);
      assert.ok(report.build.regular.contributors.length > 0);
      assert.ok(report.build.release.contributors.length > 0);
    },
  );
};
