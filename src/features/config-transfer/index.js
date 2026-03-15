import {
  default as stateManager,
  config,
  defaultColors,
  defaultDirectDownloadPackages,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
} from "../../config.js";
import { isValidColor, isValidTag, isValidVersion } from "../../utils/validators.js";
import { isValidOverlayColorOrder } from "../latest-overlay/overlayOrder.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";

const CONFIG_TRANSFER_DIALOG_ID = "latest-config-dialog";
const CONFIG_TRANSFER_ERROR_ID = "config-transfer-dialog-error";
const ERROR_TOAST_DURATION = 6000;

const EXPORTABLE_CONFIG_KEYS = Object.freeze([
  "tags",
  "preferredTags",
  "excludedTags",
  "color",
  "overlaySettings",
  "threadSettings",
  "globalSettings",
  "latestSettings",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function hasOnlyKnownKeys(obj, allowedKeys) {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      return key;
    }
  }
  return "";
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getConfigTransferDialogPanel() {
  const shadowRoot = stateManager.get("shadowRoot");
  if (!shadowRoot) return null;
  const dialog = shadowRoot.getElementById(CONFIG_TRANSFER_DIALOG_ID);
  if (!dialog) return null;
  return dialog.querySelector(".config-dialog-panel");
}

function ensureConfigTransferErrorElement() {
  const panel = getConfigTransferDialogPanel();
  if (!panel) return null;

  let el = panel.querySelector(`#${CONFIG_TRANSFER_ERROR_ID}`);
  if (el) return el;

  el = document.createElement("div");
  el.id = CONFIG_TRANSFER_ERROR_ID;
  el.className = "config-transfer-dialog-error";
  el.style.display = "none";

  const actions = panel.querySelector(".config-dialog-actions");
  if (actions) {
    panel.insertBefore(el, actions);
  } else {
    panel.appendChild(el);
  }

  return el;
}

function clearConfigTransferError() {
  const panel = getConfigTransferDialogPanel();
  if (!panel) return;
  const el = panel.querySelector(`#${CONFIG_TRANSFER_ERROR_ID}`);
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

function showConfigTransferError(message) {
  const text = String(message || "").trim();
  if (!text) return;

  const el = ensureConfigTransferErrorElement();
  if (el) {
    el.textContent = text;
    el.style.display = "block";
  }

  showToast(text, ERROR_TOAST_DURATION);
}

function buildExportPayload() {
  const payload = {};
  for (const key of EXPORTABLE_CONFIG_KEYS) {
    payload[key] = deepCloneJson(config[key]);
  }
  return payload;
}

function normalizeImportRoot(parsed) {
  if (isPlainObject(parsed?.settings)) {
    return parsed.settings;
  }
  return parsed;
}

function validateTagsSection(tags) {
  const seenIds = new Set();
  for (let i = 0; i < tags.length; i++) {
    const item = tags[i];
    if (!isPlainObject(item)) {
      return `tags[${i}] must be an object.`;
    }
    if (!isPositiveInteger(item.id)) {
      return `tags[${i}].id must be a positive integer.`;
    }
    if (!isValidTag(item.name)) {
      return `tags[${i}].name must be a non-empty string.`;
    }
    if (seenIds.has(item.id)) {
      return `tags contains duplicate id '${item.id}'.`;
    }
    seenIds.add(item.id);
  }
  return "";
}

function validateTagIdArray(key, ids) {
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!isPositiveInteger(id)) {
      return `${key}[${i}] must be a positive integer.`;
    }
    if (seen.has(id)) {
      return `${key} contains duplicate id '${id}'.`;
    }
    seen.add(id);
  }
  return "";
}

function validateColorSection(color) {
  const unknownKey = hasOnlyKnownKeys(color, Object.keys(defaultColors));
  if (unknownKey) return `color.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(color)) {
    if (!isValidColor(value)) {
      return `color.${key} must be a valid hex color.`;
    }
  }
  return "";
}

function validateOverlaySection(overlaySettings) {
  const unknownKey = hasOnlyKnownKeys(overlaySettings, Object.keys(defaultOverlaySettings));
  if (unknownKey) return `overlaySettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(overlaySettings)) {
    if (typeof value !== "boolean") {
      return `overlaySettings.${key} must be boolean.`;
    }
  }
  return "";
}

function validateThreadSection(threadSettings) {
  const unknownKey = hasOnlyKnownKeys(threadSettings, Object.keys(defaultThreadSetting));
  if (unknownKey) return `threadSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(threadSettings)) {
    if (key === "directDownloadPackages") {
      if (!isPlainObject(value)) {
        return "threadSettings.directDownloadPackages must be an object.";
      }
      const pkgUnknown = hasOnlyKnownKeys(value, Object.keys(defaultDirectDownloadPackages));
      if (pkgUnknown) {
        return `threadSettings.directDownloadPackages.${pkgUnknown} is not supported.`;
      }
      for (const [pkgKey, pkgEnabled] of Object.entries(value)) {
        if (typeof pkgEnabled !== "boolean") {
          return `threadSettings.directDownloadPackages.${pkgKey} must be boolean.`;
        }
      }
      continue;
    }
    if (key === "directDownloadHealth") {
      if (!isPlainObject(value)) {
        return "threadSettings.directDownloadHealth must be an object.";
      }
      const healthUnknown = hasOnlyKnownKeys(value, Object.keys(defaultDirectDownloadPackages));
      if (healthUnknown) {
        return `threadSettings.directDownloadHealth.${healthUnknown} is not supported.`;
      }
      for (const pkgKey of Object.keys(defaultDirectDownloadPackages)) {
        const hostHealth = value[pkgKey];
        if (typeof hostHealth === "undefined") continue;
        if (!isPlainObject(hostHealth)) {
          return `threadSettings.directDownloadHealth.${pkgKey} must be an object.`;
        }
        const hostUnknown = hasOnlyKnownKeys(hostHealth, [
          "failCount",
          "autoDisabled",
          "noticeDismissed",
          "lastError",
          "updatedAt",
        ]);
        if (hostUnknown) {
          return `threadSettings.directDownloadHealth.${pkgKey}.${hostUnknown} is not supported.`;
        }
        if (
          typeof hostHealth.failCount !== "number" ||
          !Number.isFinite(hostHealth.failCount) ||
          hostHealth.failCount < 0
        ) {
          return `threadSettings.directDownloadHealth.${pkgKey}.failCount must be a number >= 0.`;
        }
        if (typeof hostHealth.autoDisabled !== "boolean") {
          return `threadSettings.directDownloadHealth.${pkgKey}.autoDisabled must be boolean.`;
        }
        if (typeof hostHealth.noticeDismissed !== "boolean") {
          return `threadSettings.directDownloadHealth.${pkgKey}.noticeDismissed must be boolean.`;
        }
        if (typeof hostHealth.lastError !== "string") {
          return `threadSettings.directDownloadHealth.${pkgKey}.lastError must be string.`;
        }
        if (
          typeof hostHealth.updatedAt !== "number" ||
          !Number.isFinite(hostHealth.updatedAt) ||
          hostHealth.updatedAt < 0
        ) {
          return `threadSettings.directDownloadHealth.${pkgKey}.updatedAt must be a number >= 0.`;
        }
      }
      continue;
    }
    if (typeof value !== "boolean") {
      return `threadSettings.${key} must be boolean.`;
    }
  }
  return "";
}

function validateGlobalSection(globalSettings) {
  const unknownKey = hasOnlyKnownKeys(globalSettings, Object.keys(defaultGlobalSettings));
  if (unknownKey) return `globalSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(globalSettings)) {
    if (typeof value !== "boolean") {
      return `globalSettings.${key} must be boolean.`;
    }
  }
  return "";
}

function validateLatestSection(latestSettings) {
  const unknownKey = hasOnlyKnownKeys(latestSettings, Object.keys(defaultLatestSettings));
  if (unknownKey) return `latestSettings.${unknownKey} is not supported.`;

  for (const [key, value] of Object.entries(latestSettings)) {
    if (key === "minVersion") {
      if (!isValidVersion(value)) {
        return "latestSettings.minVersion must be a number >= 0.";
      }
      continue;
    }
    if (key === "latestOverlayColorOrder") {
      if (!isValidOverlayColorOrder(value)) {
        return "latestSettings.latestOverlayColorOrder is invalid.";
      }
      continue;
    }
    if (typeof value !== "boolean") {
      return `latestSettings.${key} must be boolean.`;
    }
  }
  return "";
}

function validateImportedPayload(payload) {
  if (!isPlainObject(payload)) {
    return "Imported JSON must be a plain object.";
  }

  const entries = Object.entries(payload).filter(([key]) => EXPORTABLE_CONFIG_KEYS.includes(key));
  if (entries.length === 0) {
    return "JSON does not contain supported settings keys.";
  }

  for (const [key, value] of entries) {
    if (key === "tags") {
      if (!Array.isArray(value)) return "'tags' must be an array.";
      const err = validateTagsSection(value);
      if (err) return err;
      continue;
    }

    if (key === "preferredTags" || key === "excludedTags") {
      if (!Array.isArray(value)) return `'${key}' must be an array.`;
      const err = validateTagIdArray(key, value);
      if (err) return err;
      continue;
    }

    if (key === "color") {
      if (!isPlainObject(value)) return "'color' must be an object.";
      const err = validateColorSection(value);
      if (err) return err;
      continue;
    }

    if (key === "overlaySettings") {
      if (!isPlainObject(value)) return "'overlaySettings' must be an object.";
      const err = validateOverlaySection(value);
      if (err) return err;
      continue;
    }

    if (key === "threadSettings") {
      if (!isPlainObject(value)) return "'threadSettings' must be an object.";
      const err = validateThreadSection(value);
      if (err) return err;
      continue;
    }

    if (key === "globalSettings") {
      if (!isPlainObject(value)) return "'globalSettings' must be an object.";
      const err = validateGlobalSection(value);
      if (err) return err;
      continue;
    }

    if (key === "latestSettings") {
      if (!isPlainObject(value)) return "'latestSettings' must be an object.";
      const err = validateLatestSection(value);
      if (err) return err;
      continue;
    }
  }

  return "";
}

function formatDateForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function downloadJsonFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportSettingsToFile() {
  clearConfigTransferError();
  const payload = buildExportPayload();
  const text = JSON.stringify(payload, null, 2);
  const filename = `f95zone-ultimate-enhancer-${formatDateForFilename()}.json`;
  downloadJsonFile(filename, text);
  showToast(`Exported: ${filename}`);
}

function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file || null);
    };

    input.addEventListener(
      "change",
      () => {
        finish(input.files?.[0] || null);
      },
      { once: true },
    );

    window.addEventListener(
      "focus",
      () => {
        // If user cancels file picker, "change" may not fire in some browsers.
        setTimeout(() => finish(input.files?.[0] || null), 300);
      },
      { once: true },
    );

    input.click();
  });
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
