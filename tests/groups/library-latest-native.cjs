"use strict";
module.exports = ({ assert, loadModule, runTest, createDomSandbox, dispatchPageTransition }) => {
  const fixture = require("../fixtures/libraryLatestNative.cjs");
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
  const local = () => ({ status: "ok", msg: { data: [{ thread_id: 42, title: "<script>data only</script>", creator: "Dev", version: "1", tags: [7], prefixes: [], cover: "", screens: [], views: null, likes: null, rating: null, ts: null, date: "", watched: false, ignored: false, new: false }], count: 1, pagination: { page: 1, total: 1 } } });

  runTest("LIBRARY-LATEST-NATIVE-01 owns the toggle beside Refresh and substitutes only active native list requests", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games/page=8/search=Game");
    const native = fixture(sandbox.window);
    const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
    const originalAjax = native.$.ajax, originalFetch = sandbox.window.fetch;
    let view;
    const received = [];
    sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1", success: (data) => received.push(data) }));
    try {
      view = createLibraryLatestView({ query: async () => local(), getWindow: () => sandbox.window });
      const button = sandbox.document.querySelector("#f95ue-library-latest-only");
      assert.strictEqual(button.nextElementSibling.nextElementSibling.id, "controls_auto-refresh");
      button.click(); await settle();
      assert.strictEqual(received[0].msg.data[0].thread_id, 42);
      assert.strictEqual(received[0].msg.data[0].views, "—");
      assert.strictEqual(native.requests.length, 1, "one ordinary site request, not a crawler");
      view.invalidate(); view.invalidate();
      assert.strictEqual(native.requests.length, 1, "background commits must not double API traffic");
      assert.match(button.title, /Library changed/);
      button.click(); await settle();
      assert.match(sandbox.window.location.hash, /page=8\/search=Game/);
      assert.strictEqual(received.at(-1).msg.data[0].thread_id, 1);
      assert.strictEqual(native.requests.length, 2);
      view.stop();
      assert.strictEqual(native.$.ajax, originalAjax); assert.strictEqual(sandbox.window.fetch, originalFetch);
      assert.strictEqual(sandbox.document.querySelector("#f95ue-library-latest-only"), null);
    } finally { view?.stop({ redraw: false }); sandbox.restore(); }
  });

  runTest("LIBRARY-LATEST-NATIVE-02 stale local reads and HTTP failures cannot paint a successful collection", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games");
    const native = fixture(sandbox.window);
    const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
    let resolve, view, delayed = true, failures = 0;
    const received = [];
    sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1", success: (data) => received.push(data), error: () => failures++ }));
    try {
      view = createLibraryLatestView({ query: () => delayed ? new Promise((done) => { resolve = done; }) : Promise.resolve(local()), getWindow: () => sandbox.window });
      const button = sandbox.document.querySelector("#f95ue-library-latest-only");
      button.click(); await Promise.resolve();
      button.click(); resolve(local()); await settle();
      assert.deepStrictEqual(received.map((r) => r.msg.data[0].thread_id), [1]);
      assert.strictEqual(native.requests.length, 1, "canceled preparation never sends its old request");
      delayed = false; native.setStatus(403); button.click(); await settle();
      assert.strictEqual(failures, 1);
      assert.strictEqual(received.length, 1, "challenge status is not rewritten to success");
      assert.match(button.title, /failed/);
    } finally { view?.stop({ redraw: false }); sandbox.restore(); }
  });

  runTest("LIBRARY-LATEST-NATIVE-03 scopes the recovery mirror away from updater fetches", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games");
    const native = fixture(sandbox.window);
    const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
    let view;
    sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1" }));
    try {
      view = createLibraryLatestView({ query: async () => local(), getWindow: () => sandbox.window });
      sandbox.document.querySelector("#f95ue-library-latest-only").click(); await settle();
      const url = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=list&cat=games&page=1";
      const mirrored = await sandbox.window.fetch(url, { credentials: "same-origin" });
      assert.strictEqual((await mirrored.json()).msg.data[0].thread_id, 42);
      assert.strictEqual(native.fetches.length, 0);
      await sandbox.window.fetch(url, { credentials: "include", headers: { Accept: "application/json" }, signal: new AbortController().signal });
      await sandbox.window.fetch("https://other.example/latest_data.php?cmd=list&cat=games", { credentials: "same-origin" });
      await sandbox.window.fetch(url, { credentials: "same-origin", method: "POST" });
      assert.strictEqual(native.fetches.length, 3);
    } finally { view?.stop({ redraw: false }); sandbox.restore(); }
  });

  runTest("LIBRARY-LATEST-NATIVE-04 BFCache category changes and missing native redraw remain reversible", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games/page=3");
    const native = fixture(sandbox.window);
    const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
    let view;
    try {
      view = createLibraryLatestView({ query: async () => local(), getWindow: () => sandbox.window, redrawTimeoutMs: 5 });
      const button = sandbox.document.querySelector("#f95ue-library-latest-only");
      button.click(); await new Promise((resolve) => setTimeout(resolve, 15));
      assert.strictEqual(view.isEnabled(), false); assert.match(button.title, /did not redraw/);
      assert.match(sandbox.window.location.hash, /page=3/);
      const redraw = () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1" });
      sandbox.window.addEventListener("popstate", redraw);
      button.click(); await settle();
      dispatchPageTransition(sandbox.window, "pagehide", true);
      const before = native.requests.length;
      assert.strictEqual(view.isEnabled(), false);
      dispatchPageTransition(sandbox.window, "pageshow", true); await settle();
      assert.strictEqual(native.requests.length, before + 1);
      sandbox.window.history.replaceState(null, "", "#/cat=comics");
      native.$.ajax({ url: "latest_data.php?cmd=list&cat=comics&page=1" }); await settle();
      assert.strictEqual(button.hidden, true);
      sandbox.window.history.replaceState(null, "", "#/cat=games"); redraw(); await settle();
      assert.strictEqual(button.hidden, false);
      sandbox.document.querySelector(".controls-block").innerHTML = '<a id="controls_auto-refresh"></a>';
      redraw(); await settle();
      assert.ok(sandbox.document.querySelector("#f95ue-library-latest-only"));
    } finally { view?.stop({ redraw: false }); sandbox.restore(); }
  });

  runTest("LIBRARY-LATEST-NATIVE-05 empty results and preparation timeouts are honest and cancel late requests", async () => {
    for (const timeout of [false, true]) {
      const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games");
      const native = fixture(sandbox.window), received = [];
      const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
      let view, resolve;
      const empty = { status: "ok", msg: { data: [], count: 0, pagination: { page: 1, total: 1 } } };
      sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1", success: (data) => received.push(data) }));
      try {
        view = createLibraryLatestView({ query: () => timeout ? new Promise((done) => { resolve = done; }) : Promise.resolve(empty), getWindow: () => sandbox.window, responseTimeoutMs: 5 });
        sandbox.document.querySelector("#f95ue-library-latest-only").click();
        await new Promise((done) => setTimeout(done, 15));
        assert.strictEqual(received[0].status, timeout ? "error" : "ok");
        if (timeout) { resolve(empty); await settle(); assert.strictEqual(native.requests.length, 0); }
        else { assert.strictEqual(received[0].msg.count, 0); assert.strictEqual(native.requests.length, 1); }
      } finally { view?.stop({ redraw: false }); sandbox.restore(); }
    }
  });

  runTest("LIBRARY-LATEST-NATIVE-06 initial native loading and keyboard activation stay safe", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games");
    const native = fixture(sandbox.window), messages = [];
    const { createLibraryLatestView } = loadModule("addons/library-addon/src/app/latestNativeView.js");
    let view;
    sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1" }));
    try {
      view = createLibraryLatestView({ query: async () => local(), getWindow: () => sandbox.window, reportError: (message) => messages.push(message) });
      native.$.active = 1;
      const button = sandbox.document.querySelector("#f95ue-library-latest-only");
      button.click(); assert.strictEqual(view.isEnabled(), false); assert.match(messages[0], /still loading/);
      native.$.active = 0;
      button.dispatchEvent(new sandbox.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle();
      assert.strictEqual(view.isEnabled(), true); assert.strictEqual(native.requests.length, 1);
    } finally { view?.stop({ redraw: false }); sandbox.restore(); }
  });
};
