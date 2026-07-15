const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "addons", "addons.manifest.json");
const CATALOG_PATH = path.join(ROOT, "src", "services", "addons", "trusted-catalog.json");
const HEADER_PATH = path.join(ROOT, "header.txt");
const SUPPORTED_SCOPES = new Set(["f95zone", "thread", "latest"]);
const RUNTIME_MODES = new Set(["core-required", "standalone", "hybrid"]);
const F95ZONE_SAMPLE_URLS = [
  "https://f95zone.to/",
  "https://f95zone.to/threads/example.1/",
  "https://f95zone.to/sam/latest_alpha/",
  "https://f95zone.to/masked/example/",
];

function matchesPattern(url, pattern) {
  const normalized = String(pattern || "").trim();
  if (!normalized || normalized === "<all_urls>") return normalized === "<all_urls>";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const match = normalized.match(/^(\*|https?|file):\/\/([^/]+)(\/.*)?$/i);
  if (!match) return false;
  const [, scheme, hostPattern, pathPattern = "/*"] = match;
  if (scheme !== "*" && scheme.toLowerCase() !== parsed.protocol.slice(0, -1)) return false;
  const host = parsed.hostname.toLowerCase();
  const wantedHost = hostPattern.toLowerCase();
  if (wantedHost.startsWith("*.")) {
    const suffix = wantedHost.slice(1);
    if (host !== suffix.slice(1) && !host.endsWith(suffix)) return false;
  } else if (wantedHost !== "*" && wantedHost !== host) {
    return false;
  }
  const escapedPath = pathPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escapedPath}$`).test(`${parsed.pathname}${parsed.search}`);
}

function hasF95ZoneMatch(matches) {
  return matches.some((pattern) => F95ZONE_SAMPLE_URLS.some((url) => matchesPattern(url, pattern)));
}

function hasStandaloneMatch(matches) {
  return matches.some((pattern) => !F95ZONE_SAMPLE_URLS.some((url) => matchesPattern(url, pattern)));
}

function readManifest() {
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return Array.isArray(parsed.addons) ? parsed.addons : [];
}

function validateManifest(addons = readManifest()) {
  const errors = [];
  const ids = new Set();
  for (const addon of addons) {
    const id = String(addon?.id || "").trim();
    const scopes = Array.isArray(addon?.pageScopes)
      ? addon.pageScopes.map((scope) => String(scope || "").trim().toLowerCase())
      : null;
    const matches = Array.isArray(addon?.matches)
      ? addon.matches.map((match) => String(match || "").trim())
      : [];
    const mode = String(addon?.runtimeMode || "").trim().toLowerCase();
    if (!id || ids.has(id)) errors.push(`${id || "<missing>"}: duplicate or missing id`);
    ids.add(id);
    if (!RUNTIME_MODES.has(mode)) errors.push(`${id}: invalid runtimeMode`);
    if (!Array.isArray(scopes)) errors.push(`${id}: pageScopes must be an array`);
    if (scopes?.some((scope) => !scope)) errors.push(`${id}: empty page scope`);
    if (scopes && new Set(scopes).size !== scopes.length) errors.push(`${id}: duplicate page scope`);
    if (scopes?.some((scope) => !SUPPORTED_SCOPES.has(scope))) errors.push(`${id}: unknown page scope`);
    if (mode !== "standalone" && scopes?.length === 0) errors.push(`${id}: core mode requires pageScopes`);
    if (mode === "standalone" && scopes?.length > 0) errors.push(`${id}: standalone cannot declare pageScopes`);
    if (!Array.isArray(addon?.matches) || matches.length === 0) errors.push(`${id}: missing matches`);
    if (mode !== "standalone" && !addon.requiresCore) errors.push(`${id}: core mode contradicts requiresCore`);
    if (mode === "standalone" && addon.requiresCore) errors.push(`${id}: standalone contradicts requiresCore`);
    if (mode === "core-required" && !hasF95ZoneMatch(matches)) errors.push(`${id}: core-required lacks an F95Zone match`);
    if (mode === "hybrid" && (!hasF95ZoneMatch(matches) || !hasStandaloneMatch(matches))) {
      errors.push(`${id}: hybrid requires F95Zone and standalone matches`);
    }
    if (matches.some((match) => !match || (!match.startsWith("<all_urls>") && !/^(\*|https?|file):\/\//i.test(match)))) {
      errors.push(`${id}: unsupported userscript match syntax`);
    }
  }
  const header = fs.readFileSync(HEADER_PATH, "utf8");
  if (!header.includes("@resource     trustedAddonCatalog https://cdn.jsdelivr.net/gh/Zenix-Al/f95-zone-highlighter@main/src/services/addons/trusted-catalog.json")) {
    errors.push("core header trusted catalog resource path/name changed");
  }
  return errors;
}

function buildTrustedCatalog(addons = readManifest()) {
  return [...addons]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((addon) => ({
      id: addon.id,
      name: addon.name,
      description: addon.description,
      version: addon.version,
      pageScopes: [...addon.pageScopes],
      runtimeMode: addon.runtimeMode,
      matches: [...addon.matches],
      grants: [...addon.grants],
      runAt: addon.runAt,
      requiresCore: Boolean(addon.requiresCore),
      capabilities: [...addon.capabilities],
      downloadUrl: String(addon.downloadUrl || ""),
      trusted: true,
    }));
}

function renderCatalog(addons = readManifest()) {
  return `${JSON.stringify(buildTrustedCatalog(addons), null, 2)}\n`;
}

function run(args = process.argv.slice(2)) {
  const addons = readManifest();
  const errors = validateManifest(addons);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const expected = renderCatalog(addons);
  if (args.includes("--write")) {
    fs.writeFileSync(CATALOG_PATH, expected);
    console.log("Generated trusted add-on catalog.");
    return;
  }
  if (args.includes("--check")) {
    const actual = fs.readFileSync(CATALOG_PATH, "utf8");
    if (actual !== expected) throw new Error("Trusted catalog differs from addons.manifest.json.");
    console.log("Trusted catalog is in sync with the add-on manifest.");
    return;
  }
  console.log(expected);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`Add-on catalog check failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildTrustedCatalog,
  readManifest,
  renderCatalog,
  run,
  validateManifest,
};
