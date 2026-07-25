import {
  LIBRARY_DB_NAME,
  LIBRARY_DB_STORES,
  LIBRARY_DB_VERSION,
  LIBRARY_INDEXES,
  LIBRARY_STORE_NAME,
} from "../../constants.js";

export function createLibraryStorePayload(extra = {}) {
  return {
    dbName: LIBRARY_DB_NAME,
    version: LIBRARY_DB_VERSION,
    storeName: LIBRARY_STORE_NAME,
    keyPath: "threadId",
    indexes: LIBRARY_INDEXES,
    stores: LIBRARY_DB_STORES,
    ...extra,
  };
}
