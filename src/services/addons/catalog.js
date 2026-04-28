import { sanitizeAddonId } from "./shared.js";
import { debugLog } from "../../core/logger.js";
// Minimal fallback used when the remote catalog resource fails to load.
// Only id, name, downloadUrl, and trusted flag — all other fields will be "-".
const CATALOG_FALLBACK = Object.freeze([
  {
    id: "image-repair-addon",
    name: "Image Repair Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572502-f95ue-image-repair-add-on",
    trusted: true,
  },
  {
    id: "masked-direct-addon",
    name: "Masked + Direct Download Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572503-f95ue-masked-direct-download-add-on",
    trusted: true,
  },
  {
    id: "library-addon",
    name: "Library Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572506-f95ue-library-add-on",
    trusted: true,
  },
  {
    id: "latest-filters-addon",
    name: "Latest Filters Add-on",
    downloadUrl: "",
    trusted: true,
  },
]);

const BUILTIN_TRUSTED_ADDON_IDS = new Set(
  CATALOG_FALLBACK.map((entry) => sanitizeAddonId(entry.id)),
);

// Try to load the catalog from the @resource declaration (fetched by the
// userscript manager at install/update time from jsDelivr.
let TRUSTED_ADDON_CATALOG = CATALOG_FALLBACK;
let _catalogFresh = false;
let _catalogInitialized = false;

function getCatalogResource() {
  try {
    if (typeof GM_getResourceText !== "function") return;
    const raw = GM_getResourceText("trustedAddonCatalog");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      TRUSTED_ADDON_CATALOG = Object.freeze(parsed.map((entry) => ({ ...entry })));
      _catalogFresh = true;
    }
  } catch (err) {
    debugLog("Failed to load trusted addon catalog resource, using fallback", err);
  }
}

export function initTrustedAddonCatalog() {
  if (_catalogInitialized) return;
  _catalogInitialized = true;
  getCatalogResource();
}

function ensureCatalogInitialized() {
  if (!_catalogInitialized) {
    initTrustedAddonCatalog();
  }
}

/** Returns true when the remote catalog was loaded successfully. */
export function isCatalogFresh() {
  ensureCatalogInitialized();
  return _catalogFresh;
}

export function listTrustedAddonCatalog() {
  ensureCatalogInitialized();
  return TRUSTED_ADDON_CATALOG.map((entry) => ({ ...entry, id: sanitizeAddonId(entry.id) })).filter(
    (entry) => entry.id,
  );
}

export function getTrustedCatalogEntry(addonId) {
  const id = sanitizeAddonId(addonId);
  if (!id) return null;
  return listTrustedAddonCatalog().find((entry) => entry.id === id) || null;
}

export function isBuiltinTrustedAddonId(addonId) {
  const id = sanitizeAddonId(addonId);
  if (!id) return false;
  return BUILTIN_TRUSTED_ADDON_IDS.has(id);
}
