const path = require("path");
const { checkFeatureManifest } = require("./featureManifest.cjs");

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const rootDir = path.resolve(readOption("--root", process.cwd()));
const outputFile = readOption("--output", "src/generated/features.generated.js");
const result = checkFeatureManifest({ rootDir, outputFile });

if (!result.matches) {
  if (result.errors.length) console.error(result.errors.join("\n"));
  else console.error(`Generated manifest is stale: ${result.outputFile}`);
  console.error("Refresh it with: node -e \"require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })\"");
  process.exitCode = 1;
} else {
  console.log("Generated manifest is up to date.");
}
