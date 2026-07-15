import { config } from "../../config.js";
import { registerDiagnosticsProvider } from "../../core/featureHealth.js";
import {
  sanitizeAddonCapabilities,
  sanitizeAddonId,
  sanitizeAddonIdList,
  VALID_ADDON_STATUSES,
} from "./shared.js";
import { getCanonicalAddonId, getTrustedCatalogEntry } from "./catalog.js";
import { resolveAddonAccess } from "./access.js";
import { validateAddonRuntimeMetadata } from "./scope.js";

const REGISTRY_LISTENERS = new Set();
let addonsRuntimeRegistry = [];
// Kept outside the public registry entry so the bridge response shape remains
// unchanged. This records which runtime identity currently owns a canonical ID.
let runtimeRegistrationSources = new Map();

function clonePlainValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clonePlainValue(entry)]),
    );
  }

  return value;
}

function cloneAddonEntry(addon) {
  if (!addon || typeof addon !== "object") return addon;

  return {
    ...addon,
    panelSettingsDefaults:
      addon.panelSettingsDefaults && typeof addon.panelSettingsDefaults === "object"
        ? clonePlainValue(addon.panelSettingsDefaults)
        : null,
    panelSettings: Array.isArray(addon.panelSettings)
      ? addon.panelSettings.map((entry) => clonePlainValue(entry))
      : [],
    panelActions: Array.isArray(addon.panelActions)
      ? addon.panelActions.map((entry) => clonePlainValue(entry))
      : [],
    pageScopes: Array.isArray(addon.pageScopes) ? [...addon.pageScopes] : [],
    runtimeMode: String(addon.runtimeMode || ""),
    matches: Array.isArray(addon.matches) ? [...addon.matches] : [],
    requestedCapabilities: Array.isArray(addon.requestedCapabilities)
      ? [...addon.requestedCapabilities]
      : [],
    capabilities: Array.isArray(addon.capabilities) ? [...addon.capabilities] : [],
  };
}

function createRegistrySnapshot() {
  return addonsRuntimeRegistry.map((addon) => cloneAddonEntry(addon));
}

function findRegistryIndex(addonId) {
  const canonicalId = getCanonicalAddonId(addonId);
  return addonsRuntimeRegistry.findIndex((addon) => addon.id === canonicalId);
}

function normalizeAddonEntry(addon, existingAddon = null) {
  if (!addon || typeof addon !== "object") return null;

  const metadata = validateAddonRuntimeMetadata(addon, { registration: true });
  if (!metadata.ok) return null;

  const id = getCanonicalAddonId(addon.id);
  const name = String(addon.name || existingAddon?.name || "").trim();
  if (!id || !name) return null;

  const requestedStatus = String(addon.status || existingAddon?.status || "installed").trim();
  const access = resolveAddonAccess({
    id,
    registered: { ...addon, status: requestedStatus },
    catalogEntry: getTrustedCatalogEntry(id),
    trustedIds: sanitizeAddonIdList(config.addons?.trustedIds),
    allowUntrusted: Boolean(config.globalSettings?.allowUntrustedAddons),
  });

  const requestedCapabilities = sanitizeAddonCapabilities(
    Array.isArray(addon.requestedCapabilities)
      ? addon.requestedCapabilities
      : Array.isArray(addon.capabilities)
        ? addon.capabilities
        : Array.isArray(existingAddon?.requestedCapabilities)
          ? existingAddon.requestedCapabilities
          : Array.isArray(existingAddon?.capabilities)
            ? existingAddon.capabilities
            : [],
  );

  const capabilities = access.isBlocked ? [] : requestedCapabilities;

  let status = VALID_ADDON_STATUSES.has(requestedStatus) ? requestedStatus : "installed";
  let statusMessage =
    String(addon.statusMessage || existingAddon?.statusMessage || "").trim() || "";

  if (access.isBlocked) {
    status = "disabled";
    statusMessage = statusMessage || getAccessStatusMessage(access.blockReason);
  }

  const panelActions = Array.isArray(addon.panelActions)
    ? addon.panelActions
    : Array.isArray(existingAddon?.panelActions)
      ? existingAddon.panelActions
      : [];

  const pageScopes = Array.isArray(addon.pageScopes)
    ? addon.pageScopes
    : Array.isArray(existingAddon?.pageScopes)
      ? existingAddon.pageScopes
      : [];
  const runtimeMode = String(addon.runtimeMode || existingAddon?.runtimeMode || "").trim().toLowerCase();
  const matches = Array.isArray(addon.matches)
    ? addon.matches.map((entry) => String(entry || "").trim()).filter(Boolean)
    : Array.isArray(existingAddon?.matches)
      ? [...existingAddon.matches]
      : [];

  return {
    id,
    name,
    version: String(addon.version || existingAddon?.version || "0.0.0").trim() || "0.0.0",
    description:
      String(
        addon.description || existingAddon?.description || "No description provided yet.",
      ).trim() || "No description provided yet.",
    status,
    statusMessage,
    panelTitle: String(addon.panelTitle || existingAddon?.panelTitle || name).trim() || name,
    panelBody: String(addon.panelBody || existingAddon?.panelBody || "").trim() || "",
    panelToastLabel:
      String(addon.panelToastLabel || existingAddon?.panelToastLabel || "").trim() || "",
    panelToastMessage:
      String(addon.panelToastMessage || existingAddon?.panelToastMessage || "").trim() || "",
    panelSettingsTitle:
      String(addon.panelSettingsTitle || existingAddon?.panelSettingsTitle || "").trim() || "",
    panelSettingsDescription:
      String(
        addon.panelSettingsDescription || existingAddon?.panelSettingsDescription || "",
      ).trim() || "",
    panelSettingsStorageKey:
      String(
        addon.panelSettingsStorageKey || existingAddon?.panelSettingsStorageKey || "",
      ).trim() || "",
    panelSettingsDefaults:
      addon.panelSettingsDefaults && typeof addon.panelSettingsDefaults === "object"
        ? clonePlainValue(addon.panelSettingsDefaults)
        : existingAddon?.panelSettingsDefaults &&
            typeof existingAddon.panelSettingsDefaults === "object"
          ? clonePlainValue(existingAddon.panelSettingsDefaults)
          : null,
    panelSettings: Array.isArray(addon.panelSettings)
      ? addon.panelSettings.map((entry) => clonePlainValue(entry))
      : Array.isArray(existingAddon?.panelSettings)
        ? existingAddon.panelSettings.map((entry) => clonePlainValue(entry))
        : [],
    panelActions: panelActions
      .map((entry) => {
        const actionId = String(entry?.id || entry?.command || "").trim();
        const label = String(entry?.label || entry?.text || "").trim();
        if (!actionId || !label) return null;
        const variant = String(entry?.variant || "")
          .trim()
          .toLowerCase();
        return {
          id: actionId,
          label,
          variant: variant === "secondary" ? "secondary" : "primary",
          requiresActivePage: entry?.requiresActivePage !== false,
        };
      })
      .filter(Boolean),
    pageScopes: pageScopes
      .map((entry) =>
        String(entry || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
    runtimeMode,
    matches,
    requestedCapabilities,
    capabilities,
    trusted: access.isTrusted,
    blocked: access.isBlocked,
    isTrusted: access.isTrusted,
    trustSource: access.trustSource,
    identityStatus: access.identityStatus,
    isEnabled: access.isEnabled,
    isBlocked: access.isBlocked,
    blockReason: access.blockReason,
    canEnable: access.canEnable,
    updatedAt: Number(addon.updatedAt || Date.now()),
  };
}

function getAccessStatusMessage(blockReason) {
  if (blockReason === "identity_error") {
    return "Blocked: add-on identity could not be matched to the trusted catalog.";
  }
  if (blockReason === "activation_mismatch") {
    return "Blocked: this add-on is not activated for the current URL.";
  }
  if (blockReason === "out_of_scope") {
    return "Blocked: this add-on is outside the current page scope.";
  }
  return "Blocked: enable 'Allow untrusted add-ons' in settings to allow full API access.";
}

function emitRegistryChange() {
  const snapshot = createRegistrySnapshot();
  REGISTRY_LISTENERS.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn("[addonsService] Registry listener failed:", error);
    }
  });
}

function replaceRegistry(addons) {
  addonsRuntimeRegistry = Array.isArray(addons) ? addons.map((addon) => cloneAddonEntry(addon)) : [];
  runtimeRegistrationSources = new Map(addonsRuntimeRegistry.map((addon) => [addon.id, addon.id]));
  emitRegistryChange();
  return createRegistrySnapshot();
}

export function listRegisteredAddons() {
  return createRegistrySnapshot();
}

export function getRegisteredAddon(addonId) {
  const normalizedId = getCanonicalAddonId(addonId);
  if (!normalizedId) return null;
  const index = findRegistryIndex(normalizedId);
  if (index < 0) return null;
  return cloneAddonEntry(addonsRuntimeRegistry[index]);
}

export function replaceRegisteredAddons(addons) {
  const normalized = Array.isArray(addons)
    ? addons.map((addon) => normalizeAddonEntry(addon)).filter(Boolean)
    : [];
  return replaceRegistry(normalized);
}

export function registerAddon(addon) {
  const sourceId = sanitizeAddonId(addon?.id);
  const normalizedId = getCanonicalAddonId(sourceId);
  const existingIndex = normalizedId ? findRegistryIndex(normalizedId) : -1;
  const existingAddon = existingIndex >= 0 ? addonsRuntimeRegistry[existingIndex] : null;
  const existingSource = normalizedId ? runtimeRegistrationSources.get(normalizedId) : null;

  // A canonical registration supersedes an old runtime alias. Two different
  // aliases cannot race into two cards; the first source remains authoritative
  // until the canonical runtime appears.
  if (existingIndex >= 0 && existingSource && existingSource !== sourceId && sourceId !== normalizedId) {
    return createRegistrySnapshot();
  }

  const normalized = normalizeAddonEntry({ ...addon, id: normalizedId }, existingAddon);
  if (!normalized) return createRegistrySnapshot();

  if (existingIndex >= 0) {
    addonsRuntimeRegistry[existingIndex] = normalized;
  } else {
    addonsRuntimeRegistry.push(normalized);
  }
  runtimeRegistrationSources.set(normalizedId, sourceId || normalizedId);

  emitRegistryChange();
  return createRegistrySnapshot();
}

export function unregisterAddon(addonId) {
  const normalizedId = getCanonicalAddonId(addonId);
  if (!normalizedId) return createRegistrySnapshot();

  const index = findRegistryIndex(normalizedId);
  if (index < 0) return createRegistrySnapshot();

  addonsRuntimeRegistry.splice(index, 1);
  runtimeRegistrationSources.delete(normalizedId);
  emitRegistryChange();
  return createRegistrySnapshot();
}

export function updateAddonStatus(addonId, status, statusMessage = "") {
  const normalizedId = getCanonicalAddonId(addonId);
  if (!normalizedId) return createRegistrySnapshot();

  const index = findRegistryIndex(normalizedId);
  if (index < 0) return createRegistrySnapshot();

  const currentAddon = addonsRuntimeRegistry[index];
  const nextStatus = VALID_ADDON_STATUSES.has(status) ? status : currentAddon.status;
  addonsRuntimeRegistry[index] = {
    ...currentAddon,
    status: nextStatus,
    statusMessage: String(statusMessage || "").trim(),
    updatedAt: Date.now(),
  };

  emitRegistryChange();
  return createRegistrySnapshot();
}

export function subscribeAddonsRegistry(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  REGISTRY_LISTENERS.add(listener);
  listener(createRegistrySnapshot());

  return () => {
    REGISTRY_LISTENERS.delete(listener);
  };
}

export function reapplyAddonSecurityPolicies() {
  const normalized = addonsRuntimeRegistry
    .map((addon) => normalizeAddonEntry(addon, addon))
    .filter(Boolean);
  return replaceRegistry(normalized);
}

export function validateAddonRegistration(addon) {
  return validateAddonRuntimeMetadata(addon, { registration: true });
}

registerDiagnosticsProvider("addonRegistry", () => {
  const entries = createRegistrySnapshot();
  return {
    total: entries.length,
    blocked: entries.filter((entry) => entry.blocked).length,
    active: entries.filter((entry) => entry.status === "installed").length,
  };
});
