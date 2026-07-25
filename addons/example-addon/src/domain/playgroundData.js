import {
  EXAMPLE_IDB_DB_NAME,
  EXAMPLE_IDB_PRIMARY_KEY,
  EXAMPLE_IDB_STORE_NAME,
} from "../constants.js";

export function buildIdbPayload(extra = {}) {
  return {
    dbName: EXAMPLE_IDB_DB_NAME,
    storeName: EXAMPLE_IDB_STORE_NAME,
    keyPath: "id",
    indexes: [{ name: "updatedAt", keyPath: "updatedAt" }],
    ...extra,
  };
}

export function createIdbBulkDeletePayload(keys) {
  return buildIdbPayload({ keys });
}

export function createIdbRowsPreview(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const value = row?.value && typeof row.value === "object" ? row.value : row;
    if (!value || typeof value !== "object" || typeof value.body !== "string") return row;
    const previewValue = {
      ...value,
      body: `${value.body.slice(0, 80)}... [${value.body.length} characters]`,
    };
    return row?.value && typeof row.value === "object"
      ? { ...row, value: previewValue }
      : previewValue;
  });
}

export function createPrimaryRecord() {
  return {
    id: EXAMPLE_IDB_PRIMARY_KEY,
    label: "Hello from idb.put",
    updatedAt: Date.now(),
  };
}

export function summarizeTagPrefs(value) {
  if (!value || typeof value !== "object") return null;
  return {
    tags: Array.isArray(value.tags) ? value.tags.length : 0,
    preferredTags: Array.isArray(value.preferredTags) ? value.preferredTags.length : 0,
    excludedTags: Array.isArray(value.excludedTags) ? value.excludedTags.length : 0,
    markedTags: Array.isArray(value.markedTags) ? value.markedTags.length : 0,
    colorKeys:
      value.color && typeof value.color === "object"
        ? Object.keys(value.color).length
        : 0,
  };
}
