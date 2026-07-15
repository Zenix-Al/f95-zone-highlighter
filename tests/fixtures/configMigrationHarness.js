const fs = require("fs");
const path = require("path");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadConfigReference({ compactCatalogs = false } = {}) {
  const file = path.join(process.cwd(), "config-ref.json");
  const reference = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!compactCatalogs) return clone(reference);

  const compact = clone(reference);
  if (Array.isArray(compact.tags)) compact.tags = compact.tags.slice(0, 3);
  if (compact.prefixes && typeof compact.prefixes === "object") {
    compact.prefixes.items = Array.isArray(compact.prefixes.items) ? compact.prefixes.items.slice(0, 3) : [];
    compact.prefixes.categories = Object.fromEntries(
      Object.entries(compact.prefixes.categories || {}).slice(0, 1).map(([key, groups]) => [key, groups.slice(0, 1)]),
    );
  }
  return compact;
}

export function extractMigrationSource(reference) {
  const source = clone(reference);
  const keys = [
    "color", "overlaySettings", "threadSettings", "globalSettings", "latestSettings",
    "preferredTags", "excludedTags", "markedTags", "savedNotifID", "tags", "prefixes", "addons", "minVersion",
    "configVisibility",
  ];
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}
