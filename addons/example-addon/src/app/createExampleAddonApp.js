import {
  notifyTeardownComplete,
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import { getAddonAccess, getCoreThrottle } from "../api/meta.js";
import { disableFeature, enableFeature, refreshFeature } from "../api/feature.js";
import {
  EXAMPLE_DIALOG_ID,
  EXAMPLE_DOCK_BUTTONS,
  EXAMPLE_DOCK_MOUNT_ID,
  EXAMPLE_EXTRA_MOUNT_ID,
  EXAMPLE_IDB_PRIMARY_KEY,
  EXAMPLE_OBSERVER_ID,
  EXAMPLE_PANEL_DIALOG_ID,
  EXAMPLE_STORAGE_KEY,
  EXAMPLE_STYLE_ID,
} from "../constants.js";
import { createBulkImportController } from "./bulkImport.js";
import { createExampleCommandController } from "./commands.js";
import { createExampleLifecycle } from "./lifecycle.js";
import {
  buildIdbPayload,
  createIdbBulkDeletePayload,
  createIdbRowsPreview,
  createInitialState,
  createPrimaryRecord,
  compactResultForPanel,
  summarizeTagPrefs,
} from "./state.js";
import {
  bulkDeleteRecords,
  countRecords,
  deleteRecord,
  getRecord,
  putRecord,
  queryRecords,
} from "../api/idb.js";
import { waitForObserver, watchObserver, unwatchObserver } from "../api/observer.js";
import { getPageContext } from "../api/page.js";
import {
  getStoredValue,
  getStorageUsage,
  getTagPrefs,
  setStoredValue,
} from "../api/storage.js";
import { showCoreToast } from "../api/toast.js";
import { closeDialog, confirmDialog, openDialog, updateDialog } from "../api/ui/dialog.js";
import { removeDockButtons, setDockButtons } from "../api/ui/dock.js";
import { mountUi, unmountUi, updateUi } from "../api/ui/mount.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import { debugLog } from "../../../shared/debugLog.js";
import exampleCssText from "../ui/example.css";
import { renderExampleDialog } from "../ui/dialog.js";
import { renderDockMarkup } from "../ui/dockRenderer.js";
import { renderExtraMount } from "../ui/extraMount.js";
import { renderExamplePanel } from "../ui/panel.js";
import { createExampleUiBindings } from "../ui/bindings.js";

export function createExampleAddonApp({ core, runtime }) {
  const state = createInitialState();
  let terminal = false;
  let dockButtonsRequested = false;
  const ownedTimeouts = new Map();
  const ownedObserverNodes = new Set();
  let ownedResourceSequence = 0;

  function wait(ms) {
    return new Promise((resolve) => {
      const token = {};
      const resourceId = `timer:${++ownedResourceSequence}`;
      const finish = () => {
        if (!ownedTimeouts.has(token)) return;
        ownedTimeouts.delete(token);
        lifecycle?.releaseResource?.(resourceId);
        resolve();
      };
      token.timer = window.setTimeout(finish, Math.max(0, Number(ms) || 0));
      token.finish = finish;
      ownedTimeouts.set(token, token);
      lifecycle?.registerResource?.(resourceId, () => {
        if (!ownedTimeouts.has(token)) return;
        ownedTimeouts.delete(token);
        window.clearTimeout(token.timer);
        resolve();
      }, "timer");
    });
  }

  function cancelOwnedTimeouts() {
    for (const token of ownedTimeouts.values()) {
      window.clearTimeout(token.timer);
      token.finish();
    }
  }

  function getDialogContentElement(dialogId) {
    return document.getElementById(
      `f95ue-addon-dialog-content-${runtime.addonId}-${String(dialogId || "").trim()}`,
    );
  }

  async function updateOpenDialogContent(dialogId, html) {
    const result = await updateDialog(core, dialogId, html);
    if (result?.ok) return true;
    if (result?.reason !== "unsupported_action") return false;
    const contentEl = getDialogContentElement(dialogId);
    if (!contentEl) return false;
    contentEl.innerHTML = html;
    return true;
  }

  function appendLog(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${String(message || "")}`;
    state.logs.unshift(line);
    if (state.logs.length > 20) {
      state.logs.length = 20;
    }
  }

  function setLastResult(action, result) {
    const displayResult = compactResultForPanel(result);
    state.lastAction = action;
    state.lastResult = displayResult;
    appendLog(`${action}: ${typeof displayResult === "string" ? displayResult : JSON.stringify(displayResult)}`);
  }

  function registerAddon() {
    debugLog(runtime.addonId, "Registration payload prepared.", {
      data: {
        id: runtime.addonId,
        version: runtime.addonVersion,
        status: state.enabled ? "installed" : "disabled",
        pageScopes: runtime.pageScopes,
        runtimeMode: runtime.runtimeMode,
        matches: runtime.matches,
        capabilities: runtime.capabilities,
        requiresCore: runtime.requiresCore,
      },
    });
    registerAddonRuntime(core, {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: state.enabled ? "installed" : "disabled",
      statusMessage: state.enabled ? "API playground active." : "API playground disabled.",
      panelTitle: runtime.addonName,
      panelBody:
        "Core API playground demonstrating every current addon-facing action through the api folder.",
      capabilities: runtime.capabilities,
      requiresCore: runtime.requiresCore,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    });
  }

  function pushStatusUpdate() {
    debugLog(runtime.addonId, "Publishing runtime status.", {
      data: {
        status: state.enabled ? "installed" : "disabled",
        enabled: state.enabled,
      },
    });
    updateAddonRuntimeStatus(
      core,
      state.enabled ? "installed" : "disabled",
      state.enabled ? "API playground active." : "API playground disabled.",
    );
    registerAddon();
  }

  async function syncPanel() {
    if (!state.enabled || terminal || !state.ui.panelOpen) return;

    const html = renderExamplePanel(state);
    if (await updateOpenDialogContent(EXAMPLE_PANEL_DIALOG_ID, html)) {
      return;
    }

    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html,
      size: "lg",
    });

    if (!result?.ok) {
      throw new Error(`Panel sync failed: ${result?.reason || "unknown"}`);
    }
    if (!state.enabled || terminal) {
      await closeDialog(core, EXAMPLE_PANEL_DIALOG_ID, "stale-panel-sync");
      return;
    }
    state.ui.panelOpen = true;
  }

  async function ensureStyleRegistered() {
    const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
    if (!result?.ok) {
      throw new Error(`ui.style.register failed: ${result?.reason || "unknown"}`);
    }
    state.ui.styleRegistered = true;
    return result;
  }

  async function ensureDockButtons() {
    const result = await setDockButtons(core, EXAMPLE_DOCK_BUTTONS);
    if (result?.ok) {
      state.ui.dockButtonsActive = true;
      dockButtonsRequested = true;
    }
    return result;
  }

  async function mountDockLauncher() {
    debugLog(runtime.addonId, "Mounting dock launcher.", {
      data: { enabled: state.enabled, mounted: state.ui.dockLauncherMounted },
    });
    const result = await mountUi(core, {
      mountId: EXAMPLE_DOCK_MOUNT_ID,
      slot: "page.dock",
      html: renderDockMarkup(),
    });
    if (!result?.ok) {
      throw new Error(`Dock launcher mount failed: ${result?.reason || "unknown"}`);
    }
    state.ui.dockLauncherMounted = true;
    uiBindings.bindDockMountEvents();
    debugLog(runtime.addonId, "Dock launcher mounted and click listener bound.", { data: result });
    return result;
  }

  async function unmountDockLauncher() {
    debugLog(runtime.addonId, "Unbinding and unmounting dock launcher.", {
      data: { enabled: state.enabled, mounted: state.ui.dockLauncherMounted },
    });
    uiBindings.unbindDockMountEvents();
    const result = await unmountUi(core, EXAMPLE_DOCK_MOUNT_ID);
    if (result?.ok) {
      state.ui.dockLauncherMounted = false;
    }
    debugLog(runtime.addonId, "Dock launcher cleanup completed.", { data: { result, ui: state.ui } });
    return result;
  }

  async function closeExampleDialog(reason = "example-close") {
    const result = await closeDialog(core, EXAMPLE_DIALOG_ID, reason);
    if (result?.ok) state.ui.dialogOpen = false;
    return result;
  }

  async function openExamplePanel() {
    if (state.ui.panelOpen) {
      await syncPanel();
      return { ok: true, value: { dialogId: EXAMPLE_PANEL_DIALOG_ID, updated: true } };
    }

    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html: renderExamplePanel(state),
      size: "lg",
    });
    if (!result?.ok) {
      throw new Error(`Panel open failed: ${result?.reason || "unknown"}`);
    }
    state.ui.panelOpen = true;
    return result;
  }

  async function closeExamplePanel(reason = "example-panel-close") {
    const result = await closeDialog(core, EXAMPLE_PANEL_DIALOG_ID, reason);
    if (result?.ok) state.ui.panelOpen = false;
    return result;
  }

  async function unmountExtra() {
    const result = await unmountUi(core, EXAMPLE_EXTRA_MOUNT_ID);
    if (result?.ok) {
      state.ui.extraMountActive = false;
    }
    return result;
  }

  async function disableUi(reason = "disable") {
    debugLog(runtime.addonId, `UI cleanup started (reason=${reason}).`, { data: { ui: state.ui } });
    if (state.observer.isWatching) {
      await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
      state.observer.isWatching = false;
    }
    const dialogCloseResult = await closeExampleDialog(reason);
    const panelCloseResult = await closeExamplePanel(reason);
    await removeDockButtons(core);
    state.ui.dockButtonsActive = false;
    await unmountExtra();
    await unmountDockLauncher();
    if (state.ui.styleRegistered || dialogCloseResult?.ok || panelCloseResult?.ok) {
      const styleResult = await unregisterStyle(core, EXAMPLE_STYLE_ID);
      if (styleResult?.ok) state.ui.styleRegistered = false;
    }
    debugLog(runtime.addonId, `UI cleanup completed (reason=${reason}).`, { data: { ui: state.ui } });
  }

  async function enableUi() {
    debugLog(runtime.addonId, "UI enable/remount started.", {
      data: { ui: state.ui, dockButtonsRequested },
    });
    if (!state.ui.styleRegistered) await ensureStyleRegistered();
    if (dockButtonsRequested && !state.ui.dockButtonsActive) await ensureDockButtons();
    if (!state.ui.dockLauncherMounted) await mountDockLauncher();
    debugLog(runtime.addonId, "UI enable/remount completed.", { data: { ui: state.ui } });
  }

  function createObserverTestNode() {
    const node = document.createElement("div");
    node.textContent = `Observer test node ${Date.now()}`;
    node.style.display = "none";
    document.body.appendChild(node);
    ownedObserverNodes.add(node);
    const token = {};
    const resourceId = `observer-node:${++ownedResourceSequence}`;
    const timer = window.setTimeout(() => {
      ownedTimeouts.delete(token);
      ownedObserverNodes.delete(node);
      lifecycle?.releaseResource?.(resourceId);
      node.remove();
    }, 1500);
    token.timer = timer;
    token.finish = () => {
      ownedTimeouts.delete(token);
      ownedObserverNodes.delete(node);
      lifecycle?.releaseResource?.(resourceId);
      window.clearTimeout(timer);
      node.remove();
    };
    ownedTimeouts.set(token, token);
    lifecycle?.registerResource?.(resourceId, () => {
      ownedTimeouts.delete(token);
      ownedObserverNodes.delete(node);
      window.clearTimeout(timer);
      node.remove();
    }, "observer-node");
  }

  async function refreshMetaSection() {
    const [accessResult, throttleResult] = await Promise.all([
      getAddonAccess(core),
      getCoreThrottle(core),
    ]);

    state.meta.access = accessResult?.ok
      ? accessResult.value
      : { error: accessResult?.reason || "unknown" };
    state.meta.throttle = throttleResult?.ok
      ? throttleResult.value
      : { error: throttleResult?.reason || "unknown" };
  }

  const bulkImport = createBulkImportController({
    core,
    state,
    syncPanel,
    getDialogContentElement,
    wait,
  });

  function handleUiActionError(action, error) {
    setLastResult(action, { ok: false, reason: error?.message || "unknown_error" });
    if (state.enabled) void syncPanel();
  }

  function handleDialogClosed(kind) {
    if (kind === "panel") {
      state.ui.panelOpen = false;
      return;
    }
    if (kind === "bulk") {
      if (state.enabled) void syncPanel();
      return;
    }
    if (kind === "dialog") {
      state.ui.dialogOpen = false;
      if (state.enabled) void syncPanel();
    }
  }

  function handleObserverNodes(detail) {
    state.observer.eventCount += 1;
    state.observer.lastBatchSize = Array.isArray(detail.nodes) ? detail.nodes.length : 0;
    state.observer.lastNodeTags = Array.isArray(detail.nodes)
      ? detail.nodes
          .map((node) => String(node?.tagName || "").trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    appendLog(
      `observer.nodes: batch=${state.observer.lastBatchSize}, tags=${state.observer.lastNodeTags.join(", ") || "-"}`,
    );
    if (state.enabled) void syncPanel();
  }

  const uiBindings = createExampleUiBindings({
    addonId: runtime.addonId,
    isEnabled: () => state.enabled,
    onAction: (action) => handleAction(action).catch((error) => handleUiActionError(action, error)),
    onDockAction: (actionId) => handleDockAction(actionId).catch((error) => handleUiActionError(actionId, error)),
  });
  let lifecycle = null;
  const commandController = createExampleCommandController({
    core,
    state,
    getLifecycle: () => lifecycle,
    bulkImport,
    onDockAction: handleDockAction,
    onDialogClosed: handleDialogClosed,
    onObserverNodes: handleObserverNodes,
    onError: (action, error, fallback) => {
      setLastResult(action, { ok: false, reason: error?.message || fallback });
    },
  });

  lifecycle = createExampleLifecycle({
    onEnable: async ({ isCurrent }) => {
      debugLog(runtime.addonId, "Lifecycle enable started.", { data: lifecycle?.getSnapshot?.() });
      state.enabled = true;
      await enableUi();
      if (!isCurrent()) return { ok: false, reason: "enable_superseded" };
      pushStatusUpdate();
      await syncPanel();
      debugLog(runtime.addonId, "Lifecycle enable completed.", { data: lifecycle?.getSnapshot?.() });
      return { ok: true };
    },
    onDisable: async () => {
      debugLog(runtime.addonId, "Lifecycle disable started.", { data: lifecycle?.getSnapshot?.() });
      state.enabled = false;
      bulkImport.requestCancellation();
      cancelOwnedTimeouts();
      for (const node of ownedObserverNodes) node.remove?.();
      ownedObserverNodes.clear();
      await disableUi("disable");
      pushStatusUpdate();
      debugLog(runtime.addonId, "Lifecycle disable completed.", {
        data: { lifecycle: lifecycle?.getSnapshot?.(), ui: state.ui },
      });
      return { ok: true };
    },
    onRefresh: async ({ isCurrent }) => {
      await refreshMetaSection();
      if (!isCurrent()) return { ok: false, reason: "refresh_superseded" };
      if (state.enabled) await syncPanel();
      setLastResult("refresh-command", { ok: true });
      return { ok: true };
    },
    onTeardown: async ({ reason }) => {
      terminal = true;
      state.enabled = false;
      bulkImport.requestCancellation();
      cancelOwnedTimeouts();
      for (const node of ownedObserverNodes) node.remove?.();
      ownedObserverNodes.clear();
      await disableUi(reason);
      commandController.unbind();
      uiBindings.unbindPanelClicks();
      uiBindings.unbindDockMountEvents();
      return { ok: true };
    },
    onTeardownAcknowledged: async (reason) => {
      notifyTeardownComplete(core, reason);
    },
  });

  async function handleAction(action) {
    if (!state.enabled || terminal) return;
    switch (action) {
      case "meta-access": {
        const result = await getAddonAccess(core);
        state.meta.access = result?.ok
          ? result.value
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "meta-throttle": {
        const result = await getCoreThrottle(core);
        state.meta.throttle = result?.ok
          ? result.value
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "panel-open": {
        const result = await openExamplePanel();
        setLastResult(action, result);
        break;
      }
      case "panel-close": {
        const result = await closeExamplePanel("panel-button");
        setLastResult(action, result);
        return;
      }
      case "toast-show": {
        const result = await showCoreToast(core, "Hello from Example Add-on", "info");
        setLastResult(action, result);
        break;
      }
      case "feature-enable": {
        const result = await enableFeature(core);
        setLastResult(action, result);
        break;
      }
      case "feature-refresh": {
        const result = await refreshFeature(core);
        setLastResult(action, result);
        break;
      }
      case "feature-disable": {
        const result = await disableFeature(core);
        setLastResult(action, result);
        return;
      }
      case "storage-set": {
        const value = {
          text: "Hello from storage.set",
          updatedAt: new Date().toISOString(),
        };
        const result = await setStoredValue(core, EXAMPLE_STORAGE_KEY, value);
        if (result?.ok) {
          state.storage.value = value;
        }
        setLastResult(action, result);
        break;
      }
      case "storage-get": {
        const result = await getStoredValue(core, EXAMPLE_STORAGE_KEY, null);
        state.storage.value = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "storage-usage": {
        const result = await getStorageUsage(core);
        state.storage.usage = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "storage-tags": {
        const result = await getTagPrefs(core);
        state.storage.tagPrefsSummary = result?.ok
          ? summarizeTagPrefs(result.value)
          : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "idb-put": {
        const record = createPrimaryRecord();
        const result = await putRecord(core, buildIdbPayload({ value: record }));
        if (result?.ok) {
          state.idb.lastRecord = record;
        }
        setLastResult(action, result);
        break;
      }
      case "idb-get": {
        const result = await getRecord(core, buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }));
        state.idb.lastRecord = result?.ok ? result.value : { error: result?.reason || "unknown" };
        setLastResult(action, result);
        break;
      }
      case "idb-bulk-put": {
        const result = await bulkImport.run();
        setLastResult(action, result);
        break;
      }
      case "idb-bulk-delete": {
        const queryResult = await queryRecords(
          core,
          buildIdbPayload({ limit: 500, includeKeys: true }),
        );
        if (!queryResult?.ok) {
          setLastResult(action, queryResult);
          break;
        }
        const keys = (Array.isArray(queryResult.value) ? queryResult.value : [])
          .map((entry) => entry?.key)
          .filter((key) => String(key || "").startsWith("dummy-bulk-"));
        const result = await bulkDeleteRecords(core, createIdbBulkDeletePayload(keys));
        if (result?.ok) {
          state.idb.rows = [];
          const countResult = await countRecords(core, buildIdbPayload({}));
          state.idb.count = countResult?.ok ? Number(countResult.value || 0) : state.idb.count;
        }
        setLastResult(action, result);
        break;
      }
      case "bulk-import-cancel": {
        bulkImport.requestCancellation();
        setLastResult(action, { ok: true, value: "cancellation requested" });
        return;
      }
      case "idb-query": {
        const result = await queryRecords(
          core,
          buildIdbPayload({
            index: "updatedAt",
            direction: "prev",
            limit: 10,
            includeKeys: true,
          }),
        );
        state.idb.rows = result?.ok
          ? createIdbRowsPreview(result.value)
          : [{ error: result?.reason || "unknown" }];
        setLastResult(action, result);
        break;
      }
      case "idb-count": {
        const result = await countRecords(core, buildIdbPayload({}));
        state.idb.count = result?.ok ? Number(result.value || 0) : -1;
        setLastResult(action, result);
        break;
      }
      case "idb-delete": {
        const result = await deleteRecord(core, buildIdbPayload({ key: EXAMPLE_IDB_PRIMARY_KEY }));
        if (result?.ok) {
          state.idb.lastRecord = null;
        }
        setLastResult(action, result);
        break;
      }
      case "observer-watch": {
        const result = await watchObserver(core, EXAMPLE_OBSERVER_ID);
        if (result?.ok) {
          state.observer.isWatching = true;
        }
        setLastResult(action, result);
        break;
      }
      case "observer-wait": {
        const result = await waitForObserver(core, `${EXAMPLE_OBSERVER_ID}-wait`, "body", 1000);
        setLastResult(action, result);
        break;
      }
      case "observer-add-node": {
        createObserverTestNode();
        setLastResult(action, { ok: true, value: "observer test node appended" });
        break;
      }
      case "observer-unwatch": {
        const result = await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
        if (result?.ok) {
          state.observer.isWatching = false;
        }
        setLastResult(action, result);
        break;
      }
      case "style-register": {
        const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
        if (result?.ok) {
          state.ui.styleRegistered = true;
        }
        setLastResult(action, result);
        break;
      }
      case "style-unregister": {
        const result = await unregisterStyle(core, EXAMPLE_STYLE_ID);
        if (result?.ok) {
          state.ui.styleRegistered = false;
        }
        setLastResult(action, result);
        break;
      }
      case "mount-extra": {
        const nextRevision = state.ui.extraMountRevision + 1;
        const result = await mountUi(core, {
          mountId: EXAMPLE_EXTRA_MOUNT_ID,
          slot: "body",
          html: renderExtraMount(nextRevision),
        });
        if (result?.ok) {
          state.ui.extraMountActive = true;
          state.ui.extraMountRevision = nextRevision;
        }
        setLastResult(action, result);
        break;
      }
      case "update-extra": {
        const nextRevision = state.ui.extraMountRevision + 1;
        const result = await updateUi(core, {
          mountId: EXAMPLE_EXTRA_MOUNT_ID,
          html: renderExtraMount(nextRevision),
        });
        if (result?.ok) {
          state.ui.extraMountActive = true;
          state.ui.extraMountRevision = nextRevision;
        }
        setLastResult(action, result);
        break;
      }
      case "unmount-extra": {
        const result = await unmountExtra();
        setLastResult(action, result);
        break;
      }
      case "dialog-open": {
        const result = await openDialog(core, {
          dialogId: EXAMPLE_DIALOG_ID,
          title: "Example Add-on Dialog",
          html: renderExampleDialog(),
          size: "sm",
        });
        if (result?.ok) {
          state.ui.dialogOpen = true;
        }
        setLastResult(action, result);
        break;
      }
      case "dialog-update": {
        const result = await updateDialog(core, EXAMPLE_DIALOG_ID, `${renderExampleDialog()}<p>Dialog content updated through <code>ui.dialog.update</code>.</p>`);
        setLastResult(action, result);
        break;
      }
      case "meta-page": {
        const result = await getPageContext(core);
        setLastResult(action, result ? { ok: true, value: result } : { ok: false, reason: "unsupported_action" });
        break;
      }
      case "dialog-confirm": {
        const result = await confirmDialog(core, {
          title: "ui.confirm example",
          description: "Did the example confirm dialog open correctly?",
          confirmLabel: "Yep",
          cancelLabel: "Nope",
        });
        state.ui.lastConfirm = result?.ok
          ? String(result?.value?.confirmed)
          : `error:${result?.reason || "unknown"}`;
        setLastResult(action, result);
        break;
      }
      case "dialog-close": {
        const result = await closeExampleDialog("example-button");
        setLastResult(action, result);
        break;
      }
      case "dock-set": {
        const result = await ensureDockButtons();
        setLastResult(action, result);
        break;
      }
      case "dock-remove": {
        const result = await removeDockButtons(core);
        if (result?.ok) {
          state.ui.dockButtonsActive = false;
          dockButtonsRequested = false;
        }
        setLastResult(action, result);
        break;
      }
      default:
        return;
    }

    await syncPanel();
  }

  async function handleDockAction(actionId) {
    if (actionId === "show-toast") {
      await handleAction("toast-show");
      return;
    }
    if (actionId === "open-panel") {
      await handleAction("panel-open");
      return;
    }
    if (actionId === "refresh-panel") {
      await handleAction("feature-refresh");
    }
  }

  async function bootstrap() {
    debugLog(runtime.addonId, "Application handshake phase started.", {
      data: { enabled: state.enabled, terminal },
    });
    uiBindings.bindPanelClicks();
    commandController.bind();
    registerAddon();

    const access = await getAddonAccess(core);
    debugLog(
      runtime.addonId,
      `Core access response (ok=${Boolean(access?.ok)}, blocked=${Boolean(access?.value?.blocked)}, enabled=${String(access?.value?.enabled)}, trusted=${String(access?.value?.trusted)}, reason=${String(access?.reason || access?.value?.blockReason || "")}).`,
      { data: access },
    );
    if (!access?.ok || access.value?.blocked || access.value?.enabled === false) {
      state.enabled = false;
      pushStatusUpdate();
      debugLog(runtime.addonId, `Application held disabled by core state (reason=${String(access?.reason || access?.value?.blockReason || (access?.value?.enabled === false ? "persisted-disabled" : "blocked"))}).`, {
        level: "warn",
        data: { access },
      });
      return;
    }

    await refreshMetaSection();
    debugLog(runtime.addonId, "Core access accepted; enabling application.");
    await lifecycle.enable();
    setLastResult("bootstrap", { ok: true, value: "example addon ready" });
  }

  return {
    bootstrap,
    getRuntimeSnapshot: () => lifecycle?.getSnapshot?.() || null,
    getResourceSnapshot: () => lifecycle?.getResourceSnapshot?.() || [],
    getPendingOperationSnapshot: () => lifecycle?.getPendingOperationSnapshot?.() || [],
  };
}
