import { debugLog } from "../../../shared/debugLog.js";
import {
  closeLibraryManager,
  openLibraryManager,
} from "../ui/manager/managerLauncher.js";

export function createLibraryManagerController({
  core,
  runtime,
  library,
  lifecycle,
  getEnabled,
  getCurrentThreadSnapshot,
  onMutated,
}) {
  let resourceOwned = false;

  function open() {
    if (!getEnabled()) return;
    debugLog(runtime.addonId, "Library manager open requested.", {
      data: { managerResourceOwned: resourceOwned },
    });
    openLibraryManager({
      bridge: core,
      addonId: runtime.addonId,
      library,
      getCurrentThreadSnapshot,
      onMutated,
    });
    if (resourceOwned) return;
    resourceOwned = true;
    lifecycle.registerResource(
      "library-manager",
      () => {
        resourceOwned = false;
        void closeLibraryManager("resource-release");
      },
      "dialog",
    );
    debugLog(runtime.addonId, "Library manager lifecycle ownership registered.");
  }

  async function close(reason) {
    await closeLibraryManager(reason);
    lifecycle.releaseResource("library-manager");
  }

  return { open, close };
}
