import {
  LIBRARY_IMPORT_MAX_RETRIES,
  LIBRARY_IMPORT_RETRY_DELAY_MS,
} from "../../constants.js";
import { createLibraryStorePayload } from "./storePayload.js";

const TRANSIENT_CORE_REASONS = new Set([
  "rate_limited",
  "too_many_concurrent_requests",
  "timeout",
]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function createLibraryApiClient(bridge) {
  async function invokeImportAction(action, payload, shouldCancel) {
    let result = null;
    for (let attempt = 0; attempt <= LIBRARY_IMPORT_MAX_RETRIES; attempt += 1) {
      if (shouldCancel?.()) return { ok: false, reason: "cancelled" };
      result = await bridge.invokeCoreAction(action, payload);
      if (result?.ok || !TRANSIENT_CORE_REASONS.has(String(result?.reason || ""))) return result;
      if (attempt < LIBRARY_IMPORT_MAX_RETRIES) {
        await wait(LIBRARY_IMPORT_RETRY_DELAY_MS * (attempt + 1));
      }
    }
    return result;
  }

  return {
    createEntriesPayload(entries = []) {
      return createLibraryStorePayload({
        entries: (Array.isArray(entries) ? entries : []).map((value) => ({ value })),
      });
    },

    async getCoreThrottleInfo() {
      try {
        const result =
          typeof bridge.getCoreThrottle === "function"
            ? await bridge.getCoreThrottle()
            : await bridge.invokeCoreAction("addon.throttle", {});
        return result?.ok ? result.value || null : null;
      } catch {
        return null;
      }
    },

    async getEntry(threadId) {
      const result = await bridge.invokeCoreAction(
        "idb.get",
        createLibraryStorePayload({
          key: String(threadId || "").trim(),
        }),
      );
      if (!result?.ok) return null;
      return result.value || null;
    },

    putEntry(value, options = {}) {
      const payload = createLibraryStorePayload({ value });
      return options.importAction
        ? invokeImportAction("idb.put", payload, options.shouldCancel)
        : bridge.invokeCoreAction("idb.put", payload);
    },

    deleteEntry(threadId) {
      return bridge.invokeCoreAction(
        "idb.delete",
        createLibraryStorePayload({
          key: String(threadId || "").trim(),
        }),
      );
    },

    queryEntries({ index, direction, limit, offset } = {}) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          index,
          direction,
          limit,
          offset,
        }),
      );
    },

    bulkPutEntries(entries, shouldCancel) {
      const payload = createLibraryStorePayload({
        entries: (Array.isArray(entries) ? entries : []).map((value) => ({ value })),
      });
      return invokeImportAction("idb.bulkPut", payload, shouldCancel);
    },
  };
}
