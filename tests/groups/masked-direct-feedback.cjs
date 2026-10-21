"use strict";

module.exports = ({ assert, loadModule, runTest }) => {
  const base = "addons/masked-direct-addon/src/";
  function harness() {
    const { createHostFeedback, HOST_FEEDBACK_KEY } = loadModule(base + "domain/directDownload/feedback.js");
    let timestamp = 20000, sequence = 0;
    const listeners = new Map(), writes = [], toasts = [];
    const gm = { setValue: async (key, value) => {
      writes.push([key, value]);
      for (const callback of listeners.values()) callback(key, null, structuredClone(value), true);
    } };
    function tab({ focused = true, visible = true, enabled = true, hostname = "f95zone.to", showToast } = {}) {
      const state = { focused, visible, enabled };
      const events = new Map();
      const windowLike = { addEventListener: (event, fn) => events.set(event, fn), removeEventListener: (event) => events.delete(event) };
      const bus = createHostFeedback({
        GMApi: gm, now: () => timestamp, createId: () => `event-${++sequence}`,
        addValueChangeListener: (_key, callback) => { const id = ++sequence; listeners.set(id, callback); return id; },
        removeValueChangeListener: (id) => listeners.delete(id),
        locationLike: { hostname }, windowLike,
        documentLike: { get visibilityState() { return state.visible ? "visible" : "hidden"; }, hasFocus: () => state.focused },
        isEnabled: () => state.enabled,
        showToast: showToast || ((message, type) => toasts.push({ state, message, type })),
      });
      return { bus, state, events };
    }
    const event = (patch = {}) => ({ version: 1, id: `event-${++sequence}`, at: timestamp, host: "pixeldrain.com", outcome: "initiated", ...patch });
    return { tab, event, writes, toasts, listeners, key: HOST_FEEDBACK_KEY,
      advance: (ms) => { timestamp += ms; },
      emit: (value, remote = true) => { for (const callback of listeners.values()) callback(HOST_FEEDBACK_KEY, null, value, remote); },
    };
  }

  runTest("MASKED-DIRECT-FEEDBACK-01 publishes only bounded generic metadata", async () => {
    const h = harness(), origin = h.tab(), host = h.tab({ hostname: "pixeldrain.com" });
    origin.bus.start();
    assert.strictEqual(host.bus.start(), false);
    assert.strictEqual(await host.bus.publish({ host: "pixeldrain.com", outcome: "initiated", filename: "private.zip", href: "signed-url", requestId: "old" }), true);
    assert.deepStrictEqual(Object.keys(h.writes[0][1]).sort(), ["at", "host", "id", "outcome", "version"]);
    assert.strictEqual(h.writes[0][0], h.key);
    assert.strictEqual(h.toasts[0].message, "pixeldrain.com: Download initiated.");
    assert.doesNotMatch(JSON.stringify(h.writes), /private|signed-url|requestId|origin|close/);
    assert.strictEqual(await host.bus.publish({ host: "evil.invalid", outcome: "initiated" }), false);
    assert.strictEqual(await host.bus.publish({ host: "pixeldrain.com", outcome: "close-tab" }), false);
    origin.bus.stop();
  });

  runTest("MASKED-DIRECT-FEEDBACK-02 only the active F95 tab receives feedback without focus replay", () => {
    const h = harness(), a = h.tab(), b = h.tab({ focused: false });
    a.bus.start(); b.bus.start();
    const event = h.event(); h.emit(event);
    assert.strictEqual(h.toasts.length, 1);
    assert.strictEqual(h.toasts[0].state, a.state);
    a.state.focused = false; b.state.focused = true;
    h.emit(event);
    assert.strictEqual(h.toasts.length, 1, "focus change cannot replay an event consumed in either tab");
    h.emit(h.event({ outcome: "failure" }));
    assert.strictEqual(h.toasts.length, 2);
    assert.strictEqual(h.toasts[1].state, b.state);
    b.state.visible = false;
    const hidden = h.event(); h.emit(hidden);
    b.state.visible = true; h.emit(hidden);
    assert.strictEqual(h.toasts.length, 2);
    a.bus.stop(); b.bus.stop();
  });

  runTest("MASKED-DIRECT-FEEDBACK-03 rejects malformed stale future same-tab and disabled events", () => {
    const h = harness(), tab = h.tab(); tab.bus.start();
    for (const patch of [{ at: 0 }, { at: 999999 }, { at: "20000" }, { version: 9 }, { outcome: "close-tab" },
      { host: "not-a-host" }, { host: "secret.pixeldrain.com" }, { host: {} }, { id: "x".repeat(97) }, { id: { toString: null } }]) h.emit(h.event(patch));
    h.emit(h.event(), false);
    assert.strictEqual(h.toasts.length, 0);
    tab.state.enabled = false; h.emit(h.event());
    assert.strictEqual(h.toasts.length, 0);
    tab.bus.stop();
  });

  runTest("MASKED-DIRECT-FEEDBACK-04 no history reads reload replay or active listeners after teardown", async () => {
    const h = harness(), tab = h.tab();
    tab.bus.start(); tab.bus.start();
    assert.strictEqual(h.listeners.size, 1);
    const late = [...h.listeners.values()][0];
    tab.events.get("pagehide")();
    assert.strictEqual(h.listeners.size, 0);
    late(h.key, null, h.event(), true);
    assert.strictEqual(h.toasts.length, 0);
    await tab.bus.publish({ host: "pixeldrain.com", outcome: "initiated" });
    const reload = h.tab(); reload.bus.start();
    assert.strictEqual(h.toasts.length, 0, "mailbox value is never read on startup");
    reload.bus.stop();
  });

  runTest("MASKED-DIRECT-FEEDBACK-05 bursts are bounded without queues or timer-driven replay", () => {
    const h = harness(), tab = h.tab(); tab.bus.start();
    for (let i = 0; i < 100; i += 1) h.emit(h.event());
    assert.strictEqual(h.toasts.length, 3);
    h.advance(2000); h.emit(h.event({ outcome: "challenge" }));
    assert.strictEqual(h.toasts.length, 4);
    assert.strictEqual(h.toasts[3].type, "warning");
    tab.bus.stop();
  });

  runTest("MASKED-DIRECT-FEEDBACK-06 storage and toast failures remain isolated", async () => {
    const h = harness(), tab = h.tab({ showToast: () => Promise.reject(new Error("core gone")) });
    tab.bus.start(); h.emit(h.event()); await Promise.resolve();
    tab.bus.stop();
    const { createHostFeedback } = loadModule(base + "domain/directDownload/feedback.js");
    const bus = createHostFeedback({ GMApi: { setValue: async () => { throw new Error("storage failed"); } },
      documentLike: {}, windowLike: {}, locationLike: { hostname: "pixeldrain.com" } });
    assert.strictEqual(await bus.publish({ host: "pixeldrain.com", outcome: "initiated" }), false);
    assert.strictEqual(bus.start(), false);
  });

  runTest("MASKED-DIRECT-FEEDBACK-07 failed feedback cannot prevent close or publish false success", async () => {
    const { createDirectDownloadFlowController } = loadModule(base + "domain/directDownload/flowController.js");
    const events = [], policy = { effectiveAutomateRegardless: true, autoCloseTabs: true };
    let closes = 0, callback;
    const flow = createDirectDownloadFlowController({ addonId: "test", diagnostics: { warn() {} },
      getPolicy: async () => policy, closeTab: () => { closes += 1; },
      setTimeoutFn: (fn) => { callback = fn; return 1; },
      publishFeedback: (event) => { events.push(event); throw new Error("failed feedback"); },
    });
    const decision = { host: "pixeldrain.com", policy };
    flow.createHostExecutionContext(decision).reportAddonHealthy();
    await Promise.resolve(); assert.strictEqual(events.length, 0);
    flow.createHostExecutionContext(decision).reportAddonHealthy({ downloadTriggered: true });
    await Promise.resolve(); await callback(); await Promise.resolve();
    assert.strictEqual(closes, 1);
    assert.strictEqual(events[0].outcome, "initiated");
    const failed = flow.createHostExecutionContext(decision);
    await failed.notifyMainFailure("host", "secret signed URL");
    assert.strictEqual(events[1].outcome, "failure");
    assert.doesNotMatch(JSON.stringify(events), /secret|signed/);
  });

  runTest("MASKED-DIRECT-FEEDBACK-08 distinguishes ordinary F95 feedback pages from intermediate and retired routes", () => {
    const { classifyMaskedDirectContext } = loadModule(base + "app/context.js");
    assert.strictEqual(classifyMaskedDirectContext({ hostname: "f95zone.to", pathname: "/sam/latest_alpha/" }).kind, "f95-core");
    assert.strictEqual(classifyMaskedDirectContext({ hostname: "f95zone.to", pathname: "/dl/123/" }).kind, "f95-continue");
    for (const pathname of ["/masked", "/masked/test", "/dl", "/dl/not-an-id/"]) {
      assert.strictEqual(classifyMaskedDirectContext({ hostname: "f95zone.to", pathname }).kind, "unsupported");
    }
  });

  runTest("MASKED-DIRECT-FEEDBACK-09 BFCache resumption reattaches without replay and disable tears down", async () => {
    const h = harness(), tab = h.tab();
    tab.bus.start();
    tab.events.get("pagehide")();
    assert.strictEqual(h.listeners.size, 0);
    await tab.bus.publish({ host: "pixeldrain.com", outcome: "initiated" });
    tab.events.get("pageshow")();
    assert.strictEqual(h.listeners.size, 1);
    assert.strictEqual(h.toasts.length, 0);
    h.emit(h.event());
    assert.strictEqual(h.toasts.length, 1);
    const { createMaskedDirectPageBehavior } = loadModule(base + "app/pageBehavior.js");
    let enabled = false;
    const page = createMaskedDirectPageBehavior({ clearOwnedResources: tab.bus.stop, feedback: tab.bus,
      getIsEnabled: () => enabled });
    await page.apply();
    assert.strictEqual(h.listeners.size, 0);
    assert.strictEqual(tab.events.size, 0);
    enabled = true;
    await page.apply();
    assert.strictEqual(h.listeners.size, 1);
    tab.bus.stop();
  });
};
