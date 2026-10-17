"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest }) => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/library-latest-api-chilling-ridge.json"), "utf8"));
  const html = fs.readFileSync(path.join(ROOT, "tests/fixtures/library-hybrid-html-baseline.html"), "utf8");
  const { createLibraryService } = loadModule("addons/library-addon/src/library/service.js");
  const { createLatestListingRequest } = loadModule("addons/library-addon/src/api/latestListing.js");
  const { mapLatestListingFacts } = loadModule("addons/library-addon/src/library/latestListingFacts.js");
  const row = fixture.msg.data[0];
  const url = "https://f95zone.to/threads/chilling-ridge.281676/";
  const catalogs = { tags: row.tags.map((id) => ({ id, name: `Tag ${id}` })), prefixes: { items: [{ id: 2, name: "Synthetic prefix", class: "label--blue" }], categories: {} } };
  function harness({ prefer = true } = {}) {
    let time = 10 * 3600000;
    const stores = new Map(["records", "meta", "updates", "activity", "update-cycles", "update-queue"].map((name) => [name, new Map()]));
    const original = { threadId: String(row.thread_id), recordModifiedAt: 1, thread: { url, title: row.title, currentVersion: "v0.0.5.5", developer: "Stored developer", tags: ["stored"], prefixes: [{ label: "Stored prefix", color: "red" }], threadRating: 4 },
      personal: { addedAt: 1, status: "playing", note: "keep", rating: 4.5, pinned: true, lastPlayedVersion: "v0.0.5.5" }, updateState: "acknowledged", schemaVersion: 5 };
    stores.get("records").set(original.threadId, structuredClone(original));
    stores.get("meta").set("auto-update:config", { preferLatestApi: prefer, spacingMs: 15000, jitterMs: 0, retryLimit: 1 });
    const starts = [];
    let apiOutcome = { ok: true, payload: fixture };
    let htmlOutcome = { ok: true, html, finalUrl: url };
    let catalogOutcome = { ok: true, value: catalogs };
    let failRecordWrites = false;
    let failRecordReads = false;
    let tail = Promise.resolve();
    const locks = { request(_name, _options, callback) { const result = tail.then(callback); tail = result.catch(() => {}); return result; } };
    const bridge = { async invokeCoreAction(action, payload) {
      if (action === "config.getTagPrefs") return structuredClone(catalogOutcome);
      const store = stores.get(payload.storeName);
      if (action === "idb.put" && payload.storeName === "records" && failRecordWrites) return { ok: false, reason: "storage_error" };
      if (action === "idb.get" && payload.storeName === "records" && failRecordReads) return { ok: false, reason: "storage_error" };
      if (action === "idb.get") return { ok: true, value: structuredClone(store.get(payload.key) || null) };
      if (action === "idb.put") { store.set(payload.value.threadId && payload.storeName === "records" ? payload.value.threadId : payload.value.key || payload.value.id, structuredClone(payload.value)); return { ok: true }; }
      if (action === "idb.delete") { store.delete(payload.key); return { ok: true }; }
      if (action === "idb.bulkPut") { payload.entries.forEach(({ value }) => store.set(value.id || value.key || value.threadId, structuredClone(value))); return { ok: true }; }
      if (action === "idb.bulkDelete") { payload.keys.forEach((key) => store.delete(key)); return { ok: true }; }
      const values = [...store.values()].filter((value) => {
        if (payload.index === "cycleId") return value.cycleId === payload.query.value;
        if (payload.index === "cycleStatusPosition" || payload.index === "cycleStatusNextAttempt") {
          return value.cycleId === payload.query.lower[0] && value.status === payload.query.lower[1]
            && (payload.index !== "cycleStatusNextAttempt" || (value.nextAttemptAt >= payload.query.lower[2] && value.nextAttemptAt <= payload.query.upper[2]));
        }
        return !payload.query || value.threadId === payload.query.lower?.[0];
      }).sort((a, b) => (a.position || 0) - (b.position || 0));
      if (action === "idb.count") return { ok: true, value: values.length };
      if (action === "idb.query") {
        const page = values.slice(0, payload.limit || values.length);
        return { ok: true, value: payload.pagination === "keyset" ? {
          items: page.map((value) => ({ value, cursor: { key: value.id, primaryKey: value.id } })),
          hasMore: values.length > page.length, nextCursor: null,
        } : page };
      }
      throw new Error(`Unexpected ${action}`);
    } };
    const make = (budgetOptions = {}) => createLibraryService(bridge, {}, {
      requestLatestApi: async (requested) => { starts.push(["api", time, requested]); return structuredClone(apiOutcome); },
      requestThreadHtml: async (requested) => { starts.push(["html", time, requested]); return structuredClone(htmlOutcome); },
      hybridBudgetOptions: { locks, now: () => time, waitFor: async (ms) => { time += ms; }, ...budgetOptions },
      autoUpdateQueueOptions: { now: () => time },
      autoUpdateWorkerOptions: { now: () => time, waitFor: async (ms) => { time += ms; } },
    });
    const service = make();
    return { service, make, starts, stores, original, now: () => time,
      setApi: (value) => { apiOutcome = value; }, setHtml: (value) => { htmlOutcome = value; },
      setCatalogs: (value) => { catalogOutcome = value; },
      failRecordWrites: () => { failRecordWrites = true; },
      failRecordReads: () => { failRecordReads = true; },
      preview: (options) => service.previewManualUpdateCheck([original.threadId], options),
      record: () => stores.get("records").get(original.threadId),
    };
  }

  runTest("LIBRARY-HYBRID-05 API success commits mapped facts once without touching personal state", async () => {
    const h = harness();
    const before = (await h.service.getEntry(h.original.threadId)).personal;
    const preview = await h.preview();
    assert.strictEqual(preview.results[0].source, "latest-api");
    const diagnostic = await h.service.getHybridRequestStatus();
    assert.strictEqual(diagnostic.lastCheck.source, "latest-api");
    assert.strictEqual(diagnostic.lastCheck.ok, true);
    assert.strictEqual(diagnostic.lastCheck.fallbackReason, "");
    assert.deepStrictEqual(Object.keys(diagnostic.lastCheck).sort(), ["checkedAt", "fallbackReason", "ok", "source"]);
    assert.deepStrictEqual(h.starts.map(([source]) => source), ["api"]);
    const query = new URL(h.starts[0][2]);
    assert.strictEqual(query.searchParams.get("rows"), "15");
    assert.strictEqual(query.searchParams.get("search"), row.title);
    assert.strictEqual(query.searchParams.get("creator"), h.original.thread.developer);
    assert.ok(query.searchParams.has("_"));
    h.record().personal.note = "newer edit from another tab";
    const result = await h.service.commitManualUpdateCheck(preview);
    assert.strictEqual(result.changed, 1);
    assert.strictEqual(h.record().thread.url, url);
    assert.strictEqual(h.record().thread.developer, row.creator);
    assert.deepStrictEqual(h.record().thread.tags, row.tags.map((id) => `tag ${id}`));
    assert.deepStrictEqual(h.record().thread.prefixes, [{ label: "Synthetic prefix", color: "blue" }]);
    assert.strictEqual(h.record().thread.threadRating, 3.71);
    assert.strictEqual(h.record().thread.sourcePage, "latest-api-update-check");
    assert.deepStrictEqual(h.record().personal, { ...before, note: "newer edit from another tab" });
    assert.strictEqual(h.record().updateState, "changed");
    assert.notStrictEqual(h.record().thread.observedAt, row.ts * 1000);
    assert.strictEqual(h.stores.get("updates").size, 1);
    const repeated = await h.preview();
    assert.strictEqual(repeated.results[0].changed, false);
    await h.service.commitManualUpdateCheck(repeated);
    assert.strictEqual(h.stores.get("updates").size, 1);
  });

  runTest("LIBRARY-UPDATE-ERRORS-02 records API errors even when HTML recovers and includes both failures", async () => {
    const h = harness();
    h.setApi({ ok: false, reason: "network_error" });
    const preview = await h.preview();
    assert.strictEqual(preview.results[0].ok, true);
    let errors = await h.service.getRecentUpdateErrors();
    assert.strictEqual(errors.value.length, 1);
    assert.strictEqual(errors.value[0].source, "latest-api");
    assert.strictEqual(errors.value[0].code, "network_error");
    assert.strictEqual(errors.value[0].outcome, "recovered");
    assert.strictEqual(errors.value[0].threadId, h.original.threadId);
    assert.strictEqual(errors.value[0].title, h.original.thread.title);
    assert.strictEqual(errors.value[0].developer, h.original.thread.developer);
    assert.strictEqual(errors.value[0].query, "Chilling Ridge");
    assert.strictEqual(errors.value[0].creatorQuery, h.original.thread.developer);
    h.setHtml({ ok: false, reason: "challenge_page" });
    await h.preview();
    errors = await h.service.getRecentUpdateErrors();
    assert.strictEqual(errors.value.length, 3);
    assert.strictEqual(errors.value[0].source, "thread-html");
    assert.strictEqual(errors.value[0].action, "site_pause");
    assert.strictEqual(errors.value[1].source, "latest-api");
    assert.strictEqual(errors.value[1].outcome, "failed");
    const { createAutoUpdateDiagnostics } = loadModule("addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js");
    const text = createAutoUpdateDiagnostics(null, await h.service.getHybridRequestStatus(), true, errors);
    assert.match(text, /Recent update errors \(3\/20/);
    assert.match(text, /latest-api \| network_error \| recovered/);
    assert.match(text, /thread-html \| challenge_page \| failed \| site_pause/);
    assert.match(text, /title="Chilling Ridge"/);
    assert.ok(text.includes(`developer=${JSON.stringify(h.original.thread.developer)}`));
    assert.doesNotMatch(text, /personal|"cover"/);
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 2);
  });

  runTest("LIBRARY-UPDATE-ERRORS-03 log failures cannot break successful fallback or refund API tokens", async () => {
    const h = harness();
    h.stores.get("meta").set("update-errors-v1", { version: 999 });
    h.setApi({ ok: false, reason: "timeout" });
    const preview = await h.preview();
    assert.strictEqual(preview.results[0].ok, true);
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 1);
    assert.strictEqual((await h.service.getRecentUpdateErrors()).reason, "invalid_error_log");
  });

  runTest("LIBRARY-HYBRID-SEARCH-02 unusable cleaned titles skip API instead of fetching default listings", async () => {
    const h = harness();
    h.record().thread.title = "the of a no on";
    const preview = await h.preview();
    assert.strictEqual(preview.results[0].source, "thread-html");
    assert.strictEqual(preview.results[0].fallbackReason, "query_unusable");
    assert.deepStrictEqual(h.starts.map(([source]) => source), ["html"]);
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 0);
  });

  runTest("LIBRARY-HYBRID-VERSION-02 numeric API versions commit through the canonical path without HTML", async () => {
    for (const version of [0.06, 0]) {
      const h = harness();
      h.setApi({ ok: true, payload: { status: "ok", msg: { data: [{ thread_id: row.thread_id, title: row.title, version }] } } });
      const preview = await h.preview();
      assert.strictEqual(preview.results[0].source, "latest-api");
      assert.strictEqual(preview.results[0].observed.currentVersion, String(version));
      assert.strictEqual((await h.service.commitManualUpdateCheck(preview)).ok, true);
      assert.strictEqual(h.record().thread.currentVersion, String(version));
      assert.deepStrictEqual(h.starts.map(([source]) => source), ["api"]);
    }
  });

  runTest("LIBRARY-HYBRID-05 maps zero rating and distinguishes absent from explicitly empty facts", () => {
    const record = { thread: { url } };
    const absent = mapLatestListingFacts({ title: "Game [Subtitle]", version: "Demo v0.46" }, record, null);
    assert.strictEqual(absent.value.title, "Game [Subtitle]");
    assert.strictEqual(Object.hasOwn(absent.value, "tags"), false);
    const empty = mapLatestListingFacts({ title: row.title, version: row.version, rating: 0, tags: [], prefixes: [] }, record, null);
    assert.strictEqual(empty.value.threadRating, 0);
    assert.deepStrictEqual(empty.value.tags, []);
    assert.deepStrictEqual(empty.value.prefixes, []);
    assert.strictEqual(mapLatestListingFacts(row, record, {}).reason, "mapping_incomplete");
    assert.strictEqual(mapLatestListingFacts({ ...row, rating: "4" }, record, catalogs).reason, "invalid_facts");
  });

  runTest("LIBRARY-HYBRID-05 metadata-only and equivalent versions never reset acknowledgement", async () => {
    const h = harness();
    h.record().thread.currentVersion = "Demo - 0.46";
    h.setApi({ ok: true, payload: { status: "ok", msg: { data: [{ ...row, version: "Demo v0.46", rating: 0, tags: [], prefixes: [] }] } } });
    await h.service.commitManualUpdateCheck(await h.preview());
    assert.strictEqual(h.record().updateState, "acknowledged");
    assert.strictEqual(h.record().thread.threadRating, 0);
    assert.deepStrictEqual(h.record().thread.tags, []);
    assert.deepStrictEqual(h.record().thread.prefixes, []);
    assert.strictEqual([...h.stores.get("updates").values()][0].type, "thread-facts");
    const initial = harness();
    initial.record().thread.currentVersion = "";
    initial.setApi({ ok: true, payload: { status: "ok", msg: { data: [{ thread_id: row.thread_id, title: row.title, version: row.version }] } } });
    await initial.service.commitManualUpdateCheck(await initial.preview());
    assert.strictEqual(initial.record().thread.currentVersion, row.version);
    assert.strictEqual(initial.record().updateState, "acknowledged");
    assert.strictEqual(initial.stores.get("updates").size, 0);
  });

  runTest("LIBRARY-HYBRID-05 production worker uses one daily slot and refunds HTML blocks without API refunds", async () => {
    for (const block of [false, true]) {
      const h = harness();
      h.setApi({ ok: false, reason: "challenge_page" });
      if (block) h.setHtml({ ok: false, reason: "challenge_page" });
      const queue = h.service.autoUpdateQueue;
      const prepared = await queue.prepareCycle({ cycle: { cycleId: "hybrid-production" }, items: [{ threadId: h.original.threadId }] });
      assert.strictEqual(prepared.ok, true);
      const result = await queue.runWorker({ owner: "tab", config: await h.service.autoUpdate.getConfig() });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.cycle.dailyAttempted, block ? 0 : 1);
      assert.strictEqual(result.cycle.completed, block ? 0 : 1);
      assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 1);
      if (block) {
        assert.strictEqual(result.reason, "site_blocked");
        const item = await queue.getQueueItem("hybrid-production:281676");
        assert.strictEqual(item.status, "pending");
        assert.strictEqual(item.attempts, 0);
        assert.strictEqual(h.record().updateCheck, undefined);
      }
    }
  });

  runTest("LIBRARY-HYBRID-05 infrastructure failures defer the real queue without charging a daily check", async () => {
    const h = harness();
    h.stores.get("meta").set("hybrid-request-budget-v1", { version: 999 });
    const queue = h.service.autoUpdateQueue;
    await queue.prepareCycle({ cycle: { cycleId: "deferred-production" }, items: [{ threadId: h.original.threadId }] });
    const result = await queue.runWorker({ owner: "tab", config: await h.service.autoUpdate.getConfig() });
    assert.strictEqual(result.reason, "invalid_budget");
    assert.strictEqual(result.cycle.dailyAttempted, 0);
    assert.strictEqual(result.cycle.failed, 0);
    assert.strictEqual(h.starts.length, 0);
    assert.strictEqual((await queue.getQueueItem("deferred-production:281676")).status, "pending");
  });

  runTest("LIBRARY-HYBRID-05 failed fact persistence never settles a successful fetch as completed", async () => {
    const h = harness();
    const queue = h.service.autoUpdateQueue;
    await queue.prepareCycle({ cycle: { cycleId: "commit-failed" }, items: [{ threadId: h.original.threadId }] });
    h.failRecordWrites();
    const result = await queue.runWorker({ owner: "tab", config: await h.service.autoUpdate.getConfig() });
    assert.strictEqual(result.reason, "commit_failed");
    assert.strictEqual(result.cycle.completed, 0);
    assert.strictEqual(result.cycle.dailyAttempted, 1);
    assert.strictEqual(result.cycle.retryPending, 1);
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 1);
    assert.strictEqual(h.stores.get("updates").size, 0);
    assert.strictEqual((await queue.getQueueItem("commit-failed:281676")).status, "retry");
  });

  runTest("LIBRARY-HYBRID-05 failed fresh reads do not masquerade as removed records or successful commits", async () => {
    const h = harness();
    const preview = await h.preview();
    h.failRecordReads();
    const result = await h.service.commitManualUpdateCheck(preview);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(h.stores.get("updates").size, 0);
    assert.strictEqual(h.record().thread.currentVersion, "v0.0.5.5");
  });

  runTest("LIBRARY-HYBRID-05 wrong ID, missing mappings and API errors fall back once with pacing", async () => {
    for (const api of [
      { ok: true, payload: { status: "ok", msg: { data: [{ ...row, thread_id: 42 }] } } },
      { ok: true, payload: { status: "ok", msg: { data: [{ ...row, tags: [999999] }] } } },
      { ok: false, reason: "network_error" },
    ]) {
      const h = harness(); h.setApi(api);
      const preview = await h.preview();
      assert.strictEqual(preview.results[0].source, "thread-html");
      assert.deepStrictEqual(h.starts.map(([source]) => source), ["api", "html"]);
      assert.ok(h.starts[1][1] - h.starts[0][1] >= 15000);
      assert.strictEqual((await h.service.commitManualUpdateCheck(preview)).checked, 1);
      assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 1);
      assert.strictEqual(h.record().thread.developer, "Stored developer");
      assert.strictEqual(h.stores.get("updates").size, 1);
    }
  });

  runTest("LIBRARY-HYBRID-05 suppression and exhausted budgets select HTML after reload without refilling tokens", async () => {
    const h = harness();
    h.setApi({ ok: false, reason: "rate_limited", retryAfter: "3600" });
    const first = await h.preview();
    assert.strictEqual(first.results[0].ok, true);
    await h.make().previewManualUpdateCheck([h.original.threadId]);
    assert.deepStrictEqual(h.starts.map(([source]) => source), ["api", "html", "html"]);
    const budget = h.stores.get("meta").get("hybrid-request-budget-v1");
    budget.used = 80; budget.apiBlockedUntil = 0;
    await h.make().previewManualUpdateCheck([h.original.threadId]);
    assert.strictEqual(h.starts.at(-1)[0], "html");
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.used, 80);
    assert.strictEqual(h.stores.get("update-cycles").size, 0, "manual checks never create a daily allowance");
  });

  runTest("LIBRARY-HYBRID-05 HTML blocks stop both paths and explicit Retry now clears only the global block", async () => {
    const h = harness();
    h.setApi({ ok: false, reason: "challenge_page" });
    h.setHtml({ ok: true, html: "<html><title>Just a moment</title></html>" });
    const first = await h.preview();
    assert.strictEqual(first.blockedReason, "challenge_page");
    const second = await h.preview();
    assert.strictEqual(second.deferredReason, "site_blocked");
    assert.strictEqual(h.starts.length, 2);
    const usage = (await h.service.getHybridRequestStatus()).value;
    assert.strictEqual(usage.used, 1);
    const { createAutoUpdateScheduler } = loadModule("addons/library-addon/src/library/autoUpdateScheduler.js");
    await h.service.autoUpdateQueue.putCycle({ cycleId: "retry-now", status: "waiting", blockedUntil: usage.siteBlockedUntil, blockedReason: "challenge_page" });
    const scheduler = createAutoUpdateScheduler({ repository: h.service.autoUpdate, queueRuntime: h.service.autoUpdateQueue, now: h.now });
    assert.strictEqual((await scheduler.clearSiteBlock()).ok, true);
    h.setHtml({ ok: true, html, finalUrl: url });
    const retry = await h.preview();
    assert.strictEqual(retry.results[0].ok, true);
    assert.strictEqual(h.starts.at(-1)[0], "html");
    assert.strictEqual((await h.service.getHybridRequestStatus()).value.apiBlockedUntil, usage.apiBlockedUntil);
  });

  runTest("LIBRARY-HYBRID-05 HTML retry uses no second API request and ledger failures do not mark records failed", async () => {
    const h = harness();
    h.setApi({ ok: false, reason: "network_error" });
    let calls = 0;
    const original = h.service.runHybridRequest;
    assert.strictEqual(typeof original, "function");
    h.setHtml({ ok: false, reason: "http_500" });
    const preview = await h.preview({ spacingMs: 1 });
    assert.deepStrictEqual(h.starts.map(([source]) => source), ["api", "html", "html"]);
    assert.strictEqual(preview.results[0].attempts, 2);
    h.stores.get("meta").set("hybrid-request-budget-v1", { version: 999 });
    const deferred = await h.preview();
    assert.strictEqual(deferred.deferredReason, "invalid_budget");
    await h.service.commitManualUpdateCheck(deferred, { shouldCancel: () => { calls += 1; return false; } });
    assert.strictEqual(h.record().updateCheck, undefined);
    assert.strictEqual(calls, 0);
  });

  runTest("LIBRARY-HYBRID-05 toggle off avoids API/catalogs and lost ownership prevents fallback and commit", async () => {
    const off = harness({ prefer: false });
    off.setCatalogs({ ok: false });
    assert.strictEqual((await off.preview()).results[0].source, "thread-html");
    assert.deepStrictEqual(off.starts.map(([source]) => source), ["html"]);
    const noCatalog = harness();
    noCatalog.setCatalogs({ ok: false, reason: "payload_too_large" });
    assert.strictEqual((await noCatalog.preview()).results[0].fallbackReason, "catalog_unavailable");
    assert.deepStrictEqual(noCatalog.starts.map(([source]) => source), ["html"]);
    const unsupported = harness();
    const denied = await unsupported.make({ locks: {} }).previewManualUpdateCheck([unsupported.original.threadId]);
    assert.strictEqual(denied.deferredReason, "locking_unavailable");
    assert.strictEqual(unsupported.starts.length, 0);
    const h = harness();
    const preview = await h.preview();
    const result = await h.service.commitManualUpdateCheck(preview, { stillOwn: async () => false });
    assert.strictEqual(result.cancelled, true);
    assert.strictEqual(h.stores.get("updates").size, 0);
    const lost = await h.preview({ stillOwn: async () => false });
    assert.strictEqual(lost.deferredReason, "lease_lost");
    assert.strictEqual(h.starts.length, 1);
  });

  runTest("LIBRARY-HYBRID-05 API transport uses fixture responses only and classifies size/status/challenges", async () => {
    const query = "https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=list&cat=games&page=1&search=Chilling+Ridge&sort=date&rows=15";
    for (const [status, body, expected] of [[200, JSON.stringify(fixture), "ok"], [403, "<html>Just a moment</html>", "challenge_page"], [429, "", "rate_limited"], [503, "bad gateway", "http_503"], [200, "{broken", "invalid_response"], [200, "x".repeat(262145), "response_too_large"]]) {
      let requestSignal;
      const request = createLatestListingRequest(async (url, options) => {
        requestSignal = options.signal;
        assert.strictEqual(url, query);
        assert.strictEqual(options.credentials, "include");
        assert.strictEqual(options.redirect, "error");
        return { ok: status === 200, status, headers: { get: (name) => name === "retry-after" ? "120" : null }, text: async () => body };
      });
      const result = await request(query);
      assert.strictEqual(result.ok ? "ok" : result.reason, expected);
      assert.strictEqual(requestSignal.aborted, true, "transport closes unread bodies on every terminal path");
      if (expected === "rate_limited") assert.strictEqual(result.retryAfter, "120");
    }
    const controller = new AbortController(); controller.abort();
    assert.strictEqual((await createLatestListingRequest(() => { throw new Error("must not fetch"); })(query, { signal: controller.signal })).reason, "cancelled");
    assert.strictEqual((await createLatestListingRequest(() => { throw new Error("must not fetch"); })("not a URL")).reason, "invalid_url");
    let cancelled = false;
    const streamed = createLatestListingRequest(async () => ({ ok: true, status: 200, headers: { get: () => null }, body: {
      getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(262145) }), cancel: async () => { cancelled = true; }, releaseLock: () => {} }),
    } }));
    assert.strictEqual((await streamed(query)).reason, "response_too_large");
    assert.strictEqual(cancelled, true);
  });
};
