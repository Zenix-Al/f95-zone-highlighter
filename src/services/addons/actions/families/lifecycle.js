import { debugLog } from "../../../../core/logger.js";
import { defineAction } from "../contract.js";

export async function actionFeatureEnableDisable(
  addonId,
  action,
  updateAddonStatus,
  emitAddonLifecycleCommand,
  ensureAddonStateBucket,
  persistAddonsState,
  upsertInstalledAddonMeta,
  cancelAddonTeardown,
  setAddonEnabledState,
  cleanupAddonRuntimeResources,
) {
  const enabled = action === "feature.enable";
  const nextStatus = enabled ? "installed" : "disabled";
  const nextMessage = enabled ? "Feature is active." : "";
  debugLog("addonsService", `Applying add-on lifecycle toggle (id=${addonId}, enabled=${enabled}).`);
  let persisted;
  let persistedMeta = { ok: true };
  if (typeof setAddonEnabledState === "function") {
    persisted = await setAddonEnabledState(addonId, enabled, { statusMessage: nextMessage });
  } else {
    const stateBucket = ensureAddonStateBucket(addonId);
    stateBucket.enabled = enabled;
    persisted = await persistAddonsState();
    persistedMeta = await upsertInstalledAddonMeta(addonId, { statusMessage: nextMessage });
  }
  if (!persisted.ok || !persistedMeta.ok) {
    debugLog("addonsService", `Add-on lifecycle toggle persistence failed (id=${addonId}, enabled=${enabled}).`, {
      level: "error", data: { persisted, persistedMeta },
    });
    return { ok: false, reason: "storage_error" };
  }
  updateAddonStatus(addonId, nextStatus, nextMessage);
  if (!enabled) {
    emitAddonLifecycleCommand(addonId, "before-disable");
    cleanupAddonRuntimeResources?.(addonId, "disable");
  } else cancelAddonTeardown?.(addonId);
  emitAddonLifecycleCommand(addonId, enabled ? "enable" : "disable");
  debugLog("addonsService", `Add-on lifecycle command dispatched (id=${addonId}, command=${enabled ? "enable" : "disable"}).`);
  return { ok: true };
}

export function actionFeatureRefresh(addonId, emitAddonCommand) {
  emitAddonCommand(addonId, "refresh");
  return { ok: true };
}

function toggle(id) {
  return defineAction({
    id, requiredCapabilities: ["feature"],
    execute: ({ addonId, deps }) => actionFeatureEnableDisable(
      addonId, id, deps.updateAddonStatus, deps.emitAddonLifecycleCommand,
      deps.ensureAddonStateBucket, deps.persistAddonsState, deps.upsertInstalledAddonMeta,
      deps.cancelAddonTeardown, deps.setAddonEnabledState, deps.cleanupAddonRuntimeResources,
    ),
  });
}

export const lifecycleActions = Object.freeze([
  toggle("feature.enable"),
  toggle("feature.disable"),
  defineAction({
    id: "feature.refresh", requiredCapabilities: ["feature"],
    execute: ({ addonId, deps }) => actionFeatureRefresh(addonId, deps.emitAddonCommand),
  }),
]);
