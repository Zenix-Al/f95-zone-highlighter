import { LIBRARY_LEGACY_KEY, LIBRARY_MIGRATION_MARKER_KEY } from "../constants.js";
import { createLibraryApiClient, resolveImportThrottleInfo } from "../api/library/index.js";
import { executeLibraryImport, previewLibraryImport } from "./importWorkflow.js";
import { getSortConfig, matchesLibraryFilters } from "./querying.js";
import { normalizeRecord } from "./recordModel.js";

export function createLibraryService(bridge, storage) {
  const api = createLibraryApiClient(bridge);

  async function getImportThrottleInfo() {
    return resolveImportThrottleInfo(await api.getCoreThrottleInfo());
  }

  async function getEntry(threadId) {
    return api.getEntry(threadId);
  }

  async function saveEntry(record, options = {}) {
    const preserveUpdatedAt = Boolean(options.preserveUpdatedAt);
    const skipExistingLookup = Boolean(options.skipExistingLookup);
    const normalized = normalizeRecord(
      preserveUpdatedAt ? record : { ...record, updatedAt: Date.now() },
    );

    if (!normalized.threadId) {
      return { ok: false, reason: "thread_id_required" };
    }

    if (!skipExistingLookup) {
      const existing = await getEntry(normalized.threadId);
      if (existing?.createdAt) {
        normalized.createdAt = existing.createdAt;
      } else if (!normalized.createdAt) {
        normalized.createdAt = Date.now();
      }
    }

    return api.putEntry(normalized, {
      importAction: options.importAction,
      shouldCancel: options.shouldCancel,
    });
  }

  function removeEntry(threadId) {
    return api.deleteEntry(threadId);
  }

  async function isSaved(threadId) {
    const entry = await getEntry(threadId);
    return Boolean(entry && entry.threadId);
  }

  function listRecent(limit = 200) {
    return api.queryEntries({
      index: "updatedAt",
      direction: "prev",
      limit,
    });
  }

  async function queryEntries(options = {}) {
    const limit = Math.max(1, Number(options.limit || 500));
    const offset = Math.max(0, Number(options.offset || 0));
    const { index, direction } = getSortConfig(options.sortBy, options.sortDir);

    const result = await api.queryEntries({
      index,
      direction,
      limit,
      offset,
    });
    if (!result?.ok) {
      throw new Error(String(result?.reason || "query_failed"));
    }
    if (!Array.isArray(result.value)) return [];

    return result.value
      .map(normalizeRecord)
      .filter((entry) => matchesLibraryFilters(entry, options));
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

  async function previewImport(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const conflictPolicy = String(options.conflictPolicy || "newer")
      .trim()
      .toLowerCase();
    const existingEntries = Array.isArray(options.existingEntries)
      ? options.existingEntries
      : await getAllEntries("updatedAt", "desc");
    const throttleInfo =
      options.throttleInfo && typeof options.throttleInfo === "object"
        ? resolveImportThrottleInfo(options.throttleInfo)
        : await getImportThrottleInfo();

    return previewLibraryImport({
      records: list,
      conflictPolicy,
      existingEntries,
      throttleInfo,
      normalizeRecord,
      createEntriesPayload: (entries) => api.createEntriesPayload(entries),
    });
  }

  async function saveImportOperation(operation, shouldCancel) {
    return saveEntry(operation?.value, {
      preserveUpdatedAt: true,
      skipExistingLookup: true,
      importAction: true,
      shouldCancel,
    });
  }

  async function importEntries(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const plan =
      options.plan && typeof options.plan === "object" && Array.isArray(options.plan.operations)
        ? options.plan
        : await previewImport(list, options);
    const shouldCancel = typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};

    return executeLibraryImport({
      records: list,
      plan,
      shouldCancel,
      onProgress,
      bulkPutEntries: (entries, cancelCheck) => api.bulkPutEntries(entries, cancelCheck),
      saveOperation: saveImportOperation,
    });
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
    const markerValue = await storage.get(LIBRARY_MIGRATION_MARKER_KEY, false);
    if (markerValue === true) {
      return { ok: true, migrated: 0, skipped: true };
    }
    const rawLegacy = await storage.get(LIBRARY_LEGACY_KEY, null);

    let migrated = 0;
    if (Array.isArray(rawLegacy)) {
      const imported = await importEntries(rawLegacy, { conflictPolicy: "newer" });
      migrated = Number(imported?.imported || 0);
    } else if (rawLegacy && typeof rawLegacy === "object") {
      const imported = await importEntries(Object.values(rawLegacy), {
        conflictPolicy: "newer",
      });
      migrated = Number(imported?.imported || 0);
    }
    await storage.set(LIBRARY_LEGACY_KEY, null);
    await storage.set(LIBRARY_MIGRATION_MARKER_KEY, true);

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
    previewImport,
    importEntries,
    patchEntry,
    bulkUpdateStatus,
    bulkRemoveEntries,
    runLegacyMigration,
  };
}
