import {
  bulkDeleteRecords,
  countRecords,
  deleteRecord,
  getRecord,
  putRecord,
  queryRecords,
} from "../../api/idb.js";
import { EXAMPLE_IDB_PRIMARY_KEY } from "../../constants.js";
import {
  buildIdbPayload,
  createIdbBulkDeletePayload,
  createIdbRowsPreview,
  createPrimaryRecord,
} from "../../domain/playgroundData.js";

export function createIdbActions({ core, state, bulkImport }) {
  return {
    "idb-put": async () => {
      const record = createPrimaryRecord();
      const result = await putRecord(core, buildIdbPayload({ value: record }));
      if (result?.ok) state.idb.lastRecord = record;
      return result;
    },
    "idb-get": async () => {
      const result = await getRecord(
        core,
        buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }),
      );
      state.idb.lastRecord = result?.ok
        ? result.value
        : { error: result?.reason || "unknown" };
      return result;
    },
    "idb-bulk-put": () => bulkImport.run(),
    "idb-bulk-delete": async () => {
      const queryResult = await queryRecords(
        core,
        buildIdbPayload({ limit: 500, includeKeys: true }),
      );
      if (!queryResult?.ok) return queryResult;
      const keys = (Array.isArray(queryResult.value) ? queryResult.value : [])
        .map((entry) => entry?.key)
        .filter((key) => String(key || "").startsWith("dummy-bulk-"));
      const result = await bulkDeleteRecords(
        core,
        createIdbBulkDeletePayload(keys),
      );
      if (result?.ok) {
        state.idb.rows = [];
        const countResult = await countRecords(core, buildIdbPayload({}));
        state.idb.count = countResult?.ok
          ? Number(countResult.value || 0)
          : state.idb.count;
      }
      return result;
    },
    "bulk-import-cancel": async () => {
      bulkImport.requestCancellation();
      return { ok: true, value: "cancellation requested" };
    },
    "idb-query": async () => {
      const result = await queryRecords(
        core,
        buildIdbPayload({
          index: "updatedAt",
          direction: "prev",
          limit: 10,
          includeKeys: true,
        }),
      );
      state.idb.rows = result?.ok
        ? createIdbRowsPreview(result.value)
        : [{ error: result?.reason || "unknown" }];
      return result;
    },
    "idb-count": async () => {
      const result = await countRecords(core, buildIdbPayload({}));
      state.idb.count = result?.ok ? Number(result.value || 0) : -1;
      return result;
    },
    "idb-delete": async () => {
      const result = await deleteRecord(
        core,
        buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }),
      );
      if (result?.ok) state.idb.lastRecord = null;
      return result;
    },
  };
}
