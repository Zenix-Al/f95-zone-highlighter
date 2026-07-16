import { acknowledgeTeardown, registerRuntime, updateRuntimeStatus } from "../api/bridge.js";
import { getAddonAccess, getPageContext } from "../api/meta.js";
import { getStoredValue, setStoredValue } from "../api/storage.js";
import { watchImages, unwatchImages } from "../api/observer.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import { DEFAULT_SETTINGS, IMAGE_HOST, IMAGE_OBSERVER_ID, IMAGE_STYLE_ID, MAX_ATTEMPTS, RETRY_DELAY_MS, SETTINGS_KEY } from "../constants.js";
import { createImageAttachmentRepair, isImageAttachmentRepairApplicable } from "../repairs/imageAttachments/imageRepair.js";
import { createLatestAjaxJqueryAdapter } from "../repairs/latestAjax/jqueryAdapter.js";
import { createImageRepairStatusUi } from "../ui/imageStatus.js";
import { createCommandController } from "./commands.js";
import { createSiteRepairLifecycle } from "./lifecycle.js";
import { normalizeSiteRepairSettings } from "./settings.js";

export function createSiteRepairApp({ core, runtime }) {
  let settings = normalizeSiteRepairSettings(DEFAULT_SETTINGS);
  let enabled = true;
  let routeApplicable = false;
  let latestRouteApplicable = false;
  const startedModules = [];
  const ui = createImageRepairStatusUi({ addonId: runtime.addonId });
  const imageRepair = createImageAttachmentRepair({
    imageHost: IMAGE_HOST, retryDelayMs: RETRY_DELAY_MS, maxAttempts: MAX_ATTEMPTS,
    onProgress: ui.update,
  });
  const latestAjax = createLatestAjaxJqueryAdapter();

  function statusMessage() {
    return enabled ? "Site repairs are active." : "Site Repair is disabled.";
  }
  function registerAddon() {
    registerRuntime(core, {
      id: runtime.addonId, name: runtime.addonName, version: runtime.addonVersion,
      description: runtime.addonDescription, status: enabled ? "installed" : "disabled",
      statusMessage: statusMessage(), panelTitle: runtime.addonName,
      panelBody: "Controls independent F95Zone repairs. Each repair activates only on its applicable route.",
      panelSettingsStorageKey: SETTINGS_KEY, panelSettingsDefaults: DEFAULT_SETTINGS,
      panelSettings: [
        { id: "enabled", path: "enabled", text: "Enable Site Repair" },
        { id: "imageAttachments", path: "repairs.imageAttachments.enabled", text: "Repair attachment images" },
        { id: "latestAjax", path: "repairs.latestAjax.enabled", text: "Repair Latest Ajax errors" },
      ],
      capabilities: runtime.capabilities, requiresCore: runtime.requiresCore,
      pageScopes: runtime.pageScopes, runtimeMode: runtime.runtimeMode, matches: runtime.matches,
    });
  }
  function publishStatus() { updateRuntimeStatus(core, enabled ? "installed" : "disabled", statusMessage()); registerAddon(); }
  async function loadSettings() {
    const stored = await getStoredValue(core, SETTINGS_KEY, DEFAULT_SETTINGS);
    settings = normalizeSiteRepairSettings(stored?.value);
    return settings;
  }
  async function stopModules() {
    for (const stop of startedModules.splice(0).reverse()) await stop();
    ui.destroy();
  }
  async function startApplicableModules(context) {
    const pageScopes = Array.isArray(context?.pageScopes) ? context.pageScopes : [];
    routeApplicable = isImageAttachmentRepairApplicable(new URL(context?.url || location.href));
    latestRouteApplicable = pageScopes.includes("latest") || context?.pageType === "latest";
    if (!enabled || !settings.enabled) return;
    try {
      if (settings.repairs.imageAttachments.enabled && routeApplicable) {
        const style = await registerStyle(core, IMAGE_STYLE_ID, ui.cssText);
        if (!style?.ok) throw new Error(`style_register_failed:${style?.reason || "unknown"}`);
        startedModules.push(async () => unregisterStyle(core, IMAGE_STYLE_ID));
        imageRepair.start(document);
        startedModules.push(async () => imageRepair.stop());
        const watched = await watchImages(core, IMAGE_OBSERVER_ID, IMAGE_HOST);
        if (!watched?.ok) throw new Error(`observer_watch_failed:${watched?.reason || "unknown"}`);
        startedModules.push(async () => unwatchImages(core, IMAGE_OBSERVER_ID));
      }
      if (settings.repairs.latestAjax.enabled && latestRouteApplicable) {
        latestAjax.enable();
        startedModules.push(async () => latestAjax.disable());
      }
    } catch (error) {
      await stopModules();
      throw error;
    }
  }
  const lifecycle = createSiteRepairLifecycle({
    onEnable: async (context) => {
      enabled = true;
      await setStoredValue(core, "enabled", true);
      await loadSettings();
      const page = await getPageContext(core);
      if (!context.isCurrent()) return { ok: false, reason: "cancelled" };
      await startApplicableModules(page?.value || context.routeContext);
      publishStatus(); return { ok: true };
    },
    onDisable: async () => { enabled = false; await stopModules(); await setStoredValue(core, "enabled", false); publishStatus(); return { ok: true }; },
    onRefresh: async (context) => { await stopModules(); await loadSettings(); const page = await getPageContext(core); if (!context.isCurrent()) return { ok: false, reason: "cancelled" }; await startApplicableModules(page?.value || context.routeContext); return { ok: true }; },
    onTeardown: async () => { enabled = false; await stopModules(); commands.unbind(); return { ok: true }; },
    onTeardownAcknowledged: (reason) => acknowledgeTeardown(core, reason),
  });
  const commands = createCommandController({
    core,
    getLifecycle: () => lifecycle,
    onNodes: (nodes) => nodes.forEach((node) => {
      if (node?.tagName === "IMG") imageRepair.attach(node);
      node?.querySelectorAll?.("img").forEach((image) => imageRepair.attach(image));
    }),
    onInvalidate: () => stopModules(),
  });

  async function bootstrap() {
    commands.bind();
    registerAddon();
    const access = await getAddonAccess(core);
    if (!access?.ok || access.value?.blocked) { enabled = false; publishStatus(); return; }
    const storedEnabled = await getStoredValue(core, "enabled", true);
    enabled = access.value?.enabled !== false && storedEnabled?.value !== false;
    await loadSettings();
    if (enabled) await lifecycle.enable({ reason: "bootstrap" });
    else publishStatus();
    window.__F95UE_SITE_REPAIR_ADDON__ = { enable: () => lifecycle.enable("console"), disable: () => lifecycle.disable("console"), snapshot: () => getRuntimeSnapshot() };
  }
  function getRuntimeSnapshot() {
    return {
      enabled, settings, routeApplicable, latestRouteApplicable,
      image: imageRepair.getSnapshot(), latestAjax: latestAjax.getSnapshot(), lifecycle: lifecycle.getSnapshot(),
    };
  }
  return { bootstrap, getLifecycle: () => lifecycle, getRuntimeSnapshot, imageRepair, latestAjax };
}
