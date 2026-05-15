/**
 * Library Manager App - Main Entry Point
 * Orchestrates all modules to create a functional library manager
 */

import { createDialogMarkup, ensureStyle, getStyleText } from "./renderer.js";
import { showToast } from "./showToast.js";

// Import modules
import { createInitialState, createAppContext } from "./state.js";
import { createApiLayer } from "./api.js";
import { createHandlers } from "./handlers.js";
import { bindEvents } from "./eventBinder.js";
import { reloadRows } from "./dataOps.js";
import { buildTagConfig } from "./helpers.js";

const ROWS_STATUS_ID = "f95ue-library-rows-status";

export function createLibraryManagerApp({
  bridge,
  addonId,
  library,
  onMutated,
  getCurrentThreadSnapshot,
}) {
  const dialogId = `${String(addonId || "library-addon")}-manager`;
  const styleId = `f95ue-${String(addonId || "library-addon")}-manager-style`;

  // Initialize state
  const state = createInitialState();
  const appContext = createAppContext();

  // Create API layer
  const api = createApiLayer(bridge, library);

  function getLiveThreadSnapshot() {
    if (typeof getCurrentThreadSnapshot !== "function") return null;
    const snapshot = getCurrentThreadSnapshot();
    if (!snapshot?.threadId) return null;
    return snapshot;
  }

  async function askConfirm(
    _root,
    {
      title = "Confirm",
      message = "Are you sure?",
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false,
    } = {},
  ) {
    const result = await api.showConfirm(title, message, confirmText, cancelText, danger);
    if (!result?.ok) return false;
    return Boolean(result?.value?.confirmed);
  }

  function getActiveRoot() {
    return appContext.dialogRoot && document.contains(appContext.dialogRoot)
      ? appContext.dialogRoot
      : null;
  }

  // Register/unregister styles
  async function registerStyle() {
    const cssText = getStyleText();
    const result = await api.registerStyle(styleId, cssText);
    if (!result?.ok) {
      ensureStyle(styleId);
    }
  }

  async function unregisterStyle() {
    const result = await api.unregisterStyle(styleId);
    if (!result?.ok) {
      const existing = document.getElementById(styleId);
      existing?.remove();
    }
  }

  // Create bound version of close for handlers
  async function close(reason = "addon-close") {
    if (!appContext.dialogOpen && !appContext.dialogRoot) {
      await unregisterStyle();
      return;
    }

    await api.closeDialog(dialogId, reason);
    appContext.dialogOpen = false;
    appContext.dialogRoot = null;
    await unregisterStyle();
  }

  // Create handlers with dependencies
  const deps = {
    reloadRowsFn: (root) => {
      state.liveThreadId = String(getLiveThreadSnapshot()?.threadId || "").trim();
      return reloadRows(root, state, api, library, ROWS_STATUS_ID);
    },
    onMutatedFn: onMutated,
    getLiveThreadSnapshotFn: getLiveThreadSnapshot,
    closeDialogFn: close,
    library,
    getRootFn: () => appContext.dialogRoot,
    askConfirmFn: askConfirm,
  };

  const handlers = createHandlers(state, api, deps);

  // Main dialog functions
  async function open() {
    if (appContext.dialogOpen && getActiveRoot()) return;

    await registerStyle();

    const result = await api.openDialog(dialogId, "Library Manager", createDialogMarkup());

    if (!result?.ok) {
      appContext.dialogOpen = false;
      await showToast(`Library manager failed to open (${result?.reason || "unknown"}).`, "error");
      return;
    }

    const contentId = String(result?.value?.contentId || "").trim();
    appContext.dialogRoot = contentId ? document.getElementById(contentId) : null;
    appContext.dialogOpen = Boolean(appContext.dialogRoot);

    if (!appContext.dialogRoot) return;

    // Load tag preference config from core (shared with main script).
    const tagPrefsResult = await api.invokeCoreAction("config.getTagPrefs", {});
    const tagPrefs = tagPrefsResult?.ok ? tagPrefsResult.value : null;
    state.tagConfig = buildTagConfig(tagPrefs || {});

    // Update deps with actual root
    deps.root = appContext.dialogRoot;

    // Setup event listeners
    bindEvents(appContext.dialogRoot, state, handlers, deps);

    // Load initial data
    state.liveThreadId = String(getLiveThreadSnapshot()?.threadId || "").trim();
    await reloadRows(appContext.dialogRoot, state, api, library, ROWS_STATUS_ID);
    appContext.dialogRoot.querySelector(".f95ue-library-manager-window")?.focus();
  }

  async function handleDialogClosed(detail = {}) {
    if (String(detail.dialogId || "") !== dialogId) return;
    appContext.dialogOpen = false;
    appContext.dialogRoot = null;
    await unregisterStyle();
  }

  return {
    open,
    close,
    handleDialogClosed,
  };
}
