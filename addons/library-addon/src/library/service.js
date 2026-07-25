import {
  LIBRARY_LEGACY_KEY,
  LIBRARY_MIGRATION_MARKER_KEY,
  LIBRARY_PIN_BACKFILL_MARKER_KEY,
} from "../constants.js";
import { createLibraryApiClient, resolveImportThrottleInfo } from "../api/library/index.js";
import { executeLibraryImport, previewLibraryImport } from "./importWorkflow.js";
import {
  getSortConfig,
  matchesLibraryFilters,
  sortLibraryRecords,
  supportsKeysetSort,
} from "./querying.js";
import {
  mergePersonalState,
  mergeThreadFacts,
  normalizeRecord,
  validateRecord,
} from "./recordModel.js";
import { createUpdateEvent, diffThreadFacts } from "./updateEventModel.js";
import { createUpdateRepository } from "./updateRepository.js";
import { createActivityEvent } from "./activityEventModel.js";
import { createActivityRepository } from "./activityRepository.js";
import {
  createLibraryDocument,
  normalizeLibraryDocument,
  planHistorySection,
  validateActivityEvent,
  validateUpdateEvent,
} from "./libraryDocument.js";
import { buildImportBatches } from "./importWorkflow.js";
import { createThreadHtmlRequest } from "../api/threadHtml.js";
import { checkLibraryRecords } from "./manualUpdateChecker.js";
import { createAutoUpdateRepository } from "./autoUpdateRepository.js";
import { getFailureDelay, selectDueRecords } from "./autoUpdatePolicy.js";

export function createLibraryService(bridge, storage, dependencies = {}) {
  const api = createLibraryApiClient(bridge);
  const updates = createUpdateRepository(api);
  const activity = createActivityRepository(api);
  const keysetCoverage = new Map();
  const requestThreadHtml =
    dependencies.requestThreadHtml || createThreadHtmlRequest(dependencies.fetch);
  const autoUpdate = createAutoUpdateRepository(api);

  async function getImportThrottleInfo() {
    return resolveImportThrottleInfo(await api.getCoreThrottleInfo());
  }

  async function getEntry(threadId) {
    const entry = await api.getEntry(threadId);
    return entry ? normalizeRecord(entry) : null;
  }

  async function saveEntry(record, options = {}) {
    const preserveUpdatedAt = Boolean(options.preserveUpdatedAt);
    const skipExistingLookup = Boolean(options.skipExistingLookup);
    const now = Date.now();
    let normalized = normalizeRecord(record, { now });

    if (!normalized.threadId) {
      return { ok: false, reason: "thread_id_required" };
    }

    if (!skipExistingLookup) {
      const existing = await getEntry(normalized.threadId);
      if (existing) {
        return observeThreadFacts(existing, record, { now });
      }
    }
    if (!preserveUpdatedAt) normalized.recordModifiedAt = now;
    const issues = validateRecord(normalized);
    if (issues.length) return { ok: false, reason: "invalid_record", issues };

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
    return queryEntries({ sortBy: "updatedAt", sortDir: "desc", limit });
  }

  async function queryEntries(options = {}) {
    const limit = Math.max(1, Number(options.limit || 500));
    const offset = Math.max(0, Number(options.offset || 0));
    const result = await api.queryEntries({
      direction: "next",
      limit: 10000,
      offset: 0,
    });
    if (!result?.ok) {
      throw new Error(String(result?.reason || "query_failed"));
    }
    if (!Array.isArray(result.value)) return [];

    const normalized = result.value
      .map(normalizeRecord)
      .filter((entry) => matchesLibraryFilters(entry, options));
    return sortLibraryRecords(normalized, options.sortBy, options.sortDir).slice(
      offset,
      offset + limit,
    );
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

  async function exportEntries(options = {}) {
    const recordFilter = Array.isArray(options.threadIds)
      ? new Set(options.threadIds.map((id) => String(id || "").trim()))
      : null;
    const records = (await getAllEntries("updatedAt", "desc")).filter(
      (record) => !recordFilter || recordFilter.has(record.threadId),
    );
    const includedIds = new Set(records.map((record) => record.threadId));
    const updateEvents = (await updates.listAll()).filter((event) =>
      includedIds.has(String(event.threadId || "")),
    );
    const activityEvents = (await activity.listAll()).filter((event) =>
      includedIds.has(String(event.threadId || "")),
    );
    return createLibraryDocument({
      records,
      updates: updateEvents,
      activity: activityEvents,
    });
  }

  async function previewImport(documentInput, options = {}) {
    const document = normalizeLibraryDocument(documentInput);
    const list = document.records;
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

    const recordPlan = previewLibraryImport({
      records: list,
      conflictPolicy,
      existingEntries,
      throttleInfo,
      normalizeRecord,
      createEntriesPayload: (entries) => api.createEntriesPayload(entries),
    });
    const existingUpdates = await updates.listAll();
    const existingActivity = await activity.listAll();
    const updatePlan = planHistorySection(
      document.updates,
      existingUpdates,
      validateUpdateEvent,
      "updates",
    );
    const activityPlan = planHistorySection(
      document.activity,
      existingActivity,
      validateActivityEvent,
      "activity",
    );
    const issues = [...updatePlan.issues, ...activityPlan.issues];
    const historyLatestByThread = new Map();
    for (const event of [...document.updates, ...document.activity]) {
      const id = String(event?.threadId || "");
      const at = Number(event?.observedAt ?? event?.occurredAt ?? 0);
      historyLatestByThread.set(id, Math.max(historyLatestByThread.get(id) || 0, at));
    }
    for (const operation of recordPlan.operations) {
      const latestHistory = historyLatestByThread.get(operation.value.threadId) || 0;
      if (latestHistory > Number(operation.value.recordModifiedAt || 0)) {
        issues.push(
          `records.${operation.value.threadId}.recordModifiedAt: older than imported history`,
        );
      }
    }
    updatePlan.batches = buildImportBatches(
      updatePlan.operations,
      throttleInfo,
      (entries) => api.createEntriesPayload(entries, "updates"),
    );
    activityPlan.batches = buildImportBatches(
      activityPlan.operations,
      throttleInfo,
      (entries) => api.createEntriesPayload(entries, "activity"),
    );
    return {
      ...recordPlan,
      sourceVersion: document.sourceVersion,
      document,
      sections: { records: recordPlan, updates: updatePlan, activity: activityPlan },
      issues,
      valid: issues.length === 0,
      total:
        recordPlan.total + updatePlan.total + activityPlan.total,
      writeCount:
        recordPlan.writeCount + updatePlan.writeCount + activityPlan.writeCount,
      totalBatches:
        recordPlan.totalBatches + updatePlan.batches.length + activityPlan.batches.length,
    };
  }

  async function saveImportOperation(operation, shouldCancel) {
    return saveEntry(operation?.value, {
      preserveUpdatedAt: true,
      skipExistingLookup: true,
      importAction: true,
      shouldCancel,
    });
  }

  async function importEntries(documentInput, options = {}) {
    const document = normalizeLibraryDocument(documentInput);
    const plan =
      options.plan && typeof options.plan === "object" && options.plan.sections
        ? options.plan
        : await previewImport(documentInput, options);
    const shouldCancel = typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    if (!plan.valid) {
      return {
        ok: false,
        reason: "invalid_import_document",
        issues: plan.issues,
        imported: 0,
        failed: 0,
        cancelled: false,
        partial: false,
        committedSections: [],
      };
    }

    const recordResult = await executeLibraryImport({
      records: document.records,
      plan: plan.sections.records,
      shouldCancel,
      onProgress,
      bulkPutEntries: (entries, cancelCheck) => api.bulkPutEntries(entries, cancelCheck),
      saveOperation: saveImportOperation,
    });
    const committedSections = recordResult.imported > 0 ? ["records"] : [];
    if (recordResult.cancelled || !recordResult.ok) {
      return {
        ...recordResult,
        partial: committedSections.length > 0,
        committedSections,
        failedSection: "records",
      };
    }

    let historyImported = 0;
    for (const sectionName of ["updates", "activity"]) {
      const section = plan.sections[sectionName];
      for (const batch of section.batches) {
        if (shouldCancel()) {
          return {
            ...recordResult,
            ok: false,
            cancelled: true,
            partial: committedSections.length > 0,
            committedSections,
            failedSection: sectionName,
            imported: recordResult.imported + historyImported,
          };
        }
        const result = await api.bulkPutStore(
          sectionName,
          batch.map((operation) => operation.value),
          shouldCancel,
        );
        if (!result?.ok) {
          return {
            ...recordResult,
            ok: false,
            reason: result?.reason || "history_import_failed",
            partial: committedSections.length > 0,
            committedSections,
            failedSection: sectionName,
            imported: recordResult.imported + historyImported,
          };
        }
        historyImported += batch.length;
      }
      if (section.writeCount > 0) committedSections.push(sectionName);
    }
    return {
      ...recordResult,
      ok: true,
      imported: recordResult.imported + historyImported,
      historyImported,
      partial: false,
      committedSections,
      sections: {
        records: recordResult.imported,
        updates: plan.sections.updates.writeCount,
        activity: plan.sections.activity.writeCount,
      },
    };
  }

  async function patchEntry(threadId, patch = {}) {
    const normalizedId = String(threadId || "").trim();
    if (!normalizedId) return { ok: false, reason: "thread_id_required" };

    const existing = await getEntry(normalizedId);
    if (!existing) return { ok: false, reason: "entry_not_found" };

    const personalKeys = new Set([
      "personal",
      "status",
      "userStatus",
      "rating",
      "userScore",
      "note",
      "pinned",
      "progressNote",
      "lastPlayedVersion",
      "startedAt",
      "lastPlayedAt",
      "completedAt",
      "droppedAt",
      "lastActivityAt",
    ]);
    const isPersonal = Object.keys(patch).some((key) => personalKeys.has(key));
    if (isPersonal) return api.putEntry(mergePersonalState(existing, patch));
    return observeThreadFacts(existing, patch);
  }

  async function observeThreadFacts(existingRecord, threadPatch, options = {}) {
    const now = Number(options.now || Date.now());
    const shouldCancel =
      typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    if (shouldCancel()) return { ok: false, reason: "cancelled" };
    const existing = normalizeRecord(existingRecord, { now });
    const merged = mergeThreadFacts(existing, threadPatch, { now });
    const diff = diffThreadFacts(existing, merged);
    if (!diff.changed) return { ok: true, value: existing, unchanged: true };

    const next = {
      ...merged,
      personal: existing.personal,
      updateState: diff.versionChanged ? "changed" : existing.updateState,
      lastThreadChangeAt: now,
      thread: {
        ...merged.thread,
        versionObservedAt: diff.versionChanged
          ? now
          : existing.thread.versionObservedAt,
      },
    };
    const event = createUpdateEvent(existing.threadId, diff, now);
    const priorEvent = event ? await updates.get(event.id) : null;
    if (shouldCancel()) return { ok: false, reason: "cancelled" };
    if (event && !priorEvent) {
      const eventResult = await updates.put(event);
      if (!eventResult?.ok) return eventResult;
    }
    if (shouldCancel()) {
      if (event && !priorEvent) await updates.remove(event.id);
      return { ok: false, reason: "cancelled" };
    }
    const recordResult = await api.putEntry(next);
    if (!recordResult?.ok && event && !priorEvent) await updates.remove(event.id);
    return recordResult?.ok
      ? { ...recordResult, value: next, event: priorEvent || event }
      : recordResult;
  }

  async function listUpdateEvents(threadId, limit = 50) {
    return updates.listByThread(String(threadId || "").trim(), limit);
  }

  async function acknowledgeCurrentUpdate(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return { ok: false, reason: "thread_id_required" };
    const existing = await getEntry(id);
    if (!existing) return { ok: false, reason: "entry_not_found" };
    if (existing.updateState !== "changed") {
      return { ok: true, value: existing, unchanged: true };
    }
    const next = {
      ...existing,
      updateState: "acknowledged",
      recordModifiedAt: Date.now(),
    };
    return api.putEntry(next);
  }

  async function previewManualUpdateCheck(threadIds, options = {}) {
    const ids = [...new Set((Array.isArray(threadIds) ? threadIds : [threadIds])
      .map((id) => String(id || "").trim()).filter(Boolean))];
    const records = [];
    for (const id of ids) {
      if (options.signal?.aborted) break;
      const record = await getEntry(id);
      if (record) records.push(record);
    }
    return checkLibraryRecords(records, requestThreadHtml, options);
  }

  async function commitManualUpdateCheck(preview, options = {}) {
    const shouldCancel =
      typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    const results = Array.isArray(preview?.results) ? preview.results : [];
    const summary = { checked: 0, current: 0, changed: 0, failed: 0, cancelled: false };
    for (const item of results) {
      if (shouldCancel()) {
        summary.cancelled = true;
        break;
      }
      const existing = await getEntry(item.threadId);
      if (!existing) continue;
      const now = Date.now();
      if (!item.ok) {
        const failureCount = Number(existing.updateCheck?.consecutiveFailures || 0) + 1;
        const failed = {
          ...existing,
          updateCheck: {
            ...existing.updateCheck,
            status: "failed",
            lastAttemptAt: now,
            nextCheckAt: options.scheduleIntervalMs
              ? now + getFailureDelay(options.scheduleIntervalMs, failureCount)
              : options.nextCheckAt ?? null,
            consecutiveFailures: failureCount,
            lastErrorCode: item.reason,
          },
          lastCheckedAt: now,
          recordModifiedAt: now,
        };
        if (shouldCancel()) {
          summary.cancelled = true;
          break;
        }
        await api.putEntry(failed);
        summary.failed += 1;
        summary.checked += 1;
        continue;
      }
      const observed = item.observed || {};
      const observation = await observeThreadFacts(
        existing,
        {
          url: observed.url || existing.thread.url,
          title: observed.title || existing.thread.title,
          gameVersion: observed.currentVersion,
          sourcePage: "manual-update-check",
        },
        { now, shouldCancel },
      );
      if (!observation?.ok) {
        if (observation?.reason === "cancelled") summary.cancelled = true;
        else summary.failed += 1;
        if (summary.cancelled) break;
        continue;
      }
      const latest = observation.value || existing;
      const checked = {
        ...latest,
        updateCheck: {
          ...latest.updateCheck,
          status: "current",
          lastAttemptAt: now,
          lastSuccessAt: now,
          nextCheckAt: options.scheduleIntervalMs
            ? now + options.scheduleIntervalMs
            : options.nextCheckAt ?? null,
          consecutiveFailures: 0,
          lastErrorCode: "",
        },
        lastCheckedAt: now,
        recordModifiedAt: now,
      };
      if (shouldCancel()) {
        summary.cancelled = true;
        break;
      }
      await api.putEntry(checked);
      summary[item.changed ? "changed" : "current"] += 1;
      summary.checked += 1;
    }
    return { ok: !summary.cancelled, ...summary };
  }

  async function setAutoUpdateEnabled(threadIds, enabled) {
    const ids = Array.isArray(threadIds) ? threadIds : [threadIds];
    let updated = 0;
    let skipped = 0;
    for (const id of ids) {
      const existing = await getEntry(id);
      if (!existing) {
        skipped += 1;
        continue;
      }
      const result = await api.putEntry({
        ...existing,
        updateCheck: {
          ...existing.updateCheck,
          enabled: Boolean(enabled),
          status: enabled ? "pending" : "disabled",
          nextCheckAt: enabled ? Date.now() : null,
        },
        recordModifiedAt: Date.now(),
      });
      if (result?.ok) updated += 1;
      else skipped += 1;
    }
    return { ok: true, updated, skipped };
  }

  async function getDueAutoUpdateRecords({
    now = Date.now(),
    limit = 10,
    failedOnly = false,
    ignoreSchedule = false,
  } = {}) {
    return selectDueRecords(await getAllEntries("updatedAt", "asc"), {
      now,
      limit,
      failedOnly,
      ignoreSchedule,
    });
  }

  async function listActivityEvents(threadId, limit = 50) {
    return activity.listByThread(String(threadId || "").trim(), limit);
  }

  async function applyPersonalActivity(threadId, personalPatch = {}, options = {}) {
    const id = String(threadId || "").trim();
    const commandId = String(options.commandId || "").trim();
    const shouldCancel =
      typeof options.shouldCancel === "function" ? options.shouldCancel : () => false;
    if (!id) return { ok: false, reason: "thread_id_required" };
    if (!commandId) return { ok: false, reason: "command_id_required" };
    if (shouldCancel()) return { ok: false, reason: "cancelled" };

    const existing = await getEntry(id);
    if (!existing) return { ok: false, reason: "entry_not_found" };
    if (shouldCancel()) return { ok: false, reason: "cancelled" };

    const occurredAt = Number(options.occurredAt || Date.now());
    const patch = personalPatch?.personal || personalPatch;
    const derived = { ...patch };
    const specs = [];
    const add = (type, before, after, version = "") => {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      specs.push({ type, before, after, version });
    };

    if (Object.hasOwn(patch, "status")) {
      const nextStatus = String(patch.status || "").trim();
      add("status-change", existing.personal.status, nextStatus);
      if (
        nextStatus === "playing" &&
        !existing.personal.startedAt &&
        !Object.hasOwn(patch, "startedAt")
      ) {
        derived.startedAt = occurredAt;
      }
      if (nextStatus === "completed" && !Object.hasOwn(patch, "completedAt")) {
        derived.completedAt = occurredAt;
      }
      if (nextStatus === "dropped" && !Object.hasOwn(patch, "droppedAt")) {
        derived.droppedAt = occurredAt;
      }
    }
    if (options.playedCurrentVersion === true) {
      const version = String(existing.thread.currentVersion || "").trim();
      if (!version) return { ok: false, reason: "current_version_required" };
      derived.lastPlayedVersion = version;
      derived.lastPlayedAt = occurredAt;
      add("played-version", existing.personal.lastPlayedVersion, version, version);
    }
    if (specs.length > 0) derived.lastActivityAt = occurredAt;
    const next = mergePersonalState(existing, { personal: derived }, { now: occurredAt });
    if (specs.length === 0) {
      if (JSON.stringify(next.personal) === JSON.stringify(existing.personal)) {
        return { ok: true, value: existing, unchanged: true, events: [] };
      }
      const result = await api.putEntry(next);
      return result?.ok ? { ...result, value: next, events: [] } : result;
    }

    const events = specs.map((spec) =>
      createActivityEvent({
        threadId: id,
        commandId,
        occurredAt,
        ...spec,
      }),
    );
    const existingEvents = await Promise.all(events.map((event) => activity.get(event.id)));
    if (existingEvents.every(Boolean)) {
      return { ok: true, value: existing, unchanged: true, events: existingEvents };
    }

    const inserted = [];
    for (let index = 0; index < events.length; index += 1) {
      if (existingEvents[index]) continue;
      if (shouldCancel()) {
        await Promise.all(inserted.map((event) => activity.remove(event.id)));
        return { ok: false, reason: "cancelled" };
      }
      const result = await activity.put(events[index]);
      if (!result?.ok) {
        await Promise.all(inserted.map((event) => activity.remove(event.id)));
        return result;
      }
      inserted.push(events[index]);
    }
    if (shouldCancel()) {
      await Promise.all(inserted.map((event) => activity.remove(event.id)));
      return { ok: false, reason: "cancelled" };
    }

    const result = await api.putEntry(next);
    if (!result?.ok) await Promise.all(inserted.map((event) => activity.remove(event.id)));
    return result?.ok
      ? { ...result, value: next, events: existingEvents.map((event, index) => event || events[index]) }
      : result;
  }

  async function queryEntriesPage(options = {}) {
    const pageSize = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const { index, direction } = getSortConfig(options.sortBy, options.sortDir);
    const keysetSupported = supportsKeysetSort(options.sortBy);
    let indexIsComplete = false;
    if (keysetSupported) {
      if (!keysetCoverage.has(index)) {
        keysetCoverage.set(
          index,
          Promise.all([api.countEntries(), api.countEntries(index)])
            .then(([allResult, indexResult]) => {
              if (!allResult?.ok || !indexResult?.ok) {
                return { complete: false, total: null };
              }
              const total = Number(allResult.value || 0);
              return {
                complete: total === Number(indexResult.value || 0),
                total,
              };
            })
            .catch(() => ({ complete: false, total: null })),
        );
      }
      indexIsComplete = (await keysetCoverage.get(index)).complete;
    }

    if (!keysetSupported || !indexIsComplete) {
      const allRows = await queryEntries({
        ...options,
        limit: 10000,
        offset: 0,
      });
      const start = Math.max(0, Number(options.page || 1) - 1) * pageSize;
      const rows = allRows.slice(start, start + pageSize);
      return {
        rows,
        nextCursor: null,
        hasNext: start + rows.length < allRows.length,
        totalRows: allRows.length,
        mode: keysetSupported ? "incomplete-index-fallback" : "offset-fallback",
      };
    }

    const acceptRecord =
      typeof options.matchesRecord === "function" ? options.matchesRecord : () => true;
    const matched = [];
    let cursor = options.cursor || null;
    let exhausted = false;
    let scanned = 0;
    const scanLimit = 10000;
    const batchSize = Math.min(500, Math.max(pageSize * 3, 100));

    while (matched.length <= pageSize && !exhausted && scanned < scanLimit) {
      const result = await api.queryEntriesPage({
        index,
        direction,
        limit: batchSize,
        cursor,
      });
      if (!result?.ok) throw new Error(String(result?.reason || "query_failed"));
      const page = result.value || {};
      const items = Array.isArray(page.items) ? page.items : [];
      for (const item of items) {
        scanned += 1;
        const record = normalizeRecord(item?.value);
        if (
          matchesLibraryFilters(record, options) &&
          acceptRecord(record)
        ) {
          matched.push({ record, cursor: item.cursor });
          if (matched.length > pageSize) break;
        }
      }
      exhausted = !page.hasMore || items.length === 0;
      cursor = page.nextCursor || cursor;
    }

    return {
      rows: matched.slice(0, pageSize).map(({ record }) => record),
      nextCursor:
        matched.length > pageSize ? matched[pageSize - 1]?.cursor || null : null,
      hasNext: matched.length > pageSize,
      totalRows:
        !options.search &&
        (!options.status || options.status === "all") &&
        typeof options.matchesRecord !== "function"
          ? (await keysetCoverage.get(index)).total
          : null,
      mode: "keyset",
      scanned,
    };
  }

  async function bulkUpdateStatus(threadIds = [], status = "saved", options = {}) {
    const ids = [
      ...new Set(
        (Array.isArray(threadIds) ? threadIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];
    const nextStatus = String(status || "saved").trim() || "saved";
    const commandId = String(options.commandId || `bulk-status:${Date.now()}`);
    let updated = 0;
    let skipped = 0;

    for (const id of ids) {
      const result = await applyPersonalActivity(
        id,
        { status: nextStatus },
        { commandId: `${commandId}:${id}` },
      );
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

  async function runPinnedIndexMigration() {
    const marker = await api.getMeta(LIBRARY_PIN_BACKFILL_MARKER_KEY);
    if (marker?.complete === true) {
      return { ok: true, migrated: 0, skipped: true };
    }
    const result = await api.queryEntries({
      direction: "next",
      limit: 10000,
      offset: 0,
    });
    if (!result?.ok || !Array.isArray(result.value)) {
      return { ok: false, reason: result?.reason || "pin_backfill_read_failed" };
    }
    const records = result.value.map((record) => normalizeRecord(record));
    for (let offset = 0; offset < records.length; offset += 20) {
      const written = await api.bulkPutEntries(records.slice(offset, offset + 20));
      if (!written?.ok) {
        return { ok: false, reason: written?.reason || "pin_backfill_write_failed" };
      }
    }
    const marked = await api.putMeta({
      key: LIBRARY_PIN_BACKFILL_MARKER_KEY,
      complete: true,
      records: records.length,
    });
    if (!marked?.ok) return marked;
    keysetCoverage.clear();
    return { ok: true, migrated: records.length, skipped: false };
  }

  return {
    getEntry,
    saveEntry,
    removeEntry,
    isSaved,
    listRecent,
    queryEntries,
    queryEntriesPage,
    getAllEntries,
    exportEntries,
    previewImport,
    importEntries,
    patchEntry,
    observeThreadFacts,
    listUpdateEvents,
    acknowledgeCurrentUpdate,
    previewManualUpdateCheck,
    commitManualUpdateCheck,
    setAutoUpdateEnabled,
    getDueAutoUpdateRecords,
    autoUpdate,
    listActivityEvents,
    applyPersonalActivity,
    bulkUpdateStatus,
    bulkRemoveEntries,
    runPinnedIndexMigration,
    runLegacyMigration,
  };
}
