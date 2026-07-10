#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { discoverFeatureExports, generateFeatureManifest } = require('./featureManifest.cjs');

function toPosix(p) { return String(p).replace(/\\/g, '/'); }

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return null; }
}

function main() {
  const rootDir = process.cwd();
  const { entries, featureNames, outputFile } = generateFeatureManifest({ rootDir });

  const errors = [];
  const warnings = [];

  // 1) Duplicate exported feature variable names
  const dupExports = featureNames.filter((v, i, a) => a.indexOf(v) !== i);
  if (dupExports.length) {
    errors.push(`Duplicate exported feature names found: ${[...new Set(dupExports)].join(', ')}`);
  }

  // 2) Inspect each feature's index file for id and bootstrapMode
  const seenIds = new Map();
  const allowedBootstrap = new Set(['waitForBody', 'fast']);

  entries.forEach(entry => {
    const filePath = path.resolve(rootDir, entry.filePath);
    const content = readFileSafe(filePath);
    if (!content) {
      errors.push(`Cannot read feature file: ${toPosix(entry.filePath)}`);
      return;
    }

    // Find id: 'id': 'value' or id: "value"
    const idMatch = content.match(/\bid\s*:\s*['\"]([^'\"]+)['\"]/);
    if (!idMatch) {
      warnings.push(`Feature file ${toPosix(entry.filePath)}: missing explicit 'id' property`);
    } else {
      const id = idMatch[1];
      if (seenIds.has(id)) {
        errors.push(`Duplicate feature id '${id}' in ${toPosix(entry.filePath)} and ${toPosix(seenIds.get(id))}`);
      } else {
        seenIds.set(id, entry.filePath);
      }
    }

    const bootstrapMatch = content.match(/\bbootstrapMode\s*:\s*['\"]([^'\"]+)['\"]/);
    if (bootstrapMatch) {
      const mode = bootstrapMatch[1];
      if (!allowedBootstrap.has(mode)) {
        errors.push(`Invalid bootstrapMode '${mode}' in ${toPosix(entry.filePath)}. Allowed: ${[...allowedBootstrap].join(', ')}`);
      }
    } else {
      // no explicit bootstrapMode is allowed (defaults to waitForBody)
      // but warn if missing
      warnings.push(`Feature file ${toPosix(entry.filePath)}: missing 'bootstrapMode' (defaults to 'waitForBody')`);
    }
  });

  // Report
  if (warnings.length) {
    console.log('Manifest validation warnings:');
    warnings.forEach(w => console.log('  WARN:', w));
  }

  if (errors.length) {
    console.error('Manifest validation errors:');
    errors.forEach(e => console.error('  ERROR:', e));
    console.error(`Generated manifest at: ${outputFile}`);
    process.exitCode = 2;
    return;
  }

  console.log('Manifest validation passed.');
  console.log(`Generated manifest: ${outputFile}`);
}

if (require.main === module) main();
