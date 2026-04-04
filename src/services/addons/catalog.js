import { sanitizeAddonId } from "./shared.js";

const TRUSTED_ADDON_CATALOG = Object.freeze([
  {
    id: "image-repair-addon",
    name: "Image Repair Add-on",
    description: "Automatically retries broken attachment images on thread pages.",
    version: "0.1.0",
    pageScopes: ["thread"],
    downloadUrl: "https://greasyfork.org/en/scripts/572502-f95ue-image-repair-add-on",
    trusted: true,
  },
  {
    id: "masked-direct-addon",
    name: "Masked + Direct Download Add-on",
    description: "Combines masked-link skipper and direct-download flows in one trusted add-on.",
    version: "0.1.0",
    pageScopes: ["thread", "download"],
    downloadUrl: "https://greasyfork.org/en/scripts/572503-f95ue-masked-direct-download-add-on",
    trusted: true,
  },
  {
    id: "library-addon",
    name: "Library Add-on",
    description:
      "Quickly save thread snapshots into a personal library and manage them in a dedicated UI.",
    version: "0.1.0",
    pageScopes: [],
    downloadUrl: "https://greasyfork.org/en/scripts/572506-f95ue-library-add-on",
    trusted: true,
  },
]);

export function listTrustedAddonCatalog() {
  return TRUSTED_ADDON_CATALOG.map((entry) => ({ ...entry, id: sanitizeAddonId(entry.id) })).filter(
    (entry) => entry.id,
  );
}

export function getTrustedCatalogEntry(addonId) {
  const id = sanitizeAddonId(addonId);
  if (!id) return null;
  return listTrustedAddonCatalog().find((entry) => entry.id === id) || null;
}
