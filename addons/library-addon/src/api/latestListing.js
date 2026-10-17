import { CHALLENGE_PAGE_PATTERN } from "./threadHtml.js";

const MAX_BYTES = 262144;

async function readBody(response) {
  if (Number(response.headers?.get?.("content-length") || 0) > MAX_BYTES) throw new Error("response_too_large");
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("response_too_large");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("response_too_large"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function createLatestListingRequest(fetchFn = globalThis.fetch) {
  return async (url, { signal, timeoutMs = 30000 } = {}) => {
    let target;
    try { target = new URL(url); } catch { return { ok: false, reason: "invalid_url" }; }
    if (target.origin !== "https://f95zone.to" || target.pathname !== "/sam/latest_alpha/latest_data.php"
      || target.searchParams.get("cmd") !== "list" || target.searchParams.get("page") !== "1"
      || target.searchParams.get("cat") !== "games"
      || target.searchParams.get("rows") !== "15") return { ok: false, reason: "invalid_url" };
    if (signal?.aborted) return { ok: false, reason: "cancelled" };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.min(30000, Math.max(1000, Number(timeoutMs) || 30000)));
    try {
      const response = await fetchFn(target.href, {
        credentials: "include", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const retryAfter = String(response.headers?.get?.("retry-after") || "").slice(0, 128);
      if (response.status === 429) return { ok: false, reason: "rate_limited", retryAfter };
      const text = await readBody(response);
      let payload;
      try { payload = JSON.parse(text); } catch { /* HTML challenges are classified below. */ }
      if (!payload && CHALLENGE_PAGE_PATTERN.test(text)) return { ok: false, reason: "challenge_page", retryAfter };
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      return payload ? { ok: true, payload } : { ok: false, reason: "invalid_response" };
    } catch (error) {
      return { ok: false, reason: signal?.aborted ? "cancelled" : controller.signal.aborted ? "timeout"
        : error?.message === "response_too_large" ? "response_too_large" : "network_error" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort(); // Close unread bodies on early 429/size-limit returns too.
    }
  };
}
