/**
 * Import/Export functionality for library entries
 * Handles file I/O and data transformation
 */

import { safeText, triggerJsonDownload } from "./helpers.js";
import { showToast } from "./showToast.js";

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
  const existingIds = new Set(
    (Array.isArray(existingRows) ? existingRows : []).map((entry) => safeText(entry?.threadId)),
  );
  const importIds = new Set();
  let added = 0;
  let updates = 0;
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
    if (existingIds.has(threadId)) updates += 1;
    else added += 1;
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
      `- Existing IDs in file: ${updates}`,
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

  const result = await library.importEntries(records, { conflictPolicy });
  await showToast(
    `Import complete. Imported: ${result.imported}, skipped: ${result.skipped}.`,
    "success",
  );
  inputEl.value = "";

  await reloadRowsFn(root);
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
