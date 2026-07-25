import {
  LIBRARY_DB_STORES,
  LIBRARY_DB_VERSION,
  LIBRARY_SCHEMA_MARKER_KEY,
} from "../../constants.js";
import { createLibraryStorePayload } from "./storePayload.js";

function requireSuccess(result, operation) {
  if (!result?.ok) throw new Error(`${operation}:${result?.reason || "failed"}`);
  return result.value;
}

let schemaReadyPromise = null;

async function verifyAndMarkSchema(bridge) {
  for (const store of LIBRARY_DB_STORES) {
    requireSuccess(
      await bridge.invokeCoreAction(
        "idb.count",
        createLibraryStorePayload({ storeName: store.name, limit: 0 }),
      ),
      `verify-store-${store.name}`,
    );
    for (const index of store.indexes) {
      requireSuccess(
        await bridge.invokeCoreAction(
          "idb.query",
          createLibraryStorePayload({
            storeName: store.name,
            index: index.name,
            limit: 1,
          }),
        ),
        `verify-index-${store.name}-${index.name}`,
      );
    }
  }

  const markerPayload = createLibraryStorePayload({
    storeName: "meta",
    keyPath: "key",
    indexes: [],
    key: LIBRARY_SCHEMA_MARKER_KEY,
  });
  const existing = requireSuccess(
    await bridge.invokeCoreAction("idb.get", markerPayload),
    "read-schema-marker",
  );
  if (existing?.version === LIBRARY_DB_VERSION && existing?.complete === true) return existing;

  const marker = {
    key: LIBRARY_SCHEMA_MARKER_KEY,
    version: LIBRARY_DB_VERSION,
    complete: true,
  };
  requireSuccess(
    await bridge.invokeCoreAction("idb.put", { ...markerPayload, value: marker }),
    "write-schema-marker",
  );
  return marker;
}

export function ensureLibrarySchema(bridge) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = verifyAndMarkSchema(bridge).catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

export function resetLibrarySchemaForTests() {
  schemaReadyPromise = null;
}
