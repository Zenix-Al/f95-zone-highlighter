import { config } from "../../config.js";
import { saveConfigKeys } from "../settingsService.js";
import { sanitizeAddonId } from "./shared.js";

function ensureAddonsConfigBucket() {
  const addonsRoot = config.addons && typeof config.addons === "object" ? config.addons : {};
  const byAddon =
    addonsRoot.byAddon && typeof addonsRoot.byAddon === "object" ? addonsRoot.byAddon : {};
  const installedMeta =
    addonsRoot.installedMeta && typeof addonsRoot.installedMeta === "object"
      ? addonsRoot.installedMeta
      : {};
  if (!config.addons || typeof config.addons !== "object") config.addons = addonsRoot;
  if (!config.addons.byAddon || typeof config.addons.byAddon !== "object") {
    config.addons.byAddon = byAddon;
  }
  if (!config.addons.installedMeta || typeof config.addons.installedMeta !== "object") {
    config.addons.installedMeta = installedMeta;
  }
  return config.addons;
}

function ensureInstalledMetaBucket(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};

  const addonsRoot = ensureAddonsConfigBucket();
  if (
    !addonsRoot.installedMeta[normalizedId] ||
    typeof addonsRoot.installedMeta[normalizedId] !== "object"
  ) {
    addonsRoot.installedMeta[normalizedId] = {
      name: "",
      version: "",
      installedSeenAt: 0,
      lastSeenAt: 0,
    };
  }
  return addonsRoot.installedMeta[normalizedId];
}

export function ensureAddonStateBucket(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};

  const addonsRoot = ensureAddonsConfigBucket();
  if (!addonsRoot.byAddon[normalizedId] || typeof addonsRoot.byAddon[normalizedId] !== "object") {
    addonsRoot.byAddon[normalizedId] = { state: {} };
  }
  if (
    !addonsRoot.byAddon[normalizedId].state ||
    typeof addonsRoot.byAddon[normalizedId].state !== "object"
  ) {
    addonsRoot.byAddon[normalizedId].state = {};
  }
  return addonsRoot.byAddon[normalizedId].state;
}

export function getAddonState(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return {};
  return { ...ensureAddonStateBucket(normalizedId) };
}

export function getInstalledAddonMeta(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return null;
  const entry = ensureInstalledMetaBucket(normalizedId);
  return { ...entry };
}

export function listInstalledAddonMeta() {
  const addonsRoot = ensureAddonsConfigBucket();
  const entries = addonsRoot.installedMeta || {};
  const result = {};
  for (const [addonId, value] of Object.entries(entries)) {
    result[addonId] = { ...value };
  }
  return result;
}

export async function persistAddonsState() {
  try {
    await saveConfigKeys({ addons: config.addons });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function setAddonStateValue(addonId, key, value) {
  const normalizedId = sanitizeAddonId(addonId);
  const normalizedKey = String(key || "").trim();
  if (!normalizedId || !normalizedKey) {
    return { ok: false, reason: "invalid_state_key" };
  }

  const stateBucket = ensureAddonStateBucket(normalizedId);
  stateBucket[normalizedKey] = value;
  const persisted = await persistAddonsState();
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true };
}

export async function upsertInstalledAddonMeta(addonId, partial = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const bucket = ensureInstalledMetaBucket(normalizedId);
  const now = Date.now();

  const incomingInstalledSeenAt = Number(partial.installedSeenAt || 0);
  const incomingLastSeenAt = Number(partial.lastSeenAt || 0);

  bucket.name = String(partial.name || bucket.name || "").trim();
  bucket.version = String(partial.version || bucket.version || "").trim();
  bucket.installedSeenAt =
    Number.isFinite(incomingInstalledSeenAt) && incomingInstalledSeenAt > 0
      ? incomingInstalledSeenAt
      : bucket.installedSeenAt || now;
  bucket.lastSeenAt =
    Number.isFinite(incomingLastSeenAt) && incomingLastSeenAt > 0 ? incomingLastSeenAt : now;

  const persisted = await persistAddonsState();
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true, value: { ...bucket } };
}

export async function clearAddonState(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: true };

  const addonsRoot = ensureAddonsConfigBucket();
  if (!addonsRoot.byAddon[normalizedId]) return { ok: true };

  delete addonsRoot.byAddon[normalizedId];
  const persisted = await persistAddonsState();
  if (!persisted.ok) return { ok: false, reason: "storage_error" };
  return { ok: true };
}
