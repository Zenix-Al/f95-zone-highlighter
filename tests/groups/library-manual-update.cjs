"use strict";

module.exports = function registerLibraryManualUpdateGroup(context) {
  const { assert, fs, loadModule, path, ROOT, runTest } = context;

  function html({ title = "Game [v1.0]", body = "Version: v1.0", extra = "" } = {}) {
    return `<!doctype html><html><head><title>${title} | F95zone</title>${extra}</head><body><article class="message-threadStarterPost"><div class="bbWrapper">${body}</div></article></body></html>`;
  }

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 commits in background without preview confirmation", () => {
    const source = fs.readFileSync(
      path.join(
        ROOT,
        "addons/library-addon/src/ui/manager/handlers/updateCheckHandlers.js",
      ),
      "utf8",
    );
    assert.doesNotMatch(source, /askConfirmFn|Update check preview/);
    assert.match(source, /in the background/);
    assert.match(source, /commitManualUpdateCheck/);
    const managerSource = fs.readFileSync(
      path.join(ROOT, "addons/library-addon/src/ui/manager/managerApp.js"),
      "utf8",
    );
    assert.match(managerSource, /reason !== "addon-close"\) cancelManualCheck/);
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 parses required thread fixtures", () => {
    const { parseLibraryThreadHtml } = loadModule(
      "addons/library-addon/src/library/threadUpdateParser.js",
    );
    const cases = [
      ["active", html({ title: "Game [v1.2]", body: "Version: v1.3" }), true, "v1.3", "active"],
      ["completed", html({ title: "Completed - Game [v2]", body: "Version: v2" }), true, "v2", "completed"],
      ["on-hold", html({ title: "On Hold - Game [v3]", body: "Version: v3" }), true, "v3", "on-hold"],
      ["abandoned", html({ title: "Abandoned - Game [v4]", body: "Version: v4" }), true, "v4", "abandoned"],
      ["renamed", html({ title: "Renamed Game [v5]", body: "No named field" }), true, "v5", "active"],
      [
        "thread-with-login-modal",
        html({ title: "Authenticated Game [v5.1]", body: "Version: v5.1" }).replace(
          "</body>",
          '<aside><a href="/login/">Log in</a><form name="login"></form></aside></body>',
        ),
        true,
        "v5.1",
        "active",
      ],
      ["missing", html({ title: "Game", body: "Nothing here" }), false, "version_missing"],
      ["malformed", "not html", false, "malformed_html"],
      [
        "login-required-message",
        '<html><title>F95zone</title><body>Sorry, you have to be <a href="https://f95zone.to/login">logged in</a> to access this page</body></html>',
        false,
        "authentication_required",
      ],
      [
        "login-required-action",
        "<html><title>F95zone</title><body>You must be logged-in to do that</body></html>",
        false,
        "authentication_required",
      ],
      ["challenge", "<html><title>Just a moment</title><div id=\"cf-chl-widget\"></div></html>", false, "challenge_page"],
    ];
    for (const [name, source, ok, value, status] of cases) {
      const result = parseLibraryThreadHtml(source);
      assert.strictEqual(result.ok, ok, name);
      if (ok) {
        assert.strictEqual(result.value.currentVersion, value, name);
        assert.strictEqual(result.value.status, status, name);
      } else {
        assert.strictEqual(result.reason, value, name);
      }
    }
    const redirected = parseLibraryThreadHtml(
      html({
        title: "Moved Game [v6]",
        body: "Version: v6",
        extra: '<meta property="og:url" content="https://f95zone.to/threads/new-name.99/">',
      }),
      { requestedUrl: "https://f95zone.to/threads/old.99/" },
    );
    assert.strictEqual(redirected.value.url, "https://f95zone.to/threads/new-name.99/");

    const loginInterfaceMarkupAlone = parseLibraryThreadHtml(
      html({ title: "Log in", body: 'Version: v1 <a href="https://f95zone.to/login">Login</a>' }),
    );
    assert.strictEqual(loginInterfaceMarkupAlone.ok, true);
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 request adapter is bounded and authenticated", async () => {
    const { createThreadHtmlRequest } = loadModule(
      "addons/library-addon/src/api/threadHtml.js",
    );
    let requestOptions;
    const request = createThreadHtmlRequest(async (_url, options) => {
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        url: "https://f95zone.to/threads/moved.1/",
        headers: { get: () => "20" },
        text: async () => html(),
      };
    });
    const result = await request("https://f95zone.to/threads/game.1/");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(requestOptions.credentials, "include");
    assert.strictEqual(requestOptions.redirect, "follow");
    assert.strictEqual(
      (await request("https://example.com/thread")).reason,
      "unsupported_origin",
    );
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 serializes requests and applies retry policy", async () => {
    const { checkLibraryRecords } = loadModule(
      "addons/library-addon/src/library/manualUpdateChecker.js",
    );
    let active = 0;
    let maxActive = 0;
    const attempts = new Map();
    const records = ["1", "2", "3"].map((threadId) => ({
      threadId,
      thread: { url: `https://f95zone.to/threads/${threadId}/`, currentVersion: "v1" },
    }));
    const request = async (url) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const id = url.match(/threads\/(\d+)/)[1];
      attempts.set(id, (attempts.get(id) || 0) + 1);
      active -= 1;
      if (id === "1" && attempts.get(id) === 1) return { ok: false, reason: "http_503" };
      if (id === "2") return { ok: false, reason: "http_429", status: 429 };
      return { ok: true, html: html({ body: "Version: v2" }), finalUrl: url };
    };
    const result = await checkLibraryRecords(records, request, {
      spacingMs: 0,
      retryLimit: 2,
    });
    assert.strictEqual(maxActive, 1);
    assert.strictEqual(attempts.get("1"), 2);
    assert.strictEqual(attempts.get("2"), 1);
    assert.strictEqual(result.results[0].changed, true);
    assert.strictEqual(result.results[1].reason, "http_429");
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 cancellation suppresses remaining work", async () => {
    const { checkLibraryRecords } = loadModule(
      "addons/library-addon/src/library/manualUpdateChecker.js",
    );
    const controller = new AbortController();
    let calls = 0;
    const records = ["1", "2"].map((threadId) => ({
      threadId,
      thread: { url: `https://f95zone.to/threads/${threadId}/`, currentVersion: "v1" },
    }));
    const result = await checkLibraryRecords(records, async () => {
      calls += 1;
      controller.abort();
      return { ok: false, reason: "cancelled" };
    }, { signal: controller.signal, spacingMs: 0 });
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(result.results, []);
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 unchanged checks write only required metadata", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    let record = {
      threadId: "42",
      thread: {
        url: "https://f95zone.to/threads/game.42/",
        title: "Game [v1]",
        canonicalTitle: "Game",
        titleNormalized: "game",
        currentVersion: "v1",
        developer: "",
        prefixes: [{ label: "Completed", color: "green" }],
        tags: ["animated", "female protagonist"],
        threadRating: null,
        sourcePage: "thread",
        observedAt: 1,
        versionObservedAt: 1,
      },
      personal: {
        status: "playing",
        rating: 4.5,
        note: "keep",
        pinned: true,
        progressNote: "keep",
        lastPlayedVersion: "v1",
        addedAt: 1,
        startedAt: 2,
        lastPlayedAt: 3,
        completedAt: null,
        droppedAt: null,
        lastActivityAt: 3,
      },
      updateState: "current",
      updateCheck: { enabled: true, status: "pending", consecutiveFailures: 0 },
      recordModifiedAt: 3,
      schemaVersion: 4,
    };
    const updates = new Map();
    const activity = new Map();
    let recordWrites = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        const store = payload.storeName || "records";
        const map = store === "updates" ? updates : activity;
        if (action === "idb.get") {
          return { ok: true, value: store === "records" ? record : map.get(payload.key) || null };
        }
        if (action === "idb.put") {
          if (store === "records") {
            record = payload.value;
            recordWrites += 1;
          }
          else map.set(payload.value.id, payload.value);
          return { ok: true, value: payload.value };
        }
        if (action === "idb.query") return { ok: true, value: [...map.values()] };
        return { ok: true, value: null };
      },
    };
    const service = createLibraryService(bridge, {}, {
      requestThreadHtml: async () => ({
        ok: true,
        html: html({ title: "Game [v1]", body: "Version: v1" }),
        finalUrl: record.thread.url,
      }),
    });
    const preview = await service.previewManualUpdateCheck(["42"], { spacingMs: 0 });
    const result = await service.commitManualUpdateCheck(preview);
    assert.strictEqual(result.current, 1);
    assert.strictEqual(record.personal.rating, 4.5);
    assert.strictEqual(record.personal.note, "keep");
    assert.deepStrictEqual(record.thread.prefixes, [{ label: "Completed", color: "green" }]);
    assert.deepStrictEqual(record.thread.tags, ["animated", "female protagonist"]);
    assert.strictEqual(record.updateCheck.status, "current");
    assert.strictEqual(record.updateCheck.lastErrorCode, "");
    assert.strictEqual(recordWrites, 1);
    assert.strictEqual(updates.size, 0);
    assert.strictEqual(activity.size, 0);
  });

  runTest("LIBRARY-MANUAL-UPDATE-CHECK-01 loads all selected records without API concurrency loss", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    let activeReads = 0;
    let maxActiveReads = 0;
    const bridge = {
      async invokeCoreAction(action, payload) {
        if (action !== "idb.get" || payload.storeName !== "records") {
          return { ok: true, value: null };
        }
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activeReads -= 1;
        return {
          ok: true,
          value: {
            threadId: String(payload.key),
            thread: {
              url: `https://f95zone.to/threads/game.${payload.key}/`,
              title: `Game ${payload.key}`,
              currentVersion: "v1",
              tags: ["preserved"],
              prefixes: [{ label: "Completed", color: "green" }],
            },
            personal: { status: "saved" },
            updateCheck: { enabled: true, status: "pending" },
            schemaVersion: 4,
          },
        };
      },
    };
    const service = createLibraryService(bridge, {}, {
      requestThreadHtml: async (_url) => ({
        ok: true,
        html: html({ title: "Game [v1]", body: "Version: v1" }),
      }),
    });
    const ids = Array.from({ length: 47 }, (_, index) => String(index + 1));
    const preview = await service.previewManualUpdateCheck(ids, { spacingMs: 1 });
    assert.strictEqual(preview.total, 47);
    assert.strictEqual(preview.results.length, 47);
    assert.strictEqual(maxActiveReads, 1);
  });
};
