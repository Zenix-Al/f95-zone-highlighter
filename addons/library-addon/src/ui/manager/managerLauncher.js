import { createLibraryManagerApp } from "./managerApp.js";

let managerApp = null;

function getManagerApp(options) {
  if (!managerApp) {
    managerApp = createLibraryManagerApp(options);
  }
  return managerApp;
}

export function openLibraryManager({ bridge, addonId, library, onMutated, getCurrentThreadSnapshot }) {
  if (!library || typeof library !== "object") return;
  void getManagerApp({
    bridge,
    addonId,
    library,
    onMutated,
    getCurrentThreadSnapshot,
  }).open();
}

export function closeLibraryManager(reason = "addon-close") {
  if (!managerApp) return Promise.resolve({ ok: true, value: { alreadyClosed: true } });
  return managerApp.close(reason);
}

export function handleLibraryManagerDialogClosed(detail) {
  if (!managerApp) return;
  void managerApp.handleDialogClosed(detail);
}
