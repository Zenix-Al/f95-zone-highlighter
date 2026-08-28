"use strict";

module.exports = function registerLibraryUpdateQueueSnapshotGroup(context) {
  const { assert, loadModule, runTest } = context;

  function createRepository({ failAppendAt = 0 } = {}) {
    let cycle = null;
    const rows = new Map();
    const batches = [];
    let appendCalls = 0;
    return {
      async getCycle() {
        return cycle ? structuredClone(cycle) : null;
      },
      async beginCyclePreparation(value) {
        cycle = { ...structuredClone(value), status: "preparing", total: 0 };
        return { ok: true, value: cycle };
      },
      async appendPreparedItems(cycleId, values, startPosition) {
        appendCalls += 1;
        if (failAppendAt && appendCalls === failAppendAt) {
          return { ok: false, reason: "storage_error" };
        }
        batches.push(values.length);
        values.forEach((value, index) => {
          rows.set(`${cycleId}:${value.threadId}`, {
            cycleId,
            threadId: value.threadId,
            position: startPosition + index,
            status: "pending",
          });
        });
        return { ok: true, written: values.length };
      },
      async finalizeCyclePreparation(value, total) {
        if (rows.size !== total) return { ok: false, reason: "queue_prepare_incomplete" };
        cycle = { ...structuredClone(value), status: "running", total };
        return { ok: true, value: cycle };
      },
      async discardCycle(cycleId) {
        for (const [key, row] of rows) {
          if (row.cycleId === cycleId) rows.delete(key);
        }
        if (cycle?.cycleId === cycleId) cycle = null;
        return { ok: true };
      },
      snapshot: () => ({
        cycle: cycle ? structuredClone(cycle) : null,
        rows: [...rows.values()].map((row) => structuredClone(row)),
        batches: [...batches],
      }),
    };
  }

  function createPager(source, { onPage = null, failPage = 0 } = {}) {
    let calls = 0;
    let stableRows = null;
    return async ({ cursor, limit, modifiedAtCutoff }) => {
      calls += 1;
      if (failPage && calls === failPage) return { ok: false, reason: "query_failed" };
      onPage?.({ calls, source, modifiedAtCutoff });
      const rows = !onPage && stableRows
        ? stableRows
        : source
          .filter((record) => Number(record.recordModifiedAt || 0) <= modifiedAtCutoff)
          .sort((left, right) =>
            Number(left.recordModifiedAt || 0) - Number(right.recordModifiedAt || 0) ||
            String(left.threadId).localeCompare(String(right.threadId)),
          );
      if (!onPage) stableRows = rows;
      const offset = Math.max(0, Number(cursor?.offset || 0));
      const page = rows.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      return {
        ok: true,
        items: page.map((value, index) => ({
          cursor: { offset: offset + index + 1 },
          value: structuredClone(value),
        })),
        nextCursor: page.length ? { offset: nextOffset } : null,
        hasMore: nextOffset < rows.length,
      };
    };
  }

  function createBuilder(repository, queryRecordsPage, options = {}) {
    const { createAutoUpdateQueueSnapshotBuilder } = loadModule(
      "addons/library-addon/src/library/autoUpdateQueueSnapshot.js",
    );
    return createAutoUpdateQueueSnapshotBuilder({
      repository,
      queryRecordsPage,
      now: () => 1000,
      createCycleId: () => "snapshot-cycle",
      ...options,
    });
  }

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 publishes empty and one-record snapshots", async () => {
    const emptyRepository = createRepository();
    const empty = await createBuilder(emptyRepository, createPager([])).build();
    assert.strictEqual(empty.ok, true);
    assert.strictEqual(empty.queued, 0);
    assert.strictEqual(empty.cycle.status, "running");

    const oneRepository = createRepository();
    const one = await createBuilder(oneRepository, createPager([{
      threadId: "1",
      recordModifiedAt: 10,
      updateCheck: { enabled: true },
    }])).build();
    assert.strictEqual(one.ok, true);
    assert.strictEqual(one.queued, 1);
    assert.strictEqual(oneRepository.snapshot().rows[0].position, 1);
  });

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 filters disabled records in deterministic order", async () => {
    const repository = createRepository();
    const result = await createBuilder(repository, createPager([
      { threadId: "later", recordModifiedAt: 20, updateCheck: { enabled: true } },
      { threadId: "disabled", recordModifiedAt: 5, updateCheck: { enabled: false } },
      { threadId: "first", recordModifiedAt: 10 },
    ])).build({ pageSize: 1 });
    assert.strictEqual(result.scanned, 3);
    assert.deepStrictEqual(
      repository.snapshot().rows.map(({ threadId, position }) => ({ threadId, position })),
      [
        { threadId: "first", position: 1 },
        { threadId: "later", position: 2 },
      ],
    );
  });

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 holds its cutoff while the Library changes", async () => {
    const records = [
      { threadId: "queued", recordModifiedAt: 10, updateCheck: { enabled: true } },
      { threadId: "remaining", recordModifiedAt: 20, updateCheck: { enabled: true } },
    ];
    const repository = createRepository();
    const pager = createPager(records, {
      onPage({ calls, source, modifiedAtCutoff }) {
        if (calls !== 2) return;
        source[0].updateCheck.enabled = false;
        source.push({
          threadId: "added-later",
          recordModifiedAt: modifiedAtCutoff + 1,
          updateCheck: { enabled: true },
        });
      },
    });
    const result = await createBuilder(repository, pager).build({ pageSize: 1 });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(
      repository.snapshot().rows.map(({ threadId }) => threadId),
      ["queued", "remaining"],
    );
  });

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 cleans cancelled and failed preparations", async () => {
    const controller = new AbortController();
    const cancelledRepository = createRepository();
    const cancelledPager = createPager([
      { threadId: "1", recordModifiedAt: 1 },
      { threadId: "2", recordModifiedAt: 2 },
    ], {
      onPage({ calls }) {
        if (calls === 2) controller.abort();
      },
    });
    const cancelled = await createBuilder(cancelledRepository, cancelledPager).build({
      pageSize: 1,
      signal: controller.signal,
    });
    assert.strictEqual(cancelled.reason, "cancelled");
    assert.strictEqual(cancelled.cleanupOk, true);
    assert.strictEqual(cancelledRepository.snapshot().cycle, null);
    assert.strictEqual(cancelledRepository.snapshot().rows.length, 0);

    const failedRepository = createRepository({ failAppendAt: 2 });
    const failed = await createBuilder(failedRepository, createPager([
      { threadId: "1", recordModifiedAt: 1 },
      { threadId: "2", recordModifiedAt: 2 },
    ])).build({ pageSize: 1 });
    assert.strictEqual(failed.reason, "storage_error");
    assert.strictEqual(failed.cleanupOk, true);
    assert.strictEqual(failedRepository.snapshot().cycle, null);
    assert.strictEqual(failedRepository.snapshot().rows.length, 0);
  });

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 refuses to replace an active cycle", async () => {
    const repository = createRepository();
    await repository.beginCyclePreparation({ cycleId: "existing" });
    await repository.finalizeCyclePreparation({ cycleId: "existing" }, 0);
    const result = await createBuilder(repository, createPager([])).build();
    assert.strictEqual(result.reason, "active_cycle_exists");
    assert.strictEqual(repository.snapshot().cycle.cycleId, "existing");
  });

  runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 constructs 10000 records in bounded pages", async () => {
    const repository = createRepository();
    const records = Array.from({ length: 10_000 }, (_, index) => ({
      threadId: String(index + 1),
      recordModifiedAt: index + 1,
      updateCheck: { enabled: index % 10 !== 0 },
    }));
    const result = await createBuilder(repository, createPager(records), {
      now: () => 20_000,
    }).build({ pageSize: 200 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.scanned, 10_000);
    assert.strictEqual(result.queued, 9_000);
    assert.strictEqual(Math.max(...repository.snapshot().batches), 180);
    assert.strictEqual(repository.snapshot().rows.at(-1).position, 9_000);
  });

  if (process.env.F95UE_LIBRARY_QUEUE_STRESS === "1") {
    runTest("LIBRARY-UPDATE-QUEUE-SNAPSHOT-01 stress constructs 100000 records", async () => {
      const repository = createRepository();
      const records = Array.from({ length: 100_000 }, (_, index) => ({
        threadId: String(index + 1),
        recordModifiedAt: index + 1,
      }));
      const result = await createBuilder(repository, createPager(records), {
        now: () => 200_000,
      }).build({ pageSize: 500 });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.scanned, 100_000);
      assert.strictEqual(result.queued, 100_000);
      assert.strictEqual(repository.snapshot().rows.at(-1).position, 100_000);
    });
  }
};
