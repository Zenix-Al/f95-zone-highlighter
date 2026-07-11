import { config } from "../../config.js";
import { registerDiagnosticsProvider } from "../../core/featureHealth.js";
import {
  sanitizeAddonCapabilities,
  sanitizeAddonId,
  sanitizeAddonIdList,
  VALID_ADDON_STATUSES,
} from "./shared.js";
import { getTrustedCatalogEntry, isBuiltinTrustedAddonId } from "./catalog.js";

const REGISTRY_LISTENERS = new Set();
let addonsRuntimeRegistry = [];

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
  return addonsRuntimeRegistry.findIndex((addon) => addon.id === addonId);
}

function normalizeAddonEntry(addon, existingAddon = null) {
  if (!addon || typeof addon !== "object") return null;

  const id = sanitizeAddonId(addon.id);
  const name = String(addon.name || existingAddon?.name || "").trim();
  if (!id || !name) return null;

  const requestedStatus = String(addon.status || existingAddon?.status || "installed").trim();
  const untrustedAllowed = Boolean(config.globalSettings?.allowUntrustedAddons);
  const trustedIds = new Set(sanitizeAddonIdList(config.addons?.trustedIds));
  const trusted =
    trustedIds.has(id) ||
    Boolean(getTrustedCatalogEntry(id)?.trusted) ||
    isBuiltinTrustedAddonId(id);
  const blocked = !trusted && !untrustedAllowed;

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

  const capabilities = blocked ? [] : requestedCapabilities;

  let status = VALID_ADDON_STATUSES.has(requestedStatus) ? requestedStatus : "installed";
  let statusMessage =
    String(addon.statusMessage || existingAddon?.statusMessage || "").trim() || "";

  if (blocked) {
    status = "disabled";
    statusMessage =
      statusMessage ||
      "Blocked: enable 'Allow untrusted add-ons' in settings to allow full API access.";
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
    requestedCapabilities,
    capabilities,
    trusted,
    blocked,
    updatedAt: Number(addon.updatedAt || Date.now()),
  };
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
  emitRegistryChange();
  return createRegistrySnapshot();
}

export function listRegisteredAddons() {
  return createRegistrySnapshot();
}

export function getRegisteredAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
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
  const normalizedId = sanitizeAddonId(addon?.id);
  const existingIndex = normalizedId ? findRegistryIndex(normalizedId) : -1;
  const existingAddon = existingIndex >= 0 ? addonsRuntimeRegistry[existingIndex] : null;
  const normalized = normalizeAddonEntry(addon, existingAddon);
  if (!normalized) return createRegistrySnapshot();

  if (existingIndex >= 0) {
    addonsRuntimeRegistry[existingIndex] = normalized;
  } else {
    addonsRuntimeRegistry.push(normalized);
  }

  emitRegistryChange();
  return createRegistrySnapshot();
}

export function unregisterAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return createRegistrySnapshot();

  const index = findRegistryIndex(normalizedId);
  if (index < 0) return createRegistrySnapshot();

  addonsRuntimeRegistry.splice(index, 1);
  emitRegistryChange();
  return createRegistrySnapshot();
}

export function updateAddonStatus(addonId, status, statusMessage = "") {
  const normalizedId = sanitizeAddonId(addonId);
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

registerDiagnosticsProvider("addonRegistry", () => {
  const entries = createRegistrySnapshot();
  return {
    total: entries.length,
    blocked: entries.filter((entry) => entry.blocked).length,
    active: entries.filter((entry) => entry.status === "installed").length,
  };
});
