import { executeActionDescriptor } from "./actions/registry.js";
import {
  ensureActionsRegistered,
  getComposedAction,
} from "./actions/composition.js";
import { getAddonActionScopePolicy } from "./actions/policy.js";

export function hasAnyCapability(allowed, alternatives = []) {
  if (!(allowed instanceof Set) || !Array.isArray(alternatives) || alternatives.length === 0) return true;
  return alternatives.some((entry) => allowed.has(entry));
}

export function isAddonActionAllowed(allowed, action) {
  const alternatives = getComposedAction(action)?.requiredCapabilities;
  return alternatives ? hasAnyCapability(allowed, alternatives) : true;
}

export async function invokeRegisteredAddonCoreAction({
  addonId, action, payload = {}, deps, limits, allowed, authorize,
}) {
  const descriptor = getComposedAction(action);
  if (!descriptor) return { ok: false, reason: "unsupported_action" };
  return executeActionDescriptor(descriptor, { addonId, action, payload, deps, limits, allowed, authorize });
}

export { getAddonActionScopePolicy };
export function getRegisteredAddonActionSnapshot() { return ensureActionsRegistered(); }
