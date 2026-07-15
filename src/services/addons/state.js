import { config } from "../../config.js";
import { saveConfigKeys } from "../settingsService.js";
import { getCanonicalAddonId, listTrustedAddonCatalog } from "./catalog.js";
import { sanitizeAddonId } from "./shared.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureAddonsConfigBucket(addons) {
  const root = addons && typeof addons === "object" ? addons : {};
  if (!root.byAddon || typeof root.byAddon !== "object" || Array.isArray(root.byAddon)) root.byAddon = {};
  if (!root.installedMeta || typeof root.installedMeta !== "object" || Array.isArray(root.installedMeta)) root.installedMeta = {};
  return root;
}

function mergeObjectState(legacyBucket, canonicalBucket) {
  const legacy = legacyBucket && typeof legacyBucket === "object" ? legacyBucket : {};
  const canonical = canonicalBucket && typeof canonicalBucket === "object" ? canonicalBucket : {};
  return {
    ...legacy,
    ...canonical,
    state: {
      ...(legacy.state && typeof legacy.state === "object" ? legacy.state : {}),
      ...(canonical.state && typeof canonical.state === "object" ? canonical.state : {}),
    },
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function mergeInstalledMeta(legacyEntry, canonicalEntry) {
  const legacy = legacyEntry && typeof legacyEntry === "object" ? legacyEntry : {};
  const canonical = canonicalEntry && typeof canonicalEntry === "object" ? canonicalEntry : {};
  const installedSeenAt = [positiveNumber(legacy.installedSeenAt), positiveNumber(canonical.installedSeenAt)].filter(Boolean);
  const lastSeenAt = [positiveNumber(legacy.lastSeenAt), positiveNumber(canonical.lastSeenAt)].filter(Boolean);
  return {
    ...legacy,
    ...canonical,
    ...(installedSeenAt.length > 0 ? { installedSeenAt: Math.min(...installedSeenAt) } : {}),
    ...(lastSeenAt.length > 0 ? { lastSeenAt: Math.max(...lastSeenAt) } : {}),
  };
}

/**
 * Merge legacy identity buckets into canonical IDs in a detached config root.
 * Canonical fields win conflicts; installation history keeps the earliest
 * sighting and the most recent sighting. The caller decides whether to commit.
 */
export function canonicalizeAddonIdentityRoot(addons) {
  const root = ensureAddonsConfigBucket(addons);
  let changed = false;
  const aliases = [];

  for (const entry of listTrustedAddonCatalog()) {
    const canonicalId = sanitizeAddonId(entry?.id);
    if (!canonicalId || !Array.isArray(entry?.legacyIds)) continue;
    for (const legacyId of entry.legacyIds) {
      const sourceId = sanitizeAddonId(legacyId);
      if (sourceId && sourceId !== canonicalId) aliases.push([sourceId, canonicalId]);
    }
  }

  for (const [sourceId, canonicalId] of aliases.sort(([a], [b]) => a.localeCompare(b))) {
    if (Object.prototype.hasOwnProperty.call(root.byAddon, sourceId)) {
      root.byAddon[canonicalId] = mergeObjectState(root.byAddon[sourceId], root.byAddon[canonicalId]);
      delete root.byAddon[sourceId];
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(root.installedMeta, sourceId)) {
      root.installedMeta[canonicalId] = mergeInstalledMeta(root.installedMeta[sourceId], root.installedMeta[canonicalId]);
      delete root.installedMeta[sourceId];
      changed = true;
    }
  }

  return { root, changed };
}

export function resolveAddonId(addonId) {
  return getCanonicalAddonId(addonId);
}

let pendingAddonConfig = null;

function ensureInstalledMetaBucket(addons, addonId) {
  const normalizedId = resolveAddonId(addonId);
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
  const normalizedId = resolveAddonId(addonId);
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
  const normalizedId = resolveAddonId(addonId);
  if (!normalizedId) return {};
  const root = ensureAddonsConfigBucket(clone(config.addons));
  canonicalizeAddonIdentityRoot(root);
  return { ...ensureAddonStateBucketInRoot(root, normalizedId) };
}

/**
 * Compatibility mutation facade for add-on action handlers. It stages changes
 * in a detached config candidate; persistAddonsState commits that candidate
 * through settingsService before it can reach live config.
 */
export function ensureAddonStateBucket(addonId) {
  const normalizedId = resolveAddonId(addonId);
  if (!normalizedId) return {};
  if (!pendingAddonConfig) {
    pendingAddonConfig = ensureAddonsConfigBucket(clone(config.addons));
    canonicalizeAddonIdentityRoot(pendingAddonConfig);
  }
  return ensureAddonStateBucketInRoot(pendingAddonConfig, normalizedId);
}

export function getInstalledAddonMeta(addonId) {
  const normalizedId = resolveAddonId(addonId);
  if (!normalizedId) return null;
  const root = ensureAddonsConfigBucket(clone(config.addons));
  canonicalizeAddonIdentityRoot(root);
  const entry = root.installedMeta?.[normalizedId];
  return entry && typeof entry === "object" ? { ...entry } : null;
}

export function listInstalledAddonMeta() {
  const root = ensureAddonsConfigBucket(clone(config.addons));
  canonicalizeAddonIdentityRoot(root);
  return Object.fromEntries(Object.entries(root.installedMeta).map(([addonId, value]) => [addonId, { ...value }]));
}

export async function persistAddonsState(addons = config.addons) {
  const candidate = pendingAddonConfig || clone(addons);
  canonicalizeAddonIdentityRoot(candidate);
  const result = await saveConfigKeys({ addons: clone(candidate) });
  pendingAddonConfig = null;
  return result.committed
    ? { ok: true, result }
    : { ok: false, reason: "storage_error", result };
}

/** Persist all legacy buckets under their canonical identity in one commit. */
export async function normalizeAddonIdentities() {
  const candidate = ensureAddonsConfigBucket(clone(config.addons));
  const normalized = canonicalizeAddonIdentityRoot(candidate);
  if (!normalized.changed) return { ok: true, changed: false };
  const persisted = await persistAddonsState(candidate);
  return persisted.ok ? { ok: true, changed: true } : persisted;
}

/** Normalize one alias explicitly; useful during release/update sequencing. */
export async function normalizeAddonIdentity(addonId) {
  const sourceId = sanitizeAddonId(addonId);
  const canonicalId = resolveAddonId(sourceId);
  if (!sourceId || sourceId === canonicalId) return { ok: true, changed: false, canonicalId };
  const candidate = ensureAddonsConfigBucket(clone(config.addons));
  const normalized = canonicalizeAddonIdentityRoot(candidate);
  if (!normalized.changed) return { ok: true, changed: false, canonicalId };
  const persisted = await persistAddonsState(candidate);
  return persisted.ok ? { ok: true, changed: true, canonicalId } : { ...persisted, canonicalId };
}

export async function setAddonStateValue(addonId, key, value) {
  const normalizedId = resolveAddonId(addonId);
  const normalizedKey = String(key || "").trim();
  if (!normalizedId || !normalizedKey) return { ok: false, reason: "invalid_state_key" };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  ensureAddonStateBucketInRoot(addons, normalizedId)[normalizedKey] = value;
  const persisted = await persistAddonsState(addons);
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true };
}

export async function upsertInstalledAddonMeta(addonId, partial = {}) {
  const normalizedId = resolveAddonId(addonId);
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
  const normalizedId = resolveAddonId(addonId);
  if (!normalizedId) return { ok: true };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  canonicalizeAddonIdentityRoot(addons);
  if (!addons.byAddon[normalizedId]) return { ok: true };
  delete addons.byAddon[normalizedId];
  const persisted = await persistAddonsState(addons);
  return persisted.ok ? { ok: true } : { ok: false, reason: "storage_error" };
}

export async function removeInstalledAddonMeta(addonId) {
  const normalizedId = resolveAddonId(addonId);
  if (!normalizedId) return { ok: true };

  const addons = ensureAddonsConfigBucket(clone(config.addons));
  canonicalizeAddonIdentityRoot(addons);
  if (!addons.installedMeta[normalizedId]) return { ok: true };
  delete addons.installedMeta[normalizedId];
  const persisted = await persistAddonsState(addons);
  return persisted.ok ? { ok: true } : { ok: false, reason: "storage_error" };
}
