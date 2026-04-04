const esbuild = require("esbuild");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
let terser = null;
try {
  terser = require("terser");
} catch {
  terser = null;
}

const ROOT = __dirname ? path.resolve(__dirname, "..") : process.cwd();
const MANIFEST_PATH = path.join(ROOT, "addons", "addons.manifest.json");
const ADDONS_VERSION_FILE = path.join(ROOT, "addons", "version.json");
const CACHE_FILE = path.join(ROOT, "addons", ".build-cache.json");

function readVersion() {
  let currentVersion = { major: 0, minor: 1, patch: 0 };
  if (!fs.existsSync(ADDONS_VERSION_FILE)) return currentVersion;

  try {
    currentVersion = JSON.parse(fs.readFileSync(ADDONS_VERSION_FILE, "utf8"));
  } catch {
    console.warn("addons/version.json corrupted, resetting...");
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

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function readBuildCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return { regular: {}, release: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return {
      regular: parsed?.regular && typeof parsed.regular === "object" ? parsed.regular : {},
      release: parsed?.release && typeof parsed.release === "object" ? parsed.release : {},
    };
  } catch {
    return { regular: {}, release: {} };
  }
}

function writeBuildCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function collectFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function computeAddonHash(addon, isRelease) {
  const entry = path.join(ROOT, addon.entry);
  const addonRoot = path.resolve(path.dirname(entry), "..");
  const srcRoot = path.join(addonRoot, "src");
  const sourceFiles = collectFilesRecursive(srcRoot);
  const filesToHash = sourceFiles.length > 0 ? sourceFiles : [entry];

  const hash = crypto.createHash("sha256");
  hash.update(
    JSON.stringify({
      id: addon.id,
      name: addon.name,
      namespace: resolveAddonNamespace(addon),
      version: addon.version,
      description: addon.description,
      author: addon.author,
      entry: addon.entry,
      outfile: addon.outfile,
      matches: normalizeArray(addon.matches, ["*://f95zone.to/*"]),
      grants: normalizeArray(addon.grants, ["none"]),
      runAt: addon.runAt || "document-idle",
      capabilities: normalizeArray(addon.capabilities, []),
      requiresCore: Boolean(addon.requiresCore),
      isRelease: Boolean(isRelease),
      buildToolVersion: 4,
    }),
  );

  filesToHash
    .sort((a, b) => a.localeCompare(b))
    .forEach((filePath) => {
      hash.update(path.relative(ROOT, filePath));
      hash.update(hashFile(filePath));
    });

  return hash.digest("hex");
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing add-ons manifest: ${MANIFEST_PATH}`);
  }

  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const addons = Array.isArray(parsed.addons) ? parsed.addons : [];
  if (addons.length === 0) {
    throw new Error("No add-ons defined in addons.manifest.json");
  }
  return addons;
}

function normalizeArray(input, fallback = []) {
  return Array.isArray(input) ? input : fallback;
}

function sanitizeAddonId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveAddonNamespace(addon) {
  const fromManifest = String(addon?.namespace || "").trim();
  if (fromManifest) return fromManifest;

  const safeId = sanitizeAddonId(addon?.id || "addon");
  return `https://github.com/Zenix-Al/f95-zone-highlighter/addons/${safeId}`;
}

function headerForAddon(addon, version) {
  const lines = [
    "// ==UserScript==",
    `// @name         ${addon.name}`,
    `// @namespace    ${resolveAddonNamespace(addon)}`,
    `// @version      ${version || addon.version || "0.1.0"}`,
    `// @description  ${addon.description || "F95UE add-on userscript"}`,
    `// @author       ${addon.author || "Unknown"}`,
    "// @icon         https://f95zone.to/data/avatars/l/1963/1963870.jpg",
    "// @license      GPL-3.0-or-later",
    "// @supportURL   https://f95zone.to/threads/f95zone-latest.250836/",
    "// @source       https://github.com/Zenix-Al/f95-zone-highlighter",
  ];

  normalizeArray(addon.matches, ["*://f95zone.to/*"]).forEach((match) => {
    lines.push(`// @match        ${match}`);
  });

  normalizeArray(addon.grants, ["none"]).forEach((grant) => {
    lines.push(`// @grant        ${grant}`);
  });

  lines.push(`// @run-at       ${addon.runAt || "document-idle"}`);
  lines.push("// ==/UserScript==");
  lines.push("// ------------------------------------------------------------");
  lines.push(`// Built on ${new Date().toISOString()} -- AUTO-GENERATED`);
  lines.push(
    addon.requiresCore
      ? "// Requires F95UE core userscript (add-on exits early when core is not detected): https://greasyfork.org/en/scripts/546518-f95zone-ultimate-enhancer"
      : "// Standalone add-on.",
  );
  lines.push("// ------------------------------------------------------------");

  return lines.join("\n") + "\n";
}

async function buildAddon(addon, isRelease, versionString) {
  const entry = path.join(ROOT, addon.entry);
  const outfile = path.join(ROOT, addon.outfile);

  if (!fs.existsSync(entry)) {
    throw new Error(`Missing add-on entry: ${entry}`);
  }

  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    write: false,
    legalComments: "none",
    minifyWhitespace: Boolean(isRelease),
    // Keep function and exported symbol names readable in release, then
    // run a controlled terser beautify pass (same philosophy as main build.js).
    minifyIdentifiers: false,
    minifySyntax: Boolean(isRelease),
    define: {
      __ADDON_ID__: JSON.stringify(addon.id),
      __ADDON_CAPABILITIES__: JSON.stringify(normalizeArray(addon.capabilities, [])),
      __ADDON_REQUIRES_CORE__: addon.requiresCore ? "true" : "false",
    },
  });

  const builtCode = result.outputFiles[0].text || result.outputFiles[0].contents.toString("utf8");
  const header = headerForAddon(addon, versionString);

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, header + builtCode);

  const sizeKb = (fs.statSync(outfile).size / 1024).toFixed(2);
  console.log(`✅ ${addon.id} -> ${path.relative(ROOT, outfile)} (${sizeKb} KB)`);

  return { builtCode, header, outfile, addonId: addon.id };
}

async function beautifyFromCode(code, header, outPath) {
  if (!terser) {
    fs.writeFileSync(outPath, header + code);
    console.warn("terser not available — wrote add-on artifact without beautify");
    return;
  }

  const reserved = [
    "GM_setValue",
    "GM_getValue",
    "GM_addValueChangeListener",
    "GM_removeValueChangeListener",
    "GM_xmlhttpRequest",
    "GM_registerMenuCommand",
    "GM_unregisterMenuCommand",
    "unsafeWindow",
    "window",
    "document",
  ];

  const terserOpts = {
    compress: false,
    mangle: { reserved, keep_fnames: true },
    format: { beautify: true, comments: false },
  };

  const result = await terser.minify(code, terserOpts);
  if (result.error) throw result.error;

  fs.writeFileSync(outPath, header + result.code);
}

async function main() {
  const args = process.argv.slice(2);
  const isRelease = args.includes("--release");
  const bumpType = getBumpType(args);
  const forceBuild = args.includes("--force");
  const requested = args.find((arg) => arg && !arg.startsWith("--"));
  const addons = readManifest();

  const targets =
    !requested || requested === "--all" || requested === "all"
      ? addons
      : addons.filter((addon) => addon.id === requested);

  if (targets.length === 0) {
    const known = addons.map((addon) => addon.id).join(", ");
    throw new Error(`Unknown add-on '${requested}'. Known ids: ${known}`);
  }

  const cache = readBuildCache();
  const modeKey = isRelease ? "release" : "regular";
  const currentModeCache = cache[modeKey] || {};

  const changedTargets = [];
  const nextModeCache = { ...currentModeCache };

  for (const addon of targets) {
    const hash = computeAddonHash(addon, isRelease);
    const previous = currentModeCache[addon.id];
    const changed = forceBuild || previous !== hash;
    if (changed) changedTargets.push({ addon, hash });
    else console.log(`⏭️  ${addon.id} unchanged — skipped`);
    nextModeCache[addon.id] = hash;
  }

  if (changedTargets.length === 0) {
    console.log(`\nNo add-on source changes detected (${isRelease ? "release" : "regular"} mode).`);
    return;
  }

  const currentVersion = readVersion();
  const nextVersion = bumpVersion(currentVersion, bumpType);
  const versionString = formatVersion(nextVersion);
  fs.writeFileSync(ADDONS_VERSION_FILE, JSON.stringify(nextVersion, null, 2));
  console.log(
    `Bumping add-ons version: ${formatVersion(currentVersion)} -> ${versionString} (${bumpType})`,
  );

  for (const item of changedTargets) {
    const built = await buildAddon(item.addon, isRelease, versionString);
    if (isRelease && built?.builtCode) {
      await beautifyFromCode(built.builtCode, built.header, built.outfile);
      const sizeKb = (fs.statSync(built.outfile).size / 1024).toFixed(2);
      console.log(
        `🧹 ${built.addonId} release beautified -> ${path.relative(ROOT, built.outfile)} (${sizeKb} KB)`,
      );
    }
  }

  cache[modeKey] = nextModeCache;
  writeBuildCache(cache);

  console.log(
    `\nAdd-on build complete (${isRelease ? "release" : "regular"} mode). Built ${changedTargets.length}/${targets.length}.`,
  );
}

main().catch((error) => {
  console.error("Add-on build failed:", error);
  process.exit(1);
});
