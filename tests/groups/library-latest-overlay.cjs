"use strict";
module.exports = ({ assert, loadModule, runTest, createDomSandbox, createFakeClock }) => {
  const fixture = require("../fixtures/libraryLatestNative.cjs");
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
  const local = { status: "ok", msg: { data: [{ thread_id: 42, title: "Library", creator: "Dev", version: "", tags: [7], prefixes: [], cover: "", screens: [], views: null, likes: null, rating: null, ts: null, date: "", watched: false, ignored: false, new: false }], count: 1, pagination: { page: 1, total: 1 } } };

  for (const captureFirst of [false, true]) runTest(`LIBRARY-LATEST-CAPTURE-01 ordinary XHR capture paints local cards; captureFirst=${captureFirst}`, async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games/page=4");
    const native = fixture(sandbox.window);
    const originalXhr = global.XMLHttpRequest, originalFetch = global.fetch;
    let api, view;
    try {
      global.XMLHttpRequest = sandbox.window.XMLHttpRequest;
      global.fetch = sandbox.window.fetch;
      api = loadModule("addons/library-addon/src/app/latestNativeView.js", { sourceReplacements: {
        "export function createLibraryLatestView": `export { startLatestCapture, getLatestCaptureSnapshot, resetLatestCaptureForTests } from "../../../../src/features/latest-overlay/capture/index.js";
          export { enableLatestOverlay, disableLatestOverlay, reprocessAllTiles } from "../../../../src/features/latest-overlay/handler.js";
          export { config, stateManager } from "../../../../src/config.js";
          export { latestDataIndex } from "../../../../src/features/latest-overlay/latestDataIndex.js";
          export { latestMarkerBroker } from "../../../../src/services/addons/latestMarkerRuntime.js";
          export function createLibraryLatestView`,
      } });
      const startCapture = () => {
        // Node globals and the fixture Window represent one userscript realm.
        global.fetch = sandbox.window.fetch;
        api.startLatestCapture({ generation: 0 }, { active: true });
        sandbox.window.fetch = global.fetch;
      };
      if (captureFirst) startCapture();
      view = api.createLibraryLatestView({ query: async () => local, getWindow: () => sandbox.window });
      global.fetch = sandbox.window.fetch;
      if (!captureFirst) startCapture();
      api.config.tags = [{ id: 7, name: "favorite" }];
      api.config.preferredTags = [7]; api.config.excludedTags = [];
      api.config.overlaySettings = { ...api.config.overlaySettings, preferred: true, overlayText: true };
      api.config.latestSettings = { ...api.config.latestSettings, latestMarkerProviders: { "library-status": { enabled: true } } };
      api.latestMarkerBroker.list = () => [{ id: "library-status", priority: 50 }];
      api.latestMarkerBroker.query = async () => ({ 42: { label: "Saved", tone: "neutral", description: "Saved" } });
      api.stateManager.set("latestOverlayStatus", "IDLE"); api.enableLatestOverlay();
      sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1", success: (response) => {
        const id = response.msg.data[0].thread_id;
        sandbox.document.querySelector("#latest-page_items-wrap_inner").innerHTML = `<div class="resource-tile" data-thread-id="${id}"><div class="resource-tile_thumb-wrap"></div><div class="resource-tile_body"><span class="resource-tile_info-meta_rating"></span></div><div class="resource-tile_hover-wrap"><div class="resource-tile_tags"><span>favorite</span></div></div></div>`;
        sandbox.document.querySelector(".resource-tile").getClientRects = () => [{}];
      } }));
      sandbox.document.querySelector("#f95ue-library-latest-only").click(); await settle();
      const tile = sandbox.document.querySelector(".resource-tile");
      assert.strictEqual(api.getLatestCaptureSnapshot().data[0].thread_id, 42);
      assert.strictEqual(tile.dataset.modified, "true");
      assert.strictEqual(tile.querySelector(".f95ue-latest-marker").textContent, "Saved");
      assert.strictEqual(api.latestDataIndex.get(42).rating, null, "missing rating isn't manufactured as zero");
      tile.dispatchEvent(new sandbox.window.MouseEvent("mouseover", { bubbles: true }));
      assert.strictEqual(tile.querySelector(".resource-tile_tags span").style.fontWeight, "bold");
      api.disableLatestOverlay(); api.enableLatestOverlay(); await settle();
      assert.strictEqual(tile.dataset.modified, "true");
      api.config.preferredTags = []; api.config.excludedTags = [7]; api.reprocessAllTiles();
      assert.strictEqual(tile.querySelector(".resource-tile_body").style.getPropertyValue("--f95ue-overlay-gradient"), api.config.color.excluded);
      sandbox.document.querySelector("#f95ue-library-latest-only").click(); await settle();
      assert.strictEqual(api.getLatestCaptureSnapshot().data[0].thread_id, 1);
      assert.strictEqual(native.requests.length, 2);
    } finally {
      view?.stop({ redraw: false }); api?.disableLatestOverlay(); api?.resetLatestCaptureForTests();
      global.XMLHttpRequest = originalXhr; global.fetch = originalFetch;
      await settle(); sandbox.restore();
    }
  });

  runTest("LIBRARY-LATEST-CONTROLLER-01 cache invalidation and canceled reads need no new core action", async () => {
    const { createLibraryLatestCollectionController } = loadModule("addons/library-addon/src/app/latestCollectionController.js");
    let hooks, refreshes = 0, resolveRead, delayed = false, reads = 0;
    const calls = [];
    const controller = createLibraryLatestCollectionController({ getEnabled: () => true, getUrl: () => "https://f95zone.to/sam/latest_alpha/",
      createView: (value) => { hooks = value; return { stop() {}, invalidate() { refreshes++; }, isEnabled: () => true }; },
      core: { async invokeCoreAction(action) { calls.push(action); return { ok: true, value: { tags: [] } }; } },
      library: { async queryEntriesPage() { reads++; return delayed ? new Promise((resolve) => { resolveRead = resolve; }) : { rows: [{ threadId: "42", thread: { title: "Game" } }], hasNext: false }; } },
    });
    const request = { id: "1:1", session: 1, url: "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=list&cat=games&page=1" };
    await controller.start(); await hooks.query(request); await hooks.query(request);
    assert.strictEqual(reads, 1);
    controller.changed(); controller.changed(); await settle(); assert.strictEqual(refreshes, 1);
    delayed = true;
    const old = hooks.query(request); await settle(); hooks.onModeChange(false);
    resolveRead({ rows: [], hasNext: false }); await assert.rejects(old, /cancelled/);
    await controller.stop(); assert.deepStrictEqual([...new Set(calls)], ["config.getTagPrefs"]);
  });

  runTest("LIBRARY-LATEST-CONTROLLER-02 late site readiness has bounded canceled attempts", async () => {
    const { createLibraryLatestCollectionController } = loadModule("addons/library-addon/src/app/latestCollectionController.js");
    const clock = createFakeClock(); const realSet = global.setTimeout, realClear = global.clearTimeout;
    let tries = 0;
    const controller = createLibraryLatestCollectionController({ core: {}, library: {}, getEnabled: () => true,
      getUrl: () => "https://f95zone.to/sam/latest_alpha/", createView: () => { tries++; return null; } });
    try {
      global.setTimeout = clock.setTimeout; global.clearTimeout = clock.clearTimeout;
      await controller.start(); await clock.tick(15000);
      assert.strictEqual(tries, 21); assert.strictEqual(clock.pending(), 0);
      await controller.stop(); await controller.start(); assert.strictEqual(clock.pending(), 1);
      await controller.stop(); assert.strictEqual(clock.pending(), 0);
    } finally { await controller.stop(); global.setTimeout = realSet; global.clearTimeout = realClear; }
  });

  runTest("LIBRARY-LATEST-CAPTURE-02 real recovery fetch consumes the local mirror without touching the server", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/sam/latest_alpha/#/cat=games");
    const native = fixture(sandbox.window);
    const savedXhr = global.XMLHttpRequest, savedFetch = global.fetch;
    let api, view;
    try {
      global.XMLHttpRequest = sandbox.window.XMLHttpRequest; global.fetch = sandbox.window.fetch;
      api = loadModule("src/features/latest-overlay/capture/latestCaptureService.js", { sourceReplacements: {
        'import { debugLog } from "../../../core/logger.js";': `import { debugLog } from "../../../core/logger.js";
          export {createLibraryLatestView} from "../../../../addons/library-addon/src/app/latestNativeView.js";
          export {getLatestCaptureSnapshot,resetLatestCaptureStoreForTests} from "./fastCaptureStore.js";`,
        "async function recoverLatestCaptureFromPerformance()": "export async function recoverLatestCaptureFromPerformance()",
        "const resource = captureActive ? latestMatchingResource() : null;": 'const resource = {name:"https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=list&cat=games&page=1"};',
      } });
      api.startLatestCapture({ generation: 0 }, { active: true }); sandbox.window.fetch = global.fetch;
      view = api.createLibraryLatestView({ query: async () => local, getWindow: () => sandbox.window });
      global.fetch = sandbox.window.fetch;
      sandbox.window.addEventListener("popstate", () => native.$.ajax({ url: "latest_data.php?cmd=list&cat=games&page=1" }));
      sandbox.document.querySelector("#f95ue-library-latest-only").click(); await settle();
      api.resetLatestCaptureStoreForTests();
      await api.recoverLatestCaptureFromPerformance();
      assert.strictEqual(api.getLatestCaptureSnapshot().data[0].thread_id, 42);
      assert.strictEqual(native.requests.length, 1);
      assert.strictEqual(native.fetches.length, 0);
    } finally {
      view?.stop({ redraw: false }); api?.resetLatestCaptureForTests();
      global.XMLHttpRequest = savedXhr; global.fetch = savedFetch; await settle(); sandbox.restore();
    }
  });
};
