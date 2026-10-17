import { createLatestSearchUrl } from "./updateSource.js";
import { selectLatestListing } from "./latestListingSelector.js";
import { mapLatestListingFacts } from "./latestListingFacts.js";
import { parseLibraryThreadHtml } from "./threadUpdateParser.js";
import { normalizeF95ThreadUrl } from "./threadIdentity.js";

export function createHybridRecordRequest({ budget, requestApi, requestHtml, getCatalogs, spacingMs, stillOwn, preferApi = true }) {
  const triedApi = new Set();
  const fallbackReasons = new Map();
  const apiErrors = new Map();
  let catalogPromise;
  return async (record, options) => {
    const gateOptions = { ...options, spacingMs, stillOwn };
    const key = record.threadId;
    // Diagnostics are best-effort: a log failure never refunds tokens, retries a
    // request, or changes a successful check into a failed one.
    const log = async (entry, id) => {
      try { return await budget.recordError?.({ threadId: key, ...entry }, id); }
      catch { return null; }
    };
    let fallbackReason = fallbackReasons.get(key) || (preferApi ? "html_retry" : "html_only");
    if (preferApi && !triedApi.has(key)) {
      triedApi.add(key);
      catalogPromise ||= Promise.resolve().then(getCatalogs).catch(() => ({ ok: false }));
      const catalogs = await catalogPromise;
      if (!catalogs?.ok) fallbackReason = "catalog_unavailable";
      else if (!createLatestSearchUrl(record.thread.title || record.thread.canonicalTitle, record.thread.developer, { version: record.thread.currentVersion })) fallbackReason = "query_unusable";
      else {
        let requestedUrl;
        const api = await budget.attempt("api", () => {
          requestedUrl = createLatestSearchUrl(record.thread.title || record.thread.canonicalTitle, record.thread.developer, { version: record.thread.currentVersion });
          return requestApi(requestedUrl, options);
        }, gateOptions);
        if (!api.ok && !["api_exhausted", "api_suppressed"].includes(api.reason)) return { ok: false, reason: api.reason, deferred: true };
        if (api.result?.reason === "cancelled") return { ok: false, reason: "cancelled", deferred: true };
        fallbackReason = api.reason || api.result?.reason;
        if (api.ok && api.result?.ok) {
          const selected = selectLatestListing(api.result.payload, key);
          const facts = selected.ok ? mapLatestListingFacts(selected.value, record, catalogs.value) : selected;
          if (facts.ok) return { ...facts, source: "latest-api", fallbackReason: "" };
          fallbackReason = facts.reason;
        }
        if (api.ok && api.result?.reason !== "cancelled") {
          const sent = new URL(requestedUrl).searchParams;
          const logged = await log({ source: "latest-api", code: fallbackReason || "invalid_response", outcome: "fallback_pending", action: "fallback",
            title: record.thread.title || record.thread.canonicalTitle, developer: record.thread.developer,
            query: sent.get("search") || "", creatorQuery: sent.get("creator") || "",
          });
          if (logged?.ok) apiErrors.set(key, logged.id);
        }
      }
    }
    fallbackReasons.set(key, fallbackReason);
    async function finish(result) {
      const cancelled = result.reason === "cancelled" || options.signal?.aborted;
      const outcome = cancelled ? "cancelled" : result.deferred ? "deferred" : result.ok ? "recovered" : "failed";
      const action = cancelled ? "cancelled"
        : ["challenge_page", "rate_limited", "site_blocked"].includes(result.reason) ? "site_pause"
          : result.deferred ? "deferred"
            : ["timeout", "network_error", "http_500", "http_502", "http_503", "http_504"].includes(result.reason) ? "retry_eligible" : "none";
      if (apiErrors.has(key)) await log({ outcome, action }, apiErrors.get(key));
      if (!result.ok && !result.deferred && !cancelled) {
        await log({ source: "thread-html", code: result.reason, outcome: "failed", action });
      }
      return result;
    }
    if (!normalizeF95ThreadUrl(record.thread.url, key)) return finish({ ok: false, reason: "invalid_url", source: "thread-html", fallbackReason });
    const html = await budget.attempt("html", async () => {
      const result = await requestHtml(record.thread.url, options);
      return result.ok ? parseLibraryThreadHtml(result.html, { finalUrl: result.finalUrl, requestedUrl: record.thread.url }) : result;
    }, gateOptions);
    return finish(html.ok ? { ...html.result, source: "thread-html", fallbackReason }
      : { ok: false, reason: html.reason, deferred: true, retryAt: html.value?.siteBlockedUntil, blockReason: html.value?.siteBlockedReason });
  };
}
