"use strict";

module.exports = function registerLatestFiltersExpansionGroup(context) {
  const {
    ADDON_MANIFEST,
    TRUSTED_ADDON_CATALOG,
    ROOT,
    assert,
    createDomSandbox,
    createFakeClock,
    fs,
    loadModule,
    path,
    runTest,
  } = context;

  const fixture = fs.readFileSync(
    path.join(
      ROOT,
      "tests",
      "fixtures",
      "latest-filters",
      "filter-drawer.html",
    ),
    "utf8",
  );

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  runTest("LATEST-FILTERS-EXPANSION-VERIFY-01 preserves preset shape, storage keys, and metadata", () => {
    const {
      FILTER_PRESETS_STORAGE_KEY,
      FILTER_SETTINGS_STORAGE_KEY,
    } = loadModule("addons/latest-filters-addon/src/constants.js");
    const { normalizePreset } = loadModule(
      "addons/latest-filters-addon/src/domain/presets.js",
    );
    const sandbox = createDomSandbox(
      "https://f95zone.to/sam/latest_alpha/#/cat=games/tags=1,2",
    );
    try {
      assert.strictEqual(FILTER_PRESETS_STORAGE_KEY, "presets");
      assert.strictEqual(FILTER_SETTINGS_STORAGE_KEY, "settings");
      assert.deepStrictEqual(
        Object.keys(
          normalizePreset({
            id: "fixture",
            name: "Fixture",
            url: location.href,
            updatedAt: 42,
          }),
        ),
        [
          "id",
          "name",
          "url",
          "normalizedUrl",
          "summary",
          "summaryParts",
          "searchText",
          "updatedAt",
        ],
      );
    } finally {
      sandbox.restore();
    }

    const manifest = ADDON_MANIFEST.addons.find(
      ({ id }) => id === "latest-filters-addon",
    );
    const catalog = TRUSTED_ADDON_CATALOG.find(
      ({ id }) => id === "latest-filters-addon",
    );
    assert.deepStrictEqual(manifest.matches, [
      "*://f95zone.to/sam/latest_alpha/*",
    ]);
    assert.deepStrictEqual(manifest.grants, ["GM.getValue", "GM.setValue"]);
    assert.strictEqual(manifest.runAt, "document-idle");
    assert.deepStrictEqual(manifest.pageScopes, ["latest"]);
    assert.strictEqual(manifest.runtimeMode, "core-required");
    assert.deepStrictEqual(catalog.matches, manifest.matches);
    assert.deepStrictEqual(catalog.pageScopes, manifest.pageScopes);
    assert.deepStrictEqual(catalog.capabilities, manifest.capabilities);
  });

  runTest("LATEST-FILTERS-EXPANSION-VERIFY-01 composes reset and Surprise through one route pipeline", () => {
    const sandbox = createDomSandbox(
      "https://f95zone.to/sam/latest_alpha/?rows=30#/cat=games/page=4/tags=9/notags=1,3/prefixes=10/search=demo",
    );
    try {
      const { applySurpriseTags, resetTagFilter } = loadModule(
        "addons/latest-filters-addon/src/domain/filterRoute.js",
      );
      const reset = resetTagFilter(location.href, "tags", location.origin);
      const surprise = applySurpriseTags(reset.url, [1, 2], location.origin);
      assert.strictEqual(
        new URL(surprise.url).hash,
        "#/cat=games/notags=3/prefixes=10/search=demo/tags=1,2",
      );
      assert.strictEqual(new URL(surprise.url).search, "?rows=30");
    } finally {
      sandbox.restore();
    }
  });

  runTest("LATEST-FILTERS-EXPANSION-VERIFY-01 covers routes, lifecycle, presets, colors, and stale cleanup", async () => {
    const sandbox = createDomSandbox(
      "https://f95zone.to/sam/latest_alpha/#/cat=games/tags=1/notags=3",
    );
    const clock = createFakeClock();
    const previousSetTimeout = sandbox.window.setTimeout;
    const previousClearTimeout = sandbox.window.clearTimeout;
    sandbox.window.setTimeout = clock.setTimeout;
    sandbox.window.clearTimeout = clock.clearTimeout;

    const values = {
      settings: { enabled: true, state: { showPageButton: true } },
      presets: [],
    };
    const writes = [];
    let commandHandler = null;
    let dialogContent = null;
    let teardownAcknowledgements = 0;
    const core = {
      registerAddon() {
        return { ok: true };
      },
      updateStatus() {
        return { ok: true };
      },
      bindAddonCommands(handler) {
        commandHandler = handler;
        return () => {
          commandHandler = null;
        };
      },
      notifyTeardownComplete() {
        teardownAcknowledgements += 1;
        return { ok: true };
      },
      async getAddonAccess() {
        return { ok: true, value: { blocked: false } };
      },
      async invokeCoreAction(action, payload) {
        if (action === "storage.get") {
          return {
            ok: true,
            value: structuredClone(values[payload.key] ?? payload.defaultValue),
          };
        }
        if (action === "storage.set") {
          values[payload.key] = structuredClone(payload.value);
          writes.push(payload.key);
          return { ok: true };
        }
        if (action === "config.getTagPrefs") {
          return {
            ok: true,
            value: {
              tags: [
                { id: 1, name: "Preferred" },
                { id: 2, name: "Normal" },
                { id: 3, name: "Excluded" },
              ],
              preferredTags: [1],
              excludedTags: [3],
              markedTags: [2],
              color: {
                preferred: "#123456",
                preferredText: "#ffffff",
              },
            },
          };
        }
        if (action === "page.getContext") {
          return {
            ok: true,
            value: {
              pageScopes: location.pathname.startsWith("/sam/latest_alpha/")
                ? ["latest"]
                : [],
              pageType: "latest",
              url: location.href,
            },
          };
        }
        if (action === "observer.waitFor") {
          return {
            ok: Boolean(document.querySelector(payload.selector)),
          };
        }
        if (action === "ui.style.register" || action === "ui.style.unregister") {
          return { ok: true };
        }
        if (action === "ui.mount") {
          const host = document.createElement("div");
          host.innerHTML = payload.html;
          const mounted = host.firstElementChild;
          document
            .querySelector(".content-block_filter-title")
            ?.after(mounted);
          return { ok: true, value: { mountId: payload.mountId } };
        }
        if (action === "ui.unmount") {
          document.getElementById("f95ue-latest-filters-addon")?.remove();
          return { ok: true };
        }
        if (action === "ui.dialog.open") {
          dialogContent = document.createElement("div");
          dialogContent.id = "latest-filter-dialog-content";
          dialogContent.innerHTML = payload.html;
          document.body.append(dialogContent);
          return {
            ok: true,
            value: { contentId: dialogContent.id },
          };
        }
        if (action === "ui.dialog.close") {
          dialogContent?.remove();
          dialogContent = null;
          return { ok: true };
        }
        if (action === "ui.confirm") {
          return { ok: true, value: { confirmed: true } };
        }
        if (action === "toast.show") return { ok: true };
        return { ok: false, reason: "unsupported_action" };
      },
    };

    try {
      document.body.innerHTML = fixture;
      const { createLatestFiltersApp } = loadModule(
        "addons/latest-filters-addon/src/app/createLatestFiltersApp.js",
        { loader: { ".css": "text", ".html": "text" } },
      );
      const manifest = ADDON_MANIFEST.addons.find(
        ({ id }) => id === "latest-filters-addon",
      );
      const app = createLatestFiltersApp({
        core,
        runtime: {
          addonId: manifest.id,
          addonName: manifest.name,
          addonVersion: manifest.version,
          addonDescription: manifest.description,
          capabilities: manifest.capabilities,
          pageScopes: manifest.pageScopes,
          runtimeMode: manifest.runtimeMode,
          matches: manifest.matches,
        },
        gm: null,
      });

      await app.bootstrap();
      await settle();
      await clock.tick(0);
      await settle();
      assert.ok(commandHandler);
      assert.strictEqual(
        document.querySelectorAll("[data-f95ue-lf-reset]").length,
        4,
      );
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        1,
      );

      document.querySelector("[data-action='surprise']").click();
      assert.match(location.hash, /tags=[^/]*1/);
      assert.doesNotMatch(location.hash, /notags=1(?:,|\/|$)/);
      await settle();
      await settle();
      await clock.tick(0);
      await settle();

      document.querySelector("[data-action='toggle-panel']").click();
      await settle();
      assert.ok(dialogContent);
      const nameInput = dialogContent.querySelector("[data-role='save-name']");
      nameInput.value = "Surprise route";
      dialogContent.querySelector("[data-action='save-current']").click();
      await settle();
      await settle();
      assert.strictEqual(values.presets.length, 1);
      assert.match(
        dialogContent.querySelector("[data-role='current']").innerHTML,
        /Current applied filter/,
      );
      assert.match(dialogContent.innerHTML, /data-state="preferred"/);
      assert.match(dialogContent.innerHTML, /background:#123456/);

      location.hash = "#/cat=mods/tags=2";
      window.dispatchEvent(new window.Event("hashchange"));
      await settle();
      await settle();
      await clock.tick(0);
      await settle();
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        1,
      );

      document.querySelector("[data-action='toggle-panel']").click();
      await settle();
      dialogContent
        .querySelector("[data-action='update']")
        .click();
      await settle();
      await settle();
      assert.match(values.presets[0].url, /cat=mods/);

      location.hash = "#/cat=games";
      window.dispatchEvent(new window.Event("hashchange"));
      await settle();
      await settle();
      await clock.tick(0);
      document.querySelector("[data-action='toggle-panel']").click();
      await settle();
      dialogContent.querySelector("[data-action='apply']").click();
      assert.match(location.hash, /cat=mods/);

      window.dispatchEvent(new window.Event("hashchange"));
      await settle();
      await settle();
      await clock.tick(0);
      document.querySelector("[data-action='toggle-panel']").click();
      await settle();
      dialogContent.querySelector("[data-action='delete']").click();
      await settle();
      await settle();
      assert.deepStrictEqual(values.presets, []);
      assert.ok(writes.includes("presets"));
      assert.ok(
        writes.every((key) => key === "presets" || key === "settings"),
      );

      history.pushState({}, "", "/threads/example.1/");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await settle();
      await settle();
      await clock.tick(5000);
      assert.strictEqual(
        document.querySelectorAll("[data-f95ue-lf-reset]").length,
        0,
      );
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        0,
      );

      history.pushState({}, "", "/sam/latest_alpha/#/cat=games");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      window.dispatchEvent(new window.PopStateEvent("popstate"));
      await settle();
      await settle();
      await clock.tick(0);
      await settle();
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        1,
      );

      await app.getLifecycle().disable({ reason: "fixture-disable" });
      await clock.tick(10000);
      assert.strictEqual(
        document.querySelectorAll(
          "[data-f95ue-lf-reset], [data-action='surprise']",
        ).length,
        0,
      );
      await app.getLifecycle().enable({ reason: "fixture-enable" });
      await settle();
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        1,
      );
      await app.getLifecycle().refresh({ reason: "fixture-refresh" });
      await settle();
      assert.strictEqual(
        document.querySelectorAll("[data-action='surprise']").length,
        1,
      );
      await app.getLifecycle().teardown({ reason: "fixture-teardown" });
      await clock.tick(10000);
      assert.strictEqual(
        document.querySelectorAll(
          "[data-f95ue-lf-reset], [data-action='surprise']",
        ).length,
        0,
      );
      assert.deepStrictEqual(app.getResourceSnapshot(), []);
      assert.deepStrictEqual(app.getPendingOperationSnapshot(), []);
      assert.strictEqual(teardownAcknowledgements, 1);
    } finally {
      sandbox.window.setTimeout = previousSetTimeout;
      sandbox.window.clearTimeout = previousClearTimeout;
      sandbox.restore();
    }
  });
};
