import { createLibraryManagerApp } from "./managerApp.js";

let managerApp = null;

export function openLibraryManager({ library, onMutated, getCurrentThreadSnapshot }) {
  if (!library || typeof library !== "object") return;
  if (!managerApp) {
    managerApp = createLibraryManagerApp({
      library,
      onMutated,
      getCurrentThreadSnapshot,
    });
  }
  void managerApp.open();
}
