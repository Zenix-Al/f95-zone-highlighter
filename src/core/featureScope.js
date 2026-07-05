import { stateManager } from "../config.js";

export function featureMatchesPageScopes(feature, getScopeValue = (scope) => stateManager.get(scope)) {
  const scopes = Array.isArray(feature?.pageScopes) ? feature.pageScopes : [];
  if (scopes.length === 0) return true;

  return scopes
    .map((scope) => String(scope || "").trim())
    .filter(Boolean)
    .some((scope) => getScopeValue(scope) === true);
}
