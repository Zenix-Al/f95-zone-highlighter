"use strict";

module.exports = function registerLibraryRecordModelGroup(context) {
  const { assert, loadModule, runTest } = context;
  const fixtures = require("../fixtures/libraryPersonalBaselineFixtures.cjs");

  runTest("LIBRARY-RECORD-MODEL-04 maps valid version-3 fields into canonical owners", () => {
    const { normalizeRecord, validateRecord } = loadModule(
      "addons/library-addon/src/library/recordModel.js",
    );
    const source = fixtures.createFixtures().version3;
    const record = normalizeRecord(source);
    assert.strictEqual(record.schemaVersion, 5);
    assert.strictEqual(record.pinRankDesc, Number(record.personal.pinned));
    assert.strictEqual(record.pinRankAsc, Number(!record.personal.pinned));
    assert.strictEqual(record.thread.title, source.title);
    assert.strictEqual(record.thread.threadRating, source.threadRating);
    assert.strictEqual(record.thread.currentVersion, source.gameVersion);
    assert.deepStrictEqual(record.thread.tags, source.tags);
    assert.deepStrictEqual(record.thread.prefixes, source.prefixes);
    assert.strictEqual(record.personal.status, source.userStatus);
    assert.strictEqual(record.personal.note, source.note);
    assert.strictEqual(record.personal.pinned, source.pinned);
    assert.strictEqual(record.personal.rating, source.userScore / 2);
    assert.strictEqual(record.personal.addedAt, source.createdAt);
    assert.strictEqual(record.recordModifiedAt, source.updatedAt);
    assert.deepStrictEqual(validateRecord(record), []);
  });

  runTest("LIBRARY-RECORD-MODEL-04 recovers invalid owned fields with exact validation paths", () => {
    const { normalizeRecord, validateRecord } = loadModule(
      "addons/library-addon/src/library/recordModel.js",
    );
    const record = normalizeRecord({
      threadId: "7",
      thread: { title: "Preserved", tags: ["one"], observedAt: 10 },
      personal: {
        status: "invalid",
        rating: 7,
        note: "preserved",
        lastPlayedAt: "invalid",
        addedAt: 5,
      },
      schemaVersion: 4,
      recordModifiedAt: 20,
    });
    assert.strictEqual(record.thread.title, "Preserved");
    assert.deepStrictEqual(record.thread.tags, ["one"]);
    assert.strictEqual(record.personal.status, "saved");
    assert.strictEqual(record.personal.rating, null);
    assert.strictEqual(record.personal.note, "preserved");
    assert.strictEqual(record.personal.lastPlayedAt, null);
    assert.deepStrictEqual(
      validateRecord({
        ...record,
        personal: { ...record.personal, rating: 5.25, status: "bad", lastPlayedAt: -1 },
      }),
      [
        { path: "personal.status", code: "invalid_status" },
        { path: "personal.rating", code: "invalid_rating" },
        { path: "personal.lastPlayedAt", code: "invalid_date" },
      ],
    );
  });

  runTest("LIBRARY-RECORD-MODEL-04 keeps thread and personal mutations isolated", () => {
    const { mergePersonalState, mergeThreadFacts, normalizeRecord } = loadModule(
      "addons/library-addon/src/library/recordModel.js",
    );
    const source = normalizeRecord(fixtures.createFixtures().version3);
    const personalBefore = JSON.stringify(source.personal);
    const threadUpdated = mergeThreadFacts(
      source,
      {
        threadId: source.threadId,
        title: "New title",
        gameVersion: "v9",
        tags: ["new"],
        prefixes: source.thread.prefixes,
        threadRating: 4.9,
      },
      { now: 200 },
    );
    assert.strictEqual(JSON.stringify(threadUpdated.personal), personalBefore);
    const sparseThreadUpdate = mergeThreadFacts(
      threadUpdated,
      { title: "Only title changed", currentVersion: "v10" },
      { now: 250 },
    );
    assert.deepStrictEqual(sparseThreadUpdate.thread.tags, threadUpdated.thread.tags);
    assert.deepStrictEqual(sparseThreadUpdate.thread.prefixes, threadUpdated.thread.prefixes);
    assert.strictEqual(sparseThreadUpdate.thread.developer, threadUpdated.thread.developer);

    const threadBefore = JSON.stringify(threadUpdated.thread);
    const personalUpdated = mergePersonalState(
      threadUpdated,
      { userStatus: "playing", note: "new note", userScore: 4.5 },
      { now: 300 },
    );
    assert.strictEqual(JSON.stringify(personalUpdated.thread), threadBefore);
    assert.strictEqual(personalUpdated.personal.rating, 4.5);
    assert.strictEqual(personalUpdated.personal.note, "new note");
  });

  runTest("LIBRARY-RECORD-MODEL-04 normalization is deterministic and idempotent", () => {
    const { normalizeRecord } = loadModule(
      "addons/library-addon/src/library/recordModel.js",
    );
    const first = normalizeRecord(fixtures.createFixtures().legacy, { now: 123 });
    const second = normalizeRecord(first, { now: 999 });
    assert.deepStrictEqual(second, first);
    assert.ok(!Object.hasOwn(first, "updatedAt"));
    assert.ok(!Object.hasOwn(first, "userStatus"));
    assert.ok(!Object.hasOwn(first, "gameVersion"));
  });

  runTest("LIBRARY-RECORD-MODEL-04 reads legacy records without writing", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const source = fixtures.createFixtures().version3;
    let writes = 0;
    const bridge = {
      async invokeCoreAction(action) {
        if (action === "idb.get") return { ok: true, value: source };
        if (action === "idb.put") writes += 1;
        return { ok: true, value: null };
      },
    };
    const library = createLibraryService(bridge, {});
    const record = await library.getEntry(source.threadId);
    assert.strictEqual(record.schemaVersion, 5);
    assert.strictEqual(writes, 0);
  });
};
