import { sanitizeAddonId, sanitizeAddonIdList } from "./shared.js";
import { matchesAnyUserscriptPattern, scopeAppliesToCurrentPage } from "./scope.js";
import { getCanonicalAddonId } from "./catalog.js";

const TRUST_SOURCE = Object.freeze({
  CATALOG: "catalog",
  USER: "user",
  NONE: "none",
});

function normalizeId(value) {
  return sanitizeAddonId(value);
}

function getCatalogIdentity(catalogEntry, id) {
  if (!catalogEntry || typeof catalogEntry !== "object") {
    return { status: "unresolved", mismatch: false };
  }

  const catalogId = normalizeId(catalogEntry.id);
  if (!catalogId || !id || catalogId !== id) {
    return { status: "mismatch", mismatch: true };
  }

  return { status: "resolved", mismatch: false };
}

/**
 * Resolve the single access projection shared by registration, management UI,
 * and execution authorization. This function is deliberately pure so tests
 * can exercise policy changes without creating a bridge or mutating config.
 */
export function resolveAddonAccess({
  id: providedId = "",
  addon = null,
  registered = null,
  catalogEntry = null,
  trustedIds = [],
  allowUntrusted = false,
  desiredEnabled,
  currentScopes,
  currentUrl = "",
} = {}) {
  const source = addon || registered || {};
  const id = getCanonicalAddonId(providedId || source.id);
  const normalizedTrustedIds = new Set(sanitizeAddonIdList(trustedIds).map((value) => getCanonicalAddonId(value)));
  const catalogIdentity = getCatalogIdentity(catalogEntry, id);
  const trustedByUser = Boolean(id && normalizedTrustedIds.has(id));
  const trustedByCatalog = !catalogIdentity.mismatch && Boolean(catalogEntry?.trusted === true);
  const isTrusted = trustedByUser || trustedByCatalog;
  const trustSource = trustedByUser
    ? TRUST_SOURCE.USER
    : trustedByCatalog
      ? TRUST_SOURCE.CATALOG
      : TRUST_SOURCE.NONE;

  const requestedStatus = String(source.status || "installed").trim().toLowerCase();
  const isEnabled =
    typeof desiredEnabled === "boolean"
      ? desiredEnabled
      : requestedStatus !== "disabled";
  const pageScopes = Array.isArray(source.pageScopes) ? source.pageScopes : [];
  const matches = Array.isArray(source.matches) ? source.matches : [];
  const hasCurrentScopeContext = Array.isArray(currentScopes);
  const hasCurrentUrlContext = String(currentUrl || "").trim().length > 0;
  const scopeApplies = hasCurrentScopeContext
    ? scopeAppliesToCurrentPage(pageScopes, currentScopes)
    : true;
  const matchesCurrentPage = hasCurrentUrlContext && matches.length > 0
    ? matchesAnyUserscriptPattern(currentUrl, matches)
    : true;
  const supportsCurrentPage = matchesCurrentPage && scopeApplies;

  let blockReason = null;
  if (catalogIdentity.mismatch) {
    blockReason = "identity_error";
  } else if (!isTrusted && !Boolean(allowUntrusted)) {
    blockReason = "untrusted_disallowed";
  }

  const isBlocked = Boolean(blockReason);
  const availabilityReason = !isEnabled
    ? "disabled"
    : hasCurrentUrlContext && !matchesCurrentPage
      ? "activation_mismatch"
      : hasCurrentScopeContext && !scopeApplies
        ? "out_of_scope"
        : null;
  const canEnable = !catalogIdentity.mismatch && (isTrusted || Boolean(allowUntrusted));

  return {
    id,
    isTrusted,
    trustSource,
    identityStatus: catalogIdentity.status,
    isEnabled,
    isBlocked,
    blockReason,
    availabilityReason,
    canEnable,
    matchesCurrentPage,
    scopeApplies,
    supportsCurrentPage,
  };
}

export const ADDON_TRUST_SOURCES = TRUST_SOURCE;
