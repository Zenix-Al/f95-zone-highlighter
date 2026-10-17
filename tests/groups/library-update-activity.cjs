"use strict";

module.exports = ({ assert, loadModule, runTest, sanitizeAddonCss, Window, fs, path, ROOT, createDomSandbox }) => {
  const activityPath = "addons/library-addon/src/library/autoUpdateActivity.js";

  runTest("LIBRARY-UPDATE-ACTIVITY-01 distinguishes work waiting failures and completion", () => {
    const { getAutoUpdateActivity } = loadModule(activityPath);
    assert.strictEqual(getAutoUpdateActivity(null), "idle");
    for (const status of ["preparing", "recovering", "running"]) {
      assert.strictEqual(getAutoUpdateActivity({ status }, { running: true }), "working");
      assert.strictEqual(getAutoUpdateActivity({ status }), "idle", "stale persisted running is not live work");
    }
    for (const status of ["paused", "waiting"]) {
      assert.strictEqual(getAutoUpdateActivity({ status }, { running: true }), "idle");
    }
    for (const blockedReason of ["challenge_page", "rate_limited"]) {
      assert.strictEqual(getAutoUpdateActivity({ status: "waiting", blockedReason, blockedUntil: 200 }, { currentTime: 100 }), "waiting");
      assert.strictEqual(getAutoUpdateActivity({ status: "paused", blockedReason, blockedUntil: 200 }, { currentTime: 100, reason: "paused" }), "waiting");
      assert.strictEqual(getAutoUpdateActivity({ status: "waiting", blockedReason, blockedUntil: 200 }, { currentTime: 201, reason: "site_blocked" }), "idle");
    }
    assert.strictEqual(getAutoUpdateActivity({ status: "waiting", blockedReason: "challenge_page" }), "idle", "no active deadline means no warning");
    assert.strictEqual(getAutoUpdateActivity({ status: "waiting", dailyAttempted: 100, checksPerDay: 100 }, { reason: "daily_allowance_exhausted" }), "idle");
    assert.strictEqual(getAutoUpdateActivity({ status: "running", failed: 20 }, { running: true }), "working");
    assert.strictEqual(getAutoUpdateActivity({ status: "completed", failed: 20 }, { running: true }), "idle");
    assert.strictEqual(getAutoUpdateActivity(null, { reason: "run_failed" }), "error");
    assert.strictEqual(getAutoUpdateActivity({ status: "running" }, { reason: "idb_error" }), "error");
    assert.strictEqual(getAutoUpdateActivity({ status: "running" }, { reason: "lease_owned" }), "idle");
    assert.strictEqual(getAutoUpdateActivity({ status: "running" }, { reason: "lease_owned", leaseActive: true }), "working");
    assert.strictEqual(getAutoUpdateActivity({ status: "recovering" }, { recoveryPending: true, leaseActive: true }), "working");
    assert.strictEqual(getAutoUpdateActivity({ status: "waiting" }, { leaseActive: true }), "idle");
    assert.strictEqual(getAutoUpdateActivity({ status: "completed" }, { leaseActive: true }), "idle");
    assert.strictEqual(getAutoUpdateActivity({ status: "completed" }, { reason: "not_due" }), "idle");
    assert.strictEqual(getAutoUpdateActivity(null, { reason: "paused" }), "idle");
  });

  runTest("LIBRARY-UPDATE-ACTIVITY-01 patches status without disabling or replacing buttons", () => {
    const { patchUpdateActivity } = loadModule(activityPath);
    const window = new Window();
    try {
      const button = window.document.createElement("button");
      button.textContent = "Auto update";
      let clicked = 0;
      button.addEventListener("click", () => { clicked += 1; });
      for (const activity of ["working", "waiting", "error", "idle"]) {
        patchUpdateActivity(button, activity);
        assert.strictEqual(button.dataset.f95ueActivity, activity);
        assert.match(button.title, /Auto update/);
        assert.strictEqual(button.disabled, false);
        assert.strictEqual(button.textContent, "Auto update");
        button.click();
      }
      assert.strictEqual(clicked, 4);
    } finally { window.happyDOM.abort(); }
  });

  runTest("LIBRARY-UPDATE-ACTIVITY-02 keeps live previous-process work green only until lease expiry", async () => {
    const { createAutoUpdateScheduler } = loadModule("addons/library-addon/src/library/autoUpdateScheduler.js");
    let timestamp = 100;
    let cycle = { cycleId: "remote", status: "running" };
    const scheduler = createAutoUpdateScheduler({
      owner: "this-tab", now: () => timestamp,
      repository: {
        getConfig: async () => ({ enabled: true, intervalMs: 86400000 }),
        getLease: async () => ({ owner: "other-tab", expiresAt: 1100 }),
      },
      queueRuntime: { getCycle: async () => cycle },
    });
    await scheduler.start();
    assert.strictEqual(scheduler.snapshot().recoveryPending, true);
    assert.strictEqual(scheduler.snapshot().activity, "working");
    assert.strictEqual((await scheduler.run()).reason, "lease_owned");
    assert.strictEqual(scheduler.snapshot().activity, "working");
    timestamp = 1101;
    assert.strictEqual(scheduler.snapshot().activity, "idle", "an expired lease is not evidence of ongoing work");
    cycle = { ...cycle, status: "completed" };
    await scheduler.start();
    assert.strictEqual(scheduler.snapshot().activity, "idle");
    await scheduler.stop();
  });

  runTest("LIBRARY-UPDATE-OWNERSHIP-01 rearming an active local worker does not wait for itself", async () => {
    const { createAutoUpdateScheduler } = loadModule("addons/library-addon/src/library/autoUpdateScheduler.js");
    const { derivePrimaryUpdateAction, patchAutoUpdateView } = loadModule("addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js");
    let lease = null;
    let timestamp = 100;
    let cycle = { cycleId: "local", status: "running", nextRunAt: 5000 };
    let release;
    let entered;
    const gate = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { entered = resolve; });
    const scheduler = createAutoUpdateScheduler({
      owner: "this-tab", now: () => timestamp, random: () => 0,
      repository: {
        getConfig: async () => ({ enabled: true, intervalMs: 86400000, leaseTtlMs: 90000, jitterMs: 0 }),
        getLease: async () => lease,
        putLease: async (value) => { lease = value; },
        deleteLease: async () => { lease = null; },
        getLegacyQueueMetadata: async () => ({ complete: true }),
      },
      queueRuntime: {
        getCycle: async () => cycle,
        async runWorker({ onCycleChange }) {
          onCycleChange(cycle);
          entered();
          await gate;
          cycle = { ...cycle, status: "completed" };
          return { ok: true, cycle };
        },
      },
    });
    const task = scheduler.run();
    try {
      await started;
      for (let i = 0; i < 3; i += 1) {
        lease = { ...lease, expiresAt: timestamp + 90000 };
        await scheduler.start();
        assert.strictEqual(scheduler.snapshot().running, true);
        assert.strictEqual(scheduler.snapshot().recoveryPending, false);
        assert.strictEqual(scheduler.snapshot().recoveryAt, 0);
        assert.strictEqual(scheduler.snapshot().activity, "working");
        assert.strictEqual((await scheduler.run()).reason, "already_running");
        timestamp += 90001;
      }
      const runtime = { running: true, recoveryPending: true, recoveryAt: 9999 };
      assert.strictEqual(derivePrimaryUpdateAction(cycle, runtime).label, "Updating...");
      const nodes = {};
      const root = { querySelector(selector) {
        if (!nodes[selector]) nodes[selector] = { setAttribute() {}, dataset: {} };
        return nodes[selector];
      } };
      patchAutoUpdateView(root, cycle, runtime);
      assert.strictEqual(nodes['[data-role="state"]'].textContent, "RUNNING");
      assert.strictEqual(nodes['[data-role="primaryAction"]'].textContent, "Updating...");
    } finally {
      release();
      await task;
      await scheduler.stop();
    }
  });

  runTest("LIBRARY-UPDATE-ACTIVITY-01 manager animation survives core sanitization and respects reduced motion", () => {
    const { getManagerStyleText } = loadModule("addons/library-addon/src/ui/components/manager/dialogShell.js", {
      loader: { ".css": "text", ".html": "text" },
    });
    const css = getManagerStyleText();
    const safe = sanitizeAddonCss("library-addon", css);
    assert.strictEqual(safe.ok, true, safe.reason);
    assert.match(safe.cssText, /@keyframes f95ue-library-addon-activity-pulse/);
    assert.match(safe.cssText, /prefers-reduced-motion: reduce/);
    const coreCss = fs.readFileSync(path.join(ROOT, "src/ui/assets/startup.css"), "utf8");
    for (const text of [safe.cssText, coreCss]) {
      assert.match(text, /data-f95ue-activity="working"/);
      assert.match(text, /data-f95ue-activity="waiting"/);
      assert.match(text, /data-f95ue-activity="error"/);
      assert.match(text, /animation: none/);
    }
  });

  runTest("LIBRARY-UPDATE-ACTIVITY-01 scheduler emits settled activity and supports unsubscribe", async () => {
    const { createAutoUpdateScheduler } = loadModule("addons/library-addon/src/library/autoUpdateScheduler.js");
    let lease = null;
    let cycle = { cycleId: "activity", status: "running", nextRunAt: 1 };
    const queueRuntime = {
      getCycle: async () => cycle,
      async runWorker({ onCycleChange }) {
        onCycleChange(cycle);
        cycle = { ...cycle, status: "completed", failed: 1 };
        onCycleChange(cycle);
        return { ok: true, cycle };
      },
    };
    const scheduler = createAutoUpdateScheduler({
      owner: "activity-tab", now: () => 100, random: () => 0, queueRuntime,
      repository: {
        getConfig: async () => ({ enabled: true, jitterMs: 0, intervalMs: 86400000, leaseTtlMs: 90000 }),
        getLease: async () => lease,
        putLease: async (value) => { lease = value; },
        deleteLease: async () => { lease = null; },
        getLegacyQueueMetadata: async () => ({ complete: true }),
      },
    });
    const observed = [];
    const unsubscribe = scheduler.subscribe(() => observed.push(scheduler.snapshot().activity));
    assert.strictEqual((await scheduler.run()).ok, true);
    assert.ok(observed.includes("working"));
    assert.strictEqual(observed.at(-1), "idle");
    queueRuntime.runWorker = async () => { throw new Error("storage failure"); };
    cycle = { ...cycle, status: "running" };
    await scheduler.run();
    assert.strictEqual(observed.at(-1), "error");
    unsubscribe();
    const count = observed.length;
    await scheduler.stop();
    assert.strictEqual(observed.length, count);
  });

  runTest("LIBRARY-UPDATE-ACTIVITY-01 dock updates only on transitions and unsubscribes on unmount", async () => {
    const sandbox = createDomSandbox();
    try {
      const { createLibraryDockController } = loadModule("addons/library-addon/src/app/dockController.js", {
        loader: { ".html": "text", ".css": "text" },
      });
      const resources = new Map();
      const listeners = new Set();
      const calls = [];
      let activity = "working";
      const lifecycle = {
        releaseResource(id) { resources.get(id)?.(); resources.delete(id); },
        registerResource(id, cleanup) { resources.set(id, cleanup); },
      };
      const dock = createLibraryDockController({
        runtime: { addonId: "library-addon" }, library: {},
        state: { enabled: true, showPageButtons: true }, getLifecycle: () => lifecycle,
        autoUpdateScheduler: {
          snapshot: () => ({ activity }),
          subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
        },
        core: {
          async invokeCoreAction(action, payload) {
            calls.push({ action, payload });
            return action === "page.getContext" ? { ok: true, value: { pageScopes: ["latest"] } } : { ok: true };
          },
        },
      });
      const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
      await dock.refresh();
      assert.match(calls.find((c) => c.action === "ui.mount").payload.html, /data-f95ue-activity="working"/);
      assert.strictEqual(listeners.size, 1);
      listeners.forEach((callback) => callback());
      await flush();
      assert.strictEqual(calls.filter((c) => c.action === "ui.update").length, 0);
      activity = "waiting";
      listeners.forEach((callback) => callback());
      await flush();
      assert.match(calls.find((c) => c.action === "ui.update").payload.html, /data-f95ue-activity="waiting"/);
      // Queue another transition then unmount before its promise executes.
      activity = "error";
      listeners.forEach((callback) => callback());
      await dock.unmount();
      await flush();
      assert.strictEqual(listeners.size, 0);
      assert.strictEqual(calls.filter((c) => c.action === "ui.update").length, 1);
    } finally { sandbox.restore(); }
  });
};
