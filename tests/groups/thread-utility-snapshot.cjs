"use strict";

module.exports = function registerThreadUtilitySnapshot(context) {
  const {
    ROOT,
    Window,
    assert,
    createDomSandbox,
    fs,
    loadModule,
    path,
    runTest,
  } = context;

  function loadSnapshotModules() {
    return {
      ...loadModule("addons/thread-utility-addon/src/domain/snapshot/parser.js"),
      ...loadModule("addons/thread-utility-addon/src/domain/snapshot/sourceRegistry.js"),
    };
  }

  function fixtureDocument(html) {
    const window = new Window({ url: "https://f95zone.to/threads/daiakuji.308343/" });
    window.document.body.innerHTML = html;
    return { document: window.document, window };
  }

  function pageContext(overrides = {}) {
    return {
      pageScopes: ["f95zone", "thread"],
      pageType: "thread",
      threadId: "308343",
      threadTitle: "Daiakuji [v2.18.0] [AliceSoft]",
      url: "https://f95zone.to/threads/daiakuji-v2-18-0-alicesoft.308343/",
      ...overrides,
    };
  }

  runTest("THREAD-UTILITY-SNAPSHOT-01 parses the canonical fixture", () => {
    const html = fs.readFileSync(path.join(ROOT, "addons/reference/sample.html"), "utf8");
    const fixture = fixtureDocument(html);
    try {
      const { captureThreadSnapshot, createSnapshotSourceRegistry } = loadSnapshotModules();
      const sources = createSnapshotSourceRegistry();
      const snapshot = captureThreadSnapshot({
        document: fixture.document,
        pageContext: pageContext(),
        generation: 7,
        sourceRegistry: sources,
        capturedAt: 12345,
      });
      assert.strictEqual(snapshot.threadId, "308343");
      assert.strictEqual(snapshot.title, "Daiakuji [v2.18.0] [AliceSoft]");
      assert.strictEqual(snapshot.canonicalTitle, "Daiakuji");
      assert.strictEqual(snapshot.version, "v2.18.0");
      assert.strictEqual(snapshot.developer, "AliceSoft");
      assert.deepStrictEqual(snapshot.prefixes, ["Others", "Completed"]);
      assert.strictEqual(snapshot.rating, 0);
      assert.deepStrictEqual(snapshot.tags, [
        "2dcg",
        "censored",
        "harem",
        "humor",
        "lesbian",
        "male protagonist",
        "management",
        "rpg",
        "strategy",
        "turn based combat",
      ]);
      assert.deepStrictEqual(snapshot.starter, {
        postId: "21113152",
        author: "Lerd0",
        postedAt: "2026-07-28T09:47:26+0700",
      });
      assert.strictEqual(snapshot.capturedAt, 12345);
      assert.ok(Object.isFrozen(snapshot));
      assert.ok(Object.isFrozen(snapshot.tags));
      const contentRoot = sources.get(snapshot.sectionSources.contentRootToken, 7);
      assert.ok(contentRoot?.matches(".bbWrapper"));
      assert.strictEqual(contentRoot.closest(".message-threadStarterPost") !== null, true);
      assert.strictEqual(
        snapshot.downloadSource.contentRootToken,
        snapshot.sectionSources.contentRootToken,
      );
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-SNAPSHOT-01 excludes signature and reply sources", () => {
    const fixture = fixtureDocument(`
      <h1 class="p-title-value">Game [v1] [Dev]</h1>
      <article class="message-threadStarterPost" data-author="Starter" data-content="post-1">
        <header class="message-attribution"><a>#1</a></header>
        <div class="message-body"><div class="bbWrapper"><a href="/kept">Kept</a></div></div>
        <aside class="message-signature"><a href="/signature">Signature</a></aside>
      </article>
      <article class="message"><div class="message-body"><div class="bbWrapper">
        <a href="/reply">Reply</a>
      </div></div></article>
    `);
    try {
      const { captureThreadSnapshot, createSnapshotSourceRegistry } = loadSnapshotModules();
      const sources = createSnapshotSourceRegistry();
      const snapshot = captureThreadSnapshot({
        document: fixture.document,
        pageContext: pageContext(),
        generation: 1,
        sourceRegistry: sources,
      });
      const root = sources.get(snapshot.sectionSources.contentRootToken, 1);
      assert.deepStrictEqual([...root.querySelectorAll("a")].map((node) => node.textContent), ["Kept"]);
      assert.strictEqual(snapshot.sectionSources.linkCount, 1);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-SNAPSHOT-01 preserves partial header data without a starter", () => {
    const fixture = fixtureDocument(`
      <h1 class="p-title-value"><span class="labelLink"><span class="label">RPGM</span></span>
        Partial Game [0.8] [Studio]
      </h1>
      <span class="js-tagList"><a class="tagItem">animated</a></span>
    `);
    try {
      const { captureThreadSnapshot, createSnapshotSourceRegistry } = loadSnapshotModules();
      const snapshot = captureThreadSnapshot({
        document: fixture.document,
        pageContext: pageContext(),
        generation: 2,
        sourceRegistry: createSnapshotSourceRegistry(),
      });
      assert.strictEqual(snapshot.canonicalTitle, "Partial Game");
      assert.deepStrictEqual(snapshot.prefixes, ["RPGM"]);
      assert.deepStrictEqual(snapshot.tags, ["animated"]);
      assert.deepStrictEqual(snapshot.starter, { postId: "", author: "", postedAt: "" });
      assert.strictEqual(snapshot.sectionSources, null);
      assert.strictEqual(snapshot.downloadSource, null);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-SNAPSHOT-01 uses bounded title and verified #1 fallbacks", () => {
    const fixture = fixtureDocument(`
      <article class="message" data-author="Fallback" data-content="post-42">
        <header class="message-attribution"><a href="/post-42"> #1 </a></header>
        <div class="message-body"><div class="bbWrapper">Fallback body</div></div>
      </article>
    `);
    try {
      fixture.document.title = `${"Fallback Game ".repeat(40)} | F95zone`;
      const { captureThreadSnapshot, createSnapshotSourceRegistry } = loadSnapshotModules();
      const snapshot = captureThreadSnapshot({
        document: fixture.document,
        pageContext: pageContext({ threadTitle: "" }),
        generation: 3,
        sourceRegistry: createSnapshotSourceRegistry(),
      });
      assert.ok(snapshot.title.startsWith("Fallback Game"));
      assert.ok(snapshot.title.length <= 240);
      assert.strictEqual(snapshot.starter.postId, "42");
      assert.strictEqual(snapshot.starter.author, "Fallback");
      assert.ok(snapshot.sectionSources);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-SNAPSHOT-01 tolerates malformed optional markup and bounds collections", () => {
    const tags = Array.from({ length: 130 }, (_, index) =>
      `<a class="tagItem"> tag ${index} </a>`).join("");
    const fixture = fixtureDocument(`
      <h1 class="p-title-value">Malformed [not-a-version]</h1>
      <span class="js-tagList">${tags}</span>
      <select name="rating" data-initial-rating="not-a-rating"></select>
      <article class="message-threadStarterPost">
        <div class="message-body"><div class="bbWrapper"><div><span>Unclosed
      </article>
    `);
    try {
      const { captureThreadSnapshot, createSnapshotSourceRegistry } = loadSnapshotModules();
      assert.doesNotThrow(() => {
        const snapshot = captureThreadSnapshot({
          document: fixture.document,
          pageContext: pageContext(),
          generation: 4,
          sourceRegistry: createSnapshotSourceRegistry(),
        });
        assert.strictEqual(snapshot.rating, null);
        assert.strictEqual(snapshot.tags.length, 100);
        assert.strictEqual(snapshot.developer, "not-a-version");
      });
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-SNAPSHOT-01 suppresses stale lifecycle publication and clears sources", async () => {
    const sandbox = createDomSandbox();
    try {
      document.body.innerHTML = `
        <h1 class="p-title-value">Race Game [v1] [Dev]</h1>
        <article class="message-threadStarterPost" data-content="post-9">
          <div class="message-body"><div class="bbWrapper">Body</div></div>
        </article>
      `;
      let resolveContext;
      const contextPromise = new Promise((resolve) => {
        resolveContext = resolve;
      });
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
        async invokeCoreAction(action) {
          if (action === "addon.access") {
            return { ok: true, value: { blocked: false, enabled: true } };
          }
          if (action === "page.getContext") return contextPromise;
          if (action === "storage.get") return { ok: true, value: { showLauncher: true } };
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
          capabilities: ["page", "storage", "toast", "ui.style", "ui.mount", "ui.dialog"],
          requiresCore: true,
          pageScopes: ["thread"],
          runtimeMode: "core-required",
          matches: ["*://f95zone.to/threads/*"],
        },
      });
      const bootstrap = app.bootstrap();
      await new Promise((resolve) => setImmediate(resolve));
      commandHandler({
        command: "before-page-change",
        reason: "race",
        routeContext: { pathname: "/threads/new.10/" },
      });
      resolveContext({ ok: true, value: pageContext() });
      await bootstrap;
      assert.strictEqual(app.getSnapshot(), null);

      const enable = app.getLifecycle().enable("fresh-route");
      resolveContext({ ok: true, value: pageContext() });
      await enable;
      const snapshot = app.getSnapshot();
      assert.ok(snapshot);
      const token = snapshot.sectionSources.contentRootToken;
      assert.ok(app.getSnapshotSource(token));
      commandHandler({
        command: "dialog-closed",
        dialogId: "thread-utility-palette",
        reason: "escape",
      });
      assert.strictEqual(app.getSnapshotSource(token), null);
      await app.getLifecycle().teardown("snapshot-test");
      assert.strictEqual(app.getSnapshot(), null);
    } finally {
      sandbox.restore();
    }
  });
};
