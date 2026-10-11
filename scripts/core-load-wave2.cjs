// Warm synthetic read-preparation benchmark, not a browser startup measurement.
const path = require("path");
const Module = require("module");
const esbuild = require("esbuild");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const filename = path.join(root, "tests/fixtures/addonStateReadyHarness.js");
const output = esbuild.buildSync({
  entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
}).outputFiles[0].text;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(output, filename);
const state = loaded.exports;
const ids = Array.from({ length: 7 }, (_, index) => `fixture-${index}`);
state.config.addons = {
  byAddon: Object.fromEntries(ids.map((id) => [id, { state: {
    enabled: true, presets: Array.from({ length: 30 }, (_, index) => ({
      name: `Preset ${index}`, url: `https://f95zone.to/threads/${index + 1}/`,
    })),
  } }])),
  installedMeta: Object.fromEntries(ids.map((id) => [id, { name: id, pageScopes: ["f95zone"] }])),
};
const previous = () => ({
  installedMeta: state.listInstalledAddonMeta(),
  states: ids.map((id) => state.getAddonState(id)),
});
const optimized = () => {
  const snapshot = state.getAddonConfigSnapshot();
  return { installedMeta: snapshot.installedMeta, states: ids.map((id) => snapshot.byAddon[id].state) };
};
require("assert").deepStrictEqual(optimized(), previous());
const measure = (operation) => {
  for (let index = 0; index < 50; index++) operation();
  const start = performance.now();
  for (let index = 0; index < 1000; index++) operation();
  return performance.now() - start;
};
const previousMs = [], optimizedMs = [];
for (let index = 0; index < 5; index++) {
  previousMs.push(measure(previous));
  optimizedMs.push(measure(optimized));
}
const median = (values) => [...values].sort((a, b) => a - b)[2];
console.log(JSON.stringify({
  scope: "synthetic warm listing read preparation only; seven add-ons, 30 presets each",
  iterationsPerRun: 1000, runs: 5,
  previousMedianMs: median(previousMs), optimizedMedianMs: median(optimizedMs),
}, null, 2));
