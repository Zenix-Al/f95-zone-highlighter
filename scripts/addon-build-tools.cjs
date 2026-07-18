const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { buildAddonToPath } = require("../addons/build-addon.js");
const { readManifest, validateManifest } = require("./addon-catalog.cjs");
const { snapshotWorkingTree, stableJson } = require("./addon-baseline.cjs");

const SOURCE_EXTENSIONS = new Set([".js", ".css", ".html"]);

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativePath(value) {
  return normalizePath(path.relative(ROOT, path.resolve(ROOT, value)));
}

function collectSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(absolute);
      return entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? [absolute]
        : [];
    });
}

function validateStructure(addons = readManifest(), { rootDir = ROOT } = {}) {
  const root = path.resolve(rootDir);
  const errors = [];
  for (const [index, addon] of addons.entries()) {
    const id = String(addon?.id || "<missing>");
    const entry = normalizePath(addon?.entry);
    const sourceRoot = path.join(root, "addons", id, "src");
    const expectedEntry = `addons/${id}/src/main.js`;
    const expectedOutfile = `addons/${id}/dist/${id}.user.js`;
    if (entry !== expectedEntry) errors.push(`addons[${index}].entry: expected ${expectedEntry}`);
    if (normalizePath(addon?.outfile) !== expectedOutfile) {
      errors.push(`addons[${index}].outfile: expected ${expectedOutfile}`);
    }
    if (!fs.existsSync(sourceRoot)) errors.push(`addons[${index}].src: missing ${normalizePath(path.relative(root, sourceRoot))}`);
    if (!fs.existsSync(path.join(root, expectedEntry))) errors.push(`addons[${index}].entry: missing ${expectedEntry}`);
    if (fs.existsSync(sourceRoot) && collectSourceFiles(sourceRoot).length === 0) {
      errors.push(`addons[${index}].src: contains no source files`);
    }
  }
  return errors;
}

function normalizeMetafile(metafile) {
  if (!metafile || typeof metafile !== "object") return null;
  const normalizeNested = (value) => {
    if (Array.isArray(value)) return value.map(normalizeNested);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (key === "inputs" || key === "outputs") return [key, normalizeMap(nested)];
      if ((key === "path" || key === "entryPoint") && typeof nested === "string") {
        return [key, normalizePathKey(nested)];
      }
      return [key, normalizeNested(nested)];
    }));
  };
  const normalizePathKey = (key) => {
    const normalized = normalizePath(key);
    if (normalized.startsWith("<")) return normalized;
    const normalizedRoot = normalizePath(ROOT).replace(/\/+$/, "");
    const isWindowsAbsolute = path.win32.isAbsolute(String(key || ""));
    const isPosixAbsolute = path.posix.isAbsolute(normalized);
    if (isWindowsAbsolute) {
      const windowsRoot = path.win32.isAbsolute(ROOT) ? normalizedRoot : "";
      if (
        windowsRoot
        && (
          normalized.toLowerCase() === windowsRoot.toLowerCase()
          || normalized.toLowerCase().startsWith(`${windowsRoot.toLowerCase()}/`)
        )
      ) {
        return normalized.slice(windowsRoot.length).replace(/^\/+/, "") || ".";
      }
      return "<external>";
    }
    if (isPosixAbsolute) {
      if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
        return normalized.slice(normalizedRoot.length).replace(/^\/+/, "") || ".";
      }
      return "<external>";
    }
    if (normalized === ".." || normalized.startsWith("../")) return "<external>";
    return normalized || ".";
  };
  const normalizeMap = (map) => Object.fromEntries(
    Object.entries(map || {})
      .map(([key, value]) => [normalizePathKey(key), normalizeNested(value)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    inputs: normalizeMap(metafile.inputs),
    outputs: normalizeMap(metafile.outputs),
  };
}

function hasAbsolutePath(value) {
  return /(?:^|["'\s])(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp)\/)/.test(String(value || ""));
}

function hasBuildTimestamp(value) {
  return /Built on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(value || ""));
}

async function runSmokeBuild({ addonId = null, modes = ["regular", "release"], outputDir = null } = {}) {
  const addons = readManifest();
  const manifestErrors = validateManifest(addons);
  if (manifestErrors.length) throw new Error(manifestErrors.join("\n"));
  const structureErrors = validateStructure(addons);
  if (structureErrors.length) throw new Error(structureErrors.join("\n"));

  const targets = addonId ? addons.filter((addon) => addon.id === addonId) : addons;
  if (targets.length === 0) throw new Error(`Unknown add-on '${addonId}'.`);
  const selectedModes = [...new Set(modes)].filter((mode) => mode === "regular" || mode === "release");
  if (selectedModes.length === 0) throw new Error("Smoke build requires regular or release mode.");

  const temporaryOutput = !outputDir;
  const resolvedOutput = outputDir
    ? path.resolve(ROOT, outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "f95ue-addon-smoke-"));
  const before = snapshotWorkingTree();
  const builds = [];
  try {
    for (const addon of targets) {
      for (const mode of selectedModes) {
        const outputPath = path.join(resolvedOutput, `${addon.id}.${mode}.user.js`);
        const metafilePath = path.join(resolvedOutput, "metafiles", `${addon.id}.${mode}.json`);
        const built = await buildAddonToPath(addon, mode === "release", {
          outputPath,
          deterministicHeader: true,
          metafile: true,
        });
        const code = fs.readFileSync(built.outputPath, "utf8");
        const metafile = normalizeMetafile(built.metafile);
        fs.mkdirSync(path.dirname(metafilePath), { recursive: true });
        fs.writeFileSync(metafilePath, stableJson(metafile));
        builds.push({
          id: addon.id,
          mode,
          output: temporaryOutput ? "<temporary>" : relativePath(built.outputPath),
          metafile: temporaryOutput ? "<temporary>" : relativePath(metafilePath),
          bytes: Buffer.byteLength(code),
          metafileBytes: Buffer.byteLength(stableJson(metafile)),
          debugLogPresent: /\bdebugLog\s*\(/.test(built.code),
          outputHasTimestamps: hasBuildTimestamp(code),
          outputHasAbsolutePaths: hasAbsolutePath(code) || hasAbsolutePath(stableJson(metafile)),
        });
      }
    }
    const after = snapshotWorkingTree();
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    if (!unchanged) throw new Error("Add-on smoke build changed repository state.");
    return {
      tool: "addon-build-tools",
      selectedAddons: targets.map((addon) => addon.id),
      modes: selectedModes,
      temporaryOutput,
      builds,
      validation: {
        unchanged,
        versionsUpdated: false,
        manifestUpdated: false,
        cacheUpdated: false,
        trackedDistUpdated: false,
      },
    };
  } finally {
    if (temporaryOutput) fs.rmSync(resolvedOutput, { recursive: true, force: true });
  }
}

function parseArgs(args = process.argv.slice(2)) {
  const options = { addonId: null, modes: [], outputDir: null, structure: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--addon") options.addonId = args[++index];
    else if (arg === "--all") options.addonId = null;
    else if (arg === "--regular") options.modes.push("regular");
    else if (arg === "--release") options.modes.push("release");
    else if (arg === "--outdir") options.outputDir = args[++index];
    else if (arg === "--check-structure") options.structure = true;
    else if (!arg.startsWith("--")) options.addonId = arg;
  }
  if (options.modes.length === 0) options.modes = ["regular", "release"];
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.structure) {
    const errors = validateStructure();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("Add-on structure check passed.");
    return;
  }
  console.log(stableJson(await runSmokeBuild(options)));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Add-on build tools failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeMetafile,
  parseArgs,
  runSmokeBuild,
  validateStructure,
};
