// Synthetic transformation CPU only; excludes manager I/O, locks and startup.
const { performance } = require("node:perf_hooks");
const assert = require("node:assert");
const esbuild = require("esbuild");
const Module = require("node:module");
const path = require("node:path");
const filename = path.resolve(__dirname, "../src/services/configMigrationService.js");
const loaded = new Module(filename, module);
loaded._compile(esbuild.buildSync({ entryPoints: [filename], bundle: true, write: false, format: "cjs" }).outputFiles[0].text, filename);
const { getCanonicalData } = loaded.exports;
const clone = (value) => JSON.parse(JSON.stringify(value));
const results = [];
for (const catalogSize of [0, 2000]) {
  const data = {
    addons: { byAddon: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`addon-${i}`, { state: { presets: Array.from({ length: 30 }, (_, j) => ({ name: `preset-${j}`, enabled: true })) } }])) },
    tags: Array.from({ length: catalogSize }, (_, i) => ({ id: i, name: `tag-${i}` })),
    prefixes: { items: [], categories: {} },
  };
  const previous = { schemaVersion: 2, revision: 3, writerId: "fixture", updatedAt: 1, data };
  const before = () => ({ builtData: clone(getCanonicalData(data)), backup: { ...clone(previous), data: clone(getCanonicalData(previous.data)) } });
  const after = () => {
    const { data: previousData, ...metadata } = previous;
    return { builtData: getCanonicalData(data), backup: { ...clone(metadata), data: getCanonicalData(previousData) } };
  };
  assert.deepStrictEqual(after(), before());
  const measure = (operation) => {
    for (let i = 0; i < 30; i++) operation();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) operation();
    return performance.now() - start;
  };
  const oldRuns = [], newRuns = [];
  for (let i = 0; i < 5; i++) {
    if (i % 2) { newRuns.push(measure(after)); oldRuns.push(measure(before)); }
    else { oldRuns.push(measure(before)); newRuns.push(measure(after)); }
  }
  const median = (values) => [...values].sort((a, b) => a - b)[2];
  results.push({ catalogSize, beforeMedianMs: median(oldRuns), afterMedianMs: median(newRuns) });
}
console.log(JSON.stringify({ scope: "1000 synthetic envelope-build plus backup transformations; five alternating warm trials", results }, null, 2));
