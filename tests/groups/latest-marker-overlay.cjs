"use strict";
module.exports = function ({ assert, loadModule, runTest, Window }) {
  const { createMarkerLifecycle } = loadModule("src/features/latest-overlay/markerLifecycle.js");
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  runTest("Latest marker overlay reconciles late providers and replacement without duplicate slots", async () => {
    let change;
    let providers = [];
    let tiles = [{ isConnected: true, dataset: { threadId: "1" }, markers: new Map() }];
    const calls = [];
    const lifecycle = createMarkerLifecycle({
      broker: { list: () => providers, query: async (id, ids) => { calls.push(ids); return { 1: { label: "Saved" } }; } },
      subscribe: (listener) => { change = listener; return () => { change = null; }; },
      getTiles: () => tiles,
      clear: (tile) => tile.markers.clear(),
      paint: (tile, provider, marker) => tile.markers.set(provider.id, marker),
    });
    lifecycle.enable();
    await tick();
    assert.strictEqual(calls.length, 0);
    providers = [{ id: "library", priority: 50 }];
    change();
    await tick();
    assert.strictEqual(tiles[0].markers.size, 1);
    const old = tiles[0];
    tiles = [{ isConnected: true, dataset: { threadId: "1" }, markers: new Map() }];
    lifecycle.refresh();
    await tick();
    assert.strictEqual(old.markers.size, 0);
    assert.strictEqual(tiles[0].markers.size, 1);
    change();
    await tick();
    assert.strictEqual(tiles[0].markers.size, 1);
    providers = [];
    change();
    await tick();
    assert.strictEqual(tiles[0].markers.size, 0);
    lifecycle.disable();
    assert.strictEqual(change, null);
  });
  runTest("Latest marker overlay ignores late results after disable and deduplicates batch IDs", async () => {
    let resolve;
    let requested;
    const tiles = [1, 1, 2].map((id) => ({ isConnected: true, dataset: { threadId: String(id) } }));
    let paints = 0;
    const lifecycle = createMarkerLifecycle({
      broker: { list: () => [{ id: "slow", priority: 1 }], query: (id, ids) => { requested = ids; return new Promise((done) => { resolve = done; }); } },
      subscribe: () => () => {}, getTiles: () => tiles,
      clear: () => {}, paint: () => { paints += 1; },
    });
    lifecycle.enable();
    await tick();
    assert.deepStrictEqual(requested, ["1", "2"]);
    lifecycle.disable();
    resolve({ 1: { label: "Too late" } });
    await tick();
    assert.strictEqual(paints, 0);
  });
  runTest("Latest marker DOM has one ordered slot and preserves core decorations", () => {
    const window = new Window();
    const previous = global.document;
    global.document = window.document;
    try {
      const { paintLatestMarker, clearLatestMarkers, hasMarkerTileChanges } = loadModule("src/features/latest-overlay/markers.js");
      const tile = window.document.createElement("div");
      tile.className = "resource-tile";
      tile.innerHTML = '<div class="resource-tile_thumb-wrap"><div class="custom-overlay-reason">Core</div></div>';
      window.document.body.append(tile);
      paintLatestMarker(tile, { id: "later", priority: 90 }, { label: "Saved", description: "Saved state", tone: "muted" });
      paintLatestMarker(tile, { id: "first", priority: 10 }, { label: "<img>", description: "Description", tone: "info" });
      paintLatestMarker(tile, { id: "later", priority: 90 }, { label: "Playing", description: "Playing state", tone: "success" });
      assert.strictEqual(tile.querySelectorAll(".f95ue-latest-markers").length, 1);
      assert.deepStrictEqual([...tile.querySelectorAll(".f95ue-latest-marker")].map((chip) => chip.dataset.providerId), ["first", "later"]);
      assert.strictEqual(tile.querySelector("img"), null);
      assert.strictEqual(hasMarkerTileChanges([{ addedNodes: [tile.querySelector(".f95ue-latest-markers")] }]), false);
      assert.strictEqual(hasMarkerTileChanges([{ removedNodes: [tile] }]), true);
      clearLatestMarkers(tile);
      assert.strictEqual(tile.querySelector(".f95ue-latest-markers"), null);
      assert.strictEqual(tile.querySelector(".custom-overlay-reason").textContent, "Core");
    } finally { global.document = previous; window.happyDOM.abort(); }
  });
  runTest("Latest marker overlay batches visible IDs and isolates failing providers", async () => {
    const sizes = [];
    let paints = 0;
    const tiles = Array.from({ length: 205 }, (_, index) => ({ isConnected: true, dataset: { threadId: String(index + 1) } }));
    const lifecycle = createMarkerLifecycle({
      broker: {
        list: () => [{ id: "broken", priority: 1 }, { id: "working", priority: 2 }],
        query: async (id, ids) => {
          if (id === "broken") throw new Error("provider failure");
          sizes.push(ids.length);
          return Object.fromEntries(ids.map((threadId) => [threadId, { label: "Saved" }]));
        },
      },
      subscribe: () => () => {}, getTiles: () => tiles, clear: () => {}, paint: () => { paints += 1; },
    });
    lifecycle.enable();
    await tick();
    assert.deepStrictEqual(sizes, [100, 100, 5]);
    assert.strictEqual(paints, 205);
    lifecycle.disable();
  });
};
