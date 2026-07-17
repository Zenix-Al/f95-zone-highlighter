import { debugLog } from "../../core/logger.js";
import { storageAdapter } from "../storageAdapter.js";
import { sanitizeAddonId } from "./shared.js";
import generatedAliases from "../../generated/trusted-addon-aliases.json";

export const TRUSTED_CATALOG_CACHE_KEY = "f95ue:addons:trusted-catalog-cache";
export const TRUSTED_CATALOG_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TRUSTED_CATALOG_META_URL =
  "https://cdn.jsdelivr.net/gh/Zenix-Al/f95-zone-highlighter@main/src/generated/trusted-addon-catalog.meta.json";
const TRUSTED_CATALOG_BASE_URL =
  "https://cdn.jsdelivr.net/gh/Zenix-Al/f95-zone-highlighter@main/src/generated/";
const CATALOG_FILE_PATTERN = /^trusted-addon-catalog\.[a-f0-9]{16}\.json$/;

let trustedCatalog = [];
let normalizedCatalog = [];
let catalogById = new Map();
const staticAliases = new Map(Object.entries(generatedAliases || {}).map(([legacyId, id]) => [
  sanitizeAddonId(legacyId), sanitizeAddonId(id),
]).filter(([legacyId, id]) => legacyId && id));
let catalogAliases = new Map(staticAliases);
let catalogFresh = false;
let initializationPromise = null;

function rebuildCatalogCache(catalog) {
  trustedCatalog = Object.freeze(catalog.map((entry) => Object.freeze({ ...entry })));
  normalizedCatalog = trustedCatalog.map((entry) => ({
    ...entry,
    id: sanitizeAddonId(entry.id),
    legacyIds: Array.isArray(entry.legacyIds)
      ? [...new Set(entry.legacyIds.map(sanitizeAddonId).filter(Boolean))]
      : [],
  })).filter((entry) => entry.id);
  catalogById = new Map(normalizedCatalog.map((entry) => [entry.id, entry]));
  catalogAliases = new Map(staticAliases);
  for (const entry of normalizedCatalog) {
    for (const legacyId of entry.legacyIds) {
      if (legacyId !== entry.id && !catalogById.has(legacyId) && !catalogAliases.has(legacyId)) {
        catalogAliases.set(legacyId, entry.id);
      }
    }
  }
}

function isCatalogArray(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set();
  return value.every((entry) => {
    const id = sanitizeAddonId(entry?.id);
    if (!id || ids.has(id) || entry?.trusted !== true) return false;
    ids.add(id);
    return typeof entry.name === "string" && Array.isArray(entry.pageScopes)
      && Array.isArray(entry.matches) && Array.isArray(entry.capabilities);
  });
}

function normalizeStoredCache(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1) return null;
  const identifier = String(value.identifier || "").toLowerCase();
  const hasCatalog = isCatalogArray(value.catalog) && /^[a-f0-9]{64}$/.test(identifier);
  if (!hasCatalog && (identifier || !Array.isArray(value.catalog) || value.catalog.length > 0)) return null;
  return {
    schemaVersion: 1,
    identifier,
    catalog: value.catalog.map((entry) => ({ ...entry })),
    checkedAt: Math.max(0, Number(value.checkedAt) || 0),
    updatedAt: Math.max(0, Number(value.updatedAt) || 0),
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { cache: "no-store", credentials: "omit" });
  if (!response?.ok) throw new Error(`catalog_http_${Number(response?.status) || 0}`);
  return response.json();
}

export function createTrustedCatalogRepository({
  storage = storageAdapter,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  hashCatalog = (catalog) => sha256(JSON.stringify(catalog)),
} = {}) {
  return {
    async load({ force = false } = {}) {
      const currentTime = now();
      const stored = normalizeStoredCache(await storage.get(TRUSTED_CATALOG_CACHE_KEY, null));
      const hasStoredCatalog = Boolean(stored && isCatalogArray(stored.catalog));
      if (hasStoredCatalog) rebuildCatalogCache(stored.catalog);
      catalogFresh = hasStoredCatalog;

      if (!force && stored && currentTime - stored.checkedAt < TRUSTED_CATALOG_CHECK_INTERVAL_MS) {
        return hasStoredCatalog
          ? { ok: true, source: "cache", changed: false, cache: stored }
          : { ok: false, source: "throttled-unavailable", changed: false, cache: stored };
      }

      try {
        if (typeof fetchImpl !== "function") throw new Error("catalog_fetch_unavailable");
        const checkToken = Math.floor(currentTime / TRUSTED_CATALOG_CHECK_INTERVAL_MS);
        const metadata = await fetchJson(fetchImpl, `${TRUSTED_CATALOG_META_URL}?check=${checkToken}`);
        const identifier = String(metadata?.identifier || "").toLowerCase();
        const catalogFile = String(metadata?.catalogFile || "");
        if (!/^[a-f0-9]{64}$/.test(identifier) || !CATALOG_FILE_PATTERN.test(catalogFile)) {
          throw new Error("catalog_metadata_invalid");
        }

        if (stored?.identifier === identifier) {
          const next = { ...stored, checkedAt: currentTime };
          await storage.set(TRUSTED_CATALOG_CACHE_KEY, next);
          return { ok: true, source: "not-modified", changed: false, cache: next };
        }

        const document = await fetchJson(fetchImpl, `${TRUSTED_CATALOG_BASE_URL}${catalogFile}`);
        if (document?.schemaVersion !== 1 || document?.identifier !== identifier || !isCatalogArray(document.catalog)) {
          throw new Error("catalog_document_invalid");
        }
        if (await hashCatalog(document.catalog) !== identifier) throw new Error("catalog_hash_mismatch");

        const next = {
          schemaVersion: 1,
          identifier,
          catalog: document.catalog.map((entry) => ({ ...entry })),
          checkedAt: currentTime,
          updatedAt: currentTime,
        };
        await storage.set(TRUSTED_CATALOG_CACHE_KEY, next);
        rebuildCatalogCache(next.catalog);
        catalogFresh = true;
        return { ok: true, source: "remote", changed: true, cache: next };
      } catch (error) {
        await storage.set(TRUSTED_CATALOG_CACHE_KEY, stored
          ? { ...stored, checkedAt: currentTime }
          : { schemaVersion: 1, identifier: "", catalog: [], checkedAt: currentTime, updatedAt: 0 });
        debugLog("addonsCatalog", "Trusted add-on catalog refresh failed.", {
          level: "warn",
          data: { reason: String(error?.message || "catalog_refresh_failed") },
        });
        return { ok: false, source: stored ? "stale-cache" : "unavailable", changed: false };
      }
    },
  };
}

const catalogRepository = createTrustedCatalogRepository();

export function initTrustedAddonCatalog() {
  if (!initializationPromise) initializationPromise = catalogRepository.load();
  return initializationPromise;
}

export async function reloadTrustedAddonCatalog() {
  initializationPromise = catalogRepository.load({ force: true });
  await initializationPromise;
  return listTrustedAddonCatalog();
}

export function isCatalogFresh() {
  return catalogFresh;
}

export function listTrustedAddonCatalog() {
  return normalizedCatalog.map((entry) => ({ ...entry }));
}

export function listTrustedAddonAliases() {
  return [...catalogAliases.entries()].map(([legacyId, id]) => ({ legacyId, id }));
}

export function getTrustedCatalogEntry(addonId) {
  const id = sanitizeAddonId(addonId);
  if (!id) return null;
  const entry = catalogById.get(id) || catalogById.get(catalogAliases.get(id));
  return entry ? { ...entry } : null;
}

export function getCanonicalAddonId(addonId) {
  const id = sanitizeAddonId(addonId);
  return id ? catalogAliases.get(id) || id : "";
}

export function isAddonIdAlias(addonId) {
  const id = sanitizeAddonId(addonId);
  return Boolean(id && getCanonicalAddonId(id) !== id);
}
