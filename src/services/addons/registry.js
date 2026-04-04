import { config } from "../../config.js";
import {
  sanitizeAddonCapabilities,
  sanitizeAddonId,
  sanitizeAddonIdList,
  UNTRUSTED_ALLOWED_CAPABILITIES,
  VALID_ADDON_STATUSES,
} from "./shared.js";
import { upsertInstalledAddonMeta } from "./state.js";
import { getTrustedCatalogEntry } from "./catalog.js";

const REGISTRY_LISTENERS = new Set();
let addonsRuntimeRegistry = [];

function normalizeAddonEntry(addon, existingAddon = null) {
  if (!addon || typeof addon !== "object") return null;

  const id = sanitizeAddonId(addon.id);
  const name = String(addon.name || existingAddon?.name || "").trim();
  if (!id || !name) return null;

  const requestedStatus = String(addon.status || existingAddon?.status || "installed").trim();
  const untrustedAllowed = Boolean(config.globalSettings?.allowUntrustedAddons);
  const trustedIds = new Set(sanitizeAddonIdList(config.addons?.trustedIds));
  const trusted = trustedIds.has(id) || Boolean(getTrustedCatalogEntry(id)?.trusted);
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

  const capabilities = requestedCapabilities.filter((entry) => {
    if (trusted) return true;
    return UNTRUSTED_ALLOWED_CAPABILITIES.has(entry);
  });

  let status = VALID_ADDON_STATUSES.has(requestedStatus) ? requestedStatus : "installed";
  let statusMessage =
    String(addon.statusMessage || existingAddon?.statusMessage || "").trim() || "";

  if (blocked) {
    status = "disabled";
    statusMessage =
      statusMessage ||
      "Blocked: enable 'Allow untrusted add-ons' in settings to allow limited API access.";
  }

  const panelActions = Array.isArray(addon.panelActions)
    ? addon.panelActions
    : Array.isArray(existingAddon?.panelActions)
      ? existingAddon.panelActions
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
        ? addon.panelSettingsDefaults
        : existingAddon?.panelSettingsDefaults &&
            typeof existingAddon.panelSettingsDefaults === "object"
          ? existingAddon.panelSettingsDefaults
          : null,
    panelSettings: Array.isArray(addon.panelSettings)
      ? addon.panelSettings
      : Array.isArray(existingAddon?.panelSettings)
        ? existingAddon.panelSettings
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
    requestedCapabilities,
    capabilities,
    trusted,
    blocked,
    updatedAt: Number(addon.updatedAt || Date.now()),
  };
}

function cloneRegistry() {
  return addonsRuntimeRegistry.map((addon) => ({ ...addon }));
}

function emitRegistryChange() {
  const snapshot = cloneRegistry();
  REGISTRY_LISTENERS.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn("[addonsService] Registry listener failed:", error);
    }
  });
}

function replaceRegistry(addons) {
  addonsRuntimeRegistry = Array.isArray(addons) ? addons.map((addon) => ({ ...addon })) : [];
  emitRegistryChange();
  return cloneRegistry();
}

export function listRegisteredAddons() {
  return cloneRegistry();
}

export function replaceRegisteredAddons(addons) {
  const normalized = Array.isArray(addons)
    ? addons.map((addon) => normalizeAddonEntry(addon)).filter(Boolean)
    : [];
  return replaceRegistry(normalized);
}

export function registerAddon(addon) {
  const current = cloneRegistry();
  const existingIndex = current.findIndex((entry) => entry.id === sanitizeAddonId(addon?.id));
  const existingAddon = existingIndex >= 0 ? current[existingIndex] : null;
  const normalized = normalizeAddonEntry(addon, existingAddon);
  if (!normalized) return cloneRegistry();

  if (existingIndex >= 0) {
    current[existingIndex] = normalized;
  } else {
    current.push(normalized);
  }

  void upsertInstalledAddonMeta(normalized.id, {
    name: normalized.name,
    version: normalized.version,
  });

  return replaceRegistry(current);
}

export function unregisterAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return cloneRegistry();
  return replaceRegistry(cloneRegistry().filter((addon) => addon.id !== normalizedId));
}

export function updateAddonStatus(addonId, status, statusMessage = "") {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return cloneRegistry();

  const current = cloneRegistry();
  const index = current.findIndex((addon) => addon.id === normalizedId);
  if (index < 0) return current;

  const nextStatus = VALID_ADDON_STATUSES.has(status) ? status : current[index].status;
  current[index] = {
    ...current[index],
    status: nextStatus,
    statusMessage: String(statusMessage || "").trim(),
    updatedAt: Date.now(),
  };

  return replaceRegistry(current);
}

export function subscribeAddonsRegistry(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  REGISTRY_LISTENERS.add(listener);
  listener(cloneRegistry());

  return () => {
    REGISTRY_LISTENERS.delete(listener);
  };
}

export function reapplyAddonSecurityPolicies() {
  const normalized = cloneRegistry()
    .map((addon) => normalizeAddonEntry(addon, addon))
    .filter(Boolean);
  return replaceRegistry(normalized);
}
