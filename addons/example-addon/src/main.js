/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */
import { createExampleAddonApp } from "./app/createExampleAddonApp.js";
import { waitForCorePing } from "./api/bridge.js";
import { createCoreAdaptor } from "./core/adaptor.js";

const runtime = {
  addonId: __ADDON_ID__,
  addonName: __ADDON_NAME__,
  addonVersion: __ADDON_VERSION__,
  addonDescription: __ADDON_DESCRIPTION__,
  capabilities: __ADDON_CAPABILITIES__,
  requiresCore: __ADDON_REQUIRES_CORE__,
  pageScopes: __ADDON_PAGE_SCOPES__,
  runtimeMode: __ADDON_RUNTIME_MODE__,
  matches: __ADDON_MATCHES__,
};

const core = createCoreAdaptor(runtime.addonId);
const app = createExampleAddonApp({ core, runtime });

async function bootstrap() {
  const ping = await waitForCorePing(core);
  if (!ping.ok && runtime.runtimeMode === "core-required") {
    console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
    return;
  }

  try {
    await app.bootstrap();
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error ?? "Unknown error");
    console.error(`[${runtime.addonId}] bootstrap failed:`, error);
    core.updateStatus("broken", `Failed to initialize: ${message}`);
  }
}

void bootstrap();
