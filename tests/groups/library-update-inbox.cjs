"use strict";

module.exports = function registerLibraryUpdateInboxGroup(context) {
  const { assert, loadModule, runTest, Window } = context;

  function record(threadId, modifiedAt, updateState = "changed") {
    return {
      threadId: String(threadId),
      thread: {
        title: `Game ${threadId}`,
        currentVersion: `v${threadId}`,
        url: `https://f95zone.to/threads/${threadId}/`,
        observedAt: modifiedAt,
        versionObservedAt: modifiedAt,
      },
      personal: {
        status: "playing",
        note: "keep",
        lastPlayedVersion: "old",
        addedAt: modifiedAt,
      },
      updateState,
      updateCheck: { enabled: true, status: "changed" },
      lastThreadChangeAt: modifiedAt,
      recordModifiedAt: modifiedAt,
      schemaVersion: 5,
    };
  }

  function createRepositoryBridge(initialRecords) {
    const records = new Map(
      initialRecords.map((value) => [String(value.threadId), value]),
    );
    const queries = [];
    const puts = [];
    return {
      bridge: {
        async invokeCoreAction(action, payload) {
          if (action === "idb.get") {
            return { ok: true, value: records.get(String(payload.key)) || null };
          }
          if (action === "idb.put") {
            records.set(String(payload.value.threadId), payload.value);
            puts.push(payload.value);
            return { ok: true, value: payload.value.threadId };
          }
          if (action === "idb.count") {
            return {
              ok: true,
              value: [...records.values()].filter(
                (value) => value.updateState === payload.query?.value,
              ).length,
            };
          }
          if (action === "idb.query") {
            queries.push(payload);
            const values = [...records.values()]
              .sort(
                (left, right) =>
                  right.recordModifiedAt - left.recordModifiedAt ||
                  String(right.threadId).localeCompare(String(left.threadId)),
              );
            return {
              ok: true,
              value: {
                items: values.slice(0, payload.limit).map((value) => ({
                  value,
                  cursor: {
                    key: value.recordModifiedAt,
                    primaryKey: value.threadId,
                  },
                })),
                hasMore: false,
                nextCursor: null,
              },
            };
          }
          return { ok: true, value: null };
        },
      },
      records,
      queries,
      puts,
    };
  }

  runTest("LIBRARY-UPDATE-INBOX-01 queries changed records bounded newest-first", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const memory = createRepositoryBridge([
      record("a", 30),
      record("b", 30, "acknowledged"),
      record("c", 30),
      record("d", 20, "current"),
    ]);
    const library = createLibraryService(memory.bridge, {});
    const count = await library.countChangedEntries();
    const page = await library.queryChangedEntriesPage({ limit: 2 });

    assert.deepStrictEqual(page.rows.map(({ threadId }) => threadId), ["c", "a"]);
    assert.strictEqual(page.hasNext, false);
    assert.strictEqual(count.count, 2);
    assert.strictEqual(memory.queries[0].index, "recordModifiedAt");
    assert.strictEqual(memory.queries[0].direction, "prev");
    assert.ok(memory.queries[0].limit <= 250);
  });

  runTest("LIBRARY-UPDATE-INBOX-01 acknowledgement preserves unrelated canonical fields", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const original = record("42", 100);
    const memory = createRepositoryBridge([original]);
    const library = createLibraryService(memory.bridge, {});
    const canonical = await library.getEntryFresh("42");
    const result = await library.acknowledgeCurrentUpdate("42", { now: 200 });
    const saved = memory.records.get("42");

    assert.strictEqual(result.updated, true);
    assert.strictEqual(saved.updateState, "acknowledged");
    assert.strictEqual(saved.recordModifiedAt, 200);
    assert.deepStrictEqual(saved.thread, canonical.thread);
    assert.deepStrictEqual(saved.personal, canonical.personal);
    assert.deepStrictEqual(saved.updateCheck, canonical.updateCheck);
  });

  runTest("LIBRARY-UPDATE-INBOX-01 bulk acknowledgement revalidates and reports failures", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    const memory = createRepositoryBridge([
      record("changed", 30),
      record("done", 20, "acknowledged"),
    ]);
    const originalInvoke = memory.bridge.invokeCoreAction;
    memory.bridge.invokeCoreAction = async (action, payload) => {
      if (action === "idb.put" && payload.value?.threadId === "failed") {
        return { ok: false, reason: "storage_error" };
      }
      return originalInvoke(action, payload);
    };
    memory.records.set("failed", record("failed", 10));
    const library = createLibraryService(memory.bridge, {});
    const result = await library.acknowledgeChangedEntries([
      "changed",
      "done",
      "removed",
      "failed",
    ]);

    assert.deepStrictEqual(
      {
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
      { updated: 1, skipped: 2, failed: 1 },
    );
    assert.strictEqual(memory.records.get("failed").updateState, "changed");
  });

  runTest("LIBRARY-UPDATE-INBOX-01 notification coordinator latches in memory only", () => {
    const { createUpdateNotificationCoordinator } = loadModule(
      "addons/library-addon/src/library/updateNotificationCoordinator.js",
    );
    const messages = [];
    let active = true;
    const coordinator = createUpdateNotificationCoordinator({
      notify: (...args) => messages.push(args),
      isActive: () => active,
    });
    assert.strictEqual(coordinator.notifyFirstChanged(), true);
    assert.strictEqual(coordinator.notifyFirstChanged(), false);
    active = false;
    assert.strictEqual(coordinator.notifyFirstChanged(), false);
    assert.deepStrictEqual(messages, [
      ["There are updated games in your Library.", "success"],
    ]);
    assert.deepStrictEqual(coordinator.getSnapshot(), { delivered: true });
  });

  runTest("LIBRARY-UPDATE-INBOX-01 first committed changed transition notifies immediately once per service session", async () => {
    const { createLibraryService } = loadModule(
      "addons/library-addon/src/library/service.js",
    );
    let current = record("42", 10, "current");
    current.thread.currentVersion = "v1";
    const updates = new Map();
    const bridge = {
      async invokeCoreAction(action, payload) {
        const store = payload.storeName || "records";
        if (action === "idb.get") {
          return {
            ok: true,
            value:
              store === "records"
                ? current
                : updates.get(payload.key) || null,
          };
        }
        if (action === "idb.put") {
          if (store === "records") current = payload.value;
          else updates.set(payload.value.id, payload.value);
          return {
            ok: true,
            value:
              store === "records" ? payload.value.threadId : payload.value.id,
          };
        }
        if (action === "idb.delete") {
          updates.delete(payload.key);
          return { ok: true };
        }
        return { ok: true, value: null };
      },
    };
    const firstMessages = [];
    const firstSession = createLibraryService(bridge, {}, {
      notifyFirstChanged: () => firstMessages.push(current.thread.currentVersion),
    });
    await firstSession.observeThreadFacts(current, { gameVersion: "v2" }, { now: 20 });
    assert.deepStrictEqual(firstMessages, ["v2"]);
    assert.strictEqual(current.updateState, "changed");

    await firstSession.observeThreadFacts(current, { gameVersion: "v3" }, { now: 30 });
    assert.deepStrictEqual(firstMessages, ["v2"]);

    current = { ...current, updateState: "acknowledged" };
    const secondMessages = [];
    const secondSession = createLibraryService(bridge, {}, {
      notifyFirstChanged: () => secondMessages.push(current.thread.currentVersion),
    });
    await secondSession.observeThreadFacts(current, { gameVersion: "v4" }, { now: 40 });
    assert.deepStrictEqual(secondMessages, ["v4"]);
  });

  runTest("LIBRARY-UPDATE-INBOX-01 inbox Edit closes before opening stable record", async () => {
    const window = new Window();
    const previous = {
      document: global.document,
      AbortController: global.AbortController,
    };
    global.document = window.document;
    global.AbortController = window.AbortController;
    try {
      const { createUpdateInboxController } = loadModule(
        "addons/library-addon/src/ui/updateInbox/updateInboxController.js",
        { loader: { ".css": "text" } },
      );
      const order = [];
      const roots = new Map();
      const core = {
        async invokeCoreAction(action, payload) {
          if (action === "ui.dialog.open") {
            const root = window.document.createElement("div");
            root.id = `${payload.dialogId}-content`;
            root.innerHTML = payload.html;
            window.document.body.appendChild(root);
            roots.set(payload.dialogId, root);
            order.push("open-inbox");
            return { ok: true, value: { contentId: root.id } };
          }
          if (action === "ui.dialog.update") {
            const root = roots.get(payload.dialogId);
            root.innerHTML = payload.html;
            return { ok: true, value: { contentId: root.id } };
          }
          if (action === "ui.dialog.close") {
            order.push("close-inbox");
            roots.get(payload.dialogId)?.remove();
            roots.delete(payload.dialogId);
          }
          return { ok: true, value: {} };
        },
      };
      const fixture = record("42", 100);
      const controller = createUpdateInboxController({
        core,
        addonId: "library-addon",
        library: {
          queryChangedEntriesPage: async () => ({
            ok: true,
            rows: [fixture],
            nextCursor: null,
            hasNext: false,
          }),
          countChangedEntries: async () => ({ ok: true, count: 1 }),
          listUpdateEvents: async () => [],
          getEntryFresh: async () => fixture,
        },
        openEntryEditor: async (id) => {
          order.push(`edit:${id}`);
          return { ok: true };
        },
      });
      await controller.open();
      window.document
        .querySelector('[data-inbox-action="edit"]')
        .click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      assert.deepStrictEqual(order.slice(-2), ["close-inbox", "edit:42"]);
      assert.strictEqual(controller.getSnapshot().active, false);
    } finally {
      global.document = previous.document;
      global.AbortController = previous.AbortController;
    }
  });
};
