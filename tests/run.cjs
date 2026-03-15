const path = require("path");
const fs = require("fs");
const assert = require("assert");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const TMP_DIR = path.join(__dirname, ".tmp");

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function loadModule(relativePath) {
  const entry = path.join(ROOT, relativePath);
  const outFile = path.join(TMP_DIR, relativePath.replace(/[\\/]/g, "_") + ".cjs");

  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: outFile,
    logLevel: "silent",
  });

  delete require.cache[require.resolve(outFile)];
  return require(outFile);
}

let passed = 0;
let failed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err);
  }
}

const { default: createStateManager } = loadModule("src/core/StateManager.js");
const {
  OVERLAY_COLOR_ORDER_KEYS,
  normalizeOverlayColorOrder,
  buildOrderedOverlayMatches,
} = loadModule("src/features/latest-overlay/overlayOrder.js");
const { coerceSettingValue } = loadModule("src/ui/renderers/coerceSettingValue.js");
const { setByPath } = loadModule("src/utils/objectPath.js");
const { normalizeDirectDownloadHealth } = loadModule("src/features/direct-download/hostBreaker.js");

runTest("StateManager blocks unknown set paths when knownPaths is provided", () => {
  const manager = createStateManager(
    { known: 1 },
    { knownPaths: new Set(["known"]), warnUnknown: false },
  );

  assert.strictEqual(manager.set("known", 2), true);
  assert.strictEqual(manager.get("known"), 2);

  assert.strictEqual(manager.set("unknown", 1), false);
  assert.strictEqual(manager.get("unknown"), undefined);
});

runTest("setByPath recovers from primitive intermediate path segments", () => {
  const obj = { feature: "legacy" };
  const didSet = setByPath(obj, "feature.enabled", true);
  assert.strictEqual(didSet, true);
  assert.deepStrictEqual(obj, { feature: { enabled: true } });
});

runTest("StateManager getState handles circular runtime values without throwing", () => {
  const manager = createStateManager({ shadowRoot: null });
  const circular = {};
  circular.self = circular;

  assert.strictEqual(manager.set("shadowRoot", circular), true);
  const snapshot = manager.getState();
  assert.deepStrictEqual(snapshot, { shadowRoot: { self: null } });
});

runTest("normalizeDirectDownloadHealth clamps invalid host breaker values", () => {
  const normalized = normalizeDirectDownloadHealth({
    gofile: {
      failCount: -99,
      autoDisabled: "yes",
      noticeDismissed: 1,
      lastError: 42,
      updatedAt: -2,
    },
  });

  assert.strictEqual(normalized.gofile.failCount, 0);
  assert.strictEqual(normalized.gofile.autoDisabled, true);
  assert.strictEqual(normalized.gofile.noticeDismissed, true);
  assert.strictEqual(normalized.gofile.lastError, "");
  assert.strictEqual(normalized.gofile.updatedAt, 0);
});

runTest("normalizeOverlayColorOrder restores missing keys and removes duplicates", () => {
  const result = normalizeOverlayColorOrder(["preferred", "excluded", "preferred", "onhold"]);
  assert.strictEqual(result.length, OVERLAY_COLOR_ORDER_KEYS.length);
  assert.deepStrictEqual(result.slice(0, 3), ["preferred", "excluded", "onhold"]);
  assert.strictEqual(new Set(result).size, OVERLAY_COLOR_ORDER_KEYS.length);
});

runTest("buildOrderedOverlayMatches follows requested order", () => {
  const order = ["completed", "excluded", "preferred"];
  const overlayMatches = {
    preferred: { label: "Preferred", color: "#111111" },
    excluded: { label: "Excluded", color: "#222222" },
    completed: { label: "Completed", color: "#333333" },
  };

  const result = buildOrderedOverlayMatches(overlayMatches, order);
  assert.deepStrictEqual(result.labels.slice(0, 3), ["Completed", "Excluded", "Preferred"]);
  assert.deepStrictEqual(result.colors.slice(0, 3), ["#333333", "#222222", "#111111"]);
});

runTest("coerceSettingValue keeps numeric setting typed and clamped", () => {
  const meta = {
    type: "number",
    config: "latestSettings.minVersion",
    input: { min: 0, max: 2 },
  };

  assert.strictEqual(coerceSettingValue(meta, "1.2", 0.5), 1.2);
  assert.strictEqual(coerceSettingValue(meta, "-4", 0.5), 0);
  assert.strictEqual(coerceSettingValue(meta, "999", 0.5), 2);
  assert.strictEqual(coerceSettingValue(meta, "abc", 0.5), 0.5);
});

runTest("coerceSettingValue validates color values", () => {
  const meta = { type: "color", config: "color.preferred" };

  assert.strictEqual(coerceSettingValue(meta, "#abcdef", "#123456"), "#abcdef");
  assert.strictEqual(coerceSettingValue(meta, "invalid", "#123456"), "#123456");
});

console.log(`\nTest results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
