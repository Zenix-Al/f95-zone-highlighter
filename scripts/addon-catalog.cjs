const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "addons", "addons.manifest.json");
const GENERATED_DIR = path.join(ROOT, "src", "generated");
const LEGACY_CATALOG_PATH = path.join(ROOT, "src", "services", "addons", "trusted-catalog.json");
const CATALOG_META_PATH = path.join(GENERATED_DIR, "trusted-addon-catalog.meta.json");
const CATALOG_FILE_PREFIX = "trusted-addon-catalog.";
const HEADER_PATH = path.join(ROOT, "build", "header.txt");
const SUPPORTED_SCOPES = new Set(["f95zone", "thread", "latest"]);
const RUNTIME_MODES = new Set(["core-required", "standalone", "hybrid"]);
const VALID_CAPABILITIES = new Set([
  "toast",
  "feature",
  "storage",
  "page",
  "idb",
  "observer",
  "ui",
  "ui.style",
  "ui.mount",
  "ui.dialog",
  "ui.dock",
]);
const VALID_RUN_AT = new Set(["document-start", "document-body", "document-end", "document-idle", "context-menu"]);
const F95ZONE_SAMPLE_URLS = [
  "https://f95zone.to/",
  "https://f95zone.to/threads/example.1/",
  "https://f95zone.to/sam/latest_alpha/",
  "https://f95zone.to/masked/example/",
];

function sanitizeAddonId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

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

function validateManifest(addons = readManifest(), { rootDir = ROOT, checkFiles = true } = {}) {
  const errors = [];
  const ids = new Set();
  const legacyIds = new Map();
  const root = path.resolve(rootDir);
  if (!Array.isArray(addons)) return ["addons: manifest must contain an array"];

  const addPathError = (index, field, message) => errors.push(`addons[${index}].${field}: ${message}`);
  const isRelativeRepositoryPath = (value) => {
    const normalized = String(value || "").replace(/\\/g, "/");
    return normalized && !normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized) && !normalized.includes("../");
  };

  for (const addon of addons) {
    const index = addons.indexOf(addon);
    const id = sanitizeAddonId(addon?.id);
    const scopes = Array.isArray(addon?.pageScopes)
      ? addon.pageScopes.map((scope) => String(scope || "").trim().toLowerCase())
      : null;
    const matches = Array.isArray(addon?.matches)
      ? addon.matches.map((match) => String(match || "").trim())
      : [];
    const mode = String(addon?.runtimeMode || "").trim().toLowerCase();
    if (!id) addPathError(index, "id", "missing add-on id");
    else if (ids.has(id)) addPathError(index, "id", `duplicate add-on id '${id}'`);
    ids.add(id);
    if (!RUNTIME_MODES.has(mode)) addPathError(index, "runtimeMode", `invalid runtime mode '${mode || "<missing>"}'`);
    if (!Array.isArray(scopes)) addPathError(index, "pageScopes", "must be an array");
    if (scopes?.some((scope) => !scope)) addPathError(index, "pageScopes", "contains an empty scope");
    if (scopes && new Set(scopes).size !== scopes.length) addPathError(index, "pageScopes", "contains duplicate scopes");
    if (scopes?.some((scope) => !SUPPORTED_SCOPES.has(scope))) addPathError(index, "pageScopes", "contains an unsupported scope");
    if (mode !== "standalone" && scopes?.length === 0) addPathError(index, "pageScopes", "core mode requires at least one scope");
    if (mode === "standalone" && scopes?.length > 0) addPathError(index, "pageScopes", "standalone mode must not declare scopes");
    if (!Array.isArray(addon?.matches) || matches.length === 0) addPathError(index, "matches", "must contain at least one match");
    if (new Set(matches).size !== matches.length) addPathError(index, "matches", "contains duplicate matches");
    if (mode !== "standalone" && addon.requiresCore !== true) addPathError(index, "requiresCore", "must be true for core modes");
    if (mode === "standalone" && addon.requiresCore !== false) addPathError(index, "requiresCore", "must be false for standalone mode");
    if (mode === "core-required" && !hasF95ZoneMatch(matches)) addPathError(index, "matches", "core-required lacks an F95Zone match");
    if (mode === "hybrid" && (!hasF95ZoneMatch(matches) || !hasStandaloneMatch(matches))) {
      addPathError(index, "matches", "hybrid requires both F95Zone and standalone matches");
    }
    if (matches.some((match) => !match || (!match.startsWith("<all_urls>") && !/^(\*|https?|file):\/\//i.test(match)))) {
      addPathError(index, "matches", "contains unsupported userscript match syntax");
    }

    const grants = Array.isArray(addon?.grants) ? addon.grants.map((grant) => String(grant || "").trim()) : null;
    if (!grants || grants.length === 0) addPathError(index, "grants", "must contain at least one grant");
    if (grants && new Set(grants).size !== grants.length) addPathError(index, "grants", "contains duplicate grants");
    if (grants?.includes("none") && grants.length !== 1) addPathError(index, "grants", "none must be used alone");
    if (grants?.some((grant) => grant !== "none" && !/^(?:GM_[A-Za-z0-9]+|GM\.[A-Za-z0-9]+)$/.test(grant))) {
      addPathError(index, "grants", "contains an unsupported grant");
    }

    if (!VALID_RUN_AT.has(String(addon?.runAt || "").trim())) {
      addPathError(index, "runAt", `unsupported run timing '${addon?.runAt || "<missing>"}'`);
    }
    if (!Array.isArray(addon?.capabilities)) addPathError(index, "capabilities", "must be an array");
    if (addon?.capabilities?.some((capability) => !VALID_CAPABILITIES.has(String(capability || "").trim()))) {
      addPathError(index, "capabilities", "contains an unsupported capability");
    }
    if (addon?.capabilities && new Set(addon.capabilities).size !== addon.capabilities.length) {
      addPathError(index, "capabilities", "contains duplicate capabilities");
    }

    const expectedEntry = `addons/${id}/src/main.js`;
    const expectedOutfile = `addons/${id}/dist/${id}.user.js`;
    if (addon?.entry !== expectedEntry) addPathError(index, "entry", `must be '${expectedEntry}'`);
    if (addon?.outfile !== expectedOutfile) addPathError(index, "outfile", `must be '${expectedOutfile}'`);
    if (!isRelativeRepositoryPath(addon?.entry)) addPathError(index, "entry", "must be a relative repository path");
    if (!isRelativeRepositoryPath(addon?.outfile)) addPathError(index, "outfile", "must be a relative repository path");
    if (checkFiles && id && addon?.entry === expectedEntry && !fs.existsSync(path.join(root, expectedEntry))) {
      addPathError(index, "entry", `file does not exist: ${expectedEntry}`);
    }

    const declaredLegacyIds = addon?.legacyIds;
    if (typeof declaredLegacyIds !== "undefined" && !Array.isArray(declaredLegacyIds)) {
      addPathError(index, "legacyIds", "must be an array when provided");
    }
    for (const legacyId of Array.isArray(declaredLegacyIds) ? declaredLegacyIds : []) {
      const normalizedLegacyId = sanitizeAddonId(legacyId);
      if (!normalizedLegacyId) addPathError(index, "legacyIds", "contains an empty ID");
      else if (String(legacyId || "").trim() !== normalizedLegacyId) {
        addPathError(index, "legacyIds", `must use sanitized ID '${normalizedLegacyId}'`);
      } else if (normalizedLegacyId === id || legacyIds.has(normalizedLegacyId)) {
        addPathError(index, "legacyIds", `duplicates add-on identity '${normalizedLegacyId}'`);
      } else {
        legacyIds.set(normalizedLegacyId, index);
      }
    }
  }
  const allIds = new Set(addons.map((addon) => String(addon?.id || "").trim()).filter(Boolean));
  const folderIds = new Set(
    addons
      .map((addon) => String(addon?.entry || "").replace(/\\/g, "/").match(/^addons\/([^/]+)\/src\/main\.js$/)?.[1])
      .filter(Boolean),
  );
  try {
    for (const entry of fs.readdirSync(path.join(root, "addons"), { withFileTypes: true })) {
      if (entry.isDirectory()) folderIds.add(sanitizeAddonId(entry.name));
    }
  } catch {
    // Temporary validator fixtures may not include an add-ons directory.
  }
  let catalogById = new Map();
  if (checkFiles) {
    try {
      const existingCatalog = JSON.parse(fs.readFileSync(
        path.join(root, "src", "generated", "trusted-addon-catalog.meta.json"),
        "utf8",
      ));
      const catalogFile = String(existingCatalog?.catalogFile || "");
      const catalogDocument = JSON.parse(fs.readFileSync(path.join(root, "src", "generated", catalogFile), "utf8"));
      catalogById = new Map((Array.isArray(catalogDocument?.catalog) ? catalogDocument.catalog : [])
        .map((entry) => [sanitizeAddonId(entry?.id), entry]).filter(([id]) => id));
    } catch {
      catalogById = new Map();
    }
  }
  for (const [legacyId, ownerIndex] of legacyIds) {
    const owner = addons[ownerIndex];
    const previousCatalogEntry = catalogById.get(legacyId);
    const isSamePublishedScript = previousCatalogEntry &&
      String(previousCatalogEntry.downloadUrl || "") === String(owner?.downloadUrl || "");
    if (allIds.has(legacyId) || folderIds.has(legacyId) || (previousCatalogEntry && !isSamePublishedScript)) {
      addPathError(ownerIndex, "legacyIds", `duplicates add-on identity '${legacyId}'`);
    }
  }
  for (const [legacyId, ownerIndex] of legacyIds) {
    const owner = addons[ownerIndex];
    if (owner?.legacyIds?.filter((value) => String(value || "").trim() === legacyId).length > 1) {
      addPathError(ownerIndex, "legacyIds", `duplicates legacy ID '${legacyId}'`);
    }
  }
  const header = fs.readFileSync(HEADER_PATH, "utf8");
  if (header.includes("trustedAddonCatalog") || header.includes("GM_getResourceText")) {
    errors.push("core header must not embed the trusted catalog resource");
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
      ...(Array.isArray(addon.legacyIds) && addon.legacyIds.length > 0
        ? { legacyIds: [...new Set(addon.legacyIds.map((value) => sanitizeAddonId(value)).filter(Boolean))].sort() }
        : {}),
    }));
}

function renderCatalog(addons = readManifest()) {
  return `${JSON.stringify(buildTrustedCatalog(addons), null, 2)}\n`;
}

function buildCatalogArtifacts(addons = readManifest()) {
  const catalog = buildTrustedCatalog(addons);
  const canonical = JSON.stringify(catalog);
  const identifier = crypto.createHash("sha256").update(canonical).digest("hex");
  const catalogFile = `${CATALOG_FILE_PREFIX}${identifier.slice(0, 16)}.json`;
  return {
    identifier,
    catalogFile,
    metadata: `${JSON.stringify({ schemaVersion: 1, identifier, catalogFile }, null, 2)}\n`,
    catalog: `${JSON.stringify({ schemaVersion: 1, identifier, catalog }, null, 2)}\n`,
    aliases: `${JSON.stringify(Object.fromEntries(catalog.flatMap((entry) =>
      (entry.legacyIds || []).map((legacyId) => [legacyId, entry.id]))), null, 2)}\n`,
  };
}

function writeCatalogArtifacts(addons = readManifest(), { rootDir = ROOT } = {}) {
  const generatedDir = path.join(rootDir, "src", "generated");
  const artifacts = buildCatalogArtifacts(addons);
  fs.mkdirSync(generatedDir, { recursive: true });
  for (const name of fs.readdirSync(generatedDir)) {
    if (name.startsWith(CATALOG_FILE_PREFIX) && name.endsWith(".json") && name !== artifacts.catalogFile) {
      fs.rmSync(path.join(generatedDir, name));
    }
  }
  fs.writeFileSync(path.join(generatedDir, artifacts.catalogFile), artifacts.catalog);
  fs.writeFileSync(path.join(generatedDir, "trusted-addon-catalog.meta.json"), artifacts.metadata);
  fs.writeFileSync(path.join(generatedDir, "trusted-addon-aliases.json"), artifacts.aliases);
  const legacyPath = path.join(rootDir, path.relative(ROOT, LEGACY_CATALOG_PATH));
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, renderCatalog(addons));
  return artifacts;
}

function checkCatalogArtifacts(addons = readManifest(), { rootDir = ROOT } = {}) {
  const generatedDir = path.join(rootDir, "src", "generated");
  const expected = buildCatalogArtifacts(addons);
  const metadataPath = path.join(generatedDir, "trusted-addon-catalog.meta.json");
  const catalogPath = path.join(generatedDir, expected.catalogFile);
  if (!fs.existsSync(metadataPath) || fs.readFileSync(metadataPath, "utf8") !== expected.metadata) return false;
  if (!fs.existsSync(catalogPath) || fs.readFileSync(catalogPath, "utf8") !== expected.catalog) return false;
  if (fs.readFileSync(path.join(generatedDir, "trusted-addon-aliases.json"), "utf8") !== expected.aliases) return false;
  const legacyPath = path.join(rootDir, path.relative(ROOT, LEGACY_CATALOG_PATH));
  if (!fs.existsSync(legacyPath) || fs.readFileSync(legacyPath, "utf8") !== renderCatalog(addons)) return false;
  return fs.readdirSync(generatedDir)
    .filter((name) => name.startsWith(CATALOG_FILE_PREFIX) && name.endsWith(".json") && name !== "trusted-addon-catalog.meta.json")
    .every((name) => name === expected.catalogFile);
}

function run(args = process.argv.slice(2)) {
  const addons = readManifest();
  const errors = validateManifest(addons);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  if (args.includes("--check-manifest")) {
    console.log("Add-on manifest validation passed.");
    return;
  }
  if (args.includes("--write")) {
    const artifacts = writeCatalogArtifacts(addons);
    console.log(`Generated trusted add-on catalog ${artifacts.catalogFile}.`);
    return;
  }
  if (args.includes("--check")) {
    if (!checkCatalogArtifacts(addons)) throw new Error("Generated trusted catalog artifacts differ from addons.manifest.json.");
    console.log("Trusted catalog is in sync with the add-on manifest.");
    return;
  }
  console.log(buildCatalogArtifacts(addons).catalog);
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
  buildCatalogArtifacts,
  checkCatalogArtifacts,
  readManifest,
  renderCatalog,
  writeCatalogArtifacts,
  run,
  validateManifest,
};
