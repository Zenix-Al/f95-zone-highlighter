/**
 * Import/Export functionality for library entries
 * Handles file I/O and data transformation
 */

import { triggerJsonDownload } from "../utils/download.js";
import {
  finishImportProgress,
  isImportCancelled,
  openImportProgress,
  updateImportProgress,
} from "./importProgressController.js";
import { showToast } from "../utils/showToast.js";
import { matchesSearchTokens, parseSearchQuery } from "../utils/searchTokens.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeImportPayload(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.records)) return parsed;
  return parsed;
}

async function reloadAfterImport(root, reloadRowsFn, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await wait(1200 * attempt);
    try {
      const reloaded = await reloadRowsFn(root);
      if (reloaded !== false) return true;
      lastError = new Error("reload_failed");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("reload_failed");
}

export async function handleImportFile(
  inputEl,
  root,
  state,
  library,
  reloadRowsFn,
  onMutatedFn,
  askConfirmFn,
) {
  const file = inputEl?.files?.[0];
  if (!file) return;

  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    await showToast("Invalid JSON file.", "error");
    inputEl.value = "";
    return;
  }

  const policyEl = root.querySelector('[data-field="conflictPolicy"]');
  const conflictPolicy = String(policyEl?.value || "newer")
    .trim()
    .toLowerCase();
  const importPayload = normalizeImportPayload(parsed);
  const preview = await library.previewImport(importPayload, { conflictPolicy });
  if (!preview.valid) {
    await showToast(
      `Import rejected before writing: ${preview.issues.slice(0, 3).join("; ")}`,
      "error",
    );
    inputEl.value = "";
    return;
  }

  const policyHint =
    conflictPolicy === "skip"
      ? "Existing records will be skipped."
      : conflictPolicy === "replace"
        ? "Existing records will be replaced."
        : "Existing records only update when incoming updatedAt is newer.";

  const confirmed = await askConfirmFn(root, {
    title: "Confirm Import",
    confirmText: "Import",
    message: [
      "Import preview:",
      `- New records: ${preview.added}`,
      `- Existing records to update: ${preview.updated}`,
      `- Existing records skipped by policy: ${preview.skippedExisting + preview.skippedNotNewer}`,
      `- Invalid records (missing threadId): ${preview.skippedInvalid}`,
      `- Duplicate IDs inside file: ${preview.skippedDuplicateInFile}`,
      `- Update history events: ${preview.sections.updates.total} (${preview.sections.updates.writeCount} new)`,
      `- Activity events: ${preview.sections.activity.total} (${preview.sections.activity.writeCount} new)`,
      `- Planned write batches: ${preview.totalBatches}`,
      "",
      `Policy: ${conflictPolicy}`,
      policyHint,
    ].join("\n"),
  });

  if (!confirmed) {
    inputEl.value = "";
    return;
  }

  await openImportProgress({
    total: preview.total,
    totalBatches: preview.totalBatches,
    throttle: preview.throttleInfo,
  });
  const result = await library.importEntries(importPayload, {
    conflictPolicy,
    shouldCancel: isImportCancelled,
    onProgress: updateImportProgress,
    plan: preview,
  });
  await finishImportProgress(result.cancelled ? "import-cancelled" : "import-complete");
  if (result.cancelled) {
    inputEl.value = "";
    return;
  }
  const detail = [
    `added: ${result.added}`,
    `updated: ${result.updated}`,
    `conflict-skipped: ${result.skippedExisting + result.skippedNotNewer}`,
    `invalid: ${result.skippedInvalid}`,
    `duplicate-file-ids: ${result.skippedDuplicateInFile}`,
    `failed: ${result.failed}`,
    `history imported: ${result.historyImported || 0}`,
  ].join(", ");
  const failureDetail = Object.entries(result.failureReasons || {})
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
  await showToast(
    `${result.cancelled ? "Import stopped" : result.ok ? "Import complete" : "Import partially completed"}. ${detail}.${result.failedSection ? ` Failed section: ${result.failedSection}.` : ""}${failureDetail ? ` Failures: ${failureDetail}.` : ""}`,
    !result.ok || result.failed > 0 || result.cancelled ? "error" : "success",
  );
  inputEl.value = "";

  await wait(750);
  try {
    await reloadAfterImport(root, reloadRowsFn);
  } catch {
    await showToast("Import finished, but refreshing the table is still being rate-limited.", "error");
  }
  if (typeof onMutatedFn === "function") onMutatedFn();
}

export async function handleExport(root, state, library, isFiltered = false) {
  const scopeEl = root.querySelector('[data-field="exportScope"]');
  const scope = String(scopeEl?.value || "all").trim();
  let payload;
  if (scope === "selected") {
    payload = await library.exportEntries({ threadIds: [...state.selectedIds] });
  } else if (scope === "filtered" || isFiltered) {
    const parsedSearch = parseSearchQuery(state.search);
    const records = await library.queryEntries({
      search: parsedSearch.text,
      status: state.status,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      limit: 10000,
      offset: 0,
    });
    const filteredRecords = parsedSearch.tokens.length
        ? records.filter((entry) => matchesSearchTokens(entry, parsedSearch.tokens))
        : records;
    payload = await library.exportEntries({
      threadIds: filteredRecords.map((entry) => entry.threadId),
    });
  } else {
    payload = await library.exportEntries();
  }
  if (scope === "selected" && payload.records.length === 0) {
    await showToast("Select at least one row first.", "error");
    return;
  }
  const filename = `f95ue-library-${new Date().toISOString().slice(0, 10)}.json`;
  triggerJsonDownload(filename, payload);
}

export async function handleExportSelected(root, state, library) {
  const ids = [...state.selectedIds];
  if (ids.length === 0) {
    await showToast("Select at least one row first.", "error");
    return;
  }
  const payload = await library.exportEntries({ threadIds: ids });
  const filename = `f95ue-library-selected-${new Date().toISOString().slice(0, 10)}.json`;
  triggerJsonDownload(filename, payload);
}
