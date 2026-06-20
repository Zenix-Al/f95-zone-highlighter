import { LIBRARY_DB_NAME, LIBRARY_INDEXES, LIBRARY_STORE_NAME } from "../../constants.js";

export function createLibraryStorePayload(extra = {}) {
  return {
    dbName: LIBRARY_DB_NAME,
    storeName: LIBRARY_STORE_NAME,
    keyPath: "threadId",
    indexes: LIBRARY_INDEXES,
    ...extra,
  };
}
