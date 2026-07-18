#!/usr/bin/env node
const childProcess = require("child_process");
const crypto = require("crypto");
const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "addons", "addons.manifest.json");
const TRUSTED_CATALOG_META_PATH = path.join(ROOT, "src", "generated", "trusted-addon-catalog.meta.json");
const BASELINE_SCHEMA_VERSION = 1;
const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".css", ".html"]);
const SERVICE_SOURCE_EXTENSIONS = new Set([".js", ".json"]);

let terser = null;
try { terser = require("terser"); } catch { terser = null; }
const { stripDebugLogs } = require(path.join(ROOT, "build", "stripDebugLogs.js"));
const {
  normalizeText,
  normalizedTextAssets,
} = require(path.join(ROOT, "build", "normalizeTextAssets.js"));

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativePath(filePath) {
  return normalizePath(path.relative(ROOT, filePath));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeAddonId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeArray(value, fallback = []) {
  return Array.isArray(value) ? [...value] : [...fallback];
}

function readManifest() {
  const manifest = readJson(MANIFEST_PATH);
  if (!Array.isArray(manifest.addons) || manifest.addons.length === 0) {
    throw new Error("addons.manifest.json must contain at least one add-on.");
  }
  return manifest.addons.map((addon) => ({
    id: sanitizeAddonId(addon.id),
    name: String(addon.name || "").trim(),
    description: String(addon.description || "").trim(),
    version: String(addon.version || "").trim(),
    author: String(addon.author || "").trim(),
    entry: normalizePath(addon.entry),
    outfile: normalizePath(addon.outfile),
    matches: normalizeArray(addon.matches),
    grants: normalizeArray(addon.grants),
    runAt: String(addon.runAt || "document-idle"),
    requiresCore: Boolean(addon.requiresCore),
    runtimeMode: String(addon.runtimeMode || "").trim().toLowerCase(),
    pageScopes: normalizeArray(addon.pageScopes).map((scope) => String(scope).trim().toLowerCase()),
    downloadUrl: String(addon.downloadUrl || "").trim(),
    capabilities: normalizeArray(addon.capabilities),
  }));
}

function readTrustedCatalog() {
  const metadata = readJson(TRUSTED_CATALOG_META_PATH);
  const document = readJson(path.join(ROOT, "src", "generated", String(metadata.catalogFile || "")));
  return normalizeArray(document.catalog)
    .map((entry) => ({
      id: sanitizeAddonId(entry.id),
      name: String(entry.name || "").trim(),
      description: String(entry.description || "").trim(),
      version: String(entry.version || "").trim(),
      pageScopes: normalizeArray(entry.pageScopes).map((scope) => String(scope).trim().toLowerCase()).filter(Boolean),
      runtimeMode: String(entry.runtimeMode || "").trim().toLowerCase(),
      matches: normalizeArray(entry.matches),
      downloadUrl: String(entry.downloadUrl || "").trim(),
      trusted: Boolean(entry.trusted),
    }))
    .filter((entry) => entry.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function validateTrustedCatalog(catalog = readTrustedCatalog()) {
  const errors = [];
  const ids = new Set();
  for (const entry of catalog) {
    if (!entry.id || ids.has(entry.id)) errors.push(`duplicate or missing trusted-catalog id: ${entry.id}`);
    ids.add(entry.id);
    if (typeof entry.trusted !== "boolean") errors.push(`${entry.id}: trusted must be boolean`);
    if (!Array.isArray(entry.pageScopes)) errors.push(`${entry.id}: pageScopes must be an array`);
  }
  return errors;
}

function collectFiles(directory, extensions = SOURCE_EXTENSIONS) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute, extensions));
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files.sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

function countLines(source) {
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let inBlockComment = false;
  let meaningful = 0;
  for (let line of lines) {
    let output = "";
    while (line.length > 0) {
      if (inBlockComment) {
        const end = line.indexOf("*/");
        if (end < 0) { line = ""; continue; }
        line = line.slice(end + 2);
        inBlockComment = false;
        continue;
      }
      const starts = [line.indexOf("/*"), line.indexOf("<!--")].filter((index) => index >= 0);
      const lineComment = line.search(/\/\//);
      if (lineComment >= 0) starts.push(lineComment);
      if (starts.length === 0) { output += line; line = ""; continue; }
      const start = Math.min(...starts);
      output += line.slice(0, start);
      if (line.startsWith("//", start)) line = "";
      else if (line.startsWith("<!--", start)) {
        const end = line.indexOf("-->", start + 4);
        if (end < 0) { line = ""; inBlockComment = true; }
        else line = line.slice(end + 3);
      } else {
        const end = line.indexOf("*/", start + 2);
        if (end < 0) { line = ""; inBlockComment = true; }
        else line = line.slice(end + 2);
      }
    }
    if (output.trim()) meaningful += 1;
  }
  return { physicalLines: lines.length, nonblankLines: meaningful };
}

function sourceRecords(files) {
  return files.map((filePath) => {
    const source = normalizeText(fs.readFileSync(filePath, "utf8"));
    const lines = countLines(source);
    return {
      path: relativePath(filePath),
      bytes: Buffer.byteLength(source),
      physicalLines: lines.physicalLines,
      nonblankLines: lines.nonblankLines,
    };
  });
}

function sourceShapeForAddon(addon) {
  const addonRoot = path.join(ROOT, path.dirname(addon.entry), "..");
  const files = sourceRecords(collectFiles(path.resolve(addonRoot, "src")));
  return {
    fileCount: files.length,
    authoredBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    physicalLines: files.reduce((sum, file) => sum + file.physicalLines, 0),
    nonblankLines: files.reduce((sum, file) => sum + file.nonblankLines, 0),
    files,
  };
}

function sourceFootprint(files) {
  const records = sourceRecords(files);
  return {
    fileCount: records.length,
    authoredBytes: records.reduce((sum, file) => sum + file.bytes, 0),
    physicalLines: records.reduce((sum, file) => sum + file.physicalLines, 0),
    nonblankLines: records.reduce((sum, file) => sum + file.nonblankLines, 0),
    files: records,
  };
}

function parseActionDescriptors() {
  const built = esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src/services/addons/coreActions.js")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    define: { __F95UE_DEBUG__: "false" },
    logLevel: "silent",
  });
  const module = { exports: {} };
  Function("module", "exports", "require", built.outputFiles[0].text)(module, module.exports, require);
  const validatorNames = {
    "page.getContext": "validatePageContextPayload",
    "storage.get": "keyPayload",
    "storage.set": "valuePayload",
    "idb.get": "keyPayload",
    "idb.put": "valuePayload",
    "idb.delete": "keyPayload",
  };
  return module.exports.getRegisteredAddonActionSnapshot().map((entry) => ({
    ...entry,
    payloadValidator: validatorNames[entry.id] || "objectPayload",
  }));
}

function parseActionPolicies() {
  const source = fs.readFileSync(path.join(ROOT, "src/services/addons/actions/policy.js"), "utf8");
  const policies = [];
  for (const match of source.matchAll(/"([^\"]+)"\s*:\s*"([^\"]+)"/g)) {
    policies.push({ id: match[1], scopePolicy: match[2] });
  }
  return policies.sort((a, b) => a.id.localeCompare(b.id));
}

function parseExports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const exports = new Set();
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) exports.add(match[1]);
  for (const match of source.matchAll(/\bexport\s*\{([\s\S]*?)\}/g)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name) exports.add(name);
    }
  }
  return [...exports].sort();
}

function parseStringConstants(files) {
  const records = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]*(?:KEY|EVENT|ID|NAME|STORE|INDEX|DB)[A-Z0-9_]*)\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      records.push({ path: relativePath(filePath), name: match[1], value: match[2] });
    }
  }
  return records.sort((a, b) => `${a.path}:${a.name}`.localeCompare(`${b.path}:${b.name}`));
}

function parseCoreAddonIdentifiers(addonSourceFiles) {
  const sharedFiles = [
    path.join(ROOT, "src/services/addons/shared.js"),
    path.join(ROOT, "src/services/addons/lifecycle.js"),
    path.join(ROOT, "src/services/addons/protocol.js"),
  ];
  const source = sharedFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const capabilities = [...(source.match(/VALID_ADDON_CAPABILITIES\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] || "").matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
  const events = [...new Set([...source.matchAll(/\b(?:ADDON_[A-Z_]+|ADDONS_[A-Z_]+)\s*=\s*"([^"]+)"/g)].map((match) => match[1]))].sort();
  const allFiles = [...sharedFiles, ...addonSourceFiles];
  return { capabilities, events, constants: parseStringConstants(allFiles) };
}

function deterministicHeader(addon) {
  const lines = [
    "// ==UserScript==",
    `// @name         ${addon.name}`,
    `// @namespace    https://github.com/Zenix-Al/f95-zone-highlighter/addons/${addon.id}`,
    `// @version      ${addon.version}`,
    `// @description  ${addon.description}`,
    `// @author       ${addon.author || "Unknown"}`,
    "// @icon         https://f95zone.to/data/avatars/l/1963/1963870.jpg",
    "// @license      GPL-3.0-or-later",
    "// @supportURL   https://f95zone.to/threads/f95zone-latest.250836/",
    "// @source       https://github.com/Zenix-Al/f95-zone-highlighter",
  ];
  for (const match of addon.matches) lines.push(`// @match        ${match}`);
  for (const grant of addon.grants) lines.push(`// @grant        ${grant}`);
  lines.push(`// @run-at       ${addon.runAt}`);
  lines.push("// ==/UserScript==");
  lines.push("// ------------------------------------------------------------");
  lines.push("// Deterministic ADDON-BASELINE-01 measurement header.");
  lines.push(addon.requiresCore
    ? "// Requires F95UE core userscript."
    : "// Standalone add-on.");
  lines.push("// ------------------------------------------------------------");
  return `${lines.join("\n")}\n`;
}

function normalizeMetafilePath(value) {
  return normalizePath(path.relative(ROOT, path.isAbsolute(value) ? value : path.resolve(ROOT, value)));
}

function bundleContributors(metafile) {
  const output = Object.values(metafile.outputs || {})[0] || { inputs: {} };
  return Object.entries(output.inputs || {}).map(([input, details]) => ({
    path: normalizeMetafilePath(input),
    bytes: details.bytesInOutput || 0,
  })).sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

async function buildAddon(addon, mode, tempDir) {
  const release = mode === "release";
  const outputPath = path.join(tempDir, `${addon.id}.${mode}.user.js`);
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [addon.entry],
    bundle: true,
    format: "iife",
    legalComments: "none",
    loader: { ".html": "text", ".css": "text" },
    minifyWhitespace: release,
    minifyIdentifiers: false,
    minifySyntax: release,
    plugins: release ? [normalizedTextAssets, stripDebugLogs] : [normalizedTextAssets],
    metafile: true,
    outfile: outputPath,
    define: {
      __ADDON_ID__: JSON.stringify(addon.id),
      __ADDON_NAME__: JSON.stringify(addon.name),
      __ADDON_VERSION__: JSON.stringify(addon.version),
      __ADDON_DESCRIPTION__: JSON.stringify(addon.description),
      __ADDON_CAPABILITIES__: JSON.stringify(addon.capabilities),
      __ADDON_REQUIRES_CORE__: addon.requiresCore ? "true" : "false",
    },
    write: true,
    logLevel: "silent",
  });
  let code = fs.readFileSync(outputPath, "utf8");
  if (release && terser) {
    const minified = await terser.minify(code, {
      compress: false,
      mangle: {
        reserved: ["GM_setValue", "GM_getValue", "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_xmlhttpRequest", "GM_openInTab", "GM_registerMenuCommand", "GM_unregisterMenuCommand", "unsafeWindow", "window", "document"],
        keep_fnames: true,
      },
      format: { beautify: true, comments: false },
    });
    if (minified.error) throw minified.error;
    code = minified.code;
  }
  fs.writeFileSync(outputPath, `${deterministicHeader(addon)}${code}\n`);
  const bytes = fs.readFileSync(outputPath);
  return {
    mode,
    bytes: bytes.length,
    gzipBytes: zlib.gzipSync(bytes, { mtime: 0 }).length,
    contributors: bundleContributors(result.metafile).slice(0, 20),
  };
}

function snapshotWorkingTree() {
  const tracked = childProcess.execFileSync("git", ["ls-files", "dist", "addons"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/).filter((file) => file && !file.includes("/.build-cache.json") && !file.includes("/dist/")).sort();
  const files = ["version.json", "addons/addons.manifest.json", "addons/.build-cache.json", ...tracked]
    .filter((file, index, all) => all.indexOf(file) === index && fs.existsSync(path.join(ROOT, file)))
    .map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")]);
  return { files, status: childProcess.execFileSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" }) };
}

function behaviorSnapshots() {
  return {
    registration: {
      requestEvent: "f95ue:addons-dev-command",
      requestType: "register",
      responseProjection: ["id", "name", "version", "description", "status", "capabilities", "pageScopes"],
      postRegistrationEvent: "after-register",
    },
    enable: {
      coreCommand: "enable",
      state: { status: "installed", enabled: true },
      emittedEvents: ["enable"],
      persistence: ["addons.byAddon", "addons.installedMeta"],
    },
    disable: {
      coreCommand: "disable",
      state: { status: "disabled", enabled: false },
      emittedEvents: ["before-disable", "teardown", "disable"],
      cleanup: ["observers", "ui", "styles", "dialogs", "mounts"],
    },
    refresh: { coreCommand: "refresh", emittedEvents: ["refresh"] },
    beforePageChange: { coreCommand: "before-page-change", cleanupBeforeNotification: true },
    teardown: { coreCommand: "teardown", acknowledgment: "teardown-complete", watchdogMs: 1200, acknowledgmentRequired: true },
    coreAbsent: { ping: { ok: false }, coreRequiredResult: "exit-without-registration" },
    outOfScopeAction: { featureToggle: "allowed-for-management", otherActions: "addon_out_of_scope" },
    capabilityRejection: { result: { ok: false, reason: "permission_denied" } },
  };
}

function validateStructure(addons) {
  const errors = [];
  const ids = new Set();
  for (const addon of addons) {
    if (!addon.id || ids.has(addon.id)) errors.push(`duplicate or missing add-on id: ${addon.id}`);
    ids.add(addon.id);
    if (!fs.existsSync(path.join(ROOT, addon.entry))) errors.push(`${addon.id}: missing entry ${addon.entry}`);
    if (!addon.outfile.startsWith(`addons/${addon.id}/dist/`)) errors.push(`${addon.id}: outfile is outside its dist directory`);
    if (!addon.runAt) errors.push(`${addon.id}: missing runAt`);
    if (!Array.isArray(addon.matches) || addon.matches.length === 0) errors.push(`${addon.id}: missing matches`);
    if (!addon.runtimeMode) errors.push(`${addon.id}: missing runtimeMode`);
    if (!Array.isArray(addon.pageScopes)) errors.push(`${addon.id}: missing pageScopes`);
  }
  return errors;
}

async function createBaseline({ rootDir = ROOT } = {}) {
  if (path.resolve(rootDir) !== path.resolve(ROOT)) throw new Error("The add-on baseline currently runs from the repository root.");
  const addons = readManifest();
  const structureErrors = validateStructure(addons);
  if (structureErrors.length) throw new Error(structureErrors.join("\n"));
  const catalogErrors = validateTrustedCatalog();
  if (catalogErrors.length) throw new Error(catalogErrors.join("\n"));
  const before = snapshotWorkingTree();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "f95ue-addon-baseline-"));
  try {
    const addonReports = [];
    for (const addon of addons) {
      const source = sourceShapeForAddon(addon);
      addonReports.push({
        id: addon.id,
        source,
        builds: {
          regular: await buildAddon(addon, "regular", tempDir),
          release: await buildAddon(addon, "release", tempDir),
        },
      });
    }
    const after = snapshotWorkingTree();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Add-on baseline build changed repository state.");

    const addonSourceFiles = addons.flatMap((addon) => collectFiles(path.resolve(path.join(ROOT, path.dirname(addon.entry), ".."), "src")));
    const serviceFile = path.join(ROOT, "src/services/addonsService.js");
    const addonServiceFiles = collectFiles(path.join(ROOT, "src/services/addons"), SERVICE_SOURCE_EXTENSIONS);
    const addonUiFiles = [
      ...collectFiles(path.join(ROOT, "src/ui/components/addons")),
      path.join(ROOT, "src/ui/renderers/addonsRenderer.js"),
    ].filter((filePath) => fs.existsSync(filePath));
    const serviceExports = parseExports(serviceFile);
    const actions = parseActionDescriptors();
    const identifiers = parseCoreAddonIdentifiers(addonSourceFiles);
    return {
      reportSchemaVersion: BASELINE_SCHEMA_VERSION,
      tool: "addon-baseline",
      scope: {
        included: ["addons/** source", "src/services/addonsService.js", "src/services/addons/**", "src/ui/components/addons/**", "src/ui/renderers/addonsRenderer.js"],
        excluded: ["addons/**/dist/**", "addons/.build-cache.json", "generated catalog output", "timestamps", "absolute machine paths"],
      },
      manifest: { entries: addons },
      trustedCatalog: {
        source: `src/generated/${readJson(TRUSTED_CATALOG_META_PATH).catalogFile}`,
        projection: readTrustedCatalog(),
        runtimeFreshDefault: false,
      },
      publicActions: actions,
      actionPolicies: parseActionPolicies(),
      serviceExports,
      identifiers: {
        addonIds: addons.map((addon) => addon.id).sort(),
        capabilities: identifiers.capabilities,
        coreEvents: identifiers.events,
        sourceConstants: identifiers.constants,
      },
      behaviorSnapshots: behaviorSnapshots(),
      addons: addonReports.sort((a, b) => a.id.localeCompare(b.id)),
      coreServiceFootprint: {
        addonsService: sourceFootprint([serviceFile]),
        servicesAddons: sourceFootprint(addonServiceFiles),
        uiIntegration: sourceFootprint(addonUiFiles),
      },
      trustGatingContradiction: {
        status: "not-reproduced",
        fixture: null,
        reason: "No executable contradiction fixture is present in the repository; the observed Masked + Direct status-message path is retained for ADDON-TRUST-GATING-01.",
        sourceEvidence: [
          "addons/masked-direct-addon/src/main.js#statusMessage",
          "addons/masked-direct-addon/src/main.js#refreshAccessState",
          "src/services/addons/knownAddons.js#buildKnownAddonsSnapshot",
        ],
      },
      deterministic: {
        outputHasTimestamps: false,
        outputHasAbsolutePaths: false,
        buildsUseTemporaryOutput: true,
        productionBuilderInvoked: false,
        versionsUpdated: false,
        cacheUpdated: false,
        trackedDistUpdated: false,
      },
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runSmokeBuild({ rootDir = ROOT } = {}) {
  const before = snapshotWorkingTree();
  const report = await createBaseline({ rootDir });
  const after = snapshotWorkingTree();
  return { report, unchanged: JSON.stringify(before) === JSON.stringify(after) };
}

function parseArgs(args) {
  const options = { output: null, check: null, smoke: false, structure: false, catalog: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output") options.output = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--check") options.check = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--smoke-build") options.smoke = true;
    else if (args[index] === "--check-structure") options.structure = true;
    else if (args[index] === "--check-catalog") options.catalog = true;
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const addons = readManifest();
  const errors = validateStructure(addons);
  if (options.structure) {
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Add-on structure check passed.");
    return;
  }
  if (options.catalog) {
    const catalogErrors = validateTrustedCatalog();
    if (catalogErrors.length) throw new Error(catalogErrors.join("\n"));
    console.log("Trusted catalog check passed.");
    return;
  }
  const report = await createBaseline();
  if (options.smoke) {
    console.log(stableJson({ tool: "addon-baseline", smokeBuild: report.deterministic }));
    return;
  }
  const output = stableJson(report);
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output);
    console.log(`Wrote ${normalizePath(path.relative(ROOT, options.output))}.`);
  } else if (options.check) {
    const expected = fs.readFileSync(options.check, "utf8");
    if (expected !== output) throw new Error(`Add-on baseline differs from ${normalizePath(path.relative(ROOT, options.check))}.`);
    console.log("Add-on baseline check passed.");
  } else console.log(output);
}

if (require.main === module) main().catch((error) => { console.error(`Add-on baseline failed: ${error.message}`); process.exitCode = 1; });

module.exports = {
  createBaseline,
  normalizeText,
  parseActionDescriptors,
  readManifest,
  readTrustedCatalog,
  runSmokeBuild,
  snapshotWorkingTree,
  stableJson,
  validateTrustedCatalog,
  validateStructure,
};
