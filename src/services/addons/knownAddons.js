function supportsCurrentPage(pageScopes = [], currentScopes = []) {
  if (!Array.isArray(pageScopes) || pageScopes.length === 0) return true;
  return pageScopes.some((scope) => currentScopes.includes(scope));
}

function computeAddonStatus({
  runtimeEntry,
  metaEntry,
  hasInstallSighting,
  hasExplicitDesiredState,
  desiredEnabled,
  hasKnownScopeMeta,
  scopeApplies,
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
      } else if (!scopeApplies) {
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
    } else if (scopeApplies) {
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
  catalogFresh = false,
  getAddonState = () => ({}),
}) {
  const byRegistered = new Map(registered.map((addon) => [addon.id, addon]));
  const catalogIds = new Set(catalog.map((entry) => entry.id));
  const allIds = new Set([
    ...catalog.map((entry) => entry.id),
    ...Object.keys(installedMeta || {}),
    ...registered.map((entry) => entry.id),
  ]);

  const merged = [];
  for (const id of allIds) {
    const runtimeEntry = byRegistered.get(id) || null;
    const catalogEntry = catalog.find((entry) => entry.id === id) || null;
    const metaEntry = installedMeta[id] || null;

    // Runtime registration takes priority for pageScopes; catalog is fallback.
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
    const scopeApplies = supportsCurrentPage(pageScopes, currentScopes);
    const hasInstallSighting = Boolean(metaEntry?.installedSeenAt);
    const stateEntry = getAddonState(id);
    const desiredEnabled = stateEntry?.enabled;
    const hasExplicitDesiredState = typeof desiredEnabled === "boolean";

    const { status, statusMessage } = computeAddonStatus({
      runtimeEntry,
      metaEntry,
      hasInstallSighting,
      hasExplicitDesiredState,
      desiredEnabled,
      hasKnownScopeMeta,
      scopeApplies,
      catalogFresh,
    });

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
      capabilities: Array.isArray(runtimeEntry?.capabilities)
        ? [...runtimeEntry.capabilities]
        : Array.isArray(metaEntry?.capabilities)
          ? [...metaEntry.capabilities]
          : [],
      trusted: Boolean(runtimeEntry?.trusted || catalogIds.has(id)),
      blocked: Boolean(runtimeEntry?.blocked),
      activeOnPage: Boolean(runtimeEntry),
      supportsCurrentPage: scopeApplies,
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
