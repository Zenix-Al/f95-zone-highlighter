"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest }) => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/library-latest-api-chilling-ridge.json"), "utf8"));
  const html = fs.readFileSync(path.join(ROOT, "tests/fixtures/library-hybrid-html-baseline.html"), "utf8");
  const url = "https://f95zone.to/threads/chilling-ridge.281676/";

  runTest("LIBRARY-HYBRID-02 validates persisted opt-in", async () => {
    const { normalizeAutoUpdateConfig, createAutoUpdateRepository } = loadModule("addons/library-addon/src/library/autoUpdateRepository.js");
    for (const value of [undefined, null, false, "true", 1]) {
      assert.strictEqual(normalizeAutoUpdateConfig({ preferLatestApi: value }).preferLatestApi, false);
    }
    let saved;
    const repository = createAutoUpdateRepository({
      getMeta: async () => saved,
      putMeta: async (value) => { saved = value; return { ok: true }; },
    });
    assert.strictEqual((await repository.getConfig()).preferLatestApi, false);
    await repository.putConfig({ preferLatestApi: true, spacingMs: 5000 });
    assert.strictEqual((await repository.getConfig()).preferLatestApi, true);
    assert.strictEqual(saved.spacingMs, 15000);
    assert.strictEqual(saved.key, "auto-update:config");
  });

  runTest("LIBRARY-HYBRID-05 source selection chooses opt-in hybrid without changing bounded query", () => {
    const { selectUpdateSource, createLatestSearchUrl } = loadModule("addons/library-addon/src/library/updateSource.js");
    assert.deepStrictEqual(selectUpdateSource(), { source: "thread-html", reason: "html_only" });
    assert.deepStrictEqual(selectUpdateSource({ preferLatestApi: true }), { source: "hybrid", reason: "api_preferred" });
    const search = new URL(createLatestSearchUrl("Game & Other [Demo]"));
    assert.strictEqual(search.origin, "https://f95zone.to");
    assert.strictEqual(search.searchParams.get("search"), "Game Other Demo");
    assert.strictEqual(search.searchParams.get("page"), "1");
    assert.strictEqual(search.searchParams.get("rows"), "15");
    assert.strictEqual(search.searchParams.get("cat"), "games");
  });

  runTest("LIBRARY-HYBRID-02 service adapter reads public catalogs and tolerates older cores", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    const calls = [];
    let value = { tags: [{ id: 30, name: "tag" }] };
    const service = createLibraryService({ invokeCoreAction: async (action, payload) => {
      calls.push([action, payload]);
      return { ok: true, value };
    } }, {});
    assert.deepStrictEqual(await service.getUpdateCatalogs(), { ok: true, value });
    value = { ...value, prefixes: { items: [{ id: 2, name: "Synthetic", class: "label--blue" }], categories: { games: [] } } };
    assert.deepStrictEqual((await service.getUpdateCatalogs()).value.prefixes, value.prefixes);
    assert.deepStrictEqual(calls, [["config.getTagPrefs", { includePrefixes: true }], ["config.getTagPrefs", { includePrefixes: true }]]);
  });

  runTest("LIBRARY-HYBRID-BASELINE-01 records the supplied API payload without network access", () => {
    assert.strictEqual(fixture.status, "ok");
    assert.deepStrictEqual(fixture.msg.pagination, { page: 1, total: 1 });
    assert.strictEqual(fixture.msg.count, fixture.msg.data.length);
    const row = fixture.msg.data[0];
    assert.strictEqual(row.thread_id, 281676);
    assert.strictEqual(row.title, "Chilling Ridge");
    assert.strictEqual(row.creator, "Catmilk Studios");
    assert.strictEqual(row.version, "v0.0.5.6");
    assert.strictEqual(row.rating, 3.71);
    assert.deepStrictEqual(row.prefixes, [2]);
    assert.strictEqual(row.tags.length, 23);
    assert.ok(row.tags.every(Number.isInteger));
    assert.strictEqual(row.ts, 1792192020);
    assert.strictEqual(Object.hasOwn(row, "url"), false);
  });

  runTest("LIBRARY-HYBRID-02 tag prefs expose cached tags and full prefix catalog without freshness promises", async () => {
    const { actionConfigGetTagPrefs, storageActions } = loadModule("src/services/addons/actions/families/storage.js");
    const descriptor = storageActions.find((entry) => entry.id === "config.getTagPrefs");
    assert.deepStrictEqual(descriptor.requiredCapabilities, ["storage"]);
    for (const flag of [true, false, "true", undefined]) {
      const result = await descriptor.execute({
        payload: { includePrefixes: flag }, deps: { measurePayloadBytes: () => 1 },
        limits: { maxAddonStorageValueBytes: 16384 },
      });
      assert.strictEqual(Object.hasOwn(result.value, "prefixes"), flag === true);
    }
    const config = {
      tags: [{ id: 30, name: "synthetic fixture tag" }],
      preferredTags: [], excludedTags: [], markedTags: [], color: {},
      prefixes: { items: [{ id: 2, name: "Synthetic prefix", class: "label--blue" }], categories: { games: [{ id: 9, name: "Group", prefixIds: [2] }] } },
      updatedAt: 123,
    };
    const read = await actionConfigGetTagPrefs(() => 100, 1000, () => config, true);
    assert.strictEqual(read.ok, true);
    assert.deepStrictEqual(read.value.tags, config.tags);
    assert.deepStrictEqual(read.value.prefixes, config.prefixes);
    assert.strictEqual(Object.hasOwn(read.value, "updatedAt"), false);
    assert.strictEqual((await actionConfigGetTagPrefs(() => 1001, 1000, () => config)).reason, "payload_too_large");
    const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
    const size = bytes(read.value);
    assert.strictEqual((await actionConfigGetTagPrefs(bytes, size, () => config, true)).ok, true);
    assert.strictEqual((await actionConfigGetTagPrefs(bytes, size - 1, () => config, true)).reason, "payload_too_large");
    assert.strictEqual(Object.hasOwn((await actionConfigGetTagPrefs(bytes, size - 1, () => config)).value, "prefixes"), false);
    assert.deepStrictEqual((await actionConfigGetTagPrefs(() => 1, 1000, () => ({}))).value.tags, []);
    assert.deepStrictEqual((await actionConfigGetTagPrefs(() => 1, 1000, () => ({}), true)).value.prefixes, { items: [], categories: {} });
    assert.strictEqual((await actionConfigGetTagPrefs(() => 1, 1000, () => { throw new Error("unavailable"); })).reason, "storage_unavailable");
  });

  runTest("LIBRARY-HYBRID-BASELINE-01 documents prefix catalog structure without assigning real prefix meanings", () => {
    const { normalizePrefixesFromLatestUpdates } = loadModule("src/services/prefixService.js");
    const normalized = normalizePrefixesFromLatestUpdates({ games: [{
      id: 9, name: "Synthetic group", prefixes: [{ id: "2", name: "Synthetic prefix", class: "label--blue" }],
    }] });
    assert.deepStrictEqual(normalized.items, [{ id: 2, name: "Synthetic prefix", class: "label--blue" }]);
    assert.deepStrictEqual(normalized.categories.games[0].prefixIds, [2]);
  });

  runTest("LIBRARY-HYBRID-BASELINE-01 separates search title extraction from version identity normalization", () => {
    const { normalizeThreadTitleText } = loadModule("addons/library-addon/src/thread/title.js");
    const { normalizeVersionIdentity } = loadModule("addons/library-addon/src/library/updateEventModel.js");
    assert.deepStrictEqual(normalizeThreadTitleText("Chilling Ridge [v0.0.5.6] [Catmilk Studios] | F95zone"), {
      source: "Chilling Ridge [v0.0.5.6] [Catmilk Studios]", title: "Chilling Ridge",
      gameVersion: "v0.0.5.6", developer: "Catmilk Studios",
    });
    assert.strictEqual(normalizeVersionIdentity("v0.0.5.6"), normalizeVersionIdentity("0.0.5.6"));
    assert.strictEqual(normalizeVersionIdentity("Demo - 0.46"), normalizeVersionIdentity("Demo v0.46"));
    // Raw-heading extraction must not be applied to canonical/API titles twice.
    assert.strictEqual(normalizeThreadTitleText("Game [Demo v0.46] [Dev]").title, "Game");
  });

  runTest("LIBRARY-HYBRID-BASELINE-01 HTML checks use the saved URL and commit only existing facts", async () => {
    const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
    let record = {
      threadId: "281676", schemaVersion: 5, recordModifiedAt: 1,
      thread: { url, title: "Chilling Ridge", currentVersion: "v0.0.5.5", developer: "Stored developer",
        tags: ["stored tag"], prefixes: [{ label: "Stored prefix", color: "blue" }], threadRating: 2.5 },
      personal: { addedAt: 1, status: "playing", rating: 4, note: "keep", pinned: true, lastPlayedVersion: "v0.0.5.5" },
      updateState: "acknowledged",
    };
    const stores = new Map();
    const requests = [];
    const service = createLibraryService({ async invokeCoreAction(action, payload) {
      const store = payload.storeName || "records";
      if (!stores.has(store)) stores.set(store, new Map());
      const values = stores.get(store);
      if (action === "idb.get") return { ok: true, value: store === "records" ? record : values.get(payload.key) || null };
      if (action === "idb.put") {
        if (store === "records") record = payload.value;
        else values.set(payload.value.id || payload.value.key, payload.value);
        return { ok: true, value: payload.value };
      }
      if (action === "idb.query") return { ok: true, value: [...values.values()] };
      return { ok: true, value: null };
    } }, {}, { requestThreadHtml: async (requested) => {
      requests.push(requested);
      return { ok: true, html, finalUrl: url };
    } });
    const before = await service.getEntry("281676");
    const preview = await service.previewManualUpdateCheck(["281676"]);
    assert.deepStrictEqual(requests, [url]);
    assert.strictEqual(preview.sourceReason, "html_only");
    assert.strictEqual(preview.results[0].ok, true);
    assert.strictEqual(preview.results[0].changed, true);
    assert.strictEqual(preview.results[0].observed.currentVersion, fixture.msg.data[0].version);
    // Rich API facts must later be wired deliberately; the current commit drops them.
    Object.assign(preview.results[0].observed, { developer: "Different developer", tags: ["different"], prefixes: [], threadRating: 5 });
    assert.strictEqual((await service.commitManualUpdateCheck(preview)).ok, true);
    const after = await service.getEntry("281676");
    assert.strictEqual(after.thread.currentVersion, "v0.0.5.6");
    assert.strictEqual(after.thread.url, url);
    assert.strictEqual(after.thread.developer, before.thread.developer);
    assert.deepStrictEqual(after.thread.tags, before.thread.tags);
    assert.deepStrictEqual(after.thread.prefixes, before.thread.prefixes);
    assert.strictEqual(after.thread.threadRating, before.thread.threadRating);
    assert.deepStrictEqual(after.personal, before.personal);
    assert.strictEqual(after.updateState, "changed");
    assert.strictEqual(after.updateCheck.status, "current");
  });
};
