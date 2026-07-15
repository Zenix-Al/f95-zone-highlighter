import {
  matchesAnyUserscriptPattern,
  scopeAppliesToCurrentPage,
} from "./scope.js";
import { resolveAddonAccess } from "./access.js";
import { sanitizeAddonId } from "./shared.js";

function computeAddonStatus({
  runtimeEntry,
  metaEntry,
  hasInstallSighting,
  hasExplicitDesiredState,
  desiredEnabled,
  hasKnownScopeMeta,
  supportsCurrentPage,
  catalogFresh,
}) {
  let status = runtimeEntry?.status || "disabled";
  let statusMessage = runtimeEntry?.statusMessage || metaEntry?.statusMessage || "";

  if (!runtimeEntry && hasInstallSighting && hasExplicitDesiredState) {
    if (desiredEnabled === false) {
      status = "disabled";
      statusMessage =
        String(metaEntry?.statusMessage || "").trim() ||
        "Disabled from core. It will remain off when the add-on loads.";
    } else {
      status = "installed";
      if (!hasKnownScopeMeta) {
        statusMessage = String(metaEntry?.statusMessage || "").trim() || "";
      } else if (!supportsCurrentPage) {
        statusMessage = "Enabled. This add-on only activates on supported pages.";
      } else {
        statusMessage =
          String(metaEntry?.statusMessage || "").trim() ||
          "Enabled from core. Waiting for the add-on to register on this page.";
      }
    }
  } else if (!runtimeEntry && hasInstallSighting) {
    if (!hasKnownScopeMeta) {
      status = "installed";
      statusMessage = "Installed. Runtime scope metadata is unavailable on this page.";
    } else if (supportsCurrentPage) {
      status = "not-installed";
      statusMessage =
        "Not detected on this supported page. The add-on may be disabled or failed to load.";
    } else {
      status = "installed";
      statusMessage = "Installed. This add-on only activates on supported pages.";
    }
  } else if (!runtimeEntry && !hasInstallSighting) {
    status = "not-installed";
    statusMessage = catalogFresh ? "" : "Catalog data unavailable - install info may be outdated.";
  }

  return { status, statusMessage };
}

export function buildKnownAddonsSnapshot({
  registered = [],
  catalog = [],
  installedMeta = {},
  currentScopes = [],
  currentUrl = "",
  catalogFresh = false,
  trustedIds = [],
  allowUntrusted = false,
  getAddonState = () => ({}),
}) {
  const normalizeEntries = (entries) =>
    entries
      .map((entry) => [sanitizeAddonId(entry?.id), entry])
      .filter(([id]) => id);
  const byRegistered = new Map(normalizeEntries(registered));
  const catalogById = new Map(normalizeEntries(catalog));
  const normalizeKey = (value) => sanitizeAddonId(value);
  const normalizedMeta = Object.fromEntries(
    Object.entries(installedMeta || {})
      .map(([id, entry]) => [normalizeKey(id), entry])
      .filter(([id]) => id),
  );
  const currentScopesSet = new Set(currentScopes);
  const allIds = new Set([
    ...catalog.map((entry) => normalizeKey(entry?.id)),
    ...Object.keys(normalizedMeta),
    ...registered.map((entry) => normalizeKey(entry?.id)),
  ]);

  const merged = [];
  for (const id of allIds) {
    const runtimeEntry = byRegistered.get(id) || null;
    const catalogEntry = catalogById.get(id) || null;
    const metaEntry = normalizedMeta[id] || null;

    // Runtime registration takes priority for metadata; catalog is fallback.
    const pageScopes = Array.isArray(runtimeEntry?.pageScopes)
      ? [...runtimeEntry.pageScopes]
      : Array.isArray(metaEntry?.pageScopes)
        ? [...metaEntry.pageScopes]
        : Array.isArray(catalogEntry?.pageScopes)
          ? [...catalogEntry.pageScopes]
          : [];
    const hasKnownScopeMeta =
      (Array.isArray(runtimeEntry?.pageScopes) && runtimeEntry.pageScopes.length > 0) ||
      (Array.isArray(metaEntry?.pageScopes) && metaEntry.pageScopes.length > 0) ||
      (Array.isArray(catalogEntry?.pageScopes) && catalogEntry.pageScopes.length > 0);
    const scopeApplies = scopeAppliesToCurrentPage(pageScopes, currentScopesSet);
    const activationMatches = Array.isArray(runtimeEntry?.matches)
      ? [...runtimeEntry.matches]
      : Array.isArray(metaEntry?.matches)
        ? [...metaEntry.matches]
        : Array.isArray(catalogEntry?.matches)
          ? [...catalogEntry.matches]
          : [];
    const hasKnownActivationMeta = activationMatches.length > 0;
    const matchesCurrentPage = hasKnownActivationMeta
      ? matchesAnyUserscriptPattern(currentUrl, activationMatches)
      : true;
    const supportsCurrentPage = matchesCurrentPage && scopeApplies;
    const hasInstallSighting = Boolean(metaEntry?.installedSeenAt);
    const stateEntry = getAddonState(id);
    const desiredEnabled = stateEntry?.enabled;
    const hasExplicitDesiredState = typeof desiredEnabled === "boolean";

    let { status, statusMessage } = computeAddonStatus({
      runtimeEntry,
      metaEntry,
      hasInstallSighting,
      hasExplicitDesiredState,
      desiredEnabled,
      hasKnownScopeMeta,
      supportsCurrentPage,
      catalogFresh,
    });

    const access = resolveAddonAccess({
      id,
      registered: {
        ...(runtimeEntry || {}),
        status,
        pageScopes,
        matches: activationMatches,
      },
      catalogEntry,
      trustedIds,
      allowUntrusted,
      desiredEnabled,
      currentScopes,
      currentUrl,
    });

    if (access.isBlocked) {
      status = "disabled";
      statusMessage = getAccessStatusMessage(access.blockReason, statusMessage);
    } else if (/^Blocked(?: by main settings|:)/i.test(String(statusMessage || "").trim())) {
      statusMessage = status === "disabled"
        ? "Disabled from core. It will remain off when the add-on loads."
        : "";
    }

    // When catalog is stale, fields that only come from the remote catalog show
    // "" as a placeholder so users know the info is not available.
    const descFallback = catalogFresh ? "No description provided yet." : "-";
    const verFallback = catalogFresh ? "0.0.0" : "-";

    merged.push({
      id,
      name: runtimeEntry?.name || metaEntry?.name || catalogEntry?.name || "Unknown Add-on",
      version: runtimeEntry?.version || metaEntry?.version || catalogEntry?.version || verFallback,
      description:
        runtimeEntry?.description ||
        metaEntry?.description ||
        catalogEntry?.description ||
        descFallback,
      status,
      statusMessage,
      panelTitle:
        runtimeEntry?.panelTitle ||
        metaEntry?.panelTitle ||
        metaEntry?.name ||
        catalogEntry?.name ||
        runtimeEntry?.name ||
        "Add-on",
      panelBody:
        runtimeEntry?.panelBody ||
        metaEntry?.panelBody ||
        metaEntry?.description ||
        catalogEntry?.description ||
        "This add-on has no runtime panel content on this page.",
      panelToastLabel: runtimeEntry?.panelToastLabel || "",
      panelToastMessage: runtimeEntry?.panelToastMessage || "",
      panelSettingsTitle: runtimeEntry?.panelSettingsTitle || "",
      panelSettingsDescription: runtimeEntry?.panelSettingsDescription || "",
      panelSettingsStorageKey: runtimeEntry?.panelSettingsStorageKey || "",
      panelSettingsDefaults:
        runtimeEntry?.panelSettingsDefaults &&
        typeof runtimeEntry.panelSettingsDefaults === "object"
          ? runtimeEntry.panelSettingsDefaults
          : null,
      panelSettings: Array.isArray(runtimeEntry?.panelSettings) ? runtimeEntry.panelSettings : [],
      panelActions: Array.isArray(runtimeEntry?.panelActions) ? runtimeEntry.panelActions : [],
      capabilities: access.isBlocked
        ? []
        : Array.isArray(runtimeEntry?.capabilities)
          ? [...runtimeEntry.capabilities]
          : Array.isArray(metaEntry?.capabilities)
            ? [...metaEntry.capabilities]
            : [],
      trusted: access.isTrusted,
      blocked: access.isBlocked,
      isTrusted: access.isTrusted,
      trustSource: access.trustSource,
      identityStatus: access.identityStatus,
      isEnabled: access.isEnabled,
      isBlocked: access.isBlocked,
      blockReason: access.blockReason,
      canEnable: access.canEnable,
      activeOnPage: Boolean(runtimeEntry),
      runtimeMode: runtimeEntry?.runtimeMode || metaEntry?.runtimeMode || catalogEntry?.runtimeMode || "",
      matches: activationMatches,
      matchesCurrentPage,
      scopeApplies,
      supportsCurrentPage,
      pageScopes,
      catalogFresh,
      downloadUrl: String(catalogEntry?.downloadUrl || "").trim(),
      installedSeenAt: Number(metaEntry?.installedSeenAt || 0),
      persistedStatusMessage: String(metaEntry?.statusMessage || "").trim(),
      lastSeenAt: Number(metaEntry?.lastSeenAt || 0),
    });
  }

  return merged.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function getAccessStatusMessage(blockReason, previousMessage = "") {
  if (blockReason === "identity_error") {
    return "Blocked: add-on identity could not be matched to the trusted catalog.";
  }
  if (blockReason === "activation_mismatch") {
    return "Blocked: this add-on is not activated for the current URL.";
  }
  if (blockReason === "out_of_scope") {
    return "Blocked: this add-on is outside the current page scope.";
  }
  return String(previousMessage || "").trim() ||
    "Blocked: enable 'Allow untrusted add-ons' in settings to allow full API access.";
}
