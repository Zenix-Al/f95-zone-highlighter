"use strict";

module.exports = ({ assert, loadModule, runTest }) => {
  const model = () => loadModule("addons/library-addon/src/library/recordModel.js");
  const collection = () => loadModule("addons/library-addon/src/library/latestCollection.js");
  const catalogs = { tags: [{ id: 7, name: "Male Protagonist" }, { id: 8, name: "Other" }], prefixes: { items: [{ id: 13, name: "Completed", class: "label--green" }] } };
  const record = (id, latest = {}) => model().normalizeRecord({ threadId: String(id), thread: {
    title: `Game ${id}`, currentVersion: "1", tags: ["male protagonist"], prefixes: [{ label: "Completed", color: "green" }], latest,
  } }, { now: 10 });

  runTest("LIBRARY-LATEST-COLLECTION-01 retains safe optional metadata across sparse merges and serialization", () => {
    const { normalizeRecord, mergeThreadFacts, mergePersonalState } = model();
    const initial = record(1, { cover: "https://preview.f95zone.to/a.jpg", screens: ["https://preview.f95zone.to/b.jpg", "javascript:alert(1)"], views: 0, likes: 2, ts: 100, watched: false, ignored: true, new: true });
    assert.strictEqual(initial.thread.latest.views, 0);
    assert.strictEqual(initial.thread.latest.watched, false);
    assert.deepStrictEqual(initial.thread.latest.screens, ["https://preview.f95zone.to/b.jpg"]);
    assert.deepStrictEqual(normalizeRecord(JSON.parse(JSON.stringify(initial))).thread.latest, initial.thread.latest);
    assert.deepStrictEqual(mergePersonalState(initial, { note: "edit" }).thread.latest, initial.thread.latest);
    assert.deepStrictEqual(mergeThreadFacts(initial, { title: "Game" }).thread.latest, initial.thread.latest);
    const patched = mergeThreadFacts(initial, { latest: { screens: [], likes: 0, cover: "javascript:bad", views: -1, ts: null } });
    assert.deepStrictEqual(patched.thread.latest.screens, []);
    assert.strictEqual(patched.thread.latest.cover, initial.thread.latest.cover);
    assert.strictEqual(patched.thread.latest.ts, 100);
    assert.strictEqual(patched.thread.latest.likes, 0);
    assert.deepStrictEqual(record(2, null).thread.latest, {});
    const { normalizeLatestPresentation } = loadModule("addons/library-addon/src/library/latestPresentation.js");
    assert.deepStrictEqual(normalizeLatestPresentation({ cover: "https://user:pass@example.com/a", views: "10", watched: 1, date: "old" }), {});
    assert.strictEqual(normalizeLatestPresentation({ screens: Array.from({ length: 30 }, (_, i) => `https://example.com/${i}`) }).screens.length, 20);
  });

  runTest("LIBRARY-LATEST-COLLECTION-02 maps catalogs without guessing and keeps unknown facts neutral", () => {
    const { createLatestCatalogLookup, toLatestCollectionItem } = collection();
    const lookup = createLatestCatalogLookup(catalogs);
    const item = toLatestCollectionItem(record(1), lookup);
    assert.deepStrictEqual(item.tags, [7]);
    assert.deepStrictEqual(item.prefixes, [13]);
    assert.strictEqual(item.views, null);
    assert.strictEqual(item.ts, null);
    assert.strictEqual(item.cover, "");
    assert.deepStrictEqual(item.screens, []);
    assert.strictEqual(toLatestCollectionItem(record(1, { cover: "https://preview.f95zone.to/a(1).jpg" }), lookup).cover, "https://preview.f95zone.to/a%281%29.jpg");
    const ambiguous = createLatestCatalogLookup({ tags: [...catalogs.tags, { id: 9, name: "male protagonist" }] });
    assert.deepStrictEqual(toLatestCollectionItem(record(1), ambiguous).tags, []);
    assert.strictEqual(toLatestCollectionItem(record("bad"), lookup), null);
    assert.strictEqual(toLatestCollectionItem(record(1), lookup).title, "Game 1");
    const unsafe = record(1);
    unsafe.thread.title = '<img src=x onerror="alert(1)">';
    // Data only: native/page integration must use safe text rendering, not HTML.
    assert.strictEqual(JSON.parse(JSON.stringify(toLatestCollectionItem(unsafe, lookup))).title, unsafe.thread.title);
    const prefixCatalog = createLatestCatalogLookup({ prefixes: { items: [
      { id: 13, name: "Completed", class: "label--green" },
      { id: 14, name: "Completed", class: "label--red" },
    ] } });
    assert.deepStrictEqual(toLatestCollectionItem(record(1), prefixCatalog).prefixes, [13]);
    unsafe.thread.prefixes = [{ label: "Completed", color: "" }];
    assert.deepStrictEqual(toLatestCollectionItem(unsafe, prefixCatalog).prefixes, []);
  });

  runTest("LIBRARY-LATEST-COLLECTION-03 applies search filters stable unknown-last sorting and local pagination", () => {
    const { createLatestCatalogLookup, toLatestCollectionItem, queryLatestCollection } = collection();
    const lookup = createLatestCatalogLookup(catalogs);
    const items = [record(3), record(2, { ts: 100, views: 0 }), record(1, { ts: 100, views: 10 })].map((r) => toLatestCollectionItem(r, lookup));
    assert.deepStrictEqual(queryLatestCollection(items).msg.data.map((r) => r.thread_id), [1, 2, 3]);
    const page = queryLatestCollection(items, { page: 99, rows: 2, now: 160000 });
    assert.strictEqual(page.msg.count, 3);
    assert.deepStrictEqual(page.msg.pagination, { page: 2, total: 2 });
    assert.strictEqual(page.msg.data[0].date, "");
    assert.strictEqual(queryLatestCollection(items, { search: "game 1", tags: [7], prefixes: [13] }).msg.count, 1);
    assert.strictEqual(queryLatestCollection(items, { tags: [7, 8] }).msg.count, 0);
    assert.strictEqual(queryLatestCollection(items, { tags: [7, 8], tagtype: "or" }).msg.count, 3);
    assert.strictEqual(queryLatestCollection(items, { notags: [7] }).msg.count, 0);
    assert.strictEqual(queryLatestCollection(items, { noprefixes: [13] }).msg.count, 0);
    assert.strictEqual(queryLatestCollection(items, { creator: "missing" }).msg.count, 0);
    assert.strictEqual(queryLatestCollection(items, { sort: "views" }).msg.data[0].thread_id, 1);
    const dated = [{ ...items[0], ts: 1700000000 }];
    assert.strictEqual(queryLatestCollection(dated, { now: (1700000000 + 31536000) * 1000 }).msg.data[0].date, "1 year");
    assert.strictEqual(queryLatestCollection(dated, { now: (1700000000 + 7200) * 1000 }).msg.data[0].date, "2 hours");
    assert.strictEqual(queryLatestCollection(dated, { now: 1700000000000 }).msg.data[0].date, "Just now");
    assert.strictEqual(queryLatestCollection(items, { date: 1, now: 160000 }).msg.count, 2);
    assert.strictEqual(queryLatestCollection([{ ...items[0], ignored: true }], { ignored: "hide" }).msg.count, 0);
    assert.deepStrictEqual(queryLatestCollection([]).msg.pagination, { page: 1, total: 1 });
  });

  runTest("LIBRARY-LATEST-COLLECTION-04 keyset loading is bounded cancelable and deduplicated", async () => {
    const { loadLatestCollection, createLatestCatalogLookup } = collection();
    const lookup = createLatestCatalogLookup(catalogs);
    let reads = 0, yields = 0;
    const args = { lookup, yieldWork: async () => { yields++; }, readPage: async () => ++reads === 1 ? { rows: [record(1)], hasNext: true, nextCursor: { id: 1 } } : { rows: [record(1), record(2)], hasNext: false } };
    const loaded = await loadLatestCollection(args);
    assert.deepStrictEqual(loaded.items.map((r) => r.thread_id), [1, 2]);
    assert.strictEqual(yields, 1);
    assert.strictEqual((await loadLatestCollection({ ...args, isCurrent: () => false })).reason, "cancelled");
    assert.strictEqual((await loadLatestCollection({ ...args, limit: 1, readPage: async () => ({ rows: [record(1), record(2)] }) })).reason, "collection_too_large");
    assert.strictEqual((await loadLatestCollection({ ...args, readPage: async () => ({ rows: [], hasNext: true }) })).reason, "invalid_cursor");
    assert.strictEqual((await loadLatestCollection({ ...args, readPage: async () => ({ ok: false, reason: "storage_error" }) })).reason, "storage_error");
    let current = true;
    assert.strictEqual((await loadLatestCollection({ ...args, isCurrent: () => current, readPage: async () => {
      current = false;
      return { rows: [record(1)], hasNext: false };
    } })).reason, "cancelled");
  });
};
