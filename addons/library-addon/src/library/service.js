import {
  LIBRARY_DB_NAME,
  LIBRARY_INDEXES,
  LIBRARY_LEGACY_KEY,
  LIBRARY_MIGRATION_MARKER_KEY,
  LIBRARY_STORE_NAME,
} from "../constants.js";

function storePayload(extra = {}) {
  return {
    dbName: LIBRARY_DB_NAME,
    storeName: LIBRARY_STORE_NAME,
    keyPath: "threadId",
    indexes: LIBRARY_INDEXES,
    ...extra,
  };
}

export function createLibraryService(bridge) {
  const SORT_TO_INDEX = {
    updatedAt: "updatedAt",
    title: "titleNormalized",
    status: "userStatus",
  };

  function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) =>
        String(entry || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }

  function normalizeRecord(record) {
    const now = Date.now();
    const title = String(record?.title || "").trim();
    return {
      threadId: String(record?.threadId || "").trim(),
      url: String(record?.url || "").trim(),
      title,
      canonicalTitle: String(record?.canonicalTitle || title).trim(),
      titleNormalized: String(record?.titleNormalized || title)
        .trim()
        .toLowerCase(),
      prefix: String(record?.prefix || "").trim(),
      gameVersion: String(record?.gameVersion || "").trim(),
      tags: normalizeList(record?.tags),
      userStatus: String(record?.userStatus || "saved").trim() || "saved",
      note: String(record?.note || "").trim(),
      userScore: record?.userScore ?? null,
      pinned: Boolean(record?.pinned),
      schemaVersion: Number(record?.schemaVersion || 1),
      sourcePage: String(record?.sourcePage || "thread").trim() || "thread",
      createdAt: Number(record?.createdAt || now),
      updatedAt: Number(record?.updatedAt || now),
    };
  }

  function getSortConfig(sortBy = "updatedAt", sortDir = "desc") {
    const index = SORT_TO_INDEX[String(sortBy || "").trim()] || "updatedAt";
    const direction = String(sortDir || "desc").toLowerCase() === "asc" ? "next" : "prev";
    return { index, direction };
  }

  function matchesFilters(record, filters = {}) {
    const search = String(filters.search || "")
      .trim()
      .toLowerCase();
    const status = String(filters.status || "")
      .trim()
      .toLowerCase();
    const tag = String(filters.tag || "")
      .trim()
      .toLowerCase();
    const prefix = String(filters.prefix || "")
      .trim()
      .toLowerCase();

    if (status && status !== "all" && String(record?.userStatus || "").toLowerCase() !== status) {
      return false;
    }

    if (tag && !normalizeList(record?.tags).includes(tag)) {
      return false;
    }

    if (
      prefix &&
      String(record?.prefix || "")
        .trim()
        .toLowerCase() !== prefix
    ) {
      return false;
    }

    if (!search) return true;
    const haystack = [
      record?.title,
      record?.canonicalTitle,
      record?.prefix,
      record?.gameVersion,
      record?.url,
    ]
      .concat(Array.isArray(record?.tags) ? record.tags : [])
      .concat([record?.threadId])
      .map((part) => String(part || "").toLowerCase())
      .join(" ");
    return haystack.includes(search);
  }

  async function getEntry(threadId) {
    const result = await bridge.invokeCoreAction(
      "idb.get",
      storePayload({
        key: String(threadId || "").trim(),
      }),
    );
    if (!result?.ok) return null;
    return result.value || null;
  }

  async function saveEntry(record) {
    const normalized = normalizeRecord({ ...record, updatedAt: Date.now() });

    if (!normalized.threadId) {
      return { ok: false, reason: "thread_id_required" };
    }

    const existing = await getEntry(normalized.threadId);
    if (existing?.createdAt) {
      normalized.createdAt = existing.createdAt;
    } else if (!normalized.createdAt) {
      normalized.createdAt = Date.now();
    }

    return bridge.invokeCoreAction("idb.put", storePayload({ value: normalized }));
  }

  function removeEntry(threadId) {
    return bridge.invokeCoreAction(
      "idb.delete",
      storePayload({
        key: String(threadId || "").trim(),
      }),
    );
  }

  async function isSaved(threadId) {
    const entry = await getEntry(threadId);
    return Boolean(entry && entry.threadId);
  }

  function listRecent(limit = 200) {
    return bridge.invokeCoreAction(
      "idb.query",
      storePayload({
        index: "updatedAt",
        direction: "prev",
        limit,
      }),
    );
  }

  async function queryEntries(options = {}) {
    const limit = Math.max(1, Number(options.limit || 500));
    const offset = Math.max(0, Number(options.offset || 0));
    const { index, direction } = getSortConfig(options.sortBy, options.sortDir);

    const result = await bridge.invokeCoreAction(
      "idb.query",
      storePayload({
        index,
        direction,
        limit,
        offset,
      }),
    );
    if (!result?.ok || !Array.isArray(result.value)) return [];

    return result.value.map(normalizeRecord).filter((entry) => matchesFilters(entry, options));
  }

  async function getAllEntries(sortBy = "updatedAt", sortDir = "desc") {
    const all = [];
    let offset = 0;
    const pageSize = 500;

    for (;;) {
      const rows = await queryEntries({ sortBy, sortDir, limit: pageSize, offset });
      if (rows.length === 0) break;
      all.push(...rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  }

  async function exportEntries() {
    const records = await getAllEntries("updatedAt", "desc");
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    };
  }

  async function importEntries(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const conflictPolicy = String(options.conflictPolicy || "newer")
      .trim()
      .toLowerCase();
    let imported = 0;
    let skipped = 0;

    for (const raw of list) {
      const next = normalizeRecord(raw);
      if (!next.threadId) {
        skipped += 1;
        continue;
      }

      const existing = await getEntry(next.threadId);
      if (!existing) {
        const putResult = await saveEntry(next);
        if (putResult?.ok) imported += 1;
        else skipped += 1;
        continue;
      }

      if (conflictPolicy === "skip") {
        skipped += 1;
        continue;
      }

      if (conflictPolicy === "newer") {
        const existingUpdatedAt = Number(existing.updatedAt || 0);
        const incomingUpdatedAt = Number(next.updatedAt || 0);
        if (incomingUpdatedAt <= existingUpdatedAt) {
          skipped += 1;
          continue;
        }
      }

      const putResult = await saveEntry({ ...existing, ...next, createdAt: existing.createdAt });
      if (putResult?.ok) imported += 1;
      else skipped += 1;
    }

    return { ok: true, imported, skipped };
  }

  async function patchEntry(threadId, patch = {}) {
    const normalizedId = String(threadId || "").trim();
    if (!normalizedId) return { ok: false, reason: "thread_id_required" };

    const existing = await getEntry(normalizedId);
    if (!existing) return { ok: false, reason: "entry_not_found" };

    return saveEntry({ ...existing, ...patch, threadId: normalizedId });
  }

  async function bulkUpdateStatus(threadIds = [], status = "saved") {
    const ids = [
      ...new Set(
        (Array.isArray(threadIds) ? threadIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];
    const nextStatus = String(status || "saved").trim() || "saved";
    let updated = 0;
    let skipped = 0;

    for (const id of ids) {
      const result = await patchEntry(id, { userStatus: nextStatus });
      if (result?.ok) updated += 1;
      else skipped += 1;
    }

    return { ok: true, updated, skipped };
  }

  async function bulkRemoveEntries(threadIds = []) {
    const ids = [
      ...new Set(
        (Array.isArray(threadIds) ? threadIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];
    let removed = 0;
    let skipped = 0;

    for (const id of ids) {
      const result = await removeEntry(id);
      if (result?.ok) removed += 1;
      else skipped += 1;
    }

    return { ok: true, removed, skipped };
  }

  async function runLegacyMigration() {
    const markerResult = await bridge.invokeCoreAction("storage.get", {
      key: LIBRARY_MIGRATION_MARKER_KEY,
      defaultValue: false,
    });
    if (markerResult?.ok && markerResult.value === true) {
      return { ok: true, migrated: 0, skipped: true };
    }

    const legacyResult = await bridge.invokeCoreAction("storage.get", {
      key: LIBRARY_LEGACY_KEY,
      defaultValue: null,
    });
    const rawLegacy = legacyResult?.ok ? legacyResult.value : null;

    let migrated = 0;
    if (Array.isArray(rawLegacy)) {
      const imported = await importEntries(rawLegacy, { conflictPolicy: "newer" });
      migrated = Number(imported?.imported || 0);
    } else if (rawLegacy && typeof rawLegacy === "object") {
      const imported = await importEntries(Object.values(rawLegacy), { conflictPolicy: "newer" });
      migrated = Number(imported?.imported || 0);
    }

    await bridge.invokeCoreAction("storage.set", {
      key: LIBRARY_MIGRATION_MARKER_KEY,
      value: true,
    });

    return { ok: true, migrated, skipped: false };
  }

  return {
    getEntry,
    saveEntry,
    removeEntry,
    isSaved,
    listRecent,
    queryEntries,
    getAllEntries,
    exportEntries,
    importEntries,
    patchEntry,
    bulkUpdateStatus,
    bulkRemoveEntries,
    runLegacyMigration,
  };
}
