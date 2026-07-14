#!/usr/bin/env node
const childProcess = require("child_process");
const crypto = require("crypto");
const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const SOURCE_AREAS = Object.freeze(["config", "core", "services", "features", "ui"]);
const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".css", ".html"]);
const ADDON_UI_PREFIX = "src/ui/components/addons/";
const ADDON_UI_RENDERER = "src/ui/renderers/addonsRenderer.js";
const EXCLUDED_SOURCE_HINTS = Object.freeze([
  "src/services/addons/",
  "src/services/addonsService.js",
  ADDON_UI_PREFIX,
  ADDON_UI_RENDERER,
  "src/features/latest-ajax-error-recovery/",
]);
const BASELINE_SCHEMA_VERSION = 1;

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativePath(rootDir, filePath) {
  return normalizePath(path.relative(rootDir, filePath));
}

function isExcludedSource(relative) {
  const value = normalizePath(relative);
  const segments = value.split("/");
  return value === "src/generated/features.generated.js"
    || value.startsWith("src/generated/")
    || segments.includes("test")
    || segments.includes("tests")
    || EXCLUDED_SOURCE_HINTS.some((hint) => value === hint || value.startsWith(hint));
}

function sourceArea(relative) {
  const match = normalizePath(relative).match(/^src\/([^/]+)/);
  return match && SOURCE_AREAS.includes(match[1]) ? match[1] : null;
}

function isAuditedSource(relative) {
  const value = normalizePath(relative);
  return Boolean(sourceArea(value))
    && !isExcludedSource(value)
    && SOURCE_EXTENSIONS.has(path.posix.extname(value));
}

function walkFiles(rootDir, directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(rootDir, absolute, output);
    else if (entry.isFile()) {
      const relative = relativePath(rootDir, absolute);
      if (isAuditedSource(relative)) output.push({ absolute, relative });
    }
  }
  return output;
}

function countLines(source) {
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let inBlockComment = false;
  let meaningful = 0;
  for (let line of lines) {
    let remaining = line;
    let output = "";
    while (remaining.length > 0) {
      if (inBlockComment) {
        const end = remaining.indexOf("*/");
        if (end < 0) {
          remaining = "";
          continue;
        }
        remaining = remaining.slice(end + 2);
        inBlockComment = false;
        continue;
      }
      const starts = [
        remaining.indexOf("/*"),
        remaining.indexOf("<!--"),
      ].filter((index) => index >= 0);
      const lineComment = remaining.search(/\/\//);
      if (lineComment >= 0) starts.push(lineComment);
      if (starts.length === 0) {
        output += remaining;
        remaining = "";
        continue;
      }
      const start = Math.min(...starts);
      output += remaining.slice(0, start);
      if (remaining.startsWith("//", start)) {
        remaining = "";
      } else if (remaining.startsWith("<!--", start)) {
        const end = remaining.indexOf("-->", start + 4);
        if (end < 0) {
          remaining = "";
          inBlockComment = true;
        } else remaining = remaining.slice(end + 3);
      } else {
        const end = remaining.indexOf("*/", start + 2);
        if (end < 0) {
          remaining = "";
          inBlockComment = true;
        } else remaining = remaining.slice(end + 2);
      }
    }
    if (output.trim()) meaningful += 1;
  }
  return { physical: lines.length, meaningful };
}

function parseModule(source) {
  const imports = [];
  const importedNames = [];
  const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|require\s*\()(['"])([^'"\n]+)\1/g;
  let match;
  while ((match = importPattern.exec(source))) {
    imports.push(match[2]);
    const statement = source.slice(Math.max(0, source.lastIndexOf("\n", match.index) + 1), match.index + match[0].length);
    const names = statement.match(/\{([^}]+)\}/)?.[1] || "";
    for (const name of names.split(",")) {
      const imported = name.trim().split(/\s+as\s+/)[0].trim();
      if (imported) importedNames.push(imported);
    }
    if (/import\s+[*]\s+as\s+([A-Za-z_$][\w$]*)/.test(statement)) importedNames.push(RegExp.$1);
    const defaultImport = statement.match(/import\s+([A-Za-z_$][\w$]*)/);
    if (defaultImport) importedNames.push("default");
  }
  const exports = [];
  for (const declaration of source.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) exports.push(declaration[1]);
  for (const declaration of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const name of declaration[1].split(",")) {
      const exported = name.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (exported) exports.push(exported);
    }
  }
  if (/\bexport\s+default\b/.test(source)) exports.push("default");
  return { imports: [...new Set(imports)], importedNames: [...new Set(importedNames)], exports: [...new Set(exports)] };
}

function resolveImport(rootDir, importer, request, filesByPath) {
  if (!request.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), request);
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.css`, `${base}.html`, path.join(base, "index.js")];
  for (const candidate of candidates) {
    const relative = relativePath(rootDir, candidate);
    if (filesByPath.has(relative)) return relative;
  }
  return null;
}

function graphForFiles(rootDir, files) {
  const filesByPath = new Map(files.map((file) => [file.relative, file]));
  const nodes = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file.absolute, "utf8");
    const parsed = parseModule(source);
    const edges = parsed.imports
      .map((request) => resolveImport(rootDir, file.absolute, request, filesByPath))
      .filter(Boolean);
    nodes.set(file.relative, { ...parsed, edges: [...new Set(edges)].sort() });
  }
  return nodes;
}

function findCycles(nodes) {
  const cycles = [];
  const visited = new Set();
  const active = [];
  const activeSet = new Set();
  function visit(node) {
    if (activeSet.has(node)) {
      const start = active.indexOf(node);
      cycles.push([...active.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    active.push(node);
    activeSet.add(node);
    for (const edge of nodes.get(node)?.edges || []) visit(edge);
    active.pop();
    activeSet.delete(node);
    visited.add(node);
  }
  for (const node of [...nodes.keys()].sort()) visit(node);
  return cycles
    .map((cycle) => cycle.slice(0, -1).join(" -> "))
    .sort();
}

function sourceReport(rootDir) {
  const sourceDir = path.join(rootDir, "src");
  const files = walkFiles(rootDir, sourceDir);
  const nodes = graphForFiles(rootDir, files);
  const fanIn = new Map(files.map((file) => [file.relative, 0]));
  for (const node of nodes.values()) for (const edge of node.edges) fanIn.set(edge, (fanIn.get(edge) || 0) + 1);
  const fileReports = files.map((file) => {
    const source = fs.readFileSync(file.absolute, "utf8");
    const lines = countLines(source);
    const node = nodes.get(file.relative);
    return {
      path: file.relative,
      area: sourceArea(file.relative),
      bytes: Buffer.byteLength(source),
      physicalLines: lines.physical,
      meaningfulLines: lines.meaningful,
      fanIn: fanIn.get(file.relative) || 0,
      fanOut: node.edges.length,
      exports: node.exports,
    };
  }).sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const bytesByArea = Object.fromEntries(SOURCE_AREAS.map((area) => [area, 0]));
  for (const file of fileReports) bytesByArea[file.area] += file.bytes;
  const crossBoundary = new Map();
  for (const [from, node] of nodes) {
    for (const to of node.edges) {
      const fromArea = sourceArea(from);
      const toArea = sourceArea(to);
      if (fromArea === toArea) continue;
      const key = `${fromArea}->${toArea}`;
      const current = crossBoundary.get(key) || { from: fromArea, to: toArea, count: 0, examples: [] };
      current.count += 1;
      if (current.examples.length < 5) current.examples.push({ from, to });
      crossBoundary.set(key, current);
    }
  }
  const unreferencedExports = fileReports.flatMap((file) => file.exports
    .filter((name) => name !== "default" && ![...nodes.values()].some((node) => node.importedNames.includes(name)))
    .map((name) => `${file.path}#${name}`)).sort();
  return {
    fileCount: fileReports.length,
    physicalLines: fileReports.reduce((sum, file) => sum + file.physicalLines, 0),
    meaningfulLines: fileReports.reduce((sum, file) => sum + file.meaningfulLines, 0),
    authoredBytes: fileReports.reduce((sum, file) => sum + file.bytes, 0),
    bytesByArea,
    largestFiles: fileReports.slice(0, 20),
    graph: {
      files: fileReports.map((file) => ({ path: file.path, fanIn: file.fanIn, fanOut: file.fanOut })),
      cycles: findCycles(nodes),
      crossBoundaryImports: [...crossBoundary.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
      orphanFiles: fileReports.filter((file) => file.fanIn === 0).map((file) => file.path).sort(),
      unreferencedExports,
    },
  };
}

function getPlugins(rootDir, release) {
  const stripCssComments = require(path.join(rootDir, "stripCssComments.js")).stripCssComments;
  const plugins = [stripCssComments];
  if (release) plugins.push(require(path.join(rootDir, "stripDebugLogs.js")).stripDebugLogs);
  return plugins;
}

function normalizeMetafilePath(rootDir, value) {
  const relative = normalizePath(path.relative(rootDir, path.isAbsolute(value) ? value : path.resolve(rootDir, value)));
  return relative || normalizePath(value);
}

function bundleContributors(rootDir, metafile, include = () => true) {
  const output = Object.values(metafile.outputs || {})[0] || { inputs: {} };
  return Object.entries(output.inputs || [])
    .map(([input, details]) => ({ path: normalizeMetafilePath(rootDir, input), bytes: details.bytesInOutput || 0 }))
    .filter((entry) => include(entry.path))
    .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
}

async function buildOne(rootDir, tempDir, name, { release, uglified }) {
  const outfile = path.join(tempDir, name);
  const result = await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "iife",
    legalComments: "none",
    loader: { ".html": "text", ".css": "text" },
    define: { __F95UE_DEBUG__: release ? "false" : "true" },
    plugins: getPlugins(rootDir, release),
    minifyWhitespace: uglified,
    minifyIdentifiers: uglified,
    minifySyntax: uglified,
    metafile: true,
    outfile,
    write: true,
    logLevel: "silent",
  });
  const bytes = fs.readFileSync(outfile);
  const meta = result.metafile;
  return {
    mode: release ? "release" : "regular",
    bytes: bytes.length,
    gzipBytes: zlib.gzipSync(bytes, { mtime: 0 }).length,
    contributors: bundleContributors(rootDir, meta).slice(0, 20),
    coreContributors: bundleContributors(rootDir, meta, (input) => isAuditedSource(input)).slice(0, 20),
    excludedContributors: bundleContributors(rootDir, meta, (input) => !isAuditedSource(input)).slice(0, 20),
  };
}

function snapshotWorkingTree(rootDir) {
  const version = path.join(rootDir, "version.json");
  const trackedDist = childProcess.execFileSync("git", ["ls-files", "dist"], { cwd: rootDir, encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean).sort();
  return {
    version: fs.existsSync(version) ? fs.readFileSync(version) : null,
    dist: trackedDist.map((file) => [file, fs.readFileSync(path.join(rootDir, file))]),
    status: childProcess.execFileSync("git", ["status", "--short"], { cwd: rootDir, encoding: "utf8" }),
  };
}

function sameSnapshot(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

async function runCoreSmokeBuild({ rootDir = process.cwd() } = {}) {
  const before = snapshotWorkingTree(rootDir);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "f95ue-core-smoke-"));
  try {
    const readable = await buildOne(rootDir, tempDir, "core-readable.user.js", { release: false, uglified: false });
    const uglified = await buildOne(rootDir, tempDir, "core-uglified.user.js", { release: true, uglified: true });
    const after = snapshotWorkingTree(rootDir);
    if (!sameSnapshot(before, after)) throw new Error("Core smoke build modified tracked repository state.");
    return { readable, uglified };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function compareReports(current, baseline) {
  const pairs = [
    ["authoredBytes", current.authored.authoredBytes, baseline.authored?.authoredBytes],
    ["readableBytes", current.bundle.readable.bytes, baseline.bundle?.readable?.bytes],
    ["readableGzipBytes", current.bundle.readable.gzipBytes, baseline.bundle?.readable?.gzipBytes],
    ["uglifiedBytes", current.bundle.uglified.bytes, baseline.bundle?.uglified?.bytes],
    ["uglifiedGzipBytes", current.bundle.uglified.gzipBytes, baseline.bundle?.uglified?.gzipBytes],
  ];
  return Object.fromEntries(pairs.map(([name, now, before]) => [name, {
    current: now,
    baseline: before ?? null,
    delta: before === undefined ? null : now - before,
  }]));
}

async function createReport({ rootDir = process.cwd(), compare = null } = {}) {
  const authored = sourceReport(rootDir);
  const bundle = await runCoreSmokeBuild({ rootDir });
  const report = {
    reportSchemaVersion: BASELINE_SCHEMA_VERSION,
    tool: "core-source-audit",
    reportedObservation: {
      value: 480,
      unit: "KB",
      note: "User-reported approximate core size; not a measured baseline.",
    },
    scope: {
      includedAreas: SOURCE_AREAS.map((area) => `src/${area}/**`),
      excludedHints: [...EXCLUDED_SOURCE_HINTS, "src/**/test/**", "src/**/tests/**", "src/generated/**", "dist/**", "tests/**"],
    },
    authored,
    bundle,
  };
  if (compare) report.comparison = compareReports(report, compare);
  return report;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), output: null, compare: null, check: null, smokeOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") options.rootDir = path.resolve(args[++index]);
    else if (arg === "--output") options.output = path.resolve(options.rootDir, args[++index]);
    else if (arg === "--compare") options.compare = path.resolve(options.rootDir, args[++index]);
    else if (arg === "--check") options.check = path.resolve(options.rootDir, args[++index]);
    else if (arg === "--smoke-build") options.smokeOnly = true;
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.smokeOnly) {
    const result = await runCoreSmokeBuild({ rootDir: options.rootDir });
    console.log(stableJson({ tool: "core-source-audit", bundle: result }));
    return;
  }
  const baseline = options.compare ? JSON.parse(fs.readFileSync(options.compare, "utf8")) : null;
  const report = await createReport({ rootDir: options.rootDir, compare: baseline });
  const output = stableJson(report);
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output);
  } else console.log(output);
  if (options.check) {
    const expected = fs.readFileSync(options.check, "utf8");
    if (expected !== stableJson(report)) throw new Error(`Core audit differs from ${relativePath(options.rootDir, options.check)}.`);
  }
}

if (require.main === module) main().catch((error) => { console.error(`Core audit failed: ${error.message}`); process.exitCode = 1; });

module.exports = {
  auditCoreSource: sourceReport,
  compareReports,
  createReport,
  isAuditedSource,
  runCoreSmokeBuild,
  stableJson,
};
