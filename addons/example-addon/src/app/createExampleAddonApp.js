import { notifyTeardownComplete } from "../api/bridge.js";
import { getAddonAccess, getCoreThrottle } from "../api/meta.js";
import { createExampleActions } from "./actions/index.js";
import { createBulkImportController } from "../domain/bulkImport/controller.js";
import { createExampleCommandController } from "./commands.js";
import { createExampleLifecycle } from "./lifecycle.js";
import { createExampleRegistration } from "./registration.js";
import { loadExampleSettings } from "./settings.js";
import { createInitialState, compactResultForPanel } from "../domain/state.js";
import { createExampleUiController } from "./uiController.js";
import { debugLog } from "../../../shared/debugLog.js";
import { createExampleUiBindings } from "../ui/bindings.js";

export function createExampleAddonApp({ core, runtime }) {
  const state = createInitialState();
  let terminal = false;
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

  function appendLog(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${String(message || "")}`;
    state.logs.unshift(line);
    if (state.logs.length > state.settings.panelLogLimit) {
      state.logs.length = state.settings.panelLogLimit;
    }
  }

  function setLastResult(action, result) {
    const displayResult = compactResultForPanel(result);
    state.lastAction = action;
    state.lastResult = displayResult;
    appendLog(
      `${action}: ${typeof displayResult === "string" ? displayResult : JSON.stringify(displayResult)}`,
    );
  }

  const registration = createExampleRegistration({
    core,
    runtime,
    isEnabled: () => state.enabled,
  });

  async function refreshSettings() {
    const loaded = await loadExampleSettings(core);
    state.settings = loaded.settings;
    if (state.logs.length > state.settings.panelLogLimit) {
      state.logs.length = state.settings.panelLogLimit;
    }
    return loaded.result;
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

  let ui = null;
  const bulkImport = createBulkImportController({
    core,
    state,
    syncPanel: (...args) => ui.syncPanel(...args),
    getDialogContentElement: (...args) => ui.getDialogContentElement(...args),
    wait,
  });

  function handleUiActionError(action, error) {
    setLastResult(action, { ok: false, reason: error?.message || "unknown_error" });
    if (state.enabled) void ui.syncPanel();
  }

  function handleDialogClosed(kind) {
    if (kind === "panel") {
      state.ui.panelOpen = false;
      return;
    }
    if (kind === "bulk") {
      if (state.enabled) void ui.syncPanel();
      return;
    }
    if (kind === "dialog") {
      state.ui.dialogOpen = false;
      if (state.enabled) void ui.syncPanel();
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
    if (state.enabled) void ui.syncPanel();
  }

  const uiBindings = createExampleUiBindings({
    addonId: runtime.addonId,
    isEnabled: () => state.enabled,
    onAction: (action) => handleAction(action).catch((error) => handleUiActionError(action, error)),
    onDockAction: (actionId) => handleDockAction(actionId).catch((error) => handleUiActionError(actionId, error)),
  });
  ui = createExampleUiController({
    core,
    runtime,
    state,
    uiBindings,
    isTerminal: () => terminal,
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
      await ui.enable();
      if (!isCurrent()) return { ok: false, reason: "enable_superseded" };
      registration.publishStatus();
      await ui.syncPanel();
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
      await ui.disable("disable");
      registration.publishStatus();
      debugLog(runtime.addonId, "Lifecycle disable completed.", {
        data: { lifecycle: lifecycle?.getSnapshot?.(), ui: state.ui },
      });
      return { ok: true };
    },
    onRefresh: async ({ isCurrent }) => {
      await refreshSettings();
      await refreshMetaSection();
      if (!isCurrent()) return { ok: false, reason: "refresh_superseded" };
      if (state.enabled) {
        await ui.enable();
        await ui.syncPanel();
      }
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
      await ui.disable(reason);
      commandController.unbind();
      uiBindings.unbindPanelClicks();
      uiBindings.unbindDockMountEvents();
      return { ok: true };
    },
    onTeardownAcknowledged: async (reason) => {
      notifyTeardownComplete(core, reason);
    },
  });

  const actions = createExampleActions({
    core,
    state,
    isAvailable: () => state.enabled && !terminal,
    bulkImport,
    setLastResult,
    syncPanel: ui.syncPanel,
    createObserverTestNode,
    ensureDockButtons: ui.ensureDockButtons,
    removeExampleDockButtons: ui.removeExampleDockButtons,
    unmountExtra: ui.unmountExtra,
    openExamplePanel: ui.openExamplePanel,
    closeExamplePanel: ui.closeExamplePanel,
    closeExampleDialog: ui.closeExampleDialog,
  });

  async function handleAction(action) { return actions.handle(action); }

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
    registration.register();

    const access = await getAddonAccess(core);
    debugLog(
      runtime.addonId,
      `Core access response (ok=${Boolean(access?.ok)}, blocked=${Boolean(access?.value?.blocked)}, enabled=${String(access?.value?.enabled)}, trusted=${String(access?.value?.trusted)}, reason=${String(access?.reason || access?.value?.blockReason || "")}).`,
      { data: access },
    );
    if (!access?.ok || access.value?.blocked || access.value?.enabled === false) {
      state.enabled = false;
      registration.publishStatus();
      debugLog(runtime.addonId, `Application held disabled by core state (reason=${String(access?.reason || access?.value?.blockReason || (access?.value?.enabled === false ? "persisted-disabled" : "blocked"))}).`, {
        level: "warn",
        data: { access },
      });
      return;
    }

    await Promise.all([refreshSettings(), refreshMetaSection()]);
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
