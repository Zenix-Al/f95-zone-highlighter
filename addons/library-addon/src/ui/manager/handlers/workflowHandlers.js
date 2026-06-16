import { handleExport, handleExportSelected } from "../../application/importExportWorkflow.js";

export function createWorkflowHandlers(context) {
  const { deps, getRoot, state } = context;
  const { closeDialogFn, library } = deps;

  return {
    export: async () => {
      await handleExport(getRoot(), state, library, false);
    },
    "export-selected": async () => {
      await handleExportSelected(getRoot(), state);
    },
    import: () => {
      const importInput = getRoot()?.querySelector('[data-field="importFile"]');
      importInput?.click();
    },
    close: async () => {
      await closeDialogFn("addon-close");
    },
  };
}
