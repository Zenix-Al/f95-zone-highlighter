"use strict";
const path = require("node:path");
const Module = require("node:module");
const esbuild = require("esbuild");
function loadSchema() {
  const source = esbuild.buildSync({ entryPoints: [path.join(__dirname, "../src/config/schema.js")], bundle: true, write: false, format: "cjs" }).outputFiles[0].text;
  const module = new Module(__filename);
  module._compile(source, __filename);
  return module.exports;
}
function referenceLookup(index, value) {
  const normalized = String(value || "").trim().replace(/\[\d+\]/g, "[]");
  if (index.has(normalized)) return index.get(normalized);
  const segments = normalized.split(".");
  let best = null, score = -1;
  for (const [pattern, metadata] of index) {
    const parts = pattern.split(".");
    if (parts.length !== segments.length) continue;
    let specificity = 0, matches = true;
    for (let i = 0; i < segments.length; i++) {
      if (parts[i] === "*" || (parts[i] === "*[]" && segments[i].endsWith("[]"))) continue;
      if (parts[i] !== segments[i]) { matches = false; break; }
      specificity++;
    }
    if (matches && specificity > score) { best = metadata; score = specificity; }
  }
  return best;
}
function benchmark() {
  const schema = loadSchema(), index = new Map(Object.entries(schema.getSchemaPathIndex()));
  const paths = [...index.keys()].map((key) => key.replace(/\*/g, "fixture").replace(/\[\]/g, "[0]"));
  paths.push("unknown.fixture.path", "addons.byAddon.fixture.enabled");
  const measure = (lookup) => {
    const start = performance.now();
    for (let i = 0; i < 20000; i++) lookup(paths[i % paths.length]);
    return Number((performance.now() - start).toFixed(3));
  };
  const before = [], after = [];
  for (let round = 0; round < 5; round++) {
    before.push(measure((value) => referenceLookup(index, value)));
    after.push(measure(schema.getConfigPathMetadata));
  }
  const median = (values) => [...values].sort((a, b) => a - b)[2];
  return { workload: "20000 mixed schema lookups per run; repeated-path cache becomes warm", beforeMs: before, afterMs: after,
    beforeMedianMs: median(before), afterMedianMs: median(after),
    limitation: "Node microbenchmark, not browser startup; historical trace savings must be verified with a fresh browser trace." };
}
if (require.main === module) console.log(JSON.stringify(benchmark(), null, 2));
module.exports = { referenceLookup, benchmark };
