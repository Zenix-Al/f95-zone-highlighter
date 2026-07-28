"use strict";

module.exports = function registerThreadUtilityGolden(context) {
  const { ROOT, assert, fs, loadModule, path, runTest } = context;

  function read(relativePath) {
    const absolutePath = path.join(ROOT, relativePath);
    assert.ok(
      fs.existsSync(absolutePath),
      `THREAD-UTILITY-GOLDEN-01 missing Golden path: ${relativePath}`,
    );
    return fs.readFileSync(absolutePath, "utf8");
  }

  function assertOrdered(source, labels) {
    let previous = -1;
    for (const [label, fragment] of labels) {
      const index = source.indexOf(fragment);
      assert.ok(
        index >= 0,
        `THREAD-UTILITY-GOLDEN-01 missing contract: ${label}`,
      );
      assert.ok(
        index > previous,
        `THREAD-UTILITY-GOLDEN-01 ordering violation: ${label}`,
      );
      previous = index;
    }
  }

  runTest(
    "THREAD-UTILITY-GOLDEN-01 freezes bootstrap metadata and access ordering",
    () => {
      const main = read("addons/example-addon/src/main.js");
      for (const constant of [
        "__ADDON_ID__",
        "__ADDON_NAME__",
        "__ADDON_VERSION__",
        "__ADDON_DESCRIPTION__",
        "__ADDON_CAPABILITIES__",
        "__ADDON_REQUIRES_CORE__",
        "__ADDON_PAGE_SCOPES__",
        "__ADDON_RUNTIME_MODE__",
        "__ADDON_MATCHES__",
      ]) {
        assert.match(
          main,
          new RegExp(`\\b${constant}\\b`),
          `THREAD-UTILITY-GOLDEN-01 missing injected metadata: ${constant}`,
        );
      }
      assertOrdered(main, [
        ["core ping", "await waitForCorePing(core)"],
        ["core-required failure guard", 'runtime.runtimeMode === "core-required"'],
        ["application bootstrap", "await app.bootstrap()"],
      ]);

      const app = read(
        "addons/example-addon/src/app/createExampleAddonApp.js",
      );
      assertOrdered(app.slice(app.indexOf("async function bootstrap()")), [
        ["command binding", "commandController.bind()"],
        ["runtime registration", "registration.register()"],
        ["access request", "await getAddonAccess(core)"],
        ["blocked access guard", "access.value?.blocked"],
        ["persisted disabled guard", "access.value?.enabled === false"],
        ["settings load", "refreshSettings()"],
        ["lifecycle enable", "await lifecycle.enable()"],
      ]);
    },
  );

  runTest(
    "THREAD-UTILITY-GOLDEN-01 freezes required command routing",
    () => {
      const commands = read("addons/example-addon/src/app/commands.js");
      for (const [command, target] of [
        ["enable", "lifecycle.enable(context)"],
        ["disable", "lifecycle.disable(context)"],
        ["refresh", "lifecycle.refresh(context)"],
        ["before-page-change", "lifecycle.invalidate("],
        ["dialog-closed", "onDialogClosed("],
        ["teardown", "lifecycle.teardown(context)"],
      ]) {
        assert.match(
          commands,
          new RegExp(`case "${command}":[\\s\\S]*?${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
          `THREAD-UTILITY-GOLDEN-01 missing command route: ${command}`,
        );
      }
    },
  );

  runTest(
    "THREAD-UTILITY-GOLDEN-01 freezes required thin core API wrappers",
    () => {
      const expected = new Map([
        ["addons/example-addon/src/api/meta.js", ["addon.access"]],
        ["addons/example-addon/src/api/page.js", ["page.getContext"]],
        [
          "addons/example-addon/src/api/storage.js",
          ["storage.get", "storage.set", "config.getTagPrefs"],
        ],
        [
          "addons/example-addon/src/api/ui/mount.js",
          ["ui.mount", "ui.update", "ui.unmount"],
        ],
        [
          "addons/example-addon/src/api/ui/dialog.js",
          ["ui.dialog.open", "ui.dialog.update", "ui.dialog.close"],
        ],
        [
          "addons/example-addon/src/api/ui/style.js",
          ["ui.style.register", "ui.style.unregister"],
        ],
      ]);
      for (const [relativePath, actions] of expected) {
        const source = read(relativePath);
        for (const action of actions) {
          assert.ok(
            source.includes(`"${action}"`),
            `THREAD-UTILITY-GOLDEN-01 missing wrapper: ${action}`,
          );
        }
      }
      const storage = read("addons/example-addon/src/api/storage.js");
      assert.match(storage, /key:\s*String\(key\s*\|\|\s*""\)/);
    },
  );

  runTest(
    "THREAD-UTILITY-GOLDEN-01 freezes composed-path ownership and cleanup order",
    () => {
      const bindings = read("addons/example-addon/src/ui/bindings.js");
      assert.match(bindings, /event\?\.composedPath/);
      assert.match(bindings, /data-role/);
      assertOrdered(bindings, [
        ["listener duplicate guard", "if (dockClickHandler)"],
        ["listener bind", 'window.addEventListener("click", dockClickHandler, true)'],
        [
          "listener unbind",
          'window.removeEventListener("click", dockClickHandler, true)',
        ],
      ]);

      const ui = read("addons/example-addon/src/app/uiController.js");
      const disable = ui.slice(
        ui.indexOf("async function disable("),
        ui.indexOf("async function enable()"),
      );
      const closeIndex = disable.indexOf("closeExampleDialog(reason)");
      const unmountIndex = disable.indexOf("unmountDockLauncher()");
      const styleIndex = disable.indexOf("unregisterStyle(core");
      assert.ok(
        closeIndex >= 0 && unmountIndex > closeIndex && styleIndex > unmountIndex,
        "THREAD-UTILITY-GOLDEN-01 cleanup order must close, unmount, then unregister style",
      );
    },
  );

  runTest(
    "THREAD-UTILITY-GOLDEN-01 lifecycle invalidates stale work and acknowledges teardown once",
    async () => {
      const { createAddonRuntimeLifecycle } = loadModule(
        "addons/shared/runtimeLifecycle.js",
      );
      let startRefresh;
      let finishRefresh;
      let staleCommits = 0;
      let cleanupCalls = 0;
      let acknowledgments = 0;
      const refreshStarted = new Promise((resolve) => {
        startRefresh = resolve;
      });
      const refreshGate = new Promise((resolve) => {
        finishRefresh = resolve;
      });
      const lifecycle = createAddonRuntimeLifecycle({
        addonId: "thread-utility-golden-fixture",
        onRefresh: async ({ isCurrent }) => {
          startRefresh();
          await refreshGate;
          if (isCurrent()) staleCommits += 1;
          return { ok: true };
        },
        onTeardownAcknowledged: async () => {
          acknowledgments += 1;
        },
      });
      lifecycle.registerResource(
        "owned-fixture",
        () => {
          cleanupCalls += 1;
        },
        "fixture",
      );

      await lifecycle.enable();
      const refresh = lifecycle.refresh();
      await refreshStarted;
      const beforeInvalidation = lifecycle.getGeneration();
      lifecycle.invalidate("route-change", { pathname: "/threads/next.2/" });
      finishRefresh();
      await refresh;
      assert.strictEqual(staleCommits, 0);
      assert.ok(lifecycle.getGeneration() > beforeInvalidation);

      const first = lifecycle.teardown("test");
      const second = lifecycle.teardown("duplicate");
      assert.strictEqual(first, second);
      await Promise.all([first, second]);
      assert.strictEqual(cleanupCalls, 1);
      assert.strictEqual(acknowledgments, 1);
      assert.strictEqual(lifecycle.getSnapshot().state, "terminated");
      assert.strictEqual(lifecycle.getSnapshot().teardownAcknowledged, true);
    },
  );
};
