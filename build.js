const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { stripCssComments } = require("./build/stripCssComments");
const { stripDebugLogs } = require("./build/stripDebugLogs");
const { checkFeatureManifest, generateFeatureManifest } = require("./scripts/featureManifest.cjs");
let terser = null;
try {
  terser = require("terser");
} catch (err) {
  terser = null;
}

const VERSION_FILE = path.join(__dirname, "version.json");
const HEADER_TEMPLATE_PATH = path.join(__dirname, "build", "header.txt");

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

function getBuildDefines(isRelease) {
  return { __F95UE_DEBUG__: isRelease ? "false" : "true" };
}

function readHeaderTemplate() {
  if (!fs.existsSync(HEADER_TEMPLATE_PATH)) {
    throw new Error(`Missing header template: ${HEADER_TEMPLATE_PATH}`);
  }
  return fs.readFileSync(HEADER_TEMPLATE_PATH, "utf8");
}

function getBuildInfo(target, isRelease) {
  const mode = isRelease ? "release" : "regular";
  let artifact = target.isUglified ? "fully uglified" : "readable";
  if (isRelease && !target.isUglified) artifact = "bit-uglified (names preserved)";

  const logStatus = isRelease ? "debugLog call sites stripped" : "debugLog call sites retained";

  return [`// Build mode: ${mode}`, `// Artifact: ${artifact}`, `// Logs: ${logStatus}`].join("\n");
}

function renderHeader(template, { name, version, banner, buildInfo }) {
  return template
    .replaceAll("{{NAME}}", name)
    .replaceAll("{{VERSION}}", version)
    .replaceAll("{{BANNER}}", banner)
    .replaceAll("{{BUILD_INFO}}", buildInfo);
}

async function beautifyFromCode(code, header, outPath) {
  if (!terser) {
    // fallback: write as-is
    fs.writeFileSync(outPath, header + code);
    console.warn("terser not available — wrote readable artifact without beautify");
    return;
  }

  const reserved = [
    "GM_setValue",
    "GM_getValue",
    "GM_xmlhttpRequest",
    "GM_registerMenuCommand",
    "GM_unregisterMenuCommand",
    "unsafeWindow",
    "window",
    "document",
  ];

  const terserOpts = {
    // Keep readable artifact semantics identical to esbuild output.
    // Debug log stripping already happens via build plugins in release mode.
    compress: false,
    // Allow local identifier mangling while preserving common globals.
    mangle: { reserved, keep_fnames: true },
    // Keep output readable for reviewers.
    format: { beautify: true, comments: false },
  };

  const result = await terser.minify(code, terserOpts);
  if (result.error) throw result.error;
  fs.writeFileSync(outPath, header + result.code);
  console.log(`Beautified readable output: ${outPath}`);
}

async function buildTarget(target, baseOptions, headerTemplate, version, banner, isRelease) {
  const result = await esbuild.build({
    ...baseOptions,
    minifyWhitespace: target.minifyWhitespace,
    minifyIdentifiers: target.minifyIdentifiers,
    minifySyntax: target.minifySyntax,
    write: false, // in-memory for speed
  });

  const out = result.outputFiles[0];
  const builtCode = out.text || out.contents.toString("utf8");

  const buildInfo = getBuildInfo(target, isRelease);
  const header = renderHeader(headerTemplate, {
    name: target.scriptName,
    version,
    banner,
    buildInfo,
  });

  fs.mkdirSync(path.dirname(target.finalOutfile), { recursive: true });
  fs.writeFileSync(target.finalOutfile, header + builtCode);

  console.log(`✅ ${target.label} complete → ${target.finalOutfile}`);
  return builtCode;
}

async function main() {
  const args = process.argv.slice(2);
  const isRelease = args.includes("--release");
  const isSmoke = args.includes("--smoke");
  const bumpType = getBumpType(args);

  const currentVersion = readVersion();
  const nextVersion = isSmoke ? currentVersion : bumpVersion(currentVersion, bumpType);
  const versionString = `${nextVersion.major}.${nextVersion.minor}.${nextVersion.patch}`;

  if (isSmoke) {
    console.log(`Smoke build: using existing version ${versionString} without modifying version.json.`);
  } else {
    console.log(
      `Bumping version: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} → ${versionString} (${bumpType})`,
    );
  }
  if (isRelease)
    console.log(
      "Release mode enabled — debug logs stripped + GreasyFork-friendly readable artifact",
    );

  if (!isSmoke) fs.writeFileSync(VERSION_FILE, JSON.stringify(nextVersion, null, 2));

  const now = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
  const banner = `// Built on ${now} -- AUTO-GENERATED, edit from /src and rebuild`;
  const headerTemplate = readHeaderTemplate();
  const manifest = isSmoke
    ? checkFeatureManifest({ rootDir: __dirname })
    : generateFeatureManifest({ rootDir: __dirname });
  if (isSmoke && !manifest.matches) {
    throw new Error("Generated feature manifest is stale; smoke build will not rewrite it.");
  }
  if (isSmoke) {
    console.log(`Verified feature manifest: ${path.relative(__dirname, manifest.outputFile)}.`);
  } else {
    console.log(
      `Generated feature manifest: ${path.relative(__dirname, manifest.outputFile)} (${manifest.featureNames.length} feature(s))`,
    );
  }

  const baseBuildOptions = {
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "iife",
    legalComments: "none",
    loader: { ".html": "text", ".css": "text" },
    define: getBuildDefines(isRelease),
    plugins: getPlugins(isRelease),
  };

  const smokeOutputDir = isSmoke
    ? fs.mkdtempSync(path.join(os.tmpdir(), "f95ue-build-smoke-"))
    : null;
  const targetOutfile = (filename) => smokeOutputDir
    ? path.join(smokeOutputDir, filename)
    : filename;

  // === DYNAMIC TARGETS (this is the magic) ===
  const targets = [
    // Readable / main artifact
    {
      label: isRelease ? "Bit-Uglified Readable" : "Regular",
      scriptName: "F95Zone Ultimate Enhancer",
      isUglified: false,
      minifyWhitespace: isRelease, // bit uglified in release
      minifyIdentifiers: false, // names always preserved for readability
      minifySyntax: isRelease,
      finalOutfile: targetOutfile("dist/f95zone-ultimate-enhancer.user.js"),
    },
    // Full uglified artifact
    {
      label: "Fully Uglified",
      scriptName: "F95Zone Ultimate Enhancer (Uglified)",
      isUglified: true,
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      finalOutfile: targetOutfile("dist/f95zone-ultimate-enhancer.uglified.user.js"),
    },
  ];

  // Run both in parallel — super fast
  try {
    const builtCodes = await Promise.all(
    targets.map((target) =>
      buildTarget(target, baseBuildOptions, headerTemplate, versionString, banner, isRelease),
    ),
  );

  // For release builds, post-process the readable artifact to produce a
  // bit-uglified but beautified main `.user.js` (so reviewers can inspect it).
  if (isRelease) {
    const readableIndex = targets.findIndex((t) => !t.isUglified);
    if (readableIndex >= 0) {
      const target = targets[readableIndex];
      const builtCode = builtCodes[readableIndex] || "";
      const buildInfo = getBuildInfo(target, true);
      const header = renderHeader(headerTemplate, {
        name: target.scriptName,
        version: versionString,
        banner,
        buildInfo,
      });
      await beautifyFromCode(builtCode, header, target.finalOutfile);
    }
  }

  if (isSmoke) console.log("\nSmoke build completed without changing tracked build outputs.");
  else console.log(`\n🎉 ALL BUILDS COMPLETE! Version ${versionString} ready in /dist`);
  } finally {
    if (smokeOutputDir) fs.rmSync(smokeOutputDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
