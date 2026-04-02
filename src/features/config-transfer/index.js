import { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";
import { EXPORTABLE_CONFIG_KEYS } from "./constants.js";
import { deepCloneJson } from "./helpers.js";
import {
  buildExportPayload,
  downloadJsonFile,
  formatDateForFilename,
  normalizeImportRoot,
  pickJsonFile,
} from "./transferIO.js";
import { validateImportedPayload } from "./validation.js";
import {
  clearConfigTransferError,
  ensureConfigTransferErrorElement,
  showConfigTransferError,
} from "./dialogError.js";

async function exportSettingsToFile() {
  clearConfigTransferError();
  const payload = buildExportPayload();
  const text = JSON.stringify(payload, null, 2);
  const filename = `f95zone-ultimate-enhancer-${formatDateForFilename()}.json`;
  downloadJsonFile(filename, text);
  showToast(`Exported: ${filename}`);
}

async function importSettingsFromFile() {
  clearConfigTransferError();
  const file = await pickJsonFile();
  if (!file) return;

  const isJsonName = String(file.name || "")
    .toLowerCase()
    .endsWith(".json");
  const isJsonType = String(file.type || "")
    .toLowerCase()
    .includes("json");
  if (!isJsonName && !isJsonType) {
    showConfigTransferError("Import failed: JSON file only (.json).");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showConfigTransferError("Import failed: invalid JSON.");
    return;
  }

  const payload = normalizeImportRoot(parsed);
  const validationError = validateImportedPayload(payload);
  if (validationError) {
    showConfigTransferError(`Import failed: ${validationError}`);
    return;
  }

  const updates = {};
  for (const key of EXPORTABLE_CONFIG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const cloned = deepCloneJson(payload[key]);
    updates[key] = cloned;
    config[key] = cloned;
  }

  clearConfigTransferError();
  await saveConfigKeys(updates);
  showToast("Configuration imported. Reloading...");
  setTimeout(() => window.location.reload(), 400);
}

const configTransferDialogMeta = {
  exportSettings: {
    type: "button",
    text: "Export settings",
    buttonText: "Export",
    tooltip: "Download current settings as JSON file",
    onClick: exportSettingsToFile,
  },
  importSettings: {
    type: "button",
    text: "Import settings",
    buttonText: "Import",
    tooltip: "Import settings from JSON file",
    onClick: importSettingsFromFile,
  },
};

export function openConfigTransferDialog() {
  openSettingsDialog({
    title: "Import / Export Settings",
    description: "Export config to a JSON file. Import accepts JSON files only.",
    metaMap: configTransferDialogMeta,
  });
  ensureConfigTransferErrorElement();
  clearConfigTransferError();
}
