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
    createEntriesPayload(entries = [], storeName = "records") {
      return createLibraryStorePayload({
        storeName,
        keyPath: storeName === "records" ? "threadId" : "id",
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

    queryEntriesPage({ index, direction, limit, cursor } = {}) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          index,
          direction,
          limit,
          cursor,
          pagination: "keyset",
          includeCursor: true,
        }),
      );
    },

    countEntries(index, query) {
      return bridge.invokeCoreAction(
        "idb.count",
        createLibraryStorePayload({ index, query }),
      );
    },

    async getUpdateEvent(id) {
      const result = await bridge.invokeCoreAction(
        "idb.get",
        createLibraryStorePayload({ storeName: "updates", keyPath: "id", key: id }),
      );
      return result?.ok ? result.value || null : null;
    },

    putUpdateEvent(value) {
      return bridge.invokeCoreAction(
        "idb.put",
        createLibraryStorePayload({ storeName: "updates", keyPath: "id", value }),
      );
    },

    deleteUpdateEvent(id) {
      return bridge.invokeCoreAction(
        "idb.delete",
        createLibraryStorePayload({ storeName: "updates", keyPath: "id", key: id }),
      );
    },

    queryUpdateEvents(threadId, limit = 50) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          storeName: "updates",
          keyPath: "id",
          index: "threadObservedAt",
          query: {
            kind: "bound",
            lower: [String(threadId || "").trim(), 0],
            upper: [String(threadId || "").trim(), Number.MAX_SAFE_INTEGER],
          },
          direction: "prev",
          limit: Math.min(200, Math.max(1, Number(limit) || 50)),
        }),
      );
    },

    queryAllUpdateEvents(limit = 10000) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          storeName: "updates",
          keyPath: "id",
          direction: "next",
          limit,
        }),
      );
    },

    async getActivityEvent(id) {
      const result = await bridge.invokeCoreAction(
        "idb.get",
        createLibraryStorePayload({ storeName: "activity", keyPath: "id", key: id }),
      );
      return result?.ok ? result.value || null : null;
    },

    putActivityEvent(value) {
      return bridge.invokeCoreAction(
        "idb.put",
        createLibraryStorePayload({ storeName: "activity", keyPath: "id", value }),
      );
    },

    deleteActivityEvent(id) {
      return bridge.invokeCoreAction(
        "idb.delete",
        createLibraryStorePayload({ storeName: "activity", keyPath: "id", key: id }),
      );
    },

    queryActivityEvents(threadId, limit = 50) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          storeName: "activity",
          keyPath: "id",
          index: "threadOccurredAt",
          query: {
            kind: "bound",
            lower: [String(threadId || "").trim(), 0],
            upper: [String(threadId || "").trim(), Number.MAX_SAFE_INTEGER],
          },
          direction: "prev",
          limit: Math.min(200, Math.max(1, Number(limit) || 50)),
        }),
      );
    },

    queryAllActivityEvents(limit = 10000) {
      return bridge.invokeCoreAction(
        "idb.query",
        createLibraryStorePayload({
          storeName: "activity",
          keyPath: "id",
          direction: "next",
          limit,
        }),
      );
    },

    async getMeta(key) {
      const result = await bridge.invokeCoreAction(
        "idb.get",
        createLibraryStorePayload({ storeName: "meta", keyPath: "key", key }),
      );
      return result?.ok ? result.value || null : null;
    },

    putMeta(value) {
      return bridge.invokeCoreAction(
        "idb.put",
        createLibraryStorePayload({ storeName: "meta", keyPath: "key", value }),
      );
    },

    deleteMeta(key) {
      return bridge.invokeCoreAction(
        "idb.delete",
        createLibraryStorePayload({ storeName: "meta", keyPath: "key", key }),
      );
    },

    bulkPutEntries(entries, shouldCancel) {
      const payload = createLibraryStorePayload({
        entries: (Array.isArray(entries) ? entries : []).map((value) => ({ value })),
      });
      return invokeImportAction("idb.bulkPut", payload, shouldCancel);
    },

    bulkPutStore(storeName, entries, shouldCancel) {
      return invokeImportAction(
        "idb.bulkPut",
        createLibraryStorePayload({
          storeName,
          keyPath: storeName === "records" ? "threadId" : "id",
          entries: (Array.isArray(entries) ? entries : []).map((value) => ({ value })),
        }),
        shouldCancel,
      );
    },
  };
}
