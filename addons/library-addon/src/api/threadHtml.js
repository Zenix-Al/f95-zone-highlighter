import { debugLog } from "../../../shared/debugLog.js";

const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEBUG_OWNER = "library-addon:auto-update";

export function createThreadHtmlRequest(fetchFn = globalThis.fetch) {
  return async function requestThreadHtml(url, options = {}) {
    let target;
    try {
      target = new URL(url, globalThis.location?.origin || "https://f95zone.to");
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
    if (!/(^|\.)f95zone\.to$/i.test(target.hostname)) {
      return { ok: false, reason: "unsupported_origin" };
    }
    const timeoutMs = Math.min(30_000, Math.max(1, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)));
    const maxBytes = Math.max(1024, Number(options.maxBytes || DEFAULT_MAX_BYTES));
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      debugLog(DEBUG_OWNER, "Thread HTML request started.", {
        data: {
          path: `${target.pathname}${target.search}`,
          timeoutMs,
          maxBytes,
        },
      });
      const response = await fetchFn(target.href, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal,
      });
      const contentLength = Number(response.headers?.get?.("content-length") || 0);
      debugLog(DEBUG_OWNER, "Thread HTML response received.", {
        data: {
          path: target.pathname,
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          finalPath: (() => {
            try {
              return new URL(response.url || target.href).pathname;
            } catch {
              return "";
            }
          })(),
          contentType: response.headers?.get?.("content-type") || "",
          contentLength,
        },
      });
      if (contentLength > maxBytes) {
        debugLog(DEBUG_OWNER, "Thread HTML response rejected.", {
          level: "warn",
          data: { path: target.pathname, reason: "response_too_large", contentLength },
        });
        return { ok: false, reason: "response_too_large" };
      }
      if (!response.ok) {
        debugLog(DEBUG_OWNER, "Thread HTML response rejected.", {
          level: "warn",
          data: { path: target.pathname, reason: `http_${response.status}` },
        });
        return { ok: false, reason: `http_${response.status}`, status: response.status };
      }
      const html = await response.text();
      const responseBytes = new TextEncoder().encode(html).length;
      if (responseBytes > maxBytes) {
        debugLog(DEBUG_OWNER, "Thread HTML body rejected.", {
          level: "warn",
          data: { path: target.pathname, reason: "response_too_large", responseBytes },
        });
        return { ok: false, reason: "response_too_large" };
      }
      debugLog(DEBUG_OWNER, "Thread HTML body accepted.", {
        data: { path: target.pathname, responseBytes },
      });
      return { ok: true, html, finalUrl: response.url || url, status: response.status };
    } catch (error) {
      if (options.signal?.aborted) {
        debugLog(DEBUG_OWNER, "Thread HTML request cancelled.", {
          data: { path: target.pathname },
        });
        return { ok: false, reason: "cancelled" };
      }
      if (controller.signal.aborted) {
        debugLog(DEBUG_OWNER, "Thread HTML request timed out.", {
          level: "warn",
          data: { path: target.pathname, timeoutMs },
        });
        return { ok: false, reason: "timeout" };
      }
      debugLog(DEBUG_OWNER, "Thread HTML request failed.", {
        level: "warn",
        data: {
          path: target.pathname,
          reason: "network_error",
          error: String(error?.message || error),
        },
      });
      return { ok: false, reason: "network_error", error };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  };
}
