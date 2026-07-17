#!/usr/bin/env node

/* Deterministic, read-only measurement of the accepted add-on architecture. */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "docs", "architecture", "addon-baseline.json");
const CORE_SERVICE_PREFIXES = [
  "src/services/addonsService.js",
  "src/services/addons/",
  "src/ui/components/addons/",
  "src/ui/renderers/addonsRenderer.js",
];
const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".json", ".css", ".html"]);
const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);

const { readManifest } = require("./addon-catalog.cjs");
const { buildAddonToPath } = require("../addons/build-addon.js");
const { normalizeMetafile } = require("./addon-build-tools.cjs");
const { parseActionDescriptors } = require("./addon-baseline.cjs");
const { runCoreSmokeBuild } = require("./core-source-audit.cjs");

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativePath(value) {
  const relative = normalizePath(path.relative(ROOT, path.resolve(ROOT, value)));
  return relative && !relative.startsWith("../") && !path.isAbsolute(relative) ? relative : "<external>";
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(absolute);
      return entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [absolute] : [];
    });
}

function countLines(source) {
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let inBlock = false;
  let nonblank = 0;
  for (let line of lines) {
    let output = "";
    while (line.length) {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end < 0) { line = ""; continue; }
        line = line.slice(end + 2); inBlock = false; continue;
      }
      const candidates = [line.indexOf("/*"), line.indexOf("<!--")].filter((index) => index >= 0);
      const lineComment = line.search(/\/\//);
      if (lineComment >= 0) candidates.push(lineComment);
      if (!candidates.length) { output += line; line = ""; continue; }
      const start = Math.min(...candidates);
      output += line.slice(0, start);
      if (line.startsWith("//", start)) line = "";
      else if (line.startsWith("<!--", start)) {
        const end = line.indexOf("-->", start + 4);
        if (end < 0) { line = ""; inBlock = true; } else line = line.slice(end + 3);
      } else {
        const end = line.indexOf("*/", start + 2);
        if (end < 0) { line = ""; inBlock = true; } else line = line.slice(end + 2);
      }
    }
    if (output.trim()) nonblank += 1;
  }
  return { physicalLines: lines.length, nonblankLines: nonblank };
}

function sourceRecord(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const lines = countLines(source);
  return { path: relativePath(filePath), bytes: Buffer.byteLength(source), ...lines };
}

function footprint(files) {
  const records = files.map(sourceRecord).sort((a, b) => a.path.localeCompare(b.path));
  return {
    fileCount: records.length,
    authoredBytes: records.reduce((sum, item) => sum + item.bytes, 0),
    physicalLines: records.reduce((sum, item) => sum + item.physicalLines, 0),
    nonblankLines: records.reduce((sum, item) => sum + item.nonblankLines, 0),
    largestFiles: [...records].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 20),
    files: records,
  };
}

function coreFiles() {
  const files = [path.join(ROOT, "src", "services", "addonsService.js")];
  files.push(...collectFiles(path.join(ROOT, "src", "services", "addons")));
  files.push(...collectFiles(path.join(ROOT, "src", "ui", "components", "addons")));
  files.push(path.join(ROOT, "src", "ui", "renderers", "addonsRenderer.js"));
  return [...new Set(files)].filter((file) => fs.existsSync(file) && relativePath(file) !== "src/services/addons/trusted-catalog.json");
}

function generatedCatalogFiles() {
  const generated = path.join(ROOT, "src", "generated");
  const files = fs.existsSync(generated)
    ? collectFiles(generated).filter((file) => /trusted-addon-(?:catalog|aliases)/.test(path.basename(file)))
    : [];
  const legacy = path.join(ROOT, "src", "services", "addons", "trusted-catalog.json");
  if (fs.existsSync(legacy)) files.push(legacy);
  return files;
}

function parseModule(source) {
  const imports = [];
  const importedNames = [];
  const pattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|require\s*\()(["'])([^"'\n]+)\1/g;
  for (const match of source.matchAll(pattern)) {
    imports.push(match[2]);
    const statement = source.slice(Math.max(0, source.lastIndexOf("\n", match.index) + 1), match.index + match[0].length);
    for (const name of (statement.match(/\{([^}]+)\}/)?.[1] || "").split(",")) {
      const imported = name.trim().split(/\s+as\s+/)[0].trim();
      if (imported) importedNames.push(imported);
    }
    if (/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/.test(statement)) importedNames.push(RegExp.$1);
  }
  const exports = [];
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) exports.push(match[1]);
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const name of match[1].split(",")) {
      const exported = name.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (exported) exports.push(exported);
    }
  }
  return { imports: [...new Set(imports)], importedNames: [...new Set(importedNames)], exports: [...new Set(exports)] };
}

function resolveImport(importer, request, filesByPath) {
  if (!request.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), request);
  const candidates = [base, ...[...JS_EXTENSIONS].map((ext) => `${base}${ext}`), `${base}.json`, `${base}.css`, `${base}.html`, path.join(base, "index.js")];
  return candidates.map(relativePath).find((candidate) => filesByPath.has(candidate)) || null;
}

function graphForFiles(files) {
  const filesByPath = new Map(files.map((file) => [relativePath(file), file]));
  const nodes = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const parsed = parseModule(source);
    const edges = parsed.imports.map((request) => resolveImport(file, request, filesByPath)).filter(Boolean);
    nodes.set(relativePath(file), { ...parsed, edges: [...new Set(edges)].sort() });
  }
  return nodes;
}

function graphReport(files) {
  const nodes = graphForFiles(files);
  const fanIn = new Map([...nodes.keys()].map((key) => [key, 0]));
  for (const node of nodes.values()) for (const edge of node.edges) fanIn.set(edge, (fanIn.get(edge) || 0) + 1);
  const cycles = [];
  const visited = new Set();
  const active = [];
  function visit(name) {
    if (active.includes(name)) {
      cycles.push(active.slice(active.indexOf(name)).concat(name).join(" -> ")); return;
    }
    if (visited.has(name)) return;
    active.push(name);
    for (const edge of nodes.get(name)?.edges || []) visit(edge);
    active.pop(); visited.add(name);
  }
  for (const name of [...nodes.keys()].sort()) visit(name);
  const filesReport = [...nodes.keys()].sort().map((pathName) => ({
    path: pathName,
    fanIn: fanIn.get(pathName) || 0,
    fanOut: nodes.get(pathName).edges.length,
    exports: nodes.get(pathName).exports,
  }));
  const imported = new Set([...nodes.values()].flatMap((node) => node.importedNames));
  const unreferencedExports = filesReport.flatMap((file) => file.exports.filter((name) => name !== "default" && !imported.has(name)).map((name) => `${file.path}#${name}`));
  const exportOwners = new Map();
  const helperOwners = new Map();
  const addOwner = (owners, name, file) => {
    if (!owners.has(name)) owners.set(name, []);
    owners.get(name).push(file);
  };
  for (const [file, node] of nodes) {
    for (const name of node.exports) addOwner(exportOwners, name, file);
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const match of source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) addOwner(helperOwners, match[1], file);
  }
  const duplicates = (owners) => Object.entries(Object.fromEntries(owners)).filter(([, paths]) => paths.length > 1).sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => ({ name, paths: paths.sort() }));
  return {
    files: filesReport,
    cycles: [...new Set(cycles)].sort(),
    orphanFiles: filesReport.filter((file) => file.fanIn === 0).map((file) => file.path),
    unreferencedExports: unreferencedExports.sort(),
    duplicateExports: duplicates(exportOwners),
    duplicateHelpers: duplicates(helperOwners),
  };
}

function pathStarts(pathName, prefixes) {
  return prefixes.some((prefix) => pathName === prefix || pathName.startsWith(prefix));
}

function coreCategory(pathName) {
  if (pathName === "src/services/addonsService.js") return "facade";
  if (pathName.startsWith("src/services/addons/actions/")) return "actions";
  if (/registry|state|knownAddons/.test(path.basename(pathName))) return "registry-state";
  if (/catalog/.test(path.basename(pathName))) return "catalog-projection";
  if (/lifecycle|teardown/.test(path.basename(pathName))) return "lifecycle-teardown";
  if (/bridge|bootstrap|protocol/.test(path.basename(pathName))) return "bridge-transport";
  if (/access|invocation|scope|apiPolicy|actionRuntime/.test(path.basename(pathName))) return "post-registration-policy";
  if (/idb|observer/.test(path.basename(pathName))) return "storage-idb-observer";
  if (/sanitizer|uiHost/.test(path.basename(pathName))) return "ui-sanitizer-ownership";
  if (pathName.startsWith("src/ui/")) return "core-ui-integration";
  return "other";
}

function categorizeCore(files) {
  const result = {};
  for (const file of files) {
    const category = coreCategory(relativePath(file));
    (result[category] ||= []).push(file);
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, footprint(values)]));
}

function baselineAddon(baseline, id) {
  return (baseline?.addons || []).find((addon) => addon.id === id) || null;
}

function delta(current, before) {
  return { current, baseline: before ?? null, delta: before === undefined || before === null ? null : current - before };
}

function outputContributors(metafile) {
  const normalized = normalizeMetafile(metafile);
  const output = Object.values(normalized?.outputs || {})[0] || { inputs: {} };
  return Object.entries(output.inputs || {})
    .map(([file, details]) => ({ path: file, bytes: details.bytesInOutput || 0 }))
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

function contribution(contributors, predicate) {
  const items = contributors.filter((item) => predicate(item.path));
  return { bytes: items.reduce((sum, item) => sum + item.bytes, 0), contributors: items.slice(0, 20) };
}

function addonBoundary(pathName) {
  const match = pathName.match(/^addons\/[^/]+\/src\/([^/]+)/);
  return match ? match[1] : "entry-or-other";
}

function addonSource(addon) {
  return collectFiles(path.join(ROOT, "addons", addon.id, "src"));
}

function actionFamilies(actions, files) {
  const families = {};
  const actionFiles = files.filter((file) => file.includes(`${path.sep}actions${path.sep}families${path.sep}`));
  for (const action of actions) {
    const family = action.id.split(".")[0];
    (families[family] ||= { family, actionIds: [], sourceFiles: [], actions: [] });
    families[family].actionIds.push(action.id);
    families[family].actions.push(action);
  }
  for (const family of Object.values(families)) {
    const matching = actionFiles.filter((file) => path.basename(file, path.extname(file)) === family.family
      || (family.family === "config" && path.basename(file, path.extname(file)) === "storage")
      || (family.family === "feature" && path.basename(file, path.extname(file)) === "lifecycle"));
    family.sourceFiles = matching.map(relativePath).sort();
    const source = matching.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const roleBytes = (pattern) => source.split(/\r?\n/).filter((line) => pattern.test(line)).reduce((sum, line) => sum + Buffer.byteLength(line + "\n"), 0);
    family.sourceBytes = Buffer.byteLength(source);
    family.roleMeasurement = "matched source-line bytes; shared composition/policy bytes are reported separately";
    family.descriptorBytes = roleBytes(/\b(?:id|protocolVersion|requiredCapabilities|timeoutMs|auditCategory|scopePolicy)\s*:/);
    family.validatorBytes = roleBytes(/\b(?:validatePayload|validate[A-Z]|Payload)\b/);
    family.executorBytes = roleBytes(/\b(?:execute|action[A-Z]|function)\b/);
    family.actionIds.sort();
    family.actions.sort((a, b) => a.id.localeCompare(b.id));
    family.sourceFiles.sort();
  }
  const supportFiles = files.filter((file) => /actions[\\/](composition|contract|policy|registry)\.js$/.test(file));
  return { families: Object.values(families).sort((a, b) => a.family.localeCompare(b.family)), support: footprint(supportFiles) };
}

function parseFacadeExports() {
  const source = fs.readFileSync(path.join(ROOT, "src", "services", "addonsService.js"), "utf8");
  const names = new Set();
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) names.add(match[1]);
  return [...names].sort();
}

function facadeConsumers(files) {
  const exports = parseFacadeExports();
  const sourceFiles = collectFiles(path.join(ROOT, "src")).filter((file) => relativePath(file) !== "src/services/addonsService.js" && JS_EXTENSIONS.has(path.extname(file)));
  return exports.map((name) => {
    const callers = sourceFiles.filter((file) => new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`).test(fs.readFileSync(file, "utf8"))).map(relativePath);
    return { export: name, consumerCount: callers.length, callers };
  });
}

const ACTION_CAPABILITY = {
  "toast.show": "toast", "feature.enable": "feature", "feature.disable": "feature", "feature.refresh": "feature",
  "storage.get": "storage", "storage.set": "storage", "storage.getUsage": "storage", "config.getTagPrefs": "storage",
  "page.getContext": "page", "idb.get": "idb", "idb.put": "idb", "idb.delete": "idb", "idb.bulkPut": "idb", "idb.bulkDelete": "idb", "idb.query": "idb", "idb.count": "idb",
  "observer.watch": "observer", "observer.unwatch": "observer", "observer.waitFor": "observer",
  "ui.dock.setButtons": "ui.dock", "ui.dock.removeButtons": "ui.dock", "ui.mount": "ui.mount", "ui.update": "ui.mount", "ui.unmount": "ui.mount",
  "ui.dialog.open": "ui.dialog", "ui.dialog.close": "ui.dialog", "ui.dialog.update": "ui.dialog", "ui.confirm": "ui.dialog",
  "ui.style.register": "ui.style", "ui.style.unregister": "ui.style",
};

function allAddonSourceFiles(addons) { return addons.flatMap(addonSource); }

function actionConsumers(actions, files) {
  return actions.map((action) => {
    const callers = files.filter((file) => fs.readFileSync(file, "utf8").includes(`\"${action.id}\"`) || fs.readFileSync(file, "utf8").includes(`'${action.id}'`)).map(relativePath);
    return { action: action.id, capability: action.requiredCapabilities?.[0] || ACTION_CAPABILITY[action.id] || null, consumerCount: callers.length, callers };
  });
}

function sharedHelpers(addons, allFiles, builds) {
  const sharedFiles = collectFiles(path.join(ROOT, "addons", "shared")).filter((file) => JS_EXTENSIONS.has(path.extname(file)));
  const nodes = graphForFiles([...allFiles, ...sharedFiles]);
  return sharedFiles.map((file) => {
    const pathName = relativePath(file);
    const consumers = [...nodes.entries()].filter(([, node]) => node.edges.includes(pathName)).map(([name]) => name).sort();
    const addonIds = [...new Set(consumers.map((name) => name.match(/^addons\/([^/]+)\//)?.[1]).filter(Boolean))].sort();
    const perBuild = builds.flatMap((build) => build.contributors.filter((item) => item.path === pathName).map((item) => ({ addonId: build.addonId, mode: build.mode, bytes: item.bytes })));
    return {
      helper: pathName,
      sourceBytes: Buffer.byteLength(fs.readFileSync(file)),
      consumerCount: addonIds.length,
      consumers: addonIds,
      importers: consumers,
      oneConsumer: addonIds.length === 1,
      bundledBytes: perBuild.sort((a, b) => a.addonId.localeCompare(b.addonId) || a.mode.localeCompare(b.mode)),
      treeShaking: "bundle contribution is reported per add-on/mode; source bytes are not assumed to be fully emitted",
    };
  }).sort((a, b) => a.helper.localeCompare(b.helper));
}

function rawDuplication(actions, addonFiles) {
  const events = ["f95ue:addons-dev-command", "f95ue:addon-command"];
  const actionStrings = actions.map((action) => action.id);
  const count = (value) => addonFiles.flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    const occurrences = source.split(value).length - 1;
    return occurrences ? [{ path: relativePath(file), occurrences }] : [];
  });
  return {
    actions: actionStrings.map((action) => ({ value: action, occurrences: count(action) })).filter((entry) => entry.occurrences.length),
    events: events.map((event) => ({ value: event, occurrences: count(event) })).filter((entry) => entry.occurrences.length),
    decision: "raw bridge strings remain confined to adaptors/shared runtime; no transport redesign is part of this audit",
  };
}

function capabilityAudit(addons, addonFilesById, actions) {
  return addons.map((addon) => {
    const files = addonFilesById.get(addon.id) || [];
    const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    const used = new Set();
    for (const action of actions) if (source.includes(`\"${action.id}\"`) || source.includes(`'${action.id}'`)) used.add(ACTION_CAPABILITY[action.id] || action.requiredCapabilities?.[0]);
    if (/invokeCoreAction\("feature\.|feature\.|createCoreRuntime|runtimeMode|requiresCore/.test(source) || addon.runtimeMode === "core-required") used.add("feature");
    for (const capability of addon.capabilities || []) {
      const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped.replace(/\\\./g, "\\\\.")}\\b`).test(source)) used.add(capability);
    }
    if (/ui\./.test(source)) used.add("ui");
    const declared = [...(addon.capabilities || [])].sort();
    const unused = declared.filter((capability) => !used.has(capability) && !(capability === "ui" && [...used].some((value) => value?.startsWith("ui."))));
    return { addonId: addon.id, declared, evidenceUsed: [...used].filter(Boolean).sort(), unusedDeclaredCapabilities: unused, confidence: "conservative; registration and lifecycle capabilities may not have action-string evidence" };
  });
}

function cssDuplication(addons) {
  const selectors = new Map();
  for (const addon of addons) for (const file of addonSource(addon).filter((entry) => path.extname(entry) === ".css")) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/([^{}]+)\{/g)) {
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " ");
      if (!selector || selector.startsWith("@")) continue;
      const record = selectors.get(selector) || { selector, addons: [], bytes: Buffer.byteLength(match[1]) };
      if (!record.addons.includes(addon.id)) record.addons.push(addon.id);
      selectors.set(selector, record);
    }
  }
  return [...selectors.values()].filter((item) => item.addons.length > 1).sort((a, b) => b.addons.length - a.addons.length || a.selector.localeCompare(b.selector)).slice(0, 20).map((item) => ({ ...item, decision: "retain-local; sharing would add coupling and may increase every bundle" }));
}

function catalogFields() {
  return ["id", "name", "description", "version", "pageScopes", "runtimeMode", "matches", "downloadUrl", "capabilities", "trusted"].map((field) => ({
    field,
    copies: ["manifest", "generated-catalog", "runtime-injected-metadata"],
    decision: "retain; manifest-to-catalog and build-to-runtime copies serve separate validation, delivery, and execution contracts",
  }));
}

function baselineDeltas(current, before) {
  return {
    authoredBytes: delta(current.source.authoredBytes, before?.source?.authoredBytes),
    regularBytes: delta(current.builds.regular.bytes, before?.builds?.regular?.bytes),
    releaseBytes: delta(current.builds.release.bytes, before?.builds?.release?.bytes),
    regularGzipBytes: delta(current.builds.regular.gzipBytes, before?.builds?.regular?.gzipBytes),
    releaseGzipBytes: delta(current.builds.release.gzipBytes, before?.builds?.release?.gzipBytes),
    owningFiles: current.source.largestFiles.slice(0, 5).map((file) => file.path),
    behaviorDelta: "No behavior change is made or inferred by this measurement package; accepted behavior is covered by TEST-ADDONS-01.",
  };
}

async function buildAddonMetrics(addons, baseline, tempDir) {
  const records = [];
  const builds = [];
  for (const addon of addons) {
    const files = addonSource(addon);
    const source = footprint(files);
    const modes = {};
    for (const mode of ["regular", "release"]) {
      const outputPath = path.join(tempDir, `${addon.id}.${mode}.user.js`);
      const built = await buildAddonToPath(addon, mode === "release", { outputPath, deterministicHeader: true, metafile: true });
      const bytes = fs.readFileSync(outputPath);
      const contributors = outputContributors(built.metafile);
      const shared = contribution(contributors, (value) => value.startsWith("addons/shared/"));
      const ui = contribution(contributors, (value) => value.startsWith(`addons/${addon.id}/src/ui/`) || /\.(css|html)$/.test(value));
      const data = contribution(contributors, (value) => /(?:storage|idb|library|import|repository|prefs|state)/i.test(value));
      modes[mode] = {
        bytes: bytes.length,
        gzipBytes: zlib.gzipSync(bytes, { mtime: 0 }).length,
        headerBytes: Buffer.byteLength(built.header),
        contributors: contributors.slice(0, 20),
        sharedRuntime: shared,
        uiCss: ui,
        storageIdbDomain: data,
      };
      builds.push({ addonId: addon.id, mode, contributors });
    }
    const before = baselineAddon(baseline, addon.id);
    records.push({
      addonId: addon.id,
      authoredBoundary: Object.fromEntries([...new Set(files.map(addonBoundary))].sort().map((boundary) => [boundary, footprint(files.filter((file) => addonBoundary(relativePath(file)) === boundary))])),
      source,
      builds: modes,
      manifest: {
        version: addon.version,
        pageScopes: [...(addon.pageScopes || [])],
        runtimeMode: addon.runtimeMode,
        headerBytes: Object.fromEntries(Object.entries(modes).map(([mode, value]) => [mode, value.headerBytes])),
        compatibility: { matches: addon.matches, grants: addon.grants, runAt: addon.runAt },
      },
      thirdPartyOrVendored: [...new Set(Object.values(modes).flatMap((mode) => mode.contributors.map((item) => item.path).filter((value) => !value.startsWith("addons/") && !value.startsWith("src/"))))].sort(),
      baseline: baselineDeltas({ source, builds: modes }, before),
    });
  }
  return { records, builds };
}

function coreReport(coreFilesList, coreBuild) {
  const source = footprint(coreFilesList);
  const categories = categorizeCore(coreFilesList);
  const coreContributors = (build) => build.contributors.filter((item) => pathStarts(item.path, CORE_SERVICE_PREFIXES));
  return {
    source,
    categories,
    graph: graphReport(coreFilesList),
    bundle: Object.fromEntries([["readable", coreBuild.readable], ["uglified", coreBuild.uglified]].map(([mode, build]) => {
      const contributors = coreContributors(build);
      return [mode, { bytes: build.bytes, gzipBytes: build.gzipBytes, contributionBytes: contributors.reduce((sum, item) => sum + item.bytes, 0), contributors: contributors.slice(0, 20) }];
    })),
    topContributors: coreContributors(coreBuild.uglified).slice(0, 10),
  };
}

function sourceDeltas(current, baseline) {
  const before = baseline?.coreServiceFootprint || {};
  const legacyCatalog = before.servicesAddons?.files?.find((file) => file.path === "src/services/addons/trusted-catalog.json")?.bytes || 0;
  const baselineBytes = (before.addonsService?.authoredBytes || 0) + (before.servicesAddons?.authoredBytes || 0) + (before.uiIntegration?.authoredBytes || 0) - legacyCatalog;
  return { authoredBytes: delta(current.source.authoredBytes, baselineBytes), owningFiles: current.source.largestFiles.slice(0, 10).map((file) => file.path), bundleBaseline: "ADDON-BASELINE-01 did not record a core bundle baseline; current smoke-build contribution is reported without a fabricated delta" };
}

function makeSummary(addonMetrics, core, shared, generated) {
  const addonSourceBytes = addonMetrics.reduce((sum, addon) => sum + addon.source.authoredBytes, 0);
  const addonRegularBytes = addonMetrics.reduce((sum, addon) => sum + addon.builds.regular.bytes, 0);
  const addonReleaseBytes = addonMetrics.reduce((sum, addon) => sum + addon.builds.release.bytes, 0);
  return {
    coreService: { authoredBytes: core.source.authoredBytes, readableBytes: core.bundle.readable.bytes, uglifiedBytes: core.bundle.uglified.bytes, readableGzipBytes: core.bundle.readable.gzipBytes, uglifiedGzipBytes: core.bundle.uglified.gzipBytes },
    addons: { count: addonMetrics.length, authoredBytes: addonSourceBytes, regularBytes: addonRegularBytes, releaseBytes: addonReleaseBytes, regularGzipBytes: addonMetrics.reduce((sum, addon) => sum + addon.builds.regular.gzipBytes, 0), releaseGzipBytes: addonMetrics.reduce((sum, addon) => sum + addon.builds.release.gzipBytes, 0) },
    sharedRuntime: { authoredBytes: shared.reduce((sum, item) => sum + item.sourceBytes, 0), helperCount: shared.length },
    generatedMetadata: { authoredBytes: generated.reduce((sum, item) => sum + item.bytes, 0), fileCount: generated.length },
    testsExcludedFromProductionTotals: true,
    measurementNote: "Authored source totals are UTF-8 bytes from production source only; build totals include deterministic userscript headers; gzip uses gzipSync with mtime 0.",
  };
}

async function createReport({ rootDir = ROOT } = {}) {
  if (path.resolve(rootDir) !== ROOT) throw new Error("This repository audit currently requires the repository root as cwd.");
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const addons = readManifest().slice().sort((a, b) => a.id.localeCompare(b.id));
  const actions = parseActionDescriptors().sort((a, b) => a.id.localeCompare(b.id));
  const coreFilesList = coreFiles();
  const addonFilesById = new Map(addons.map((addon) => [addon.id, addonSource(addon)]));
  const addonFiles = allAddonSourceFiles(addons);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "f95ue-addon-size-audit-"));
  try {
    const coreBuild = await runCoreSmokeBuild({ rootDir: ROOT });
    const built = await buildAddonMetrics(addons, baseline, tempDir);
    const shared = sharedHelpers(addons, addonFiles, built.builds);
    const core = coreReport(coreFilesList, coreBuild);
    const generated = generatedCatalogFiles().map(sourceRecord).sort((a, b) => a.path.localeCompare(b.path));
    const actionFamilyReport = actionFamilies(actions, coreFilesList);
    const addonConsumers = actionConsumers(actions, addonFiles);
    const approvedApis = ["page.getContext", "observer.waitFor", "ui.dialog.update"].map((action) => addonConsumers.find((entry) => entry.action === action));
    const facade = facadeConsumers(coreFilesList);
    const security = {
      registrationHandshake: { status: "deferred", changed: false, owners: ["src/services/addons/bridgeServer.js", "addons/shared/coreBridge.js"], note: "Handshake transport and security are measured separately and are unchanged by this audit." },
      trustAccessPolicy: { status: "retained", owners: ["src/services/addons/access.js", "src/services/addons/knownAddons.js", "src/services/addons/registry.js", "src/services/addons/invocation.js", "src/ui/components/addons/addonCard.js"], note: "The accepted resolver keeps effective trust, badge, blocked reason, and enable-control state coherent." },
    };
    const duplication = {
      rawActionAndEventStrings: rawDuplication(actions, addonFiles),
      catalogFields: catalogFields(),
      repeatedUiMarkupAndCss: cssDuplication(addons),
      accepted: [
        { area: "add-on API wrappers and domain selectors", rationale: "Keeping these local avoids coupling and prevents shared code from entering every bundle." },
        { area: "Masked Direct host adapters", rationale: "Hybrid external-host behavior has distinct lifecycle and security ownership." },
        { area: "catalog publication", rationale: "The generated current feed and legacy service-folder publication serve different release compatibility paths." },
        { area: "bridge wrappers", rationale: "Small per-add-on adaptors preserve explicit ownership while shared transport remains tree-shakeable." },
        { area: "facade and UI barrel re-exports", rationale: "Repeated export names are compatibility projections, not duplicated runtime implementations; removing them would change established import boundaries." },
      ],
    };
    const candidates = {
      facadeExports: facade.filter((entry) => entry.consumerCount === 0),
      oneConsumerApis: addonConsumers.filter((entry) => entry.consumerCount === 1),
      oneConsumerHelpers: shared.filter((entry) => entry.oneConsumer),
      unusedCapabilities: capabilityAudit(addons, addonFilesById, actions).filter((entry) => entry.unusedDeclaredCapabilities.length),
    };
    const futureReductions = [
      { priority: 1, kind: "safe deletion candidate", evidence: "Review facade exports with zero source callers before removal; preserve public import compatibility until release policy permits it.", owners: candidates.facadeExports.map((item) => item.export) },
      { priority: 2, kind: "consolidation", evidence: "Investigate one-consumer helpers only when a measured bundle reduction is demonstrated; maintain explicit lifecycle ownership.", owners: candidates.oneConsumerHelpers.map((item) => item.helper) },
      { priority: 3, kind: "API removal/deprecation", evidence: "Review one-consumer action/API candidates against the accepted public contract; no API is removed here.", owners: candidates.oneConsumerApis.map((item) => item.action) },
      { priority: 4, kind: "add-on-local optimization", evidence: "Start with the largest release contributors named per add-on; preserve behavior and measure gzip as informational.", owners: built.records.flatMap((item) => item.baseline.owningFiles).slice(0, 20) },
      { priority: 5, kind: "deferred handshake-security review", evidence: "Registration transport/security remains unchanged and outside this plan.", owners: security.registrationHandshake.owners },
    ];
    return {
      reportSchemaVersion: 1,
      tool: "addon-service-size-audit",
      scope: {
        productionSourceIncluded: ["src/services/addonsService.js", "src/services/addons/**", "src/ui/components/addons/**", "src/ui/renderers/addonsRenderer.js", "addons/shared/**", "addons/*/src/**"],
        generatedMetadata: generated.map((item) => item.path),
        testsExcluded: true,
        trackedBuildOutputExcluded: true,
        noProductionRefactor: true,
      },
      summary: makeSummary(built.records, core, shared, generated),
      beforeAfter: { coreService: sourceDeltas(core, baseline), addons: built.records.map((item) => ({ addonId: item.addonId, ...item.baseline })) },
      coreAddOnService: { ...core, actionFamilies: actionFamilyReport, facade, facadeBytes: core.categories.facade?.authoredBytes || 0, registrationTransport: core.categories["bridge-transport"] || null, postRegistrationPolicy: core.categories["post-registration-policy"] || null },
      sharedRuntime: { files: shared, authored: footprint(collectFiles(path.join(ROOT, "addons", "shared"))), rawDuplication: duplication.rawActionAndEventStrings },
      addons: built.records,
      actionFamilyCosts: actionFamilyReport,
      publicApiConsumers: { allActions: addonConsumers, approvedApis, oneConsumerCandidates: candidates.oneConsumerApis },
      helperConsumers: shared,
      dependencyFindings: { core: core.graph, sharedAndAddons: graphReport([...addonFiles, ...collectFiles(path.join(ROOT, "addons", "shared"))]) },
      trustAccessPolicy: security.trustAccessPolicy,
      security,
      investigations: { candidates, capabilityAudit: capabilityAudit(addons, addonFilesById, actions), duplication, facadeExportCallers: facade, catalogFieldCopies: duplication.catalogFields },
      futureReductions,
      optionalTrendBudgets: { enabled: false, rationale: "Recommendation only; no gate is enabled by this package.", coreAuthored: { absoluteBytes: 2000, percentage: 5 }, coreReadableAndUglified: { absoluteBytes: 4096, percentage: 2 }, gzip: { informational: true }, addonsExcludedFromCoreGrowth: true },
      validation: { deterministic: true, temporaryOutput: true, versionsUpdated: false, cacheUpdated: false, trackedDistUpdated: false, handshakeRedesigned: false },
      deterministic: { outputHasTimestamps: false, outputHasAbsolutePaths: false, stableSorts: true },
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function renderMarkdown(report) {
  const lines = ["# Add-on service size audit", "", "Generated by `ADDON-SERVICE-SIZE-AUDIT-01`; this document is deterministic and contains no timestamps or machine paths.", "", "## Summary", "", "| Area | Authored bytes | Regular/readable bytes | Release/uglified bytes | Release gzip bytes |", "| --- | ---: | ---: | ---: | ---: |", `| Core add-on service and UI integration | ${report.summary.coreService.authoredBytes} | ${report.summary.coreService.readableBytes} | ${report.summary.coreService.uglifiedBytes} | ${report.summary.coreService.uglifiedGzipBytes} |`, `| Individual add-ons (${report.summary.addons.count}) | ${report.summary.addons.authoredBytes} | ${report.summary.addons.regularBytes} | ${report.summary.addons.releaseBytes} | ${report.summary.addons.releaseGzipBytes} |`, `| Shared runtime | ${report.summary.sharedRuntime.authoredBytes} | measured per add-on | measured per add-on | informational |`, `| Generated metadata | ${report.summary.generatedMetadata.authoredBytes} | excluded from add-on bundles | excluded from add-on bundles | — |`, "", "Tests and tracked build output are excluded from authored production totals. Core and add-on userscript footprints are reported separately.", "", "## Core top contributors", "", ...report.coreAddOnService.topContributors.map((item, index) => `${index + 1}. \`${item.path}\` — ${item.bytes} bundled bytes`), "", "## Add-on builds", "", "| Add-on | Authored | Regular | Release | Release gzip | Baseline release delta |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...report.addons.map((item) => `| ${item.addonId} | ${item.source.authoredBytes} | ${item.builds.regular.bytes} | ${item.builds.release.bytes} | ${item.builds.release.gzipBytes} | ${item.baseline.releaseBytes.delta ?? "n/a"} |`), "", "## Findings", "", `- Public actions measured: ${report.publicApiConsumers.allActions.length}; one-consumer candidates: ${report.publicApiConsumers.oneConsumerCandidates.length}.`, `- Shared helpers measured: ${report.helperConsumers.length}; one-add-on helpers: ${report.investigations.candidates.oneConsumerHelpers.length}.`, `- Unused-capability candidates: ${report.investigations.candidates.unusedCapabilities.length}; these are conservative evidence candidates, not automatic removals.`, `- Registration-handshake security: **deferred and unchanged**; owners: ${report.security.registrationHandshake.owners.map((item) => `\`${item}\``).join(", ")}.`, "", "## Accepted duplication", "", ...report.investigations.duplication.accepted.map((item) => `- **${item.area}:** ${item.rationale}`), "", "## Future decisions", "", ...report.futureReductions.map((item) => `${item.priority}. **${item.kind}:** ${item.evidence}`), "", "Optional trend budgets are recommendations only and are disabled. Core growth excludes individual add-on bytes.", ""];
  return lines.join("\n");
}

async function main(args = process.argv.slice(2)) {
  let output = null;
  let markdown = null;
  let check = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output") output = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--markdown") markdown = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--check") check = path.resolve(ROOT, args[++index]);
  }
  const report = await createReport();
  const json = stableJson(report);
  if (check) {
    const expected = fs.readFileSync(check, "utf8");
    if (expected !== json) throw new Error(`Add-on size audit differs from ${relativePath(check)}.`);
  }
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, json); }
  if (markdown) { fs.mkdirSync(path.dirname(markdown), { recursive: true }); fs.writeFileSync(markdown, renderMarkdown(report)); }
  if (!output && !markdown && !check) process.stdout.write(json);
}

if (require.main === module) main().catch((error) => { console.error(`Add-on size audit failed: ${error.stack || error.message}`); process.exitCode = 1; });

module.exports = { createReport, renderMarkdown, stableJson, normalizePath };
