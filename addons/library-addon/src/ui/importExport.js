/**
 * Import/Export functionality for library entries
 * Handles file I/O and data transformation
 */

import { safeText, triggerJsonDownload } from "./helpers.js";
import {
  finishImportProgress,
  isImportCancelled,
  openImportProgress,
  updateImportProgress,
} from "./importProgress.js";
import { showToast } from "./showToast.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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

  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.records)
      ? parsed.records
      : [];

  const policyEl = root.querySelector('[data-field="conflictPolicy"]');
  const conflictPolicy = String(policyEl?.value || "newer")
    .trim()
    .toLowerCase();

  const existingRows = await library.getAllEntries("updatedAt", "desc");
  const existingById = new Map(
    (Array.isArray(existingRows) ? existingRows : []).map((entry) => [
      safeText(entry?.threadId),
      entry,
    ]),
  );
  const importIds = new Set();
  let added = 0;
  let updates = 0;
  let conflictSkips = 0;
  let invalid = 0;
  let duplicatesInFile = 0;

  records.forEach((record) => {
    const threadId = safeText(record?.threadId);
    if (!threadId) {
      invalid += 1;
      return;
    }
    if (importIds.has(threadId)) {
      duplicatesInFile += 1;
      return;
    }
    importIds.add(threadId);
    const existing = existingById.get(threadId);
    if (!existing) {
      added += 1;
      return;
    }

    const incomingUpdatedAt = Number(record?.updatedAt || 0);
    const existingUpdatedAt = Number(existing?.updatedAt || 0);
    const canUpdate =
      conflictPolicy === "replace" ||
      (conflictPolicy === "newer" && incomingUpdatedAt > existingUpdatedAt);
    if (canUpdate) updates += 1;
    else conflictSkips += 1;
  });

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
      `- New records: ${added}`,
      `- Existing records to update: ${updates}`,
      `- Existing records skipped by policy: ${conflictSkips}`,
      `- Invalid records (missing threadId): ${invalid}`,
      `- Duplicate IDs inside file: ${duplicatesInFile}`,
      "",
      `Policy: ${conflictPolicy}`,
      policyHint,
    ].join("\n"),
  });

  if (!confirmed) {
    inputEl.value = "";
    return;
  }

  await openImportProgress(records.length);
  const result = await library.importEntries(records, {
    conflictPolicy,
    shouldCancel: isImportCancelled,
    onProgress: updateImportProgress,
  });
  await finishImportProgress(result.cancelled ? "import-cancelled" : "import-complete");
  const detail = [
    `added: ${result.added}`,
    `updated: ${result.updated}`,
    `conflict-skipped: ${result.skippedExisting + result.skippedNotNewer}`,
    `invalid: ${result.skippedInvalid}`,
    `failed: ${result.failed}`,
  ].join(", ");
  const failureDetail = Object.entries(result.failureReasons || {})
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
  await showToast(
    `${result.cancelled ? "Import stopped" : "Import complete"}. ${detail}.${failureDetail ? ` Failures: ${failureDetail}.` : ""}`,
    result.failed > 0 || result.cancelled ? "error" : "success",
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
  const payload =
    scope === "filtered" || isFiltered
      ? {
          version: 1,
          exportedAt: new Date().toISOString(),
          records: [...state.rows],
        }
      : await library.exportEntries();
  const filename = `f95ue-library-${new Date().toISOString().slice(0, 10)}.json`;
  triggerJsonDownload(filename, payload);
}

export async function handleExportSelected(root, state) {
  const ids = [...state.selectedIds];
  if (ids.length === 0) {
    await showToast("Select at least one row first.", "error");
    return;
  }
  const selectedRows = state.rows.filter((entry) => state.selectedIds.has(entry.threadId));
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    records: selectedRows,
  };
  const filename = `f95ue-library-selected-${new Date().toISOString().slice(0, 10)}.json`;
  triggerJsonDownload(filename, payload);
}
