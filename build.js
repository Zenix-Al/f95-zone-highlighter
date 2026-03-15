const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { stripCssComments } = require("./build/stripCssComments");
const { stripDebugLogs } = require("./stripDebugLogs");

const VERSION_FILE = path.join(__dirname, "version.json");
const HEADER_TEMPLATE_PATH = path.join(__dirname, "header.txt");

const BUILD_TARGETS = [
  {
    label: "Build",
    scriptName: "F95Zone Ultimate Enhancer",
    minify: false,
    tmpOutfile: "dist/userscript.js",
    finalOutfile: "dist/f95zone-ultimate-enhancer.user.js",
  },
  {
    label: "Uglify Build",
    scriptName: "F95Zone Ultimate Enhancer (Uglified)",
    minify: true,
    tmpOutfile: "dist/uglified.js",
    finalOutfile: "dist/f95zone-ultimate-enhancer.uglified.user.js",
  },
];

function readVersion() {
  let currentVersion = { major: 3, minor: 0, patch: 0 };
  if (!fs.existsSync(VERSION_FILE)) return currentVersion;

  try {
    currentVersion = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
  } catch {
    console.warn("version.json corrupted, resetting...");
  }
  return currentVersion;
}

function getBumpType(args) {
  if (args.includes("--major")) return "major";
  if (args.includes("--minor")) return "minor";
  return "patch";
}

function bumpVersion(currentVersion, bumpType) {
  if (bumpType === "major") {
    return { major: currentVersion.major + 1, minor: 0, patch: 0 };
  }
  if (bumpType === "minor") {
    return { major: currentVersion.major, minor: currentVersion.minor + 1, patch: 0 };
  }
  return { ...currentVersion, patch: currentVersion.patch + 1 };
}

function getPlugins(isRelease) {
  return isRelease ? [stripCssComments, stripDebugLogs] : [stripCssComments];
}

function getBuildDefines() {
  return {
    __F95UE_DEBUG__: "true",
  };
}

function readHeaderTemplate() {
  if (!fs.existsSync(HEADER_TEMPLATE_PATH)) {
    throw new Error(`Missing header template: ${HEADER_TEMPLATE_PATH}`);
  }
  return fs.readFileSync(HEADER_TEMPLATE_PATH, "utf8");
}

function getBuildInfo(target, isRelease) {
  const buildMode = isRelease ? "release" : "regular";
  const artifactType = target.minify ? "uglified" : "regular";
  const logStatus = isRelease
    ? "debugLog call sites stripped where possible"
    : "debugLog call sites retained";

  return [
    `// Build mode: ${buildMode}`,
    `// Artifact: ${artifactType}`,
    `// Logs: ${logStatus}`,
  ].join("\n");
}

function renderHeader(template, { name, version, banner, buildInfo }) {
  return template
    .replaceAll("{{NAME}}", name)
    .replaceAll("{{VERSION}}", version)
    .replaceAll("{{BANNER}}", banner)
    .replaceAll("{{BUILD_INFO}}", buildInfo);
}

async function buildTarget(target, baseOptions, headerTemplate, version, banner, isRelease) {
  await esbuild.build({
    ...baseOptions,
    minify: target.minify,
    outfile: target.tmpOutfile,
  });

  const builtCode = fs.readFileSync(target.tmpOutfile, "utf8");
  const buildInfo = getBuildInfo(target, isRelease);
  const header = renderHeader(headerTemplate, {
    name: target.scriptName,
    version,
    banner,
    buildInfo,
  });

  fs.writeFileSync(target.finalOutfile, header + builtCode);
  console.log(`${target.label} complete! Version: ${version}`);
  console.log(`Output: ${target.finalOutfile}`);
}

async function main() {
  const args = process.argv.slice(2);
  const bumpType = getBumpType(args);
  const isRelease = args.includes("--release");

  const currentVersion = readVersion();
  const nextVersion = bumpVersion(currentVersion, bumpType);
  const versionString = `${nextVersion.major}.${nextVersion.minor}.${nextVersion.patch}`;

  console.log(
    `Bumping version: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} -> ${versionString} (${bumpType})`,
  );
  if (isRelease) {
    console.log("Release mode: stripping debugLog(...) and disabling debug logging.");
  }

  fs.writeFileSync(VERSION_FILE, JSON.stringify(nextVersion, null, 2));

  const now = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
  const banner = `// Built on ${now} -- AUTO-GENERATED, edit from /src and rebuild`;
  const headerTemplate = readHeaderTemplate();

  const baseBuildOptions = {
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "iife",
    legalComments: "none",
    loader: {
      ".html": "text",
      ".css": "text",
    },
    define: getBuildDefines(),
    plugins: getPlugins(isRelease),
  };

  await Promise.all(
    BUILD_TARGETS.map((target) =>
      buildTarget(target, baseBuildOptions, headerTemplate, versionString, banner, isRelease),
    ),
  );
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
