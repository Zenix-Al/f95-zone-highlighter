import { createRegistrar } from "../../core/listenerRegistry.js";
import { createResourceOwner } from "../../core/resourceManager.js";

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

  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
  };
  setTimeout(revoke, 0);
  return revoke;
}

export function createJsonFilePicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  document.body.appendChild(input);

  const { reg, dispose } = createRegistrar("config-transfer-picker");
  const owner = createResourceOwner(`ui:config-transfer-picker:${Date.now()}:${Math.random().toString(16).slice(2)}`);
  let settled = false;
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });

  const finish = (file) => {
    if (settled) return;
    settled = true;
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
  reg(window, "focus", () => {
    setTimeout(() => finish(input.files?.[0] || null), 300);
  });
  input.click();

  return {
    promise,
    cancel: () => finish(null),
  };
}
