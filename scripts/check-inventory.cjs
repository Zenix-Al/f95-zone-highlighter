#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { buildFeatureManifestState } = require("./featureManifest.cjs");

const PUBLIC_SERVICE_MODULES = Object.freeze([
  "addonsService.js",
  "configChangeApplication.js",
  "configMigrationService.js",
  "configTransferService.js",
  "metricsService.js",
  "notificationService.js",
  "prefixService.js",
  "safetyService.js",
  "settingsService.js",
  "storageAdapter.js",
  "syncService.js",
  "tagsService.js",
]);

function getGeneratedBlock(source, markerName) {
  const start = `<!-- GENERATED:${markerName}:START -->`;
  const end = `<!-- GENERATED:${markerName}:END -->`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) return null;
  return source.slice(startIndex + start.length, endIndex).trim();
}

function expectedFeatureBlock(rootDir) {
  const state = buildFeatureManifestState({ rootDir });
  if (state.errors.length) throw new Error(state.errors.join("\n"));
  return state.entries
    .flatMap((entry) => entry.exports.map((featureName) => `- \`${featureName}\` — \`${entry.relativePath}\``))
    .join("\n");
}

function expectedServiceBlock(rootDir) {
  return PUBLIC_SERVICE_MODULES.map((serviceName) => {
    const servicePath = path.join(rootDir, "src", "services", serviceName);
    if (!fs.existsSync(servicePath)) throw new Error(`Public service module is missing: src/services/${serviceName}`);
    return `- \`${serviceName}\` — \`src/services/${serviceName}\``;
  }).join("\n");
}

function checkInventory({ rootDir = process.cwd() } = {}) {
  const checks = [
    ["docs/features/index.md", "FEATURE-INVENTORY", expectedFeatureBlock(rootDir)],
    ["docs/services/index.md", "SERVICE-INVENTORY", expectedServiceBlock(rootDir)],
  ];
  const errors = [];
  for (const [relativePath, markerName, expected] of checks) {
    const filePath = path.join(rootDir, relativePath);
    const actual = fs.existsSync(filePath)
      ? getGeneratedBlock(fs.readFileSync(filePath, "utf8"), markerName)
      : null;
    if (actual === null) errors.push(`${relativePath}: missing ${markerName} marker block.`);
    else if (actual !== expected) errors.push(`${relativePath}: ${markerName} inventory is stale.`);
  }
  return errors;
}

function main() {
  const errors = checkInventory();
  if (errors.length) {
    console.error("Source/documentation inventory check failed:");
    errors.forEach((error) => console.error(`  ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log("Source/documentation inventory check passed.");
}

if (require.main === module) main();

module.exports = { PUBLIC_SERVICE_MODULES, checkInventory, expectedFeatureBlock, expectedServiceBlock };
