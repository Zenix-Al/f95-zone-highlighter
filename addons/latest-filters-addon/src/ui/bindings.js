import { SEARCH_DEBOUNCE_MS } from "../constants.js";

export function createLatestFiltersBindings({
  rootEl,
  dialogEl,
  onToggle,
  onClose,
  onSave,
  onApply,
  onUpdate,
  onDelete,
  onSearch,
  onEnter,
  registerResource,
} = {}) {
  let searchTimer = 0;

  const onRootClick = (event) => {
    const actionEl = event.target?.closest?.("[data-action]");
    if (String(actionEl?.dataset?.action || "") === "toggle-panel") {
      event.preventDefault();
      onToggle?.();
    }
  };
  const onDialogClick = (event) => {
    const actionEl = event.target?.closest?.("[data-action]");
    const action = String(actionEl?.dataset?.action || "");
    const presetId = String(actionEl?.dataset?.presetId || "");
    if (action === "close-panel") { event.preventDefault(); onClose?.(); }
    else if (action === "save-current") { event.preventDefault(); void onSave?.(); }
    else if (action === "apply" && presetId) { event.preventDefault(); onApply?.(presetId); }
    else if (action === "update" && presetId) { event.preventDefault(); void onUpdate?.(presetId); }
    else if (action === "delete" && presetId) { event.preventDefault(); void onDelete?.(presetId); }
  };
  const onDialogInput = (event) => {
    if (event.target?.dataset?.role !== "search") return;
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      releaseSearchTimer?.();
      onSearch?.(String(event.target.value || "").trim());
    }, SEARCH_DEBOUNCE_MS);
    const releaseSearchTimer = registerResource?.("dialog-search-debounce", () => {
      window.clearTimeout(searchTimer);
      searchTimer = 0;
    }, "timer");
  };
  const onDialogKeydown = (event) => {
    const input = event.target;
    if (event.key === "Enter" && input?.dataset?.role === "save-name") {
      event.preventDefault();
      void onEnter?.();
    }
  };

  rootEl?.addEventListener("click", onRootClick);
  dialogEl?.addEventListener("click", onDialogClick);
  dialogEl?.addEventListener("input", onDialogInput);
  dialogEl?.addEventListener("keydown", onDialogKeydown);

  return () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = 0;
    rootEl?.removeEventListener("click", onRootClick);
    dialogEl?.removeEventListener("click", onDialogClick);
    dialogEl?.removeEventListener("input", onDialogInput);
    dialogEl?.removeEventListener("keydown", onDialogKeydown);
  };
}
