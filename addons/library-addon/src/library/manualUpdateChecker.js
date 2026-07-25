import { parseLibraryThreadHtml } from "./threadUpdateParser.js";
import { debugLog } from "../../../shared/debugLog.js";

const RETRYABLE = new Set(["timeout", "network_error", "http_500", "http_502", "http_503", "http_504"]);
const DEBUG_OWNER = "library-addon:auto-update";

function wait(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function checkLibraryRecords(records, requestHtml, options = {}) {
  const signal = options.signal;
  const maxRecords = Math.min(100, Math.max(1, Number(options.maxRecords || 50)));
  const spacingMs = Math.max(0, Number(options.spacingMs || 500));
  const jitterMs = Math.max(0, Number(options.jitterMs || 0));
  const retryLimit = Math.min(5, Math.max(0, Number(options.retryLimit ?? 2)));
  const timeoutMs = Math.min(30_000, Math.max(1, Number(options.timeoutMs || 30_000)));
  const list = (Array.isArray(records) ? records : []).slice(0, maxRecords);
  const results = [];
  debugLog(DEBUG_OWNER, "Update-check batch started.", {
    data: {
      recordCount: list.length,
      spacingMs,
      jitterMs,
      retryLimit,
      timeoutMs,
    },
  });

  for (let index = 0; index < list.length; index += 1) {
    if (signal?.aborted) break;
    const record = list[index];
    let outcome;
    let attempts = 0;
    for (;;) {
      attempts += 1;
      debugLog(DEBUG_OWNER, "Checking library record.", {
        data: { threadId: record.threadId, attempt: attempts },
      });
      outcome = await requestHtml(record.thread?.url || record.url, { signal, timeoutMs });
      debugLog(DEBUG_OWNER, "Library record request settled.", {
        data: {
          threadId: record.threadId,
          attempt: attempts,
          ok: Boolean(outcome.ok),
          reason: outcome.reason || "",
          status: outcome.status || 0,
        },
      });
      if (signal?.aborted || outcome.reason === "cancelled") break;
      if (outcome.ok || !RETRYABLE.has(outcome.reason) || attempts > retryLimit) break;
      debugLog(DEBUG_OWNER, "Retrying library record request.", {
        level: "warn",
        data: { threadId: record.threadId, attempt: attempts + 1, reason: outcome.reason },
      });
      await wait(spacingMs, signal);
    }
    if (signal?.aborted) break;
    const parsed = outcome.ok
      ? parseLibraryThreadHtml(outcome.html, {
          finalUrl: outcome.finalUrl,
          requestedUrl: record.thread?.url || record.url,
        })
      : outcome;
    results.push({
      threadId: record.threadId,
      record,
      attempts,
      ok: Boolean(parsed.ok),
      reason: parsed.ok ? "" : parsed.reason,
      observed: parsed.value || null,
      changed:
        Boolean(parsed.ok) &&
        (
          String(parsed.value.currentVersion || "").trim().toLowerCase() !==
            String(record.thread?.currentVersion || record.gameVersion || "").trim().toLowerCase() ||
          String(parsed.value.title || "").trim().toLowerCase() !==
            String(record.thread?.title || record.title || "").trim().toLowerCase()
        ),
    });
    debugLog(DEBUG_OWNER, "Library record check completed.", {
      data: {
        threadId: record.threadId,
        attempts,
        ok: Boolean(parsed.ok),
        reason: parsed.ok ? "" : parsed.reason,
        changed: results.at(-1).changed,
        observedVersion: parsed.value?.currentVersion || "",
      },
    });
    options.onProgress?.({ completed: results.length, total: list.length, result: results.at(-1) });
    if (index < list.length - 1) {
      await wait(spacingMs + Math.floor(Math.random() * (jitterMs + 1)), signal);
    }
  }
  debugLog(DEBUG_OWNER, "Update-check batch completed.", {
    data: {
      completed: results.length,
      total: list.length,
      cancelled: Boolean(signal?.aborted),
      failed: results.filter((result) => !result.ok).length,
      changed: results.filter((result) => result.changed).length,
    },
  });
  return { results, cancelled: Boolean(signal?.aborted), total: list.length };
}
