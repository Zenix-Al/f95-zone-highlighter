export function formatAddonScopes(addon) {
  const scopes = Array.isArray(addon?.pageScopes) ? addon.pageScopes : [];
  if (scopes.length === 0) return "Runs on: (Missing scope data).";
  return `Runs on: ${scopes.join(", ")}.`;
}
