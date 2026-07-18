import { debugLog } from "../../../shared/debugLog.js";
import { getAddonAccess } from "../api/meta.js";
import { createLibraryService } from "../library/service.js";
import { getThreadSnapshot } from "../thread/detector.js";
import {
  cancelActiveImport,
  configureImportProgress,
  handleImportProgressDialogClosed,
} from "../ui/application/importProgressController.js";
import { handleLibraryManagerDialogClosed } from "../ui/manager/managerLauncher.js";
import { configureToast } from "../ui/utils/showToast.js";
import { createLibraryCommandBinding } from "./commands.js";
import { createLibraryDockController } from "./dockController.js";
import { createLibraryLifecycle } from "./lifecycle.js";
import { createLibraryManagerController } from "./managerController.js";
import { getLocalLibraryPageContext } from "./pageContext.js";
import { createLibraryRegistration } from "./registration.js";
import { createLibrarySettings } from "./settings.js";

export function createLibraryAddonApp({ core, runtime }) {
  configureToast(core);
  configureImportProgress(core);

  const state = {
    enabled: true,
    showPageButtons: true,
    openManager: () => {},
    refreshRuntime: async () => ({ ok: false, reason: "not_ready" }),
  };
  const settings = createLibrarySettings(core);
  const library = createLibraryService(core, settings.storage);
  const registration = createLibraryRegistration({
    core,
    runtime,
    getEnabled: () => state.enabled,
    getShowPageButtons: () => state.showPageButtons,
  });

  let dock;
  let manager;
  let commandHandler = null;

  function isCurrent(context) {
    return (
      !context ||
      typeof context.isCurrent !== "function" ||
      context.isCurrent()
    );
  }

  async function setEnabled(nextEnabled, context = null) {
    state.enabled = Boolean(nextEnabled);
    await settings.save({ enabled: state.enabled });
    if (state.enabled) {
      await dock.refresh(context);
    } else {
      await cancelActiveImport("disabled");
      await manager.close("disabled");
      await dock.unmount();
    }
    if (!isCurrent(context)) {
      return { ok: false, reason: "lifecycle_superseded" };
    }
    registration.publishStatus();
    return { ok: true };
  }

  async function refreshRuntimeState(context = null) {
    const loaded = await settings.load();
    if (!isCurrent(context)) {
      return { ok: false, reason: "refresh_superseded" };
    }
    state.enabled = loaded.enabled !== false;
    state.showPageButtons = loaded.showPageButtons !== false;
    await dock.unmount();
    if (!isCurrent(context)) {
      return { ok: false, reason: "refresh_superseded" };
    }
    if (state.enabled) await dock.refresh(context);
    if (!isCurrent(context)) {
      return { ok: false, reason: "refresh_superseded" };
    }
    registration.publishStatus();
    return { ok: true };
  }

  const lifecycle = createLibraryLifecycle({
    addonId: runtime.addonId,
    onEnable: async (context) => {
      const result = await setEnabled(true, context);
      return context.isCurrent()
        ? result
        : { ok: false, reason: "enable_superseded" };
    },
    onDisable: async (context) => {
      const result = await setEnabled(false, context);
      return context.isCurrent()
        ? result
        : { ok: false, reason: "disable_superseded" };
    },
    onRefresh: async (context) => {
      const result = await refreshRuntimeState(context);
      return context.isCurrent()
        ? result
        : { ok: false, reason: "refresh_superseded" };
    },
    onTeardown: async ({ reason }) => {
      state.enabled = false;
      await dock.unmount();
      await manager.close(reason);
      commandBinding.unbind();
      commandHandler = null;
      return { ok: true };
    },
    onTeardownAcknowledged: async (reason) => {
      core.notifyTeardownComplete(reason);
    },
  });

  manager = createLibraryManagerController({
    core,
    runtime,
    library,
    lifecycle,
    getEnabled: () => state.enabled,
    getCurrentThreadSnapshot: getThreadSnapshot,
    onMutated: () => {
      if (state.enabled) void dock.refresh();
    },
  });
  dock = createLibraryDockController({
    core,
    runtime,
    library,
    state,
    getLifecycle: () => lifecycle,
    getLocalPageContext: getLocalLibraryPageContext,
  });
  state.openManager = manager.open;
  state.refreshRuntime = refreshRuntimeState;

  function handleCommand(detail = {}) {
    if (String(detail.addonId || "") !== runtime.addonId) return;
    const command = String(detail.command || "").trim();
    if (command === "enable") void lifecycle.enable(detail);
    else if (command === "disable") void lifecycle.disable(detail);
    else if (command === "refresh") void lifecycle.refresh(detail);
    else if (command === "before-page-change") {
      lifecycle.invalidate(
        String(detail.reason || "page-change"),
        detail.routeContext || null,
      );
    } else if (command === "toast") {
      manager.open();
    } else if (command === "dialog-closed") {
      handleLibraryManagerDialogClosed(detail);
      handleImportProgressDialogClosed(detail);
    } else if (command === "panel-action") {
      const actionId = String(detail.actionId || "").trim();
      if (actionId === "open-library" && state.enabled) manager.open();
      else if (actionId === "save-current-thread") {
        void dock.saveCurrentThread();
      }
    } else if (command === "teardown") {
      void lifecycle.teardown(detail);
    }
  }

  const commandBinding = createLibraryCommandBinding(core, (detail) =>
    commandHandler?.(detail),
  );

  async function bootstrap() {
    commandHandler = handleCommand;
    commandBinding.bind();
    registration.register();
    try {
      const access = await getAddonAccess(core);
      if (
        !access?.ok ||
        access.value?.blocked ||
        access.value?.enabled === false
      ) {
        state.enabled = false;
        registration.publishStatus();
        return;
      }
      await library.runLegacyMigration();
      const loaded = await settings.load();
      state.enabled = loaded.enabled !== false;
      state.showPageButtons = loaded.showPageButtons !== false;
      if (state.enabled) await lifecycle.enable();
      else registration.publishStatus();
    } catch (error) {
      debugLog(runtime.addonId, "Fatal initialization error.", {
        level: "error",
        data: error,
      });
      registration.publishBroken(error);
    }
  }

  return {
    bootstrap,
    getRuntimeSnapshot: () => ({
      enabled: state.enabled,
      showPageButtons: state.showPageButtons,
    }),
    getResourceSnapshot: () => lifecycle.getResourceSnapshot(),
    getPendingOperationSnapshot: () => lifecycle.getPendingOperationSnapshot(),
    getLifecycle: () => lifecycle,
  };
}
