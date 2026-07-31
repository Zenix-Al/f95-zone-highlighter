"use strict";

module.exports = function registerThreadUtilityTags(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function modules() {
    return {
      ...loadModule("addons/thread-utility-addon/src/domain/tags/model.js"),
      ...loadModule("addons/thread-utility-addon/src/ui/palette.js"),
    };
  }

  function coreResult(overrides = {}) {
    return {
      ok: true,
      value: {
        tags: [
          { id: 1, name: "Alpha Tag" },
          { id: 2, name: "Beta-Tag" },
          { id: 3, name: "Gamma Tag" },
        ],
        preferredTags: [],
        excludedTags: [],
        markedTags: [],
        color: {},
        ...overrides,
      },
    };
  }

  runTest("THREAD-UTILITY-TAGS-01 maps core names and preserves unknown tags", () => {
    const { buildDisplayTags, normalizeCoreTagPrefs } = modules();
    const prefs = normalizeCoreTagPrefs(coreResult({
      preferredTags: [1],
      color: { preferred: "#00ff00", ignored: "#ffffff" },
    }));
    const tags = buildDisplayTags(["Unknown", " alpha   tag ", "Beta Tag"], prefs);
    assert.deepStrictEqual(
      tags.map(({ id, label, status }) => ({ id, label, status })),
      [
        { id: 1, label: "alpha tag", status: "preferred" },
        { id: null, label: "Unknown", status: "normal" },
        { id: 2, label: "Beta Tag", status: "normal" },
      ],
    );
    assert.deepStrictEqual(prefs.color, { preferred: "#00ff00" });
  });

  runTest("THREAD-UTILITY-TAGS-01 preserves core overlap precedence", () => {
    const {
      buildDisplayTags,
      CORE_TAG_STATUS_PRECEDENCE,
      normalizeCoreTagPrefs,
    } = modules();
    assert.deepStrictEqual(CORE_TAG_STATUS_PRECEDENCE, [
      "preferred",
      "excluded",
      "marked",
    ]);
    const prefs = normalizeCoreTagPrefs(coreResult({
      preferredTags: [1],
      excludedTags: [1, 2],
      markedTags: [1, 2, 3],
    }));
    const tags = buildDisplayTags(
      ["Beta Tag", "Unknown", "Alpha Tag", "Gamma Tag"],
      prefs,
    );
    assert.deepStrictEqual(
      tags.map(({ label, status, originalIndex }) => ({ label, status, originalIndex })),
      [
        { label: "Gamma Tag", status: "marked", originalIndex: 3 },
        { label: "Alpha Tag", status: "preferred", originalIndex: 2 },
        { label: "Unknown", status: "normal", originalIndex: 1 },
        { label: "Beta Tag", status: "excluded", originalIndex: 0 },
      ],
    );
  });

  runTest("THREAD-UTILITY-TAGS-01 computes exact visible limits and overflow", () => {
    const { buildTagView } = modules();
    const tags = Array.from({ length: 10 }, (_, index) => ({ label: `Tag ${index}` }));
    assert.deepStrictEqual(
      { count: buildTagView(tags, { visibleTagLimit: 1 }).tags.length,
        hidden: buildTagView(tags, { visibleTagLimit: 1 }).hiddenCount },
      { count: 1, hidden: 9 },
    );
    assert.deepStrictEqual(
      { count: buildTagView(tags).tags.length, hidden: buildTagView(tags).hiddenCount },
      { count: 8, hidden: 2 },
    );
    assert.strictEqual(buildTagView(tags.slice(0, 8)).hiddenCount, 0);
    assert.strictEqual(buildTagView(tags, { visibleTagLimit: 40 }).hiddenCount, 0);
    assert.strictEqual(buildTagView(tags, { visibleTagLimit: -2 }).visibleTagLimit, 1);
    assert.deepStrictEqual(
      {
        count: buildTagView(tags, { expanded: true, visibleTagLimit: 3 }).tags.length,
        hidden: buildTagView(tags, { expanded: true, visibleTagLimit: 3 }).hiddenCount,
      },
      { count: 10, hidden: 0 },
    );
  });

  runTest("THREAD-UTILITY-TAGS-01 excludes hidden tags from exact +N", () => {
    const {
      buildDisplayTags,
      buildTagView,
      normalizeCoreTagPrefs,
      renderPalette,
    } = modules();
    const prefs = normalizeCoreTagPrefs(coreResult({ excludedTags: [2] }));
    const display = buildDisplayTags(
      ["Alpha Tag", "Beta Tag", "Unknown"],
      prefs,
      { excludedTagMode: "hidden" },
    );
    const view = buildTagView(display, { visibleTagLimit: 1 });
    assert.deepStrictEqual(display.map(({ label }) => label), ["Alpha Tag", "Unknown"]);
    assert.strictEqual(view.hiddenCount, 1);
    const html = renderPalette({
      displayTags: display,
      settings: { visibleTagLimit: 1 },
      ui: { tagsExpanded: false },
    });
    assert.match(html, />\+1<\/button>/);
    assert.doesNotMatch(html, /Beta Tag/);
    assert.match(html, /aria-expanded="false"/);
  });

  runTest("THREAD-UTILITY-TAGS-01 falls back to original normal order on API failure", () => {
    const { buildDisplayTags, normalizeCoreTagPrefs } = modules();
    const prefs = normalizeCoreTagPrefs({
      ok: false,
      reason: "payload_too_large",
      value: {
        tags: [{ id: 1, name: "Alpha Tag" }],
        markedTags: [1],
      },
    });
    const tags = buildDisplayTags(["Second", "Alpha Tag", "First"], prefs);
    assert.strictEqual(prefs.available, false);
    assert.deepStrictEqual(
      tags.map(({ label, status }) => ({ label, status })),
      [
        { label: "Second", status: "normal" },
        { label: "Alpha Tag", status: "normal" },
        { label: "First", status: "normal" },
      ],
    );
  });

  runTest("THREAD-UTILITY-TAGS-01 expands and collapses without resetting modal state", async () => {
    const sandbox = createDomSandbox();
    try {
      document.body.innerHTML = `
        <h1 class="p-title-value">Tag Game [v1] [Dev]</h1>
        <span class="js-tagList">
          ${Array.from({ length: 5 }, (_, index) =>
            `<a class="tagItem">Tag ${index + 1}</a>`).join("")}
        </span>
        <article class="message-threadStarterPost" data-content="post-1">
          <div class="message-body"><div class="bbWrapper">Body</div></div>
        </article>
      `;
      const actions = [];
      let commandHandler = null;
      const core = {
        registerAddon: () => ({ ok: true }),
        updateStatus: () => ({ ok: true }),
        bindAddonCommands(handler) {
          commandHandler = handler;
          return () => {
            commandHandler = null;
          };
        },
        notifyTeardownComplete: () => ({ ok: true }),
        async invokeCoreAction(action, payload) {
          actions.push({ action, payload });
          if (action === "addon.access") {
            return { ok: true, value: { blocked: false, enabled: true } };
          }
          if (action === "page.getContext") {
            return {
              ok: true,
              value: {
                pageScopes: ["f95zone", "thread"],
                pageType: "thread",
                threadId: "1",
                threadTitle: "Tag Game [v1] [Dev]",
                url: "https://f95zone.to/threads/tag-game.1/",
              },
            };
          }
          if (action === "storage.get") {
            return {
              ok: true,
              value: {
                showLauncher: true,
                visibleTagLimit: 2,
                excludedTagMode: "muted",
              },
            };
          }
          if (action === "config.getTagPrefs") {
            return {
              ok: true,
              value: {
                tags: Array.from({ length: 5 }, (_, index) => ({
                  id: index + 1,
                  name: `Tag ${index + 1}`,
                })),
                preferredTags: [2],
                excludedTags: [],
                markedTags: [4],
                color: {},
              },
            };
          }
          return { ok: true, value: {} };
        },
      };
      const { createThreadUtilityApp } = loadModule(
        "addons/thread-utility-addon/src/app/createThreadUtilityApp.js",
        { loader: { ".css": "text" } },
      );
      const app = createThreadUtilityApp({
        core,
        runtime: {
          addonId: "thread-utility-addon",
          addonName: "Thread Utility",
          addonVersion: "0.1.0",
          addonDescription: "fixture",
          capabilities: ["page", "storage", "toast", "ui.style", "ui.mount", "ui.dock", "ui.dialog"],
          requiresCore: true,
          pageScopes: ["thread"],
          runtimeMode: "core-required",
          matches: ["*://f95zone.to/threads/*"],
        },
      });
      await app.bootstrap();
      const lifecycleGeneration = app.getLifecycle().getGeneration();
      const snapshot = app.getSnapshot();

      commandHandler({ command: "dock-action", actionId: "open-palette" });
      await new Promise((resolve) => setImmediate(resolve));
      const open = actions.find(({ action }) => action === "ui.dialog.open");
      assert.match(open.payload.html, />\+3<\/button>/);

      const palette = document.createElement("section");
      palette.dataset.role = "threadUtilityPalette";
      const toggle = document.createElement("button");
      toggle.dataset.threadUtilityAction = "toggle-tags";
      palette.appendChild(toggle);
      document.body.appendChild(palette);
      toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setImmediate(resolve));
      const firstUpdate = actions.filter(({ action }) => action === "ui.dialog.update").at(-1);
      assert.match(firstUpdate.payload.html, /Show less/);
      assert.match(firstUpdate.payload.html, /aria-expanded="true"/);
      assert.strictEqual(app.getSnapshot(), snapshot);
      assert.strictEqual(app.getLifecycle().getGeneration(), lifecycleGeneration);

      toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setImmediate(resolve));
      const secondUpdate = actions.filter(({ action }) => action === "ui.dialog.update").at(-1);
      assert.match(secondUpdate.payload.html, />\+3<\/button>/);
      assert.strictEqual(app.getState().ui.tagsExpanded, false);

      commandHandler({
        command: "dialog-closed",
        dialogId: "thread-utility-palette",
        reason: "escape",
      });
      assert.strictEqual(app.getState().ui.tagsExpanded, false);
      await app.getLifecycle().teardown("tag-test");
    } finally {
      sandbox.restore();
    }
  });
};
