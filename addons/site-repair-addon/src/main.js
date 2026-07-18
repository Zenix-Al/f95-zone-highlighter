/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */
import { createCoreAdaptor } from "./core/adaptor.js";
import { waitForCorePingUntilReady } from "./core/waitForCore.js";
import { createSiteRepairApp } from "./app/createSiteRepairApp.js";
import { createLatestAjaxJqueryAdapter } from "./repairs/latestAjax/jqueryAdapter.js";

const runtime = {
  addonId: __ADDON_ID__, addonName: __ADDON_NAME__, addonVersion: __ADDON_VERSION__,
  addonDescription: __ADDON_DESCRIPTION__, capabilities: __ADDON_CAPABILITIES__,
  requiresCore: __ADDON_REQUIRES_CORE__, pageScopes: __ADDON_PAGE_SCOPES__,
  runtimeMode: __ADDON_RUNTIME_MODE__, matches: __ADDON_MATCHES__,
};
const core = createCoreAdaptor(runtime.addonId);
const latestAjax = createLatestAjaxJqueryAdapter();
latestAjax.enable({ allowRetry: false });
const app = createSiteRepairApp({ core, runtime, latestAjax });

void (async () => {
  const ping = await waitForCorePingUntilReady(core);
  if (!ping.ok && runtime.runtimeMode === "core-required") {
    latestAjax.destroy("core-ping-failed");
    return;
  }
  try {
    await app.bootstrap();
  } catch (error) {
    latestAjax.destroy("bootstrap-failed");
    core.updateStatus("broken", `Failed to initialize: ${error?.message || String(error)}`);
  }
})();
