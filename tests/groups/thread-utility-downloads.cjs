"use strict";

module.exports = function registerThreadUtilityDownloads(context) {
  const { ROOT, Window, assert, fs, loadModule, path, runTest } = context;

  function fixture() {
    const window = new Window({ url: "https://f95zone.to/threads/daiakuji.308343/" });
    window.document.body.innerHTML = fs.readFileSync(
      path.join(ROOT, "addons/reference/sample.html"),
      "utf8",
    );
    return { window, root: window.document.querySelector(".message-body .bbWrapper") };
  }

  function parse(root, window, generation = 1) {
    const { createSnapshotSourceRegistry } = loadModule(
      "addons/thread-utility-addon/src/domain/snapshot/sourceRegistry.js",
    );
    const { parseDownloads } = loadModule(
      "addons/thread-utility-addon/src/domain/downloads/parser.js",
    );
    const registry = createSnapshotSourceRegistry();
    registry.begin(generation);
    return {
      downloads: parseDownloads(root, {
        baseUrl: window.location.href,
        sourceRegistry: registry,
      }),
      registry,
    };
  }

  runTest("THREAD-UTILITY-DOWNLOADS-01 parses canonical links and delegation types", () => {
    const page = fixture();
    try {
      const { downloads, registry } = parse(page.root, page.window);
      assert.deepStrictEqual(downloads.map(({ label }) => label), [
        "DATANODES", "GOFILE", "MEGA", "PIXELDRAIN", "WORKUPLOAD",
      ]);
      assert.deepStrictEqual(downloads.map(({ kind }) => kind), [
        "direct", "masked", "masked", "masked", "masked",
      ]);
      assert.ok(downloads.every(({ platform }) => platform === "Windows"));
      assert.strictEqual(downloads[0].actionType, "direct");
      assert.ok(downloads.slice(1).every(({ actionType }) => actionType === "masked"));
      assert.ok(downloads.every(({ maskedDirectToken }) => maskedDirectToken));
      assert.ok(downloads.every(({ anchorToken }) => registry.get(anchorToken, 1)));
      assert.ok(downloads.every(({ originalUrl }) =>
        !/dontlookitupok|vndb\.org|miraheze\.org/.test(originalUrl)));
      registry.clear();
      assert.strictEqual(registry.get(downloads[0].anchorToken, 1), null);
    } finally {
      page.window.close();
    }
  });

  runTest("THREAD-UTILITY-DOWNLOADS-01 uses conservative adjacent fallback and deduplication", () => {
    const window = new Window({ url: "https://f95zone.to/threads/fallback.1/" });
    try {
      window.document.body.innerHTML = `
        <div class="bbWrapper">
          <a href="https://example.com/ignored">Ignored</a>
          <a href="https://f95zone.to/masked/gofile.io/1/a">GOFILE</a>
          <button data-addon-id="masked-direct-addon" data-action-type="masked"
            data-masked-href="https://f95zone.to/masked/gofile.io/1/a">Resolve</button>
          <a href="https://f95zone.to/masked/gofile.io/1/a">Duplicate</a>
        </div>`;
      const { downloads } = parse(
        window.document.querySelector(".bbWrapper"),
        window,
      );
      assert.strictEqual(downloads.length, 1);
      assert.strictEqual(downloads[0].label, "GOFILE");
      assert.strictEqual(downloads[0].platform, "Other");
    } finally {
      window.close();
    }
  });

  runTest("THREAD-UTILITY-DOWNLOADS-01 opens, copies, and delegates only live matching buttons", async () => {
    const page = fixture();
    try {
      const { downloads, registry } = parse(page.root, page.window);
      const opened = [];
      const copied = [];
      const toasts = [];
      let clicks = 0;
      let refreshes = 0;
      let contextDownloads = downloads;
      const button = registry.get(downloads[1].maskedDirectToken, 1);
      button.addEventListener("click", () => { clicks += 1; });
      const { createDownloadController } = loadModule(
        "addons/thread-utility-addon/src/domain/downloads/controller.js",
      );
      let current = true;
      const controller = createDownloadController({
        core: {
          invokeCoreAction: async (action, payload) => {
            toasts.push({ action, payload });
            return { ok: true };
          },
        },
        getContext: () => ({
          downloads: contextDownloads,
          isCurrent: () => current,
          getSource: (token) => registry.get(token, 1),
        }),
        windowObject: { open: (...args) => opened.push(args) },
        clipboardWriter: async (value) => {
          copied.push(value);
          return { ok: true };
        },
        refreshSources: async () => {
          refreshes += 1;
          return false;
        },
      });
      assert.deepStrictEqual(controller.open("download-1"), { ok: true });
      assert.strictEqual((await controller.copy("download-1")).ok, true);
      assert.strictEqual((await controller.copyAll()).ok, true);
      assert.deepStrictEqual(await controller.delegate("download-2"), { ok: true });
      assert.strictEqual(clicks, 1);
      assert.deepStrictEqual(opened[0].slice(1), ["_blank", "noopener"]);
      assert.strictEqual(copied[0], downloads[0].originalUrl);
      assert.strictEqual(copied[1].split("\n").length, 5);

      contextDownloads = Array.from({ length: 105 }, (_, index) => ({
        id: `bounded-${index}`,
        originalUrl: `https://example.com/${index}`,
      }));
      assert.strictEqual((await controller.copyAll()).ok, true);
      assert.strictEqual(copied[2].split("\n").length, 100);
      contextDownloads = downloads;

      button.dataset.maskedHref = "https://foreign.invalid/";
      assert.deepStrictEqual(
        await controller.delegate("download-2"),
        { ok: false, reason: "stale_source" },
      );
      assert.strictEqual(refreshes, 1);
      assert.strictEqual(toasts.length, 1);
      assert.strictEqual(toasts[0].action, "toast.show");
      assert.strictEqual(clicks, 1);
      current = false;
      assert.deepStrictEqual(
        controller.open("download-1"),
        { ok: false, reason: "stale_generation" },
      );
    } finally {
      page.window.close();
    }
  });

  runTest("THREAD-UTILITY-DOWNLOADS-01 renders a collapsed bounded accordion", () => {
    const { renderPalette } = loadModule(
      "addons/thread-utility-addon/src/ui/palette.js",
    );
    const state = {
      displayTags: [],
      utilities: [],
      content: null,
      downloads: [{
        id: "download-1",
        label: "Host",
        platform: "Other",
        host: "example.com",
        maskedDirectToken: "",
        actionType: "",
      }],
      settings: { visibleTagLimit: 8, descriptionPreviewLines: 4 },
      ui: { tagsExpanded: false, openContentSection: null },
    };
    const collapsed = renderPalette(state);
    assert.match(collapsed, /Downloads \(1\)/);
    assert.match(collapsed, /Show downloads/);
    assert.doesNotMatch(collapsed, /data-download-action="open"/);
    state.ui.openContentSection = "downloads";
    const open = renderPalette(state);
    assert.match(open, /data-download-action="open"/);
    assert.match(open, /Copy All originals/);
    assert.doesNotMatch(open, />Resolve<|>Direct DL</);
  });

  runTest("THREAD-UTILITY-DOWNLOADS-01 does not own Masked Direct transport", () => {
    const files = [
      "addons/thread-utility-addon/src/app/createThreadUtilityApp.js",
      "addons/thread-utility-addon/src/domain/downloads/controller.js",
      "addons/thread-utility-addon/src/domain/downloads/parser.js",
    ];
    const source = files
      .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
      .join("\n");
    assert.doesNotMatch(
      source,
      /\bGM_(?:getValue|setValue|deleteValue)\b|f95ue_dd|localStorage|sessionStorage|dispatchEvent/,
    );
  });
};
