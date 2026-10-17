"use strict";

module.exports = ({ assert, loadModule, runTest, esbuild, ROOT }) => {
  const { createHybridRequestBudget, createHybridBudgetRepository, HYBRID_BUDGET_KEY, HYBRID_LOCK_NAME } = loadModule("addons/library-addon/src/library/hybridRequestBudget.js");
  const HOUR = 3600000;
  function harness(start = 10 * HOUR) {
    let value = null;
    let time = start;
    let tail = Promise.resolve();
    const writes = [];
    const waits = [];
    const locks = { request(name, options, callback) {
      assert.strictEqual(name, HYBRID_LOCK_NAME);
      assert.strictEqual(options.mode, "exclusive");
      const pending = tail.then(() => {
        if (options.signal?.aborted) throw new Error("aborted");
        return callback();
      });
      tail = pending.catch(() => {});
      return pending;
    } };
    const repository = {
      read: async () => ({ ok: true, value: value === null ? null : structuredClone(value) }),
      write: async (next) => { value = structuredClone(next); writes.push(structuredClone(value)); return { ok: true }; },
    };
    const options = { repository, locks, now: () => time, waitFor: async (ms) => { waits.push(ms); time += ms; } };
    return { repository, writes, waits, options, make: (overrides = {}) => createHybridRequestBudget({ ...options, ...overrides }),
      now: () => time, setTime: (next) => { time = next; }, value: () => value, setValue: (next) => { value = next; } };
  }
  const success = async () => ({ ok: true });

  runTest("LIBRARY-UPDATE-ERRORS-01 serializes a bounded shared ring without touching the request budget", async () => {
    const h = harness();
    let log = null;
    const repository = { ...h.repository,
      readErrors: async () => ({ ok: true, value: structuredClone(log) }),
      writeErrors: async (value) => { log = structuredClone(value); return { ok: true }; },
    };
    const tabs = [h.make({ repository }), h.make({ repository })];
    const results = await Promise.all(Array.from({ length: 25 }, (_, index) => tabs[index % 2].recordError({
      threadId: String(index + 1), source: "latest-api", code: "timeout", outcome: "fallback_pending", action: "fallback",
      cookie: "secret", response: "private body",
    })));
    assert.ok(results.every((result) => result.ok));
    assert.strictEqual(log.version, 1);
    assert.strictEqual(log.entries.length, 20);
    assert.strictEqual(log.entries[0].threadId, "25");
    assert.strictEqual(log.entries.at(-1).threadId, "6");
    assert.strictEqual(h.value(), null, "logging cannot initialize or reset API usage");
    const id = results.at(-1).id;
    await tabs[0].recordError({ outcome: "recovered", action: "none" }, id);
    const persisted = await h.make({ repository }).getRecentErrors();
    assert.strictEqual(persisted.value[0].outcome, "recovered");
    assert.strictEqual(persisted.value[0].code, "timeout");
    assert.strictEqual(persisted.value[0].source, "latest-api");
    assert.doesNotMatch(JSON.stringify(persisted), /secret|private body|cookie|response/);
    const { createAutoUpdateDiagnostics } = loadModule("addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js");
    const diagnostic = createAutoUpdateDiagnostics({ status: "running" }, null, true, persisted);
    assert.strictEqual(diagnostic.split("\n").filter((line) => line.includes(" | thread ")).length, 20);
    const { formatRecentUpdateErrors } = loadModule("addons/library-addon/src/library/updateErrorLog.js");
    const bounded = formatRecentUpdateErrors({ ok: true, value: [{ source: "latest-api", title: "A\nB".repeat(200), developer: "D".repeat(500), query: "Q".repeat(100), creatorQuery: "C".repeat(100), note: "private-note" }] });
    assert.strictEqual(bounded.length, 2);
    assert.doesNotMatch(bounded[1], /\n|private-note/);
    assert.ok(bounded[1].includes(`developer="${"D".repeat(120)}"`));
    assert.ok(bounded[1].includes(`search="${"Q".repeat(30)}"`));
    const legacy = formatRecentUpdateErrors({ ok: true, value: [{ source: "latest-api", code: "timeout" }] });
    assert.match(legacy[1], /title="".*developer=""/);
    await tabs[0].recordError({ outcome: "recovered" }, results[0].id);
    assert.strictEqual(log.entries.length, 20, "an aged-out fallback cannot resurrect an entry");
    const failed = h.make({ repository: { ...repository, readErrors: async () => ({ ok: false }) } });
    assert.strictEqual((await failed.getRecentErrors()).reason, "error_log_read_failed");
  });

  runTest("LIBRARY-HYBRID-04 reserves before requests and counts failures without refunds", async () => {
    const h = harness();
    const gate = h.make();
    for (const reason of ["timeout", "network_error", "http_500"]) {
      const before = h.value()?.used || 0;
      const outcome = await gate.attempt("api", async () => {
        assert.strictEqual(h.value().used, before + 1);
        return { ok: false, reason };
      });
      assert.strictEqual(outcome.result.reason, reason);
    }
    await gate.attempt("api", async () => { throw new Error("network"); });
    assert.strictEqual((await gate.getStatus()).value.used, 4);
    await gate.attempt("html", success);
    assert.strictEqual((await gate.getStatus()).value.used, 4);
    assert.ok(h.waits.every((ms) => ms === 15000));
  });

  runTest("LIBRARY-HYBRID-04 serializes 81 simultaneous manual/auto attempts across instances", async () => {
    const h = harness();
    const tabs = Array.from({ length: 10 }, () => h.make());
    const starts = [];
    const results = await Promise.all(Array.from({ length: 81 }, (_, index) => tabs[index % tabs.length].attempt("api", async () => {
      starts.push(h.now()); return { ok: true };
    })));
    assert.strictEqual(starts.length, 80);
    assert.strictEqual(results.filter((result) => result.reason === "api_exhausted").length, 1);
    assert.ok(starts.every((time, index) => !index || time - starts[index - 1] >= 15000));
    assert.strictEqual((await h.make().getStatus()).value.used, 80);
    await h.make().attempt("html", success);
    assert.strictEqual(h.value().used, 80);
  });

  runTest("LIBRARY-HYBRID-04 refills at the next fixed hour and midnight, not after rolling expiry", async () => {
    for (const hour of [10, 23]) {
      const h = harness(hour * HOUR + HOUR - 1000);
      await h.make().attempt("api", success);
      assert.strictEqual(h.value().used, 1);
      h.setTime((hour + 1) * HOUR);
      const result = await h.make().attempt("api", success);
      assert.strictEqual(result.value.used, 1);
      assert.strictEqual(h.value().hour, hour + 1);
      assert.ok(h.waits.length > 0, "hour boundary never bypasses spacing");
      h.setTime(hour * HOUR);
      assert.strictEqual((await h.make().attempt("api", success)).reason, "clock_regressed");
    }
  });

  runTest("LIBRARY-HYBRID-04 API blocks suppress API but permit paced HTML and honor Retry-After", async () => {
    const h = harness(10 * HOUR + 59 * 60000);
    const gate = h.make();
    await gate.attempt("api", async () => ({ ok: false, reason: "rate_limited", retryAfter: "3600" }));
    const blockedUntil = h.now() + HOUR;
    assert.strictEqual(h.value().apiBlockedUntil, blockedUntil);
    assert.strictEqual((await h.make().attempt("api", success)).reason, "api_suppressed");
    assert.strictEqual((await h.make().attempt("html", success)).result.ok, true);
    assert.strictEqual(h.value().used, 1);
    h.setTime(11 * HOUR);
    assert.strictEqual((await h.make().attempt("api", success)).reason, "api_suppressed");
    h.setTime(blockedUntil);
    assert.strictEqual((await h.make().attempt("api", success)).result.ok, true);
    assert.strictEqual(h.value().used, 1);
    const challenged = harness();
    await challenged.make().attempt("api", async () => ({ ok: false, reason: "challenge_page", retryAfter: "nonsense" }));
    assert.strictEqual(challenged.value().apiBlockedUntil, challenged.now() + 1800000);
  });

  runTest("LIBRARY-HYBRID-07 timezone display and repeated DST hours cannot refill an absolute hour", async () => {
    const originalTimezone = process.env.TZ;
    try {
      // New York repeats 01:00 at this UTC boundary; the ledger must still use
      // distinct absolute hours, independent of local display or timezone changes.
      const boundary = Date.UTC(2026, 10, 1, 6);
      const h = harness(boundary - 1000);
      await h.make().attempt("api", success);
      for (const timezone of ["UTC", "Asia/Bangkok", "America/New_York", "Pacific/Chatham"]) {
        process.env.TZ = timezone;
        const state = await h.make().getStatus();
        assert.strictEqual(state.value.used, 1);
        assert.strictEqual(state.value.hour, Math.floor((boundary - 1000) / HOUR));
      }
      h.setTime(boundary);
      assert.strictEqual((await h.make().getStatus()).value.used, 0);
      await h.make().attempt("api", success);
      assert.strictEqual(h.value().used, 1);
      assert.ok(h.waits.length, "the DST boundary cannot bypass spacing");
      h.setTime(boundary + 25 * HOUR);
      const forward = await h.make().getStatus();
      assert.strictEqual(forward.value.used, 0);
      assert.strictEqual(forward.value.hour, Math.floor(h.now() / HOUR));
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  runTest("LIBRARY-HYBRID-04 HTML blocks pause both sources and survive new instances and hour rollover", async () => {
    const h = harness(10 * HOUR + 59 * 60000);
    await h.make().attempt("api", async () => ({ ok: false, reason: "network_error" }));
    await h.make().attempt("html", async () => ({ ok: false, reason: "challenge_page" }));
    const deadline = h.value().siteBlockedUntil;
    h.setTime(11 * HOUR);
    for (const source of ["api", "html"]) assert.strictEqual((await h.make().attempt(source, success)).reason, "site_blocked");
    h.setTime(deadline);
    assert.strictEqual((await h.make().attempt("html", success)).result.ok, true);
    const existing = harness();
    const gate = existing.make({ getSiteBlock: async () => ({ blockedUntil: existing.now() + 1800000, blockedReason: "rate_limited" }) });
    assert.strictEqual((await gate.attempt("api", success)).reason, "site_blocked");
    assert.strictEqual((await existing.make().attempt("html", success)).reason, "site_blocked");
  });

  runTest("LIBRARY-HYBRID-04 long requests crossing an hour preserve suppression and charge only the start bucket", async () => {
    const h = harness(11 * HOUR - 1000);
    const outcome = await h.make().attempt("api", async () => {
      assert.strictEqual(h.value().hour, 10);
      assert.strictEqual(h.value().used, 1);
      h.setTime(11 * HOUR + 100);
      return { ok: false, reason: "rate_limited", retryAfter: new Date(h.now() + HOUR).toUTCString() };
    });
    assert.strictEqual(outcome.value.hour, 11);
    assert.strictEqual(outcome.value.used, 0);
    assert.ok(outcome.value.apiBlockedUntil >= h.now() + 1800000);
    assert.strictEqual((await h.make().attempt("api", success)).reason, "api_suppressed");
    const huge = harness();
    await huge.make().attempt("api", async () => ({ ok: false, reason: "rate_limited", retryAfter: "999999999999999999999999999" }));
    assert.strictEqual(huge.value().apiBlockedUntil, Number.MAX_SAFE_INTEGER);
  });

  runTest("LIBRARY-HYBRID-04 fails closed on unavailable locks, storage errors and corrupt state", async () => {
    const h = harness();
    let calls = 0;
    const request = async () => { calls += 1; return { ok: true }; };
    assert.strictEqual((await h.make({ locks: {} }).attempt("api", request)).reason, "locking_unavailable");
    for (const repository of [
      { read: async () => ({ ok: false }), write: h.repository.write },
      { read: h.repository.read, write: async () => ({ ok: false }) },
    ]) assert.strictEqual((await h.make({ repository }).attempt("api", request)).ok, false);
    for (const value of [{}, { version: 2 }, { used: -1 }]) {
      h.setValue(value);
      assert.strictEqual((await h.make().attempt("api", request)).reason, "invalid_budget");
    }
    assert.strictEqual(calls, 0);
  });

  runTest("LIBRARY-HYBRID-04 cancellation and lost ownership prevent late requests without refunds", async () => {
    const h = harness();
    let calls = 0;
    const request = async () => { calls += 1; return { ok: true }; };
    assert.strictEqual((await h.make().attempt("api", request, { stillOwn: async () => false })).reason, "lease_lost");
    let checks = 0;
    const lost = await h.make().attempt("api", request, { stillOwn: async () => ++checks === 1 });
    assert.strictEqual(lost.reason, "lease_lost");
    assert.strictEqual(h.value().used, 1);
    const controller = new AbortController();
    const waiting = h.make({ waitFor: async () => controller.abort() });
    assert.strictEqual((await waiting.attempt("html", request, { signal: controller.signal })).reason, "cancelled");
    assert.strictEqual(calls, 0);
    assert.strictEqual(h.value().used, 1);
  });

  runTest("LIBRARY-HYBRID-04 abort while queued and ownership loss during fetch cannot return usable results", async () => {
    const h = harness();
    let release;
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    let own = true;
    const first = h.make().attempt("api", async () => {
      started();
      await new Promise((resolve) => { release = resolve; });
      own = false;
      return { ok: true, privateFacts: "must not commit" };
    }, { stillOwn: async () => own });
    await ready;
    const controller = new AbortController();
    let calls = 0;
    const queued = h.make().attempt("api", async () => { calls += 1; return { ok: true }; }, { signal: controller.signal });
    controller.abort(); release();
    const result = await first;
    assert.strictEqual(result.reason, "lease_lost");
    assert.strictEqual(Object.hasOwn(result, "result"), false);
    assert.strictEqual((await queued).reason, "cancelled");
    assert.strictEqual(h.value().used, 1);
    assert.strictEqual(calls, 0);
  });

  runTest("LIBRARY-HYBRID-04 uses the checked meta API without touching daily or cycle stores", async () => {
    const calls = [];
    const repository = createHybridBudgetRepository({
      getStoreValue: async (...args) => { calls.push(args); return { ok: true, value: null }; },
      putStoreValue: async (...args) => { calls.push(args); return { ok: true }; },
    });
    await repository.read(); await repository.write({ version: 1 });
    assert.deepStrictEqual(calls, [["meta", HYBRID_BUDGET_KEY, "key"], ["meta", { version: 1, key: HYBRID_BUDGET_KEY }, "key"]]);
  });

  runTest("LIBRARY-HYBRID-04 native Web Locks serialize two Chromium tabs over real IndexedDB", async () => {
    const { chromium } = require("@playwright/test");
    const http = require("http");
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" }); response.end("<!doctype html><title>Offline budget test</title>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const pages = await Promise.all([context.newPage(), context.newPage()]);
      const code = esbuild.buildSync({
        stdin: { contents: 'export { createHybridRequestBudget } from "./addons/library-addon/src/library/hybridRequestBudget.js";', resolveDir: ROOT },
        bundle: true, format: "iife", globalName: "BudgetUnderTest", write: false,
      }).outputFiles[0].text;
      await Promise.all(pages.map(async (page) => {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.addScriptTag({ content: code });
      }));
      const results = await Promise.all(pages.map((page) => page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("budget-test", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("meta");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        let time = 10 * 3600000;
        const repository = {
          read: () => new Promise((resolve, reject) => {
            const request = db.transaction("meta").objectStore("meta").get("budget");
            request.onsuccess = () => {
              time = Math.max(time, request.result?.lastClockAt || 0);
              resolve({ ok: true, value: request.result || null });
            };
            request.onerror = () => reject(request.error);
          }),
          write: (value) => new Promise((resolve, reject) => {
            const transaction = db.transaction("meta", "readwrite");
            transaction.objectStore("meta").put(value, "budget");
            transaction.oncomplete = () => resolve({ ok: true });
            transaction.onerror = () => reject(transaction.error);
          }),
        };
        const gate = BudgetUnderTest.createHybridRequestBudget({ repository, now: () => time, waitFor: async (ms) => { time += ms; } });
        const outcomes = await Promise.all(Array.from({ length: 45 }, () => gate.attempt("api", async () => ({ ok: false, reason: "timeout" }))));
        db.close();
        return outcomes.map(({ ok, reason, value }) => ({ ok, reason, used: value?.used }));
      })));
      const outcomes = results.flat();
      assert.strictEqual(outcomes.filter((result) => result.ok).length, 80);
      assert.strictEqual(outcomes.filter((result) => result.reason === "api_exhausted").length, 10);
      assert.strictEqual(Math.max(...outcomes.map((result) => result.used || 0)), 80);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
};
