#!/usr/bin/env node
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const coreAudit = require("./core-source-audit.cjs");

const DEFAULT_BASELINE = "docs/architecture/core-size-gate-baseline.json";
const DEFAULT_SOURCE_REPORT = "docs/architecture/core-size-baseline.json";
const DEFAULT_THRESHOLDS = Object.freeze({
  authoredArea: Object.freeze({ absoluteBytes: 1024, percentage: 1 }),
  readable: Object.freeze({ absoluteBytes: 2048, percentage: 1 }),
  uglified: Object.freeze({ absoluteBytes: 1024, percentage: 1 }),
  gzip: Object.freeze({ absoluteBytes: 4096, percentage: 2 }),
});

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativePath(rootDir, filePath) {
  return normalizePath(path.relative(rootDir, filePath));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function coreBundleBytes(report, mode) {
  const bundle = report.bundle?.[mode] || {};
  if (Number.isFinite(bundle.coreBytes)) return bundle.coreBytes;
  return sum((bundle.coreContributors || []).map((entry) => entry.bytes || 0));
}

function graphOf(report) {
  return report.authored?.graph || report.graph || {};
}

function percentageDelta(delta, baseline) {
  return baseline === 0 ? (delta > 0 ? Infinity : 0) : (delta / baseline) * 100;
}

function exceedsThreshold(delta, baseline, threshold) {
  return delta > threshold.absoluteBytes && percentageDelta(delta, baseline) > threshold.percentage;
}

function metricDelta(label, baseline, current, threshold, informational = false) {
  const delta = current - baseline;
  const percentage = percentageDelta(delta, baseline);
  return {
    label,
    baseline,
    current,
    delta,
    percentage,
    threshold,
    informational,
    exceeds: !informational && exceedsThreshold(delta, baseline, threshold),
  };
}

function areaBytes(report) {
  return report.authored?.bytesByArea || {};
}

function fileBytes(report) {
  if (report.authored?.bytesByFile) return report.authored.bytesByFile;
  return Object.fromEntries((report.authored?.largestFiles || []).map((file) => [file.path, file.bytes]));
}

function directionMap(report) {
  return new Map((graphOf(report).crossBoundaryImports || [])
    .map((entry) => [`${entry.from}->${entry.to}`, entry]));
}

function formatPositiveOwners(fileDeltas) {
  return fileDeltas
    .filter((entry) => entry.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.path.localeCompare(b.path))
    .slice(0, 5)
    .map((entry) => `${entry.path} (+${entry.delta})`)
    .join(", ");
}

function evaluateGate(current, baseline, thresholds = DEFAULT_THRESHOLDS) {
  const failures = [];
  const authoredAreas = [...new Set([
    ...Object.keys(areaBytes(baseline)),
    ...Object.keys(areaBytes(current)),
  ])].sort().map((area) => metricDelta(
    `authored:${area}`,
    areaBytes(baseline)[area] || 0,
    areaBytes(current)[area] || 0,
    thresholds.authoredArea,
  ));

  const readable = metricDelta(
    "readable-core-input",
    coreBundleBytes(baseline, "readable"),
    coreBundleBytes(current, "readable"),
    thresholds.readable,
  );
  const uglified = metricDelta(
    "uglified-core-input",
    coreBundleBytes(baseline, "uglified"),
    coreBundleBytes(current, "uglified"),
    thresholds.uglified,
  );
  const gzip = {
    readable: metricDelta(
      "readable-gzip-informational",
      baseline.bundle?.readable?.gzipBytes || 0,
      current.bundle?.readable?.gzipBytes || 0,
      thresholds.gzip,
      true,
    ),
    uglified: metricDelta(
      "uglified-gzip-informational",
      baseline.bundle?.uglified?.gzipBytes || 0,
      current.bundle?.uglified?.gzipBytes || 0,
      thresholds.gzip,
      true,
    ),
  };

  const files = fileBytes(current);
  const previousFiles = fileBytes(baseline);
  const fileDeltas = [...new Set([...Object.keys(files), ...Object.keys(previousFiles)])]
    .map((file) => ({ path: file, baseline: previousFiles[file] || 0, current: files[file] || 0 }))
    .map((entry) => ({ ...entry, delta: entry.current - entry.baseline }))
    .sort((a, b) => b.delta - a.delta || a.path.localeCompare(b.path));
  const owners = formatPositiveOwners(fileDeltas);

  for (const metric of [...authoredAreas, readable, uglified]) {
    if (metric.exceeds) {
      failures.push(`${metric.label} grew by ${metric.delta} bytes (${metric.percentage.toFixed(2)}%); owners: ${owners || "unresolved"}`);
    }
  }

  const previousCycles = new Set(graphOf(baseline).cycles || []);
  const newCycles = (graphOf(current).cycles || []).filter((cycle) => !previousCycles.has(cycle));
  if (newCycles.length) failures.push(`new import cycles: ${newCycles.join("; ")}`);

  const previousDirections = directionMap(baseline);
  const currentDirections = directionMap(current);
  const newDirections = [...currentDirections.entries()]
    .filter(([key]) => !previousDirections.has(key))
    .map(([key, entry]) => ({ direction: key, ...entry }));
  if (newDirections.length) {
    failures.push(`new import directions: ${newDirections.map((entry) => `${entry.direction} (${entry.examples.map((example) => example.from).join(", ")})`).join("; ")}`);
  }

  const increasedDirections = [...currentDirections.entries()]
    .filter(([key, entry]) => previousDirections.has(key) && entry.count > previousDirections.get(key).count)
    .map(([direction, entry]) => ({
      direction,
      baseline: previousDirections.get(direction).count,
      current: entry.count,
      delta: entry.count - previousDirections.get(direction).count,
    }));

  return {
    passed: failures.length === 0,
    thresholds,
    metrics: { authoredAreas, readable, uglified, gzip },
    graph: { newCycles, newDirections, increasedDirections },
    largestPositiveDeltas: fileDeltas.filter((entry) => entry.delta > 0).slice(0, 10),
    failures,
    baseline: {
      authoredBytes: baseline.authored?.authoredBytes || 0,
      readableBytes: baseline.bundle?.readable?.bytes || 0,
      uglifiedBytes: baseline.bundle?.uglified?.bytes || 0,
      readableGzipBytes: baseline.bundle?.readable?.gzipBytes || 0,
      uglifiedGzipBytes: baseline.bundle?.uglified?.gzipBytes || 0,
    },
    current: {
      authoredBytes: current.authored?.authoredBytes || 0,
      readableBytes: current.bundle?.readable?.bytes || 0,
      uglifiedBytes: current.bundle?.uglified?.bytes || 0,
      readableGzipBytes: current.bundle?.readable?.gzipBytes || 0,
      uglifiedGzipBytes: current.bundle?.uglified?.gzipBytes || 0,
    },
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readGateDefinition(rootDir, gatePath, { allowMissing = false, ignoreHash = false } = {}) {
  if (!fs.existsSync(gatePath)) {
    if (!allowMissing) throw new Error(`Missing gate baseline ${relativePath(rootDir, gatePath)}.`);
    return {
      sourceReport: DEFAULT_SOURCE_REPORT,
      thresholds: DEFAULT_THRESHOLDS,
    };
  }
  const definition = readJson(gatePath);
  const sourceReport = definition.sourceReport || DEFAULT_SOURCE_REPORT;
  const sourcePath = path.resolve(rootDir, sourceReport);
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  if (!ignoreHash && definition.sourceReportSha256 && definition.sourceReportSha256 !== sha256(sourceText)) {
    throw new Error(`Accepted baseline changed without a gate update; run the deliberate update command with --rationale.`);
  }
  return {
    ...definition,
    sourceReport,
    sourcePath,
    source: JSON.parse(sourceText),
    thresholds: definition.thresholds || DEFAULT_THRESHOLDS,
  };
}

function rationaleRecord(rootDir, rationalePath, commitNote) {
  if (rationalePath) {
    const absolute = path.resolve(rootDir, rationalePath);
    if (!fs.existsSync(absolute)) throw new Error(`Rationale file does not exist: ${rationalePath}`);
    const content = fs.readFileSync(absolute, "utf8").trim();
    if (!content) throw new Error(`Rationale file is empty: ${rationalePath}`);
    return { type: "file", path: relativePath(rootDir, absolute), sha256: sha256(content) };
  }
  if (String(commitNote || "").trim()) return { type: "commit-note", text: String(commitNote).trim() };
  throw new Error("Baseline updates require --rationale <file> or --commit-note <text>.");
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), baseline: DEFAULT_BASELINE, update: false, rationale: null, commitNote: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") options.rootDir = path.resolve(args[++index]);
    else if (arg === "--baseline") options.baseline = args[++index];
    else if (arg === "--update") options.update = true;
    else if (arg === "--rationale") options.rationale = args[++index];
    else if (arg === "--commit-note") options.commitNote = args[++index];
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const baselinePath = path.resolve(options.rootDir, options.baseline);
  const definition = readGateDefinition(options.rootDir, baselinePath, { allowMissing: options.update, ignoreHash: options.update });
  const current = await coreAudit.createReport({ rootDir: options.rootDir });

  if (options.update) {
    const rationale = rationaleRecord(options.rootDir, options.rationale, options.commitNote);
    const sourcePath = definition.sourcePath || path.resolve(options.rootDir, DEFAULT_SOURCE_REPORT);
    const sourceText = coreAudit.stableJson(current);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, sourceText);
    const updatedDefinition = {
      schemaVersion: 1,
      sourceReport: relativePath(options.rootDir, sourcePath),
      sourceReportSha256: sha256(sourceText),
      thresholds: definition.thresholds || DEFAULT_THRESHOLDS,
      rationale,
    };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, coreAudit.stableJson(updatedDefinition));
    console.log(coreAudit.stableJson({ status: "baseline-updated", baseline: relativePath(options.rootDir, baselinePath), rationale }));
    return;
  }

  const result = evaluateGate(current, definition.source, definition.thresholds);
  console.log(coreAudit.stableJson(result));
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  console.error(`Core size gate failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = {
  DEFAULT_THRESHOLDS,
  evaluateGate,
  coreBundleBytes,
  rationaleRecord,
  parseArgs,
};
