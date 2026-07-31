"use strict";

module.exports = function registerThreadUtilityPalette(context) {
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

  function section(id, text) {
    return {
      id,
      available: true,
      html: `<p>${text}</p>`,
      text,
      nodeCount: 1,
      truncated: false,
    };
  }

  function state() {
    return {
      snapshot: {
        title: "Example Game",
        version: "v1.2.3",
        developer: "Example Studio",
        rating: 4.7,
        prefixes: ["Completed", "Ren'Py"],
      },
      displayTags: Array.from({ length: 10 }, (_, index) => ({
        id: `tag-${index}`,
        label: `Tag ${index}`,
        status: index === 0 ? "preferred" : "neutral",
      })),
      utilities: [
        { id: "copy-thread-link", family: "fixed", label: "Copy thread link" },
        { id: "copy-title", family: "fixed", label: "Copy title" },
        { id: "search-1", family: "quick-search", label: "Search title" },
      ],
      settings: { visibleTagLimit: 4, descriptionPreviewLines: 4 },
      content: {
        description: section("description", "Description"),
        installation: section("installation", "Installation"),
      },
      downloads: [{
        id: "download-1",
        label: "Host",
        platform: "Windows",
        host: "example.com",
        maskedDirectToken: "",
        actionType: "",
      }],
      ui: {
        dialogOpen: true,
        dialogGeneration: 7,
        tagsExpanded: false,
        openContentSection: null,
        paletteStatus: "ready",
        paletteMessage: "",
      },
    };
  }

  runTest("THREAD-UTILITY-PALETTE-01 renders the compact required hierarchy", () => {
    const { renderPalette } = loadModule(
      "addons/thread-utility-addon/src/ui/palette.js",
    );
    const html = renderPalette(state());
    const order = [
      "Example Game",
      'data-utility-id="copy-title"',
      'data-utility-id="copy-thread-link"',
      "thread-utility-tags",
      "thread-utility-utility-grid",
      "Description",
      "Installation",
      "Downloads (1)",
      "thread-utility-footer",
    ].map((text) => html.indexOf(text));
    assert.ok(order.every((index) => index >= 0));
    assert.deepStrictEqual([...order].sort((a, b) => a - b), order);
    assert.match(html, />\+6<\/button>/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /Open thread|Copy title \+ URL|Copy description/);
    assert.match(html, /data-preserve-scroll="palette"/);
    assert.strictEqual(
      state().ui.openContentSection,
      null,
      "heavy sections must start collapsed",
    );
    const window = new Window();
    window.document.body.innerHTML = html;
    const palette = window.document.querySelector(".thread-utility-palette");
    const scroll = palette.querySelector(".thread-utility-scroll");
    const footer = palette.querySelector(".thread-utility-footer");
    assert.strictEqual(footer.parentElement, palette);
    assert.strictEqual(scroll.contains(footer), false);
    window.close();
  });

  runTest("THREAD-UTILITY-PALETTE-01 renders a missing rating as a dash", () => {
    const { renderPalette } = loadModule(
      "addons/thread-utility-addon/src/ui/palette.js",
    );
    const missingRating = state();
    missingRating.snapshot.rating = null;
    assert.match(renderPalette(missingRating), /<b>Rating<\/b> -/);
  });

  runTest("THREAD-UTILITY-PALETTE-01 keeps utilities in partial and failure states", () => {
    const { renderPalette } = loadModule(
      "addons/thread-utility-addon/src/ui/palette.js",
    );
    for (const status of ["loading", "partial", "empty", "failure"]) {
      const partial = state();
      partial.content = null;
      partial.downloads = [];
      partial.ui.paletteStatus = status;
      partial.ui.paletteMessage = `${status} state`;
      const html = renderPalette(partial);
      assert.match(html, /Copy link/);
      assert.match(html, /Search title/);
      assert.match(html, new RegExp(`${status} state`));
    }
  });

  runTest("THREAD-UTILITY-PALETTE-01 preserves state and rebinds once per update", async () => {
    const paletteState = state();
    paletteState.ui.tagsExpanded = true;
    paletteState.ui.openContentSection = "description";
    const actions = [];
    let rebinds = 0;
    const { createThreadUtilityUiController } = loadModule(
      "addons/thread-utility-addon/src/app/uiController.js",
      { loader: { ".css": "text" } },
    );
    const controller = createThreadUtilityUiController({
      core: {
        invokeCoreAction: async (action, payload) => {
          actions.push({ action, payload });
          return { ok: true };
        },
      },
      state: paletteState,
      bindings: {
        bindDialogEvents() {},
        bindLauncherEvents() {},
        rebindDialogEvents() { rebinds += 1; },
        unbindDialogEvents() {},
        unbindLauncherEvents() {},
      },
      isTerminal: () => false,
    });
    assert.deepStrictEqual(await controller.updatePalette(7), { ok: true });
    assert.strictEqual(rebinds, 1);
    assert.strictEqual(actions[0].action, "ui.dialog.update");
    assert.match(actions[0].payload.html, />Show less<\/button>/);
    assert.match(actions[0].payload.html, /aria-expanded="true"/);
    assert.deepStrictEqual(
      await controller.updatePalette(6),
      { ok: false, reason: "stale_generation" },
    );
    assert.strictEqual(actions.length, 1);
  });

  runTest("THREAD-UTILITY-PALETTE-01 binds footer actions once with native buttons", () => {
    const window = new Window();
    const previousWindow = global.window;
    const previousDocument = global.document;
    global.window = window;
    global.document = window.document;
    try {
      const { createThreadUtilityBindings } = loadModule(
        "addons/thread-utility-addon/src/ui/bindings.js",
      );
      let refreshes = 0;
      const bindings = createThreadUtilityBindings({
        addonId: "thread-utility-addon",
        isEnabled: () => true,
        onOpenPalette() {},
        onRunUtility() {},
        onCopyDescription() {},
        onDownloadAction() {},
        onOpenSettings() {},
        onRefreshPalette() { refreshes += 1; },
        onToggleContent() {},
        onToggleTags() {},
      });
      window.document.body.innerHTML = `
        <section data-role="threadUtilityPalette">
          <button type="button" data-thread-utility-footer-action="refresh">Refresh</button>
        </section>`;
      bindings.bindDialogEvents();
      bindings.bindDialogEvents();
      window.document.querySelector("button").click();
      assert.strictEqual(refreshes, 1);
      bindings.rebindDialogEvents();
      window.document.querySelector("button").click();
      assert.strictEqual(refreshes, 2);
      bindings.unbindDialogEvents();
    } finally {
      global.window = previousWindow;
      global.document = previousDocument;
      window.close();
    }
  });

  runTest("THREAD-UTILITY-PALETTE-01 stylesheet passes the core sanitizer", () => {
    const css = fs.readFileSync(
      path.join(
        ROOT,
        "addons/thread-utility-addon/src/ui/threadUtility.css",
      ),
      "utf8",
    );
    const result = sanitizeAddonCss("thread-utility-addon", css);
    assert.strictEqual(result.ok, true, result.reason);
    assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /grid-template-columns: repeat\(2/);
    assert.match(css, /\.thread-utility-scroll/);
    assert.match(css, /\.thread-utility-footer/);
    assert.match(css, /:focus-visible/);
  });
};
