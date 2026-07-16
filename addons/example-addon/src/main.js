/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */
import { debugLog } from "../../shared/debugLog.js";
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
  debugLog(runtime.addonId, "Handshake bootstrap started.", {
    data: {
      version: runtime.addonVersion,
      runtimeMode: runtime.runtimeMode,
      pageScopes: runtime.pageScopes,
      matches: runtime.matches,
    },
  });
  const ping = await waitForCorePing(core);
  debugLog(runtime.addonId, "Handshake ping completed.", { data: ping });
  if (!ping.ok && runtime.runtimeMode === "core-required") {
    debugLog(runtime.addonId, "Handshake failed; core-required add-on skipped.", {
      level: "warn",
      data: { ping },
    });
    return;
  }

  try {
    debugLog(runtime.addonId, "Starting registered application bootstrap.");
    await app.bootstrap();
    debugLog(runtime.addonId, "Application bootstrap completed.", {
      data: app.getRuntimeSnapshot?.() || null,
    });
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error ?? "Unknown error");
    debugLog(runtime.addonId, "Application bootstrap failed.", {
      level: "error",
      data: { message, error: String(error || "") },
    });
    core.updateStatus("broken", `Failed to initialize: ${message}`);
  }
}

void bootstrap();
