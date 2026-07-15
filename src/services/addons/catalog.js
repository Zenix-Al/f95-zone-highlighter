import { sanitizeAddonId } from "./shared.js";
import { debugLog } from "../../core/logger.js";
// Minimal fallback used when the remote catalog resource fails to load.
// Only id, name, downloadUrl, and trusted flag — all other fields will be "-".
const CATALOG_FALLBACK = Object.freeze([
  {
    id: "image-repair-addon",
    name: "Image Repair Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572502-f95ue-image-repair-add-on",
    pageScopes: ["thread"],
    runtimeMode: "core-required",
    matches: ["*://f95zone.to/threads/*"],
    trusted: true,
  },
  {
    id: "masked-direct-addon",
    name: "Masked + Direct Download Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572503-f95ue-masked-direct-download-add-on",
    pageScopes: ["f95zone"],
    runtimeMode: "hybrid",
    matches: ["*://f95zone.to/threads/*", "*://f95zone.to/masked/*", "*://buzzheavier.com/*", "*://*.buzzheavier.com/*", "*://bzzhr.to/*", "*://*.bzzhr.to/*", "*://gofile.io/*", "*://pixeldrain.com/*", "*://datanodes.to/*", "*://www.mediafire.com/file/*", "*://mediafire.com/file/*", "*://workupload.com/file/*", "*://workupload.com/start/*", "*://*.workupload.com/file/*", "*://*.workupload.com/start/*"],
    trusted: true,
  },
  {
    id: "library-addon",
    name: "Library Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/572506-f95ue-library-add-on",
    pageScopes: ["f95zone"],
    runtimeMode: "core-required",
    matches: ["*://f95zone.to/*"],
    trusted: true,
  },
  {
    id: "example-addon",
    name: "Example Add-on",
    downloadUrl: "",
    pageScopes: ["f95zone"],
    runtimeMode: "core-required",
    matches: ["*://f95zone.to/*"],
    trusted: true,
  },
  {
    id: "latest-filters-addon",
    name: "Latest Filters Add-on",
    downloadUrl: "",
    pageScopes: ["latest"],
    runtimeMode: "core-required",
    matches: ["*://f95zone.to/sam/latest_alpha/*"],
    trusted: true,
  },
  {
    id: "halloween-theme-addon",
    name: "Halloween Theme Add-on",
    downloadUrl: "https://greasyfork.org/en/scripts/573070-f95ue-halloween-theme-add-on",
    pageScopes: ["f95zone"],
    runtimeMode: "core-required",
    matches: ["*://f95zone.to/*"],
    trusted: true,
  },
]);

// Try to load the catalog from the @resource declaration (fetched by the
// userscript manager at install/update time from jsDelivr.
let TRUSTED_ADDON_CATALOG = CATALOG_FALLBACK;
let NORMALIZED_TRUSTED_ADDON_CATALOG = CATALOG_FALLBACK.map((entry) => ({
  ...entry,
  id: sanitizeAddonId(entry.id),
})).filter((entry) => entry.id);
let TRUSTED_ADDON_CATALOG_BY_ID = new Map(
  NORMALIZED_TRUSTED_ADDON_CATALOG.map((entry) => [entry.id, entry]),
);
let _catalogFresh = false;
let _catalogInitialized = false;

function rebuildNormalizedCatalogCache() {
  NORMALIZED_TRUSTED_ADDON_CATALOG = TRUSTED_ADDON_CATALOG.map((entry) => ({
    ...entry,
    id: sanitizeAddonId(entry.id),
  })).filter((entry) => entry.id);
  TRUSTED_ADDON_CATALOG_BY_ID = new Map(
    NORMALIZED_TRUSTED_ADDON_CATALOG.map((entry) => [entry.id, entry]),
  );
}

function getCatalogResource() {
  try {
    if (typeof GM_getResourceText !== "function") return;
    const raw = GM_getResourceText("trustedAddonCatalog");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      TRUSTED_ADDON_CATALOG = Object.freeze(parsed.map((entry) => ({ ...entry })));
      rebuildNormalizedCatalogCache();
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

/** Reload the catalog resource and rebuild its normalized identity cache. */
export function reloadTrustedAddonCatalog() {
  TRUSTED_ADDON_CATALOG = CATALOG_FALLBACK;
  rebuildNormalizedCatalogCache();
  _catalogFresh = false;
  _catalogInitialized = false;
  initTrustedAddonCatalog();
  return listTrustedAddonCatalog();
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
  return NORMALIZED_TRUSTED_ADDON_CATALOG.map((entry) => ({ ...entry }));
}

export function getTrustedCatalogEntry(addonId) {
  const id = sanitizeAddonId(addonId);
  if (!id) return null;
  ensureCatalogInitialized();
  const entry = TRUSTED_ADDON_CATALOG_BY_ID.get(id);
  return entry ? { ...entry } : null;
}
