/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */
import { debugLog } from "../../shared/debugLog.js";
import { createLibraryAddonApp } from "./app/createLibraryAddonApp.js";
import { waitForCorePing } from "./api/bridge.js";
import { createCoreAdaptor } from "./core/adaptor.js";

const runtime = {
  addonId: __ADDON_ID__, addonName: __ADDON_NAME__, addonVersion: __ADDON_VERSION__,
  addonDescription: __ADDON_DESCRIPTION__, capabilities: __ADDON_CAPABILITIES__,
  requiresCore: __ADDON_REQUIRES_CORE__, pageScopes: __ADDON_PAGE_SCOPES__,
  runtimeMode: __ADDON_RUNTIME_MODE__, matches: __ADDON_MATCHES__,
};
const core = createCoreAdaptor(runtime.addonId);
const app = createLibraryAddonApp({ core, runtime });

async function bootstrap() {
  const ping = await waitForCorePing(core);
  if (!ping.ok && runtime.runtimeMode === "core-required") return;
  try { await app.bootstrap(); }
  catch (error) {
    debugLog(runtime.addonId, "Application bootstrap failed.", { level: "error", data: error });
    core.updateStatus("broken", "Failed to initialize: " + (error?.message || "unknown"));
  }
}

void bootstrap();
