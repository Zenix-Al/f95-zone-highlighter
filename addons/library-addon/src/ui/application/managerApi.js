/**
 * API wrapper for core bridge and library interactions
 * Centralizes all async operations to external services
 */

export function createManagerApi(bridge, library) {
  return {
    invokeCoreAction: async (action, payload) => {
      return await bridge.invokeCoreAction(action, payload);
    },

    registerStyle: async (styleId, cssText) => {
      const result = await bridge.invokeCoreAction("ui.style.register", {
        styleId,
        cssText,
      });
      return result;
    },

    unregisterStyle: async (styleId) => {
      const result = await bridge.invokeCoreAction("ui.style.unregister", {
        styleId,
      });
      return result;
    },

    openDialog: async (dialogId, title, html, options = {}) => {
      const result = await bridge.invokeCoreAction("ui.dialog.open", {
        dialogId,
        title,
        html,
        closeOnBackdrop: true,
        closeOnEsc: true,
        size: "xl",
        ...options,
      });
      return result;
    },

    closeDialog: async (dialogId, reason = "addon-close") => {
      const result = await bridge.invokeCoreAction("ui.dialog.close", {
        dialogId,
        reason,
      });
      return result;
    },

    showConfirm: async (title, description, confirmLabel, cancelLabel, danger = false) => {
      const result = await bridge.invokeCoreAction("ui.confirm", {
        title,
        description,
        confirmLabel,
        cancelLabel,
        danger: Boolean(danger),
      });
      return result;
    },

    queryEntries: async (params) => {
      const rows = await library.queryEntries(params);
      return Array.isArray(rows) ? rows : [];
    },

    getAllEntries: async (sortBy, sortDir) => {
      const rows = await library.getAllEntries(sortBy, sortDir);
      return Array.isArray(rows) ? rows : [];
    },

    removeEntry: async (threadId) => {
      return await library.removeEntry(threadId);
    },

    patchEntry: async (threadId, patch) => {
      return await library.patchEntry(threadId, patch);
    },

    bulkUpdateStatus: async (ids, status) => {
      return await library.bulkUpdateStatus(ids, status);
    },

    bulkRemoveEntries: async (ids) => {
      return await library.bulkRemoveEntries(ids);
    },

    importEntries: async (records, options) => {
      return await library.importEntries(records, options);
    },

    exportEntries: async () => {
      return await library.exportEntries();
    },
  };
}
