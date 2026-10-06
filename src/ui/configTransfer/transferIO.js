import { createRegistrar } from "../../core/listenerRegistry.js";
import { createResourceOwner } from "../../core/resourceManager.js";

export function formatDateForFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const REVOKE_DELAY_MS = 10000;
const PICKER_FOCUS_GRACE_MS = 1500;

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

  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  };
  // Give the browser time to start the download before the blob URL goes away.
  setTimeout(revoke, REVOKE_DELAY_MS);
  return revoke;
}

export function createJsonFilePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  document.body.appendChild(input);

  const { reg, dispose } = createRegistrar("config-transfer-picker");
  const owner = createResourceOwner(
    `ui:config-transfer-picker:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  );
  let settled = false;
  let focusTimer = 0;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const finish = (file) => {
    if (settled) return;
    settled = true;
    clearTimeout(focusTimer);
    dispose();
    input.remove();
    owner.release();
    resolvePromise(file || null);
  };

  owner.register("input", () => {
    if (settled) return;
    settled = true;
    dispose();
    input.remove();
    resolvePromise(null);
  });

  reg(input, "change", () => finish(input.files?.[0] || null));
  // Modern browsers fire "cancel" on the input when the dialog is dismissed.
  reg(input, "cancel", () => finish(null));
  // Fallback for browsers without "cancel": the window regains focus when the dialog
  // closes, but "change" can arrive later than a short timer, so wait generously.
  reg(window, "focus", () => {
    focusTimer = setTimeout(() => finish(input.files?.[0] || null), PICKER_FOCUS_GRACE_MS);
  });
  input.click();

  return {
    promise,
    cancel: () => finish(null),
  };
}
