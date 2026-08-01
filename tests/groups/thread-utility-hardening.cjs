"use strict";

module.exports = function registerThreadUtilityHardening(context) {
  const {
    ROOT,
    Window,
    assert,
    fs,
    loadModule,
    path,
    runTest,
    sanitizeAddonCss,
  } = context;

  runTest("THREAD-UTILITY-HARDENING-01 declares consistent explicit limits", () => {
    const { THREAD_UTILITY_LIMITS, byteLength } = loadModule(
      "addons/thread-utility-addon/src/domain/limits.js",
    );
    const { SNAPSHOT_LIMITS } = loadModule(
      "addons/thread-utility-addon/src/domain/snapshot/limits.js",
    );
    const { CONTENT_LIMITS } = loadModule(
      "addons/thread-utility-addon/src/domain/content/parser.js",
    );
    const { DOWNLOAD_LIMIT } = loadModule(
      "addons/thread-utility-addon/src/domain/downloads/parser.js",
    );
    const { QUICK_SEARCH_LIMIT } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/quickSearch.js",
    );
    const { CLIPBOARD_LIMIT } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/clipboard.js",
    );
    assert.strictEqual(THREAD_UTILITY_LIMITS.sourceNodes, SNAPSHOT_LIMITS.sourceNodes);
    assert.strictEqual(THREAD_UTILITY_LIMITS.sourceLinks, SNAPSHOT_LIMITS.sourceLinks);
    assert.strictEqual(THREAD_UTILITY_LIMITS.normalizedNodes, CONTENT_LIMITS.nodes);
    assert.strictEqual(THREAD_UTILITY_LIMITS.sectionText, CONTENT_LIMITS.text);
    assert.strictEqual(THREAD_UTILITY_LIMITS.downloads, DOWNLOAD_LIMIT);
    assert.strictEqual(THREAD_UTILITY_LIMITS.utilities, QUICK_SEARCH_LIMIT);
    assert.strictEqual(THREAD_UTILITY_LIMITS.clipboardText, CLIPBOARD_LIMIT);
    const css = fs.readFileSync(
      path.join(ROOT, "addons/thread-utility-addon/src/ui/threadUtility.css"),
      "utf8",
    );
    assert.ok(byteLength(css) < THREAD_UTILITY_LIMITS.stylesheetBytes);
    assert.strictEqual(sanitizeAddonCss("thread-utility-addon", css).ok, true);
  });

  runTest("THREAD-UTILITY-HARDENING-01 keeps core lifecycle recovery available", () => {
    const manifestEntry = context.ADDON_MANIFEST.addons.find(
      ({ id }) => id === "thread-utility-addon",
    );
    assert.ok(manifestEntry.capabilities.includes("feature"));
    const panelSource = fs.readFileSync(
      path.join(ROOT, "src/ui/components/addons/addonPanelActions.js"),
      "utf8",
    );
    assert.match(panelSource, /capabilities\?\.includes\("feature"\)/);
    const lifecycleSource = fs.readFileSync(
      path.join(ROOT, "src/services/addons/actions/families/lifecycle.js"),
      "utf8",
    );
    assert.match(lifecycleSource, /requiredCapabilities: \["feature"\]/);
  });

  runTest("THREAD-UTILITY-HARDENING-01 rejects oversized UI before core", async () => {
    const { THREAD_UTILITY_LIMITS } = loadModule(
      "addons/thread-utility-addon/src/domain/limits.js",
    );
    const { openDialog } = loadModule(
      "addons/thread-utility-addon/src/api/ui/dialog.js",
    );
    const { registerStyle } = loadModule(
      "addons/thread-utility-addon/src/api/ui/style.js",
    );
    let calls = 0;
    const core = { invokeCoreAction: async () => { calls += 1; return { ok: true }; } };
    assert.deepStrictEqual(
      await openDialog(core, {
        dialogId: "oversized",
        html: "x".repeat(THREAD_UTILITY_LIMITS.dialogHtmlBytes + 1),
      }),
      { ok: false, reason: "dialog_html_too_large" },
    );
    assert.deepStrictEqual(
      await registerStyle(
        core,
        "oversized",
        "x".repeat(THREAD_UTILITY_LIMITS.stylesheetBytes + 1),
      ),
      { ok: false, reason: "stylesheet_too_large" },
    );
    assert.strictEqual(calls, 0);
  });

  runTest("THREAD-UTILITY-HARDENING-01 truncates malformed content deterministically", () => {
    const window = new Window({ url: "https://f95zone.to/threads/hardening.1/" });
    try {
      window.document.body.innerHTML = `
        <div class="bbWrapper"><b>Overview</b>
          <p>${"Bounded text ".repeat(3000)}
          <a href="javascript:alert(1)" onclick="bad()">unsafe</a>
          <a href="https://example.com/?secret=value">safe</a>
          <img src="https://example.com/private.png"></p>
          <b>Developer</b>
        </div>`;
      const root = window.document.querySelector(".bbWrapper");
      const { CONTENT_LIMITS, parseContentSections } = loadModule(
        "addons/thread-utility-addon/src/domain/content/parser.js",
      );
      const first = parseContentSections(root).description;
      const second = parseContentSections(root).description;
      assert.deepStrictEqual(first, second);
      assert.strictEqual(first.truncated, true);
      assert.ok(first.text.length <= CONTENT_LIMITS.text);
      assert.doesNotMatch(first.html, /javascript:|onclick|<img/i);
    } finally {
      window.close();
    }
  });

  runTest("THREAD-UTILITY-HARDENING-01 suppresses a late clipboard toast", async () => {
    let resolveClipboard;
    let current = true;
    const actions = [];
    const { createUtilityController } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/controller.js",
    );
    const { createUtilityRegistry } = loadModule(
      "addons/thread-utility-addon/src/domain/utilities/registry.js",
    );
    const controller = createUtilityController({
      core: {
        invokeCoreAction: async (action, payload) => {
          actions.push({ action, payload });
          return { ok: true };
        },
      },
      registry: createUtilityRegistry(),
      quickSearches: [],
      getSettings: () => ({ searchScope: "thread" }),
      getActionContext: () => ({
        snapshot: { title: "Private title", url: "https://example.com/?secret=1" },
        isCurrent: () => current,
      }),
      navigatorObject: {
        clipboard: {
          writeText: () => new Promise((resolve) => { resolveClipboard = resolve; }),
        },
      },
    });
    const pending = controller.execute("copy-title");
    current = false;
    resolveClipboard();
    assert.deepStrictEqual(
      await pending,
      { ok: false, reason: "stale_generation" },
    );
    assert.deepStrictEqual(actions, []);
  });

  runTest("THREAD-UTILITY-HARDENING-01 suppresses stale settings open and save", async () => {
    const window = new Window();
    let resolveOpen;
    let resolveStorage;
    let refreshes = 0;
    const actions = [];
    try {
      const { createThreadUtilitySettingsEditor } = loadModule(
        "addons/thread-utility-addon/src/app/settingsEditor.js",
      );
      const core = {
        invokeCoreAction: (action, payload) => {
          actions.push({ action, payload });
          if (action === "ui.dialog.open") {
            return new Promise((resolve) => { resolveOpen = resolve; });
          }
          if (action === "storage.set") {
            return new Promise((resolve) => { resolveStorage = resolve; });
          }
          return Promise.resolve({ ok: true });
        },
      };
      const editor = createThreadUtilitySettingsEditor({
        core,
        documentObject: window.document,
        getSettings: () => ({
          quickSearches: [{ id: "one", label: "One", query: "One" }],
        }),
        onSaved: async () => { refreshes += 1; },
      });
      const opening = editor.open();
      await editor.close("disable");
      resolveOpen({ ok: true });
      assert.deepStrictEqual(
        await opening,
        { ok: false, reason: "stale_generation" },
      );

      core.invokeCoreAction = (action, payload) => {
        actions.push({ action, payload });
        if (action === "ui.dialog.open") {
          window.document.body.innerHTML = payload.html;
          return Promise.resolve({ ok: true });
        }
        if (action === "storage.set") {
          return new Promise((resolve) => { resolveStorage = resolve; });
        }
        return Promise.resolve({ ok: true });
      };
      await editor.open();
      const saving = editor.save();
      await editor.close("disable");
      resolveStorage({ ok: true });
      assert.deepStrictEqual(
        await saving,
        { ok: false, reason: "stale_generation" },
      );
      assert.strictEqual(refreshes, 0);
    } finally {
      window.close();
    }
  });

  runTest("THREAD-UTILITY-HARDENING-01 keeps diagnostics and resources bounded", () => {
    const sourceRoot = path.join(ROOT, "addons/thread-utility-addon/src");
    const files = [];
    const visit = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.name.endsWith(".js")) files.push(absolute);
      }
    };
    visit(sourceRoot);
    const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    assert.doesNotMatch(source, /\bconsole\.(?:log|info|warn|error)\b/);
    assert.doesNotMatch(source, /MutationObserver|setInterval|setTimeout/);
    const main = fs.readFileSync(path.join(sourceRoot, "main.js"), "utf8");
    assert.doesNotMatch(main, /error\?\.message|String\(error|location\.href/);
    assert.match(main, /Failed to initialize Thread Utility/);
  });
};
