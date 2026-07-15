/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */
import { createExampleAddonApp } from "./app/createExampleAddonApp.js";
import { waitForCorePing } from "./api/bridge.js";
import { createCoreAdaptor } from "./core/adaptor.js";

const runtime = {
  addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "example-addon",
  addonName: typeof __ADDON_NAME__ === "string" ? __ADDON_NAME__ : "F95UE Example Add-on",
  addonVersion: typeof __ADDON_VERSION__ === "string" ? __ADDON_VERSION__ : "0.2.0",
  addonDescription:
    typeof __ADDON_DESCRIPTION__ === "string"
      ? __ADDON_DESCRIPTION__
      : "Reference add-on exercising every current core action through api modules.",
  capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
  requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  pageScopes: Array.isArray(__ADDON_PAGE_SCOPES__) ? __ADDON_PAGE_SCOPES__ : ["f95zone"],
  runtimeMode: typeof __ADDON_RUNTIME_MODE__ === "string" ? __ADDON_RUNTIME_MODE__ : "core-required",
  matches: Array.isArray(__ADDON_MATCHES__) ? __ADDON_MATCHES__ : ["*://f95zone.to/*"],
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
