module.exports = ({ runTest, assert, loadModule, Window, createFakeClock, createFakeGM, getDefaultConfig }) => {
  runTest("CORE-LOAD-WAVE5 canonical and backup snapshots stay detached and exclude catalogs", async () => {
    const previousGM = global.GM;
    global.GM = createFakeGM();
    try {
      const settings = loadModule("src/services/settingsService.js", {
        sourceReplacements: {
          "function buildEnvelope": "export function buildEnvelope",
          "async function persistEnvelope": "export async function persistEnvelope",
        },
      });
      const data = getDefaultConfig();
      data.tags = [{ id: 1, name: "runtime-only" }];
      data.addons.byAddon.fixture = { state: { nested: { value: 1 } } };
      const envelope = settings.buildEnvelope(data, 3);
      assert.deepStrictEqual(envelope.data.tags, []);
      assert.deepStrictEqual(envelope.data.prefixes, { items: [], categories: {} });
      envelope.data.addons.byAddon.fixture.state.nested.value = 2;
      assert.strictEqual(data.addons.byAddon.fixture.state.nested.value, 1);
      const previous = { ...envelope, revision: 2, data, extra: { nested: [1] } };
      await settings.persistEnvelope(envelope, previous);
      const stored = global.GM.snapshot();
      const backup = stored[settings.CONFIG_BACKUP_KEY];
      const referenceData = JSON.parse(JSON.stringify({ ...data, tags: [], prefixes: { items: [], categories: {} } }));
      assert.deepStrictEqual(backup, { ...JSON.parse(JSON.stringify(previous)), data: referenceData });
      assert.deepStrictEqual(stored[settings.CONFIG_ENVELOPE_KEY], envelope);
      backup.extra.nested.push(2);
      backup.data.addons.byAddon.fixture.state.nested.value = 4;
      stored[settings.CONFIG_ENVELOPE_KEY].data.addons.byAddon.fixture.state.nested.value = 5;
      assert.deepStrictEqual(previous.extra.nested, [1]);
      assert.strictEqual(data.addons.byAddon.fixture.state.nested.value, 1);
      assert.strictEqual(envelope.data.addons.byAddon.fixture.state.nested.value, 2);
      assert.deepStrictEqual(global.GM.logs().writes, [settings.CONFIG_BACKUP_KEY, settings.CONFIG_ENVELOPE_KEY]);
    } finally { global.GM = previousGM; }
  });
  runTest("CORE-LOAD-WAVE4 hover observes delayed batches and cancels on leave, timeout and disable", async () => {
    const previousDocument = global.document;
    const previousSetTimeout = global.setTimeout;
    const previousClearTimeout = global.clearTimeout;
    const previousObserver = global.MutationObserver;
    const window = new Window();
    global.document = window.document;
    const clock = createFakeClock();
    let hover;
    let deliver;
    global.MutationObserver = class {
      constructor(callback) { deliver = callback; }
      observe() {}
      disconnect() {}
    };
    try {
      hover = loadModule("src/features/latest-overlay/hoverTagHandler.js", {
        sourceReplacements: { "let tileHoverListener": "export { config, cache }; let tileHoverListener" },
      });
      global.setTimeout = clock.setTimeout;
      global.clearTimeout = clock.clearTimeout;
      document.body.innerHTML = '<article class="resource-tile"><span id="a"></span><span id="b"></span></article><article class="resource-tile" id="other"></article>';
      const tile = document.querySelector("article");
      const a = document.getElementById("a"), b = document.getElementById("b");
      const enter = (node, relatedTarget = null) => node.dispatchEvent(
        new window.MouseEvent("mouseover", { bubbles: true, relatedTarget }),
      );
      const insertHover = (node) => {
        node.insertAdjacentHTML("beforeend", '<div class="resource-tile_hover-wrap"><div class="resource-tile_tags"><span>tag</span></div></div>');
        return node.querySelector(".resource-tile_tags span");
      };
      const changed = (target, addedNodes = []) => deliver([{ target, addedNodes, removedNodes: [] }]);
      hover.cache.tagNameToId = new Map([["tag", 123]]);
      hover.config.preferredTags = [123];
      hover.setupHoverListener();
      hover.setupHoverListener();
      enter(tile);
      for (let i = 0; i < 20; i++) enter(i % 2 ? a : b, i % 2 ? b : a);
      enter(tile); // Re-entry before the pending retry must not add a timer.
      assert.strictEqual(clock.pending(), 1);
      await clock.tick(250);
      const lateTag = insertHover(tile);
      changed(tile, [tile.querySelector(".resource-tile_hover-wrap")]);
      assert.strictEqual(lateTag.dataset.f95ueProcessed, "1");
      assert.strictEqual(lateTag.style.fontWeight, "bold");
      assert.strictEqual(clock.pending(), 0);
      const secondTag = document.createElement("span");
      secondTag.textContent = "tag";
      lateTag.parentNode.append(secondTag);
      changed(lateTag.parentNode, [secondTag]);
      assert.strictEqual(secondTag.dataset.f95ueProcessed, "1");
      const emptyTag = document.createElement("span");
      lateTag.parentNode.append(emptyTag);
      changed(lateTag.parentNode, [emptyTag]);
      assert.strictEqual(emptyTag.dataset.f95ueProcessed, undefined);
      emptyTag.textContent = "tag";
      changed(emptyTag, [...emptyTag.childNodes]);
      assert.strictEqual(emptyTag.dataset.f95ueProcessed, "1");
      const other = document.getElementById("other");
      const immediateTag = insertHover(other);
      enter(other, tile);
      assert.strictEqual(immediateTag.dataset.f95ueProcessed, "1");
      enter(tile, other);
      assert.strictEqual(clock.pending(), 0);
      const detached = document.createElement("article");
      detached.className = "resource-tile";
      document.body.append(detached);
      enter(detached);
      const detachedTag = insertHover(detached);
      detached.remove();
      changed(document.body);
      assert.strictEqual(detachedTag.dataset.f95ueProcessed, undefined);
      assert.strictEqual(clock.pending(), 0);
      const waiting = document.createElement("article");
      waiting.className = "resource-tile";
      document.body.append(waiting);
      enter(waiting);
      await clock.tick(5000);
      const expiredTag = insertHover(waiting);
      changed(waiting, [waiting.querySelector(".resource-tile_hover-wrap")]);
      assert.strictEqual(expiredTag.dataset.f95ueProcessed, undefined);
      enter(waiting);
      assert.strictEqual(expiredTag.dataset.f95ueProcessed, "1");
      waiting.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true }));
      const afterLeave = document.createElement("span");
      afterLeave.textContent = "tag";
      expiredTag.parentNode.append(afterLeave);
      changed(expiredTag.parentNode, [afterLeave]);
      assert.strictEqual(afterLeave.dataset.f95ueProcessed, undefined);
      enter(tile);
      hover.teardownHoverListener();
      assert.strictEqual(clock.pending(), 0);
      enter(tile);
      assert.strictEqual(clock.pending(), 0);
      hover.setupHoverListener();
      waiting.innerHTML = "";
      enter(waiting);
      assert.strictEqual(clock.pending(), 1);
      hover.teardownHoverListener();
      await clock.tick(5000);
      assert.strictEqual(clock.pending(), 0);
    } finally {
      hover?.teardownHoverListener();
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
      global.MutationObserver = previousObserver;
      global.document = previousDocument;
      window.happyDOM.abort();
    }
  });
  runTest("LATEST-CONTROL card arrivals sync once; hover churn is ignored and disable cancels", async () => {
    const previousDocument = global.document;
    const previousSetTimeout = global.setTimeout;
    const previousClearTimeout = global.clearTimeout;
    const window = new Window();
    global.document = window.document;
    const clock = createFakeClock();
    try {
      const controls = loadModule("src/features/latest-control/index.js", {
        sourceReplacements: {
          "export const latestControlFeature": "export { hasLatestControlMutations, processMutations, disable, config }; export const latestControlFeature",
        },
      });
      global.setTimeout = clock.setTimeout;
      global.clearTimeout = clock.clearTimeout;
      controls.config.latestSettings.autoRefresh = true;
      controls.config.latestSettings.webNotif = true;
      document.body.innerHTML = '<button id="controls_auto-refresh"></button><button id="controls_notify"></button><article class="resource-tile"></article>';
      const auto = document.getElementById("controls_auto-refresh");
      const notify = document.getElementById("controls_notify");
      auto.addEventListener("click", () => auto.classList.toggle("selected"));
      notify.addEventListener("click", () => {
        assert.ok(auto.classList.contains("selected"));
        notify.classList.toggle("selected");
      });
      const mutation = (node) => [{ addedNodes: [node], removedNodes: [], target: document.body }];
      const tile = document.querySelector(".resource-tile");
      assert.strictEqual(controls.hasLatestControlMutations(mutation(tile)), true);
      const wrapper = document.createElement("section");
      wrapper.innerHTML = '<article class="resource-tile"></article>';
      assert.strictEqual(controls.hasLatestControlMutations(mutation(wrapper)), true);
      assert.strictEqual(controls.hasLatestControlMutations(mutation(auto)), true);
      wrapper.innerHTML = '<button id="controls_notify"></button>';
      assert.strictEqual(controls.hasLatestControlMutations(mutation(wrapper)), true);
      const hover = document.createElement("div");
      hover.className = "resource-tile_hover-wrap";
      hover.innerHTML = '<span class="tile-score-display">4</span>';
      assert.strictEqual(controls.hasLatestControlMutations(mutation(hover)), false);
      assert.strictEqual(controls.hasLatestControlMutations(mutation(document.createTextNode("text"))), false);
      assert.strictEqual(controls.hasLatestControlMutations([{ addedNodes: [], removedNodes: [tile] }]), false);
      controls.processMutations();
      controls.processMutations();
      assert.strictEqual(clock.pending(), 1);
      await clock.tick(100);
      assert.ok(auto.classList.contains("selected"));
      assert.strictEqual(notify.classList.contains("selected"), false);
      await clock.tick(400);
      assert.ok(notify.classList.contains("selected"));
      // Site pagination resets the same buttons before the new cards arrive.
      auto.classList.remove("selected");
      notify.classList.remove("selected");
      controls.processMutations();
      await clock.tick(500);
      assert.ok(auto.classList.contains("selected"));
      assert.ok(notify.classList.contains("selected"));
      controls.processMutations();
      controls.config.latestSettings.autoRefresh = false;
      controls.config.latestSettings.webNotif = false;
      // Disable notifications first, before turning auto-refresh off.
      controls.disable();
      assert.strictEqual(clock.pending(), 0);
      assert.strictEqual(auto.classList.contains("selected"), false);
      assert.strictEqual(notify.classList.contains("selected"), false);
      controls.processMutations();
      assert.strictEqual(clock.pending(), 1);
      controls.disable();
    } finally {
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
      global.document = previousDocument;
      window.happyDOM.abort();
    }
  });
  runTest("CORE-LOAD-WAVE3 reset shares a local tile list and discovers replacements afresh", () => {
    const previousDocument = global.document;
    const window = new Window();
    global.document = window.document;
    try {
      const processor = loadModule("src/features/latest-overlay/tileProcessor.js");
      const patcher = loadModule("src/features/latest-overlay/tilePatcher.js");
      const makeTile = (id) => {
        const tile = document.createElement("article");
        tile.className = "resource-tile custom-overlay-border";
        tile.dataset.threadId = id;
        tile.dataset.modified = "true";
        tile.innerHTML = '<div class="resource-tile_body custom-overlay-band"><span class="custom-overlay-reason">reason</span><span class="tile-score-display">4</span></div>';
        return tile;
      };
      const oldTile = makeTile("1");
      document.body.append(oldTile);
      const original = document.getElementsByClassName.bind(document);
      let discoveries = 0;
      document.getElementsByClassName = (name) => { discoveries += 1; return original(name); };
      processor.processAllTiles(true);
      assert.strictEqual(discoveries, 1);
      assert.strictEqual(oldTile.dataset.modified, undefined);
      assert.strictEqual(oldTile.querySelector(".custom-overlay-reason, .tile-score-display"), null);
      assert.strictEqual(oldTile.classList.contains("custom-overlay-border"), false);
      const replacement = makeTile("2");
      oldTile.replaceWith(replacement);
      processor.processAllTiles(true);
      assert.strictEqual(discoveries, 2);
      assert.strictEqual(replacement.dataset.modified, undefined);
      const untouched = makeTile("3");
      document.body.append(untouched);
      processor.processAllTiles(false);
      assert.strictEqual(discoveries, 3);
      assert.strictEqual(untouched.dataset.modified, "true");
      processor.processAllTiles(true, processor.getCurrentGeneration() + 1);
      assert.strictEqual(discoveries, 3);
      patcher.clearAllOverlayStyles();
      assert.strictEqual(discoveries, 4);
      assert.strictEqual(untouched.dataset.modified, undefined);
    } finally {
      global.document = previousDocument;
      window.happyDOM.abort();
    }
  });
  runTest("CORE-LOAD-WAVE2 listing uses one fresh detached alias-normalized snapshot", () => {
    const state = loadModule("tests/fixtures/addonStateReadyHarness.js");
    const root = {
      trustedIds: ["example-addon"],
      byAddon: {
        "example-addon-legacy": { state: { enabled: false, nested: { value: 1 } } },
        "example-addon": { state: { enabled: true } },
      },
      installedMeta: {
        "example-addon-legacy": { name: "Old", installedSeenAt: 10, lastSeenAt: 20 },
        "example-addon": { name: "New", installedSeenAt: 15, lastSeenAt: 30, pageScopes: ["f95zone"] },
      },
    };
    state.config.addons = root;
    const snapshot = state.getAddonConfigSnapshot();
    assert.deepStrictEqual(snapshot.byAddon["example-addon"].state, state.getAddonState("example-addon"));
    assert.deepStrictEqual(snapshot.installedMeta, state.listInstalledAddonMeta());
    assert.ok(root.byAddon["example-addon-legacy"]);
    snapshot.byAddon["example-addon"].state.nested.value = 9;
    snapshot.installedMeta["example-addon"].pageScopes.push("latest");
    assert.strictEqual(root.byAddon["example-addon-legacy"].state.nested.value, 1);
    assert.deepStrictEqual(root.installedMeta["example-addon"].pageScopes, ["f95zone"]);
    let clones = 0;
    Object.defineProperty(root, "toJSON", { value() {
      clones += 1;
      return { byAddon: this.byAddon, installedMeta: this.installedMeta, trustedIds: this.trustedIds };
    } });
    const before = state.listKnownAddons();
    assert.strictEqual(clones, 1);
    assert.strictEqual(before.find((entry) => entry.id === "example-addon").status, "installed");
    root.byAddon["example-addon"].state.enabled = false;
    const after = state.listKnownAddons();
    assert.strictEqual(clones, 2);
    assert.strictEqual(after.find((entry) => entry.id === "example-addon").status, "disabled");
    assert.strictEqual(before.find((entry) => entry.id === "example-addon").status, "installed");
  });
  const { analyzeTrace } = require("../../scripts/core-load-trace.cjs");
  runTest("CORE-LOAD-WAVE1 metadata cache preserves wildcard matching and eviction", () => {
    const schema = loadModule("src/config/schema.js");
    const { referenceLookup } = require("../../scripts/core-load-wave1.cjs");
    const index = new Map(Object.entries(schema.getSchemaPathIndex()));
    const paths = [...index.keys()].flatMap((key) => [key, key.replace(/\*/g, "fixture").replace(/\[\]/g, "[123]")]);
    paths.push("", "unknown.path", " addons.byAddon.fixture.enabled ");
    for (const value of paths) assert.strictEqual(schema.getConfigPathMetadata(value), referenceLookup(index, value));
    for (let i = 0; i < 1000; i++) assert.strictEqual(schema.getConfigPathMetadata(`unknown.${i}.path`), null);
    for (const value of paths) assert.strictEqual(schema.getConfigPathMetadata(value), referenceLookup(index, value));
  });
  runTest("CORE-LOAD-TRACE isolates profile node IDs and separates overlapping costs", () => {
    const profile = (pid, url) => [
      { name: "Profile", pid, id: "a", args: { data: { startTime: 1000 } } },
      { name: "ProfileChunk", pid, id: "a", args: { data: {
        cpuProfile: { nodes: [
          { id: 1, callFrame: { functionName: "core", url } },
          { id: 2, parent: 1, callFrame: { functionName: "setTimeout", url: "" } },
        ], samples: [1, 2] }, timeDeltas: [1000, 2000],
      } } },
    ];
    const report = analyzeTrace({ traceEvents: [...profile(1, "F95Zone-Ultimate-Enhancer"), ...profile(2, "unrelated.js")] });
    assert.equal(report.coreSelfSampledMs, 1);
    assert.equal(report.coreInclusiveSampledMs, 3);
    assert.equal(report.coreSampleCount, 2);
    assert.equal(report.coreSampleActivitySpanMs, 2);
    assert.equal(report.calledCodeHotspots[0].sampledMs, 2);
  });
  runTest("CORE-LOAD-TRACE missing sampling data does not invent startup measurements", () => {
    const report = analyzeTrace({ traceEvents: [] });
    assert.equal(report.coreSampleActivitySpanMs, null);
    assert.equal(report.matchedScriptCount, 0);
    assert.deepEqual(report.explicitTimings, []);
    assert.throws(() => analyzeTrace({}), /traceEvents/);
  });
};
