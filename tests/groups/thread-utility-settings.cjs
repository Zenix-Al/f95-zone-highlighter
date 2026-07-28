"use strict";

module.exports = function registerThreadUtilitySettings(context) {
  const { Window, assert, loadModule, runTest } = context;

  function loadSettings() {
    return loadModule("addons/thread-utility-addon/src/app/settings.js");
  }

  runTest("THREAD-UTILITY-SETTINGS-01 normalizes defaults and valid siblings", () => {
    const {
      THREAD_UTILITY_PANEL_SETTINGS,
      THREAD_UTILITY_SETTINGS_DEFAULTS,
      normalizeThreadUtilitySettings,
    } = loadSettings();
    assert.deepStrictEqual(
      THREAD_UTILITY_PANEL_SETTINGS.map(({ path }) => path),
      [
        "showLauncher",
        "visibleTagLimit",
        "openSearchesInNewTab",
        "descriptionPreviewLines",
      ],
    );
    assert.deepStrictEqual(
      normalizeThreadUtilitySettings(null),
      THREAD_UTILITY_SETTINGS_DEFAULTS,
    );
    const normalized = normalizeThreadUtilitySettings({
      showLauncher: false,
      visibleTagLimit: "invalid",
      descriptionPreviewLines: 99,
      openSearchesInNewTab: false,
      searchScope: "global",
      excludedTagMode: "hidden",
    });
    assert.strictEqual(normalized.showLauncher, false);
    assert.strictEqual(normalized.visibleTagLimit, 8);
    assert.strictEqual(normalized.descriptionPreviewLines, 8);
    assert.strictEqual(normalized.openSearchesInNewTab, false);
    assert.strictEqual(normalized.searchScope, "global");
    assert.strictEqual(normalized.excludedTagMode, "hidden");
  });

  runTest("THREAD-UTILITY-SETTINGS-01 bounds and validates the complete draft", () => {
    const { QUICK_SEARCH_LIMIT } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/quickSearch.js",
    );
    const {
      addDraftUtility,
      createSettingsDraft,
      validateSettingsDraft,
    } = loadModule(
      "addons/thread-utility-addon/src/domain/settings/model.js",
    );
    const draft = createSettingsDraft({
      searchScope: "thread",
      excludedTagMode: "muted",
      quickSearches: [{ id: "one", label: "One", query: "Query" }],
    });
    while (addDraftUtility(draft)) {
      draft.quickSearches.at(-1).query = "Query";
    }
    assert.strictEqual(draft.quickSearches.length, QUICK_SEARCH_LIMIT);
    assert.strictEqual(addDraftUtility(draft), false);
    draft.quickSearches[0].label = "x".repeat(41);
    assert.strictEqual(validateSettingsDraft(draft).ok, false);
    draft.quickSearches[0].label = "Valid";
    draft.quickSearches[0].query = "x".repeat(121);
    assert.strictEqual(validateSettingsDraft(draft).ok, false);
    draft.quickSearches[0].query = "Valid query";
    assert.strictEqual(validateSettingsDraft(draft).ok, true);
  });

  runTest("THREAD-UTILITY-SETTINGS-01 supports add reorder delete and reset", () => {
    const {
      addDraftUtility,
      createSettingsDraft,
      deleteDraftUtility,
      moveDraftUtility,
      resetSettingsDraft,
    } = loadModule(
      "addons/thread-utility-addon/src/domain/settings/model.js",
    );
    const draft = createSettingsDraft({
      quickSearches: [
        { id: "a", label: "A", query: "A", order: 0 },
        { id: "b", label: "B", query: "B", order: 1 },
      ],
    });
    assert.strictEqual(moveDraftUtility(draft, 1, -1), true);
    assert.deepStrictEqual(draft.quickSearches.map(({ id }) => id), ["b", "a"]);
    assert.strictEqual(deleteDraftUtility(draft, 0), true);
    assert.deepStrictEqual(draft.quickSearches.map(({ id }) => id), ["a"]);
    assert.strictEqual(addDraftUtility(draft), true);
    assert.strictEqual(draft.quickSearches.length, 2);
    assert.strictEqual(resetSettingsDraft().quickSearches.length, 6);
  });

  runTest("THREAD-UTILITY-SETTINGS-01 saves once through storage and refresh", async () => {
    const window = new Window();
    const actions = [];
    let refreshes = 0;
    try {
      const { createThreadUtilitySettingsEditor } = loadModule(
        "addons/thread-utility-addon/src/app/settingsEditor.js",
      );
      const core = {
        invokeCoreAction: async (action, payload) => {
          actions.push({ action, payload });
          if (action === "ui.dialog.open" || action === "ui.dialog.update") {
            window.document.body.innerHTML = payload.html;
          }
          return { ok: true };
        },
      };
      const live = {
        showLauncher: true,
        visibleTagLimit: 8,
        descriptionPreviewLines: 4,
        openSearchesInNewTab: true,
        searchScope: "thread",
        excludedTagMode: "muted",
        quickSearches: [{ id: "one", label: "One", query: "One" }],
      };
      const editor = createThreadUtilitySettingsEditor({
        core,
        documentObject: window.document,
        getSettings: () => live,
        onSaved: async () => { refreshes += 1; },
      });
      await editor.open();
      window.document.querySelector('[name="searchScope"]').value = "global";
      assert.strictEqual(live.searchScope, "thread");
      assert.deepStrictEqual(await editor.save(), { ok: true });
      const storage = actions.filter(({ action }) => action === "storage.set");
      assert.strictEqual(storage.length, 1);
      assert.strictEqual(storage[0].payload.key, "threadUtility.settings.v1");
      assert.strictEqual(storage[0].payload.value.searchScope, "global");
      assert.strictEqual(refreshes, 1);
      assert.strictEqual(editor.getDraft(), null);
    } finally {
      window.close();
    }
  });

  runTest("THREAD-UTILITY-SETTINGS-01 keeps failed drafts and removes bindings", async () => {
    const window = new Window();
    let updates = 0;
    try {
      const { createThreadUtilitySettingsEditor } = loadModule(
        "addons/thread-utility-addon/src/app/settingsEditor.js",
      );
      const editor = createThreadUtilitySettingsEditor({
        core: {
          invokeCoreAction: async (action, payload) => {
            if (action === "ui.dialog.open" || action === "ui.dialog.update") {
              window.document.body.innerHTML = payload.html;
            }
            if (action === "ui.dialog.update") updates += 1;
            if (action === "storage.set") return { ok: false, reason: "write_failed" };
            return { ok: true };
          },
        },
        documentObject: window.document,
        getSettings: () => ({
          quickSearches: [{ id: "one", label: "One", query: "One" }],
        }),
        onSaved: async () => {
          throw new Error("must_not_refresh");
        },
      });
      await editor.open();
      window.document.querySelector('[name="query"]').value = "Changed";
      assert.deepStrictEqual(
        await editor.save(),
        { ok: false, reason: "write_failed" },
      );
      assert.strictEqual(editor.getDraft().quickSearches[0].query, "Changed");
      assert.match(window.document.body.innerHTML, /draft is still open/i);
      await editor.close("test-close");
      await editor.open();
      window.document.querySelector('[data-settings-action="cancel"]').click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(editor.getDraft(), null);
      const before = updates;
      window.document.body.innerHTML = `
        <form data-role="threadUtilitySettings">
          <button type="button" data-settings-action="reset">Reset</button>
        </form>`;
      window.document.querySelector("button").click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(updates, before);
    } finally {
      window.close();
    }
  });
};
