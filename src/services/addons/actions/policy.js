export const ACTION_SCOPE_POLICIES = Object.freeze({
  "addon.access": "management",
  "addon.throttle": "management",
  "feature.enable": "management",
  "feature.disable": "management",
});

export function getAddonActionScopePolicy(action) {
  return ACTION_SCOPE_POLICIES[action] || "runtime";
}

