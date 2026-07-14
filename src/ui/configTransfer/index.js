import {
  buildConfigExport,
  commitConfigImport,
} from "../../services/configTransfer/index.js";
import { openSettingsDialog } from "../components/dialog.js";
import { showToast } from "../components/toast.js";
import {
  downloadJsonFile,
  formatDateForFilename,
  createJsonFilePicker,
} from "./transferIO.js";
import {
  clearConfigTransferError,
  ensureConfigTransferErrorElement,
  showConfigTransferError,
} from "./dialogError.js";

let activePicker = null;

function cancelActivePicker() {
  activePicker?.cancel();
  activePicker = null;
}

async function exportSettingsToFile() {
  clearConfigTransferError();
  const payload = buildConfigExport();
  const text = JSON.stringify(payload, null, 2);
  const filename = `f95zone-ultimate-enhancer-${formatDateForFilename()}.json`;
  downloadJsonFile(filename, text);
  showToast(`Exported: ${filename}`);
}

async function importSettingsFromFile() {
  clearConfigTransferError();
  cancelActivePicker();
  const picker = createJsonFilePicker();
  activePicker = picker;
  const file = await picker.promise;
  if (activePicker === picker) activePicker = null;
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

  const result = await commitConfigImport(await file.text());
  if (!result.ok || !result.committed) {
    const error = result.issues?.[0];
    showConfigTransferError(`Import failed: ${error ? `${error.path}: ${error.code}` : "could not persist configuration."}`);
    return;
  }

  clearConfigTransferError();
  if (result.reloadRequired) {
    showToast("Configuration imported. Reloading...");
    setTimeout(() => window.location.reload(), 400);
  } else {
    showToast("Configuration imported.");
  }
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
  cancelActivePicker();
  const dialog = openSettingsDialog({
    title: "Import / Export Settings",
    description: "Export config to a JSON file. Import accepts JSON files only.",
    metaMap: configTransferDialogMeta,
    onClose: cancelActivePicker,
  });
  ensureConfigTransferErrorElement();
  clearConfigTransferError();
  return dialog;
}
