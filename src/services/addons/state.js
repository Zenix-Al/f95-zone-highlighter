import { config } from "../../config.js";
import { saveConfigKeys } from "../settingsService.js";
import { sanitizeAddonId } from "./shared.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureAddonsConfigBucket(addons) {
  const root = addons && typeof addons === "object" ? addons : {};
  if (!root.byAddon || typeof root.byAddon !== "object") root.byAddon = {};
  if (!root.installedMeta || typeof root.installedMeta !== "object") root.installedMeta = {};
  return root;
}

let pendingAddonConfig = null;

function ensureInstalledMetaBucket(addons, addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};

  const addonsRoot = ensureAddonsConfigBucket(addons);
  if (!addonsRoot.installedMeta[normalizedId] || typeof addonsRoot.installedMeta[normalizedId] !== "object") {
    addonsRoot.installedMeta[normalizedId] = {
      name: "",
      version: "",
      description: "",
      pageScopes: [],
      runtimeMode: "",
      matches: [],
      capabilities: [],
      panelTitle: "",
      panelBody: "",
      statusMessage: "",
      installedSeenAt: 0,
      lastSeenAt: 0,
    };
  }
  return addonsRoot.installedMeta[normalizedId];
}

function ensureAddonStateBucketInRoot(addons, addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};

  const addonsRoot = ensureAddonsConfigBucket(addons);
  if (!addonsRoot.byAddon[normalizedId] || typeof addonsRoot.byAddon[normalizedId] !== "object") {
    addonsRoot.byAddon[normalizedId] = { state: {} };
  }
  if (!addonsRoot.byAddon[normalizedId].state || typeof addonsRoot.byAddon[normalizedId].state !== "object") {
    addonsRoot.byAddon[normalizedId].state = {};
  }
  return addonsRoot.byAddon[normalizedId].state;
}

export function getAddonState(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};
  const root = ensureAddonsConfigBucket(clone(config.addons));
  return { ...ensureAddonStateBucketInRoot(root, normalizedId) };
}

/**
 * Compatibility mutation facade for add-on action handlers. It stages changes
 * in a detached config candidate; persistAddonsState commits that candidate
 * through settingsService before it can reach live config.
 */
export function ensureAddonStateBucket(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};
  if (!pendingAddonConfig) pendingAddonConfig = ensureAddonsConfigBucket(clone(config.addons));
  return ensureAddonStateBucketInRoot(pendingAddonConfig, normalizedId);
}

export function getInstalledAddonMeta(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return null;
  const entry = config.addons?.installedMeta?.[normalizedId];
  return entry && typeof entry === "object" ? { ...entry } : null;
}

export function listInstalledAddonMeta() {
  const entries = config.addons?.installedMeta && typeof config.addons.installedMeta === "object"
    ? config.addons.installedMeta
    : {};
  const result = {};
  for (const [addonId, value] of Object.entries(entries)) result[addonId] = { ...value };
  return result;
}

export async function persistAddonsState(addons = config.addons) {
  const candidate = pendingAddonConfig || addons;
  const result = await saveConfigKeys({ addons: clone(candidate) });
  pendingAddonConfig = null;
  return result.committed
    ? { ok: true, result }
    : { ok: false, reason: "storage_error", result };
}

export async function setAddonStateValue(addonId, key, value) {
  const normalizedId = sanitizeAddonId(addonId);
  const normalizedKey = String(key || "").trim();
  if (!normalizedId || !normalizedKey) return { ok: false, reason: "invalid_state_key" };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  ensureAddonStateBucketInRoot(addons, normalizedId)[normalizedKey] = value;
  const persisted = await persistAddonsState(addons);
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true };
}

export async function upsertInstalledAddonMeta(addonId, partial = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  const bucket = ensureInstalledMetaBucket(addons, normalizedId);
  const now = Date.now();
  const incomingInstalledSeenAt = Number(partial.installedSeenAt || 0);
  const incomingLastSeenAt = Number(partial.lastSeenAt || 0);

  bucket.name = String(partial.name || bucket.name || "").trim();
  bucket.version = String(partial.version || bucket.version || "").trim();
  bucket.description = String(partial.description || bucket.description || "").trim();
  bucket.panelTitle = String(partial.panelTitle || bucket.panelTitle || "").trim();
  bucket.panelBody = String(partial.panelBody || bucket.panelBody || "").trim();
  bucket.statusMessage = String(partial.statusMessage || bucket.statusMessage || "").trim();
  bucket.pageScopes = Array.isArray(partial.pageScopes)
    ? partial.pageScopes.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : Array.isArray(bucket.pageScopes) ? bucket.pageScopes : [];
  bucket.runtimeMode = String(partial.runtimeMode || bucket.runtimeMode || "").trim().toLowerCase();
  bucket.matches = Array.isArray(partial.matches)
    ? partial.matches.map((entry) => String(entry || "").trim()).filter(Boolean)
    : Array.isArray(bucket.matches) ? bucket.matches : [];
  bucket.capabilities = Array.isArray(partial.capabilities)
    ? partial.capabilities.map((entry) => String(entry || "").trim()).filter(Boolean)
    : Array.isArray(bucket.capabilities) ? bucket.capabilities : [];
  bucket.installedSeenAt = Number.isFinite(incomingInstalledSeenAt) && incomingInstalledSeenAt > 0
    ? incomingInstalledSeenAt
    : bucket.installedSeenAt || now;
  bucket.lastSeenAt = Number.isFinite(incomingLastSeenAt) && incomingLastSeenAt > 0 ? incomingLastSeenAt : now;

  const persisted = await persistAddonsState(addons);
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true, value: { ...bucket } };
}

export async function clearAddonState(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: true };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  if (!addons.byAddon[normalizedId]) return { ok: true };
  delete addons.byAddon[normalizedId];
  const persisted = await persistAddonsState(addons);
  return persisted.ok ? { ok: true } : { ok: false, reason: "storage_error" };
}

export async function removeInstalledAddonMeta(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: true };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  if (!addons.installedMeta[normalizedId]) return { ok: true };
  delete addons.installedMeta[normalizedId];
  const persisted = await persistAddonsState(addons);
  return persisted.ok ? { ok: true } : { ok: false, reason: "storage_error" };
}
