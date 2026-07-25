"use strict";

module.exports = function registerLibraryEntryEditorGroup(context) {
  const { assert, loadModule, runTest, Window } = context;

  function createRecord(overrides = {}) {
    return {
      threadId: "42",
      thread: {
        title: "Editor fixture",
        currentVersion: "v2",
        threadRating: 4.7,
        ...(overrides.thread || {}),
      },
      personal: {
        status: "playing",
        rating: 4,
        note: "old note",
        progressNote: "",
        lastPlayedVersion: "v1",
        addedAt: 1,
        startedAt: null,
        lastPlayedAt: null,
        completedAt: null,
        droppedAt: null,
        lastActivityAt: null,
        ...(overrides.personal || {}),
      },
      updateState: "changed",
      recordModifiedAt: 10,
      schemaVersion: 4,
      ...overrides,
    };
  }

  function withEditorDom(testFn) {
    const window = new Window();
    const previous = {
      document: global.document,
      AbortController: global.AbortController,
    };
    global.document = window.document;
    global.AbortController = window.AbortController;
    return Promise.resolve(testFn(window)).finally(() => {
      global.document = previous.document;
      global.AbortController = previous.AbortController;
    });
  }

  function createBridge(window) {
    const calls = [];
    const roots = new Map();
    return {
      calls,
      async invokeCoreAction(action, payload) {
        calls.push({ action, payload });
        if (action === "ui.dialog.open") {
          const root = window.document.createElement("div");
          root.id = `${payload.dialogId}-content`;
          root.innerHTML = payload.html;
          window.document.body.appendChild(root);
          roots.set(payload.dialogId, root);
          return { ok: true, value: { contentId: root.id } };
        }
        if (action === "ui.dialog.update") {
          const root = roots.get(payload.dialogId);
          if (!root) return { ok: false, reason: "dialog_not_found" };
          root.innerHTML = payload.html;
          return { ok: true, value: { contentId: root.id } };
        }
        if (action === "ui.dialog.close") {
          roots.get(payload.dialogId)?.remove();
          roots.delete(payload.dialogId);
        }
        return { ok: true, value: {} };
      },
    };
  }

  runTest("LIBRARY-ENTRY-EDITOR-01 validates editor-owned personal fields", () => {
    const { createEditorDraft, validateEditorDraft } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorValidation.js",
    );
    const emptyDates = createEditorDraft(createRecord());
    assert.strictEqual(emptyDates.startedAt, "");
    assert.strictEqual(emptyDates.lastPlayedAt, "");
    assert.strictEqual(emptyDates.completedAt, "");
    assert.strictEqual(emptyDates.droppedAt, "");
    const invalid = validateEditorDraft({
      status: "unknown",
      rating: "8",
      startedAt: "2025-02-30",
    });
    assert.strictEqual(invalid.ok, false);
    assert.deepStrictEqual(
      invalid.issues.map(({ path }) => path),
      ["personal.status", "personal.rating", "personal.startedAt"],
    );
    const valid = validateEditorDraft({
      status: "playing",
      rating: "4.5",
      note: " note ",
      progressNote: " progress ",
      lastPlayedVersion: "v1",
      startedAt: "2025-02-20",
      lastPlayedAt: "",
      completedAt: "",
      droppedAt: "",
    });
    assert.strictEqual(valid.ok, true);
    assert.strictEqual(valid.personal.rating, 4.5);
    assert.strictEqual(valid.personal.note, "note");
    assert.strictEqual(valid.personal.startedAt, Date.parse("2025-02-20T00:00:00.000Z"));
  });

  runTest("LIBRARY-ENTRY-EDITOR-01 keeps Full edit with Update and Remove", () => {
    const { renderRows } = loadModule(
      "addons/library-addon/src/ui/components/manager/tableRenderer.js",
    );
    const window = new Window();
    const tbody = window.document.createElement("tbody");
    renderRows(tbody, [createRecord()], new Set(), {
      openStatusMenuId: "",
      openRowMenuId: "",
      ratingCommittedById: new Map(),
      ratingDraftById: new Map(),
    });
    assert.ok(tbody.querySelector('[data-action="full-edit"]'));
    assert.ok(tbody.querySelector('[data-action="row-update-thread"]'));
    assert.ok(tbody.querySelector('[data-action="remove"]'));
  });

  runTest("LIBRARY-ENTRY-EDITOR-01 payload stays below the UI dialog limit", () => {
    const { createEditorDraft } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorValidation.js",
    );
    const { renderEntryEditor } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorRenderer.js",
      { loader: { ".css": "text" } },
    );
    const { getEntryEditorStyleText } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorRenderer.js",
      { loader: { ".css": "text" } },
    );
    const record = createRecord({
      personal: { ...createRecord().personal, note: "x".repeat(10000), progressNote: "y".repeat(10000) },
    });
    const bytes = Buffer.byteLength(renderEntryEditor(record, createEditorDraft(record)));
    assert.ok(bytes < 131072, `editor payload ${bytes} exceeds 131072 bytes`);
    const css = getEntryEditorStyleText();
    assert.match(css, /background:\s*#191b1e/);
    assert.match(css, /background:\s*#222/);
    assert.match(css, /border-color:\s*#c15858/);
    assert.match(css, /background:\s*#893839/);
  });

  runTest("LIBRARY-ENTRY-EDITOR-01 labels non-version history without duplicate version arrows", () => {
    const { createEditorDraft } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorValidation.js",
    );
    const { renderEntryEditor } = loadModule(
      "addons/library-addon/src/ui/entryEditor/editorRenderer.js",
      { loader: { ".css": "text" } },
    );
    const record = createRecord();
    const markup = renderEntryEditor(record, createEditorDraft(record), [], [
      {
        type: "thread-facts",
        previousVersion: "v2",
        version: "v2",
        fields: ["title", "tags"],
        observedAt: 100,
      },
    ]);
    assert.match(markup, /Thread details changed/);
    assert.match(markup, /title, tags/);
    assert.doesNotMatch(markup, /v2[^<]*v2/);
  });

  runTest("LIBRARY-ENTRY-EDITOR-01 open close reopen cancel and external close are write-free", async () =>
    withEditorDom(async (window) => {
      const { createEntryEditorController } = loadModule(
        "addons/library-addon/src/ui/entryEditor/editorController.js",
        { loader: { ".css": "text" } },
      );
      const bridge = createBridge(window);
      let reads = 0;
      let writes = 0;
      const editor = createEntryEditorController({
        core: bridge,
        addonId: "library-addon",
        library: {
          getEntry: async () => { reads += 1; return createRecord(); },
          applyPersonalActivity: async () => { writes += 1; return { ok: true }; },
        },
      });
      assert.strictEqual((await editor.open("42")).ok, true);
      assert.strictEqual((await editor.close("cancel")).ok, true);
      assert.strictEqual((await editor.open("42")).ok, true);
      assert.strictEqual((await editor.close("disable")).ok, true);
      assert.strictEqual((await editor.open("42")).ok, true);
      assert.strictEqual((await editor.close("teardown")).ok, true);
      assert.strictEqual((await editor.open("42")).ok, true);
      await editor.handleDialogClosed({ dialogId: "library-addon-entry-editor" });
      assert.strictEqual(editor.getSnapshot().active, false);
      assert.strictEqual(reads, 4);
      assert.strictEqual(writes, 0);
    }));

  runTest("LIBRARY-ENTRY-EDITOR-01 Save re-reads and commits one personal-only patch", async () =>
    withEditorDom(async (window) => {
      const { createEntryEditorController } = loadModule(
        "addons/library-addon/src/ui/entryEditor/editorController.js",
        { loader: { ".css": "text" } },
      );
      const bridge = createBridge(window);
      const records = [
        createRecord({ thread: { title: "Initial", currentVersion: "v1" } }),
        createRecord({ thread: { title: "Refreshed", currentVersion: "v2" } }),
      ];
      const patches = [];
      const editor = createEntryEditorController({
        core: bridge,
        addonId: "library-addon",
        library: {
          getEntry: async () => records.shift(),
          applyPersonalActivity: async (_id, patch) => {
            patches.push(patch);
            return { ok: true };
          },
        },
      });
      await editor.open("42");
      const result = await editor.save({
        status: "playing",
        rating: "4.5",
        note: "saved note",
        progressNote: "chapter 2",
        lastPlayedVersion: "v1",
        startedAt: "",
        lastPlayedAt: "",
        completedAt: "",
        droppedAt: "",
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(records.length, 0);
      assert.strictEqual(patches.length, 1);
      assert.ok(!Object.hasOwn(patches[0], "thread"));
      assert.strictEqual(patches[0].note, "saved note");
    }));

  runTest("LIBRARY-ENTRY-EDITOR-01 stale load and save cannot commit or replace UI", async () =>
    withEditorDom(async (window) => {
      const { createEntryEditorController } = loadModule(
        "addons/library-addon/src/ui/entryEditor/editorController.js",
        { loader: { ".css": "text" } },
      );
      const bridge = createBridge(window);
      const resolvers = [];
      let writes = 0;
      const editor = createEntryEditorController({
        core: bridge,
        addonId: "library-addon",
        library: {
          getEntry: () => new Promise((resolve) => resolvers.push(resolve)),
          applyPersonalActivity: async () => { writes += 1; return { ok: true }; },
        },
      });
      const staleOpen = editor.open("42");
      await Promise.resolve();
      const currentOpen = editor.open("43");
      await Promise.resolve();
      resolvers[0](createRecord());
      assert.strictEqual((await staleOpen).reason, "cancelled");
      resolvers[1](createRecord({ threadId: "43" }));
      await currentOpen;

      const pendingSave = editor.save({
        status: "saved", rating: "", note: "", progressNote: "",
        lastPlayedVersion: "", startedAt: "", lastPlayedAt: "", completedAt: "", droppedAt: "",
      });
      await Promise.resolve();
      await editor.close("disable");
      resolvers[2](createRecord({ threadId: "43" }));
      assert.strictEqual((await pendingSave).reason, "cancelled");
      assert.strictEqual(writes, 0);
    }));
};
