import { config } from "../../config.js";
import { EXPORTABLE_CONFIG_KEYS } from "./constants.js";
import { deepCloneJson, isPlainObject } from "./helpers.js";

export function buildExportPayload() {
  const payload = {};
  for (const key of EXPORTABLE_CONFIG_KEYS) {
    payload[key] = deepCloneJson(config[key]);
  }
  return payload;
}

export function normalizeImportRoot(parsed) {
  if (isPlainObject(parsed?.settings)) {
    return parsed.settings;
  }
  return parsed;
}

export function formatDateForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function downloadJsonFile(filename, text) {
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

export function pickJsonFile() {
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
