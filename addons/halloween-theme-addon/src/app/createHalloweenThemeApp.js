import {
  notifyTeardownComplete,
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import { getAddonAccess } from "../api/meta.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import { HALLOWEEN_STYLE_ID, ROUTE_REFRESH_DELAY_MS } from "../constants.js";
import { createHalloweenCommandController } from "./commands.js";
import { createHalloweenLifecycle } from "./lifecycle.js";
import {
  applyHalloweenLogos,
  HALLOWEEN_BACKGROUND_CSS,
  restoreHalloweenLogos,
} from "../ui/theme.js";

export function createHalloweenThemeApp({ core, runtime }) {
  const restorationRecords = new Map();
  const state = { enabled: false, styleRegistered: false, terminal: false, routeTimer: 0 };
  let lifecycle = null;

  function statusMessage() {
    return state.enabled
      ? "Halloween theme is active."
      : "Halloween theme disabled — refresh recommended.";
  }

  function updateStatus() {
    updateAddonRuntimeStatus(core, state.enabled ? "installed" : "disabled", statusMessage());
  }

  function cancelRouteRefreshTimer() {
    if (!state.routeTimer) return;
    window.clearTimeout(state.routeTimer);
    state.routeTimer = 0;
    lifecycle?.releaseResource?.("route-refresh-timer");
  }

  function registerAddon() {
    registerAddonRuntime(core, {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: "disabled",
      statusMessage: "Halloween theme disabled — awaiting core authorization.",
      panelTitle: runtime.addonName,
      panelBody: "Toggle to apply/remove Halloween theme.",
      capabilities: runtime.capabilities,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    });
  }

  function trackPending(context, id, promise, kind = "operation") {
    return context?.trackPendingOperation
      ? context.trackPendingOperation(id, promise, { kind })
      : promise;
  }

  async function enableTheme(context) {
    const styleResult = await trackPending(
      context,
      "style-register",
      registerStyle(core, HALLOWEEN_STYLE_ID, HALLOWEEN_BACKGROUND_CSS),
      "style",
    );
    if (!styleResult?.ok) throw new Error(`ui.style.register failed: ${styleResult?.reason || "unknown"}`);
    state.styleRegistered = true;
    if (!context.isCurrent()) {
      await trackPending(
        context,
        "style-unregister-superseded",
        unregisterStyle(core, HALLOWEEN_STYLE_ID),
        "style",
      );
      state.styleRegistered = false;
      return { ok: false, reason: "enable_superseded" };
    }
    applyHalloweenLogos(restorationRecords);
    state.enabled = true;
    updateStatus();
    return { ok: true };
  }

  async function disableTheme(context) {
    state.enabled = false;
    cancelRouteRefreshTimer();
    restoreHalloweenLogos(restorationRecords);
    if (state.styleRegistered) {
      await trackPending(
        context,
        "style-unregister",
        unregisterStyle(core, HALLOWEEN_STYLE_ID),
        "style",
      );
      state.styleRegistered = false;
    }
    updateStatus();
    return { ok: true };
  }

  async function refreshTheme(context) {
    if (!state.enabled || !context.isCurrent()) return { ok: false, reason: "disabled" };
    cancelRouteRefreshTimer();
    const timer = window.setTimeout(() => {
      if (state.routeTimer === timer) state.routeTimer = 0;
      lifecycle?.releaseResource?.("route-refresh-timer");
      if (context.isCurrent() && state.enabled && !state.terminal) applyHalloweenLogos(restorationRecords);
    }, ROUTE_REFRESH_DELAY_MS);
    state.routeTimer = timer;
    lifecycle?.registerResource?.(
      "route-refresh-timer",
      () => {
        window.clearTimeout(timer);
        if (state.routeTimer === timer) state.routeTimer = 0;
      },
      "timer",
    );
    return { ok: true };
  }

  const commandController = createHalloweenCommandController({
    core,
    getLifecycle: () => lifecycle,
    onError: (action, error) => updateAddonRuntimeStatus(core, "broken", `${action}: ${error?.message || "failed"}`),
  });

  lifecycle = createHalloweenLifecycle({
    addonId: runtime.addonId,
    onEnable: enableTheme,
    onDisable: disableTheme,
    onRefresh: refreshTheme,
    onTeardown: async (context) => {
      state.terminal = true;
      await disableTheme(context);
      commandController.unbind();
      return { ok: true, reason: context.reason };
    },
    onTeardownAcknowledged: async (reason) => notifyTeardownComplete(core, reason),
  });

  async function bootstrap() {
    commandController.bind();
    registerAddon();
    const access = await getAddonAccess(core);
    if (!access?.ok || access.value?.blocked) {
      await lifecycle.disable({ reason: access?.value?.blockReason || "access-denied" });
      return;
    }
    await lifecycle.enable({ reason: "bootstrap" });
  }

  return {
    bootstrap,
    getLifecycle: () => lifecycle,
    getState: () => ({ ...state, restorationCount: restorationRecords.size }),
    getRuntimeSnapshot: () => lifecycle?.getSnapshot?.() || null,
    getResourceSnapshot: () => lifecycle?.getResourceSnapshot?.() || [],
    getPendingOperationSnapshot: () => lifecycle?.getPendingOperationSnapshot?.() || [],
  };
}
