"use strict";

module.exports = function registerThreadUtilityLifecycle(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function runtime() {
    return {
      addonId: "thread-utility-addon",
      addonName: "F95UE Thread Utility Add-on",
      addonVersion: "0.1.0",
      addonDescription: "Thread utility lifecycle fixture",
      capabilities: ["page", "storage", "toast", "ui.style", "ui.mount", "ui.dialog"],
      requiresCore: true,
      pageScopes: ["thread"],
      runtimeMode: "core-required",
      matches: ["*://f95zone.to/threads/*"],
    };
  }

  function deferred() {
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  }

  function createCore({
    dialogOpen = null,
    failDialogOnce = false,
    failStyleOnce = false,
    settings = [{ showLauncher: true }],
  } = {}) {
    const actions = [];
    let commandHandler = null;
    let styleShouldFail = failStyleOnce;
    let dialogShouldFail = failDialogOnce;
    let settingsRead = 0;
    const core = {
      actions,
      registerAddon(descriptor) {
        actions.push({ action: "register", descriptor });
        return { ok: true };
      },
      updateStatus(status, statusMessage) {
        actions.push({ action: "status", status, statusMessage });
        return { ok: true };
      },
      bindAddonCommands(handler) {
        commandHandler = handler;
        return () => {
          commandHandler = null;
        };
      },
      notifyTeardownComplete(reason) {
        actions.push({ action: "teardown-ack", reason });
        return { ok: true };
      },
      async invokeCoreAction(action, payload) {
        actions.push({ action, payload });
        if (action === "addon.access") {
          return { ok: true, value: { blocked: false, enabled: true } };
        }
        if (action === "page.getContext") {
          return { ok: true, value: { pageScopes: ["f95zone", "thread"], pageType: "thread" } };
        }
        if (action === "storage.get") {
          const value = settings[Math.min(settingsRead, settings.length - 1)];
          settingsRead += 1;
          return { ok: true, value };
        }
        if (action === "ui.style.register" && styleShouldFail) {
          styleShouldFail = false;
          return { ok: false, reason: "style_fixture_failure" };
        }
        if (action === "ui.dialog.open" && dialogShouldFail) {
          dialogShouldFail = false;
          return { ok: false, reason: "dialog_fixture_failure" };
        }
        if (action === "ui.dialog.open" && dialogOpen) return dialogOpen.promise;
        return { ok: true, value: {} };
      },
      command(detail) {
        commandHandler?.(detail);
      },
    };
    return core;
  }

  function createApp(core) {
    const { createThreadUtilityApp } = loadModule(
      "addons/thread-utility-addon/src/app/createThreadUtilityApp.js",
      { loader: { ".css": "text" } },
    );
    return createThreadUtilityApp({ core, runtime: runtime() });
  }

  function clickLauncher() {
    const root = document.createElement("div");
    root.dataset.role = "threadUtilityLauncher";
    const button = document.createElement("button");
    button.dataset.threadUtilityAction = "open-palette";
    root.appendChild(button);
    document.body.appendChild(root);
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  }

  function flush() {
    return new Promise((resolve) => setImmediate(resolve));
  }

  runTest("THREAD-UTILITY-LIFECYCLE-01 re-enables one launcher and one listener", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore();
      const app = createApp(core);
      await app.bootstrap();
      await app.getLifecycle().disable("cycle-disable");
      await app.getLifecycle().enable("cycle-enable");
      clickLauncher();
      await flush();
      assert.strictEqual(core.actions.filter(({ action }) => action === "ui.mount").length, 2);
      assert.strictEqual(core.actions.filter(({ action }) => action === "ui.unmount").length, 1);
      assert.strictEqual(core.actions.filter(({ action }) => action === "ui.dialog.open").length, 1);
      await app.getLifecycle().teardown("cycle-complete");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 rejects a stale A-B-C dialog commit", async () => {
    const sandbox = createDomSandbox();
    try {
      const pendingOpen = deferred();
      const core = createCore({ dialogOpen: pendingOpen });
      const app = createApp(core);
      await app.bootstrap();
      clickLauncher();
      await flush();
      core.command({
        command: "before-page-change",
        reason: "route-a-b",
        routeContext: { pathname: "/threads/b.2/" },
      });
      core.command({
        command: "before-page-change",
        reason: "route-b-c",
        routeContext: { pathname: "/threads/c.3/" },
      });
      pendingOpen.resolve({ ok: true, value: { dialogId: "thread-utility-palette" } });
      await flush();
      await flush();
      assert.strictEqual(app.getState().ui.dialogOpen, false);
      assert.ok(
        core.actions.some(
          ({ action, payload }) =>
            action === "ui.dialog.close" && payload.reason === "stale-dialog-open",
        ),
      );
      assert.strictEqual(app.getLifecycle().getSnapshot().routeContext.pathname, "/threads/c.3/");
      await app.getLifecycle().teardown("route-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 synchronizes external dialog closure", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore();
      const app = createApp(core);
      await app.bootstrap();
      clickLauncher();
      await flush();
      assert.strictEqual(app.getState().ui.dialogOpen, true);
      for (const reason of ["escape", "backdrop", "replacement", "api-close"]) {
        core.command({
          command: "dialog-closed",
          dialogId: "thread-utility-palette",
          reason,
        });
        assert.strictEqual(app.getState().ui.dialogOpen, false);
      }
      await app.getLifecycle().teardown("dialog-close-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 rolls back failed style registration", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore({ failStyleOnce: true });
      const app = createApp(core);
      await assert.rejects(app.bootstrap(), /Style registration failed/);
      assert.strictEqual(app.getState().enabled, false);
      assert.deepStrictEqual(app.getState().ui, {
        styleRegistered: false,
        launcherMounted: false,
        dialogOpen: false,
        dialogOpening: false,
        dialogGeneration: null,
        tagsExpanded: false,
        openContentSection: null,
      });
      assert.strictEqual(core.actions.filter(({ action }) => action === "ui.mount").length, 0);
      assert.deepStrictEqual(await app.getLifecycle().enable("style-retry"), { ok: true });
      assert.strictEqual(app.getState().enabled, true);
      await app.getLifecycle().teardown("style-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 rolls back a failed dialog open for retry", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore({ failDialogOnce: true });
      const app = createApp(core);
      await app.bootstrap();
      clickLauncher();
      await flush();
      assert.strictEqual(app.getState().ui.dialogOpen, false);
      assert.strictEqual(app.getState().ui.dialogOpening, false);
      clickLauncher();
      await flush();
      assert.strictEqual(app.getState().ui.dialogOpen, true);
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "ui.dialog.open").length,
        2,
      );
      await app.getLifecycle().teardown("dialog-retry-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 refreshes settings and cleans an open dialog", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore({ settings: [{ showLauncher: true }, { showLauncher: false }] });
      const app = createApp(core);
      await app.bootstrap();
      clickLauncher();
      await flush();
      assert.strictEqual(app.getState().ui.dialogOpen, true);
      await app.getLifecycle().refresh("settings-refresh");
      assert.strictEqual(app.getState().ui.launcherMounted, false);
      await app.getLifecycle().disable("open-dialog-disable");
      assert.strictEqual(app.getState().enabled, false);
      assert.strictEqual(app.getState().ui.dialogOpen, false);
      assert.strictEqual(app.getState().ui.styleRegistered, false);
      assert.ok(core.actions.some(({ action }) => action === "ui.dialog.close"));
      assert.ok(core.actions.some(({ action }) => action === "ui.style.unregister"));
      await app.getLifecycle().teardown("cleanup-test");
    } finally {
      sandbox.restore();
    }
  });

  runTest("THREAD-UTILITY-LIFECYCLE-01 acknowledges repeated teardown once", async () => {
    const sandbox = createDomSandbox();
    try {
      const core = createCore();
      const app = createApp(core);
      await app.bootstrap();
      const first = app.getLifecycle().teardown("terminal-first");
      const second = app.getLifecycle().teardown("terminal-second");
      assert.strictEqual(first, second);
      assert.deepStrictEqual(await first, { ok: true });
      assert.strictEqual(
        core.actions.filter(({ action }) => action === "teardown-ack").length,
        1,
      );
      assert.strictEqual(app.getLifecycle().isTeardownAcknowledged(), true);
    } finally {
      sandbox.restore();
    }
  });
};
