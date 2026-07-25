/**
 * API wrapper for core bridge and library interactions
 * Centralizes all async operations to external services
 */

export function createManagerApi(bridge, library) {
  return {
    getTagPrefs: async () => {
      return await bridge.invokeCoreAction("config.getTagPrefs", {});
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

    queryEntriesPage: async (params) => {
      return await library.queryEntriesPage(params);
    },

    getEntry: async (threadId) => {
      return await library.getEntry(threadId);
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

    acknowledgeCurrentUpdate: async (threadId) => {
      return await library.acknowledgeCurrentUpdate(threadId);
    },

    previewManualUpdateCheck: async (ids, options) => {
      return await library.previewManualUpdateCheck(ids, options);
    },

    commitManualUpdateCheck: async (preview, options) => {
      return await library.commitManualUpdateCheck(preview, options);
    },
    getAutoUpdateConfig: () =>
      library.autoUpdate?.getConfig?.() || Promise.resolve({
        intervalMs: 86400000,
        spacingMs: 10000,
        timeoutMs: 30000,
        retryLimit: 2,
        sessionCap: 25,
        dailyCap: 100,
      }),
    putAutoUpdateConfig: (config) => library.autoUpdate.putConfig(config),
    getAutoUpdateSummary: () => library.autoUpdate?.getSummary?.() || Promise.resolve(null),
    setAutoUpdateEnabled: (ids, enabled) => library.setAutoUpdateEnabled(ids, enabled),

    applyPersonalActivity: async (threadId, patch, options) => {
      return await library.applyPersonalActivity(threadId, patch, options);
    },

    bulkUpdateStatus: async (ids, status, options) => {
      return await library.bulkUpdateStatus(ids, status, options);
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
