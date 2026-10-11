"use strict";

// Read-only Chrome Performance trace analysis. CPU sampling is approximate;
// inclusive and self costs overlap and must never be added together.
const fs = require("node:fs");
const path = require("node:path");

function analyzeTrace(trace, { scriptPattern = /F95Zone-Ultimate-Enhancer/i } = {}) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  if (!Array.isArray(events)) throw new Error("Expected a Chrome traceEvents array");
  const profiles = new Map();
  const key = (event) => `${event.pid}:${event.id}`;
  const matches = (url) => { scriptPattern.lastIndex = 0; return scriptPattern.test(url || ""); };
  const profileFor = (event) => {
    const id = key(event);
    if (!profiles.has(id)) profiles.set(id, { nodes: new Map(), chunks: [], start: null });
    return profiles.get(id);
  };
  for (const event of events) {
    if (event.name === "Profile") profileFor(event).start = event.args?.data?.startTime;
    if (event.name !== "ProfileChunk") continue;
    const profile = profileFor(event);
    const data = event.args?.data || {};
    profile.chunks.push(data);
    for (const node of data.cpuProfile?.nodes || []) profile.nodes.set(node.id, node);
  }
  const self = new Map(), inclusive = new Map(), children = new Map();
  let selfUs = 0, inclusiveUs = 0, sampleCount = 0, unattributedSamples = 0;
  let first = Infinity, last = -Infinity;
  const scripts = new Set();
  const frameKey = (frame) => {
    const url = frame.url || "";
    let label = url;
    try { const parsed = new URL(url); label = parsed.searchParams.get("name") || parsed.pathname; } catch { /* native frame */ }
    return `${frame.functionName || "(anonymous)"} @ ${label || "(no source URL)"}:${(frame.lineNumber ?? -1) + 1}:${(frame.columnNumber ?? -1) + 1}`;
  };
  const add = (map, name, duration) => map.set(name, (map.get(name) || 0) + duration);
  for (const profile of profiles.values()) {
    let timestamp = profile.start;
    for (const chunk of profile.chunks) {
      const samples = chunk.cpuProfile?.samples || [];
      for (let index = 0; index < samples.length; index++) {
        const raw = chunk.timeDeltas?.[index];
        if (!Number.isFinite(raw) || raw < 0) { unattributedSamples++; timestamp = null; continue; }
        if (timestamp !== null && timestamp !== undefined) timestamp += raw;
        const leaf = profile.nodes.get(samples[index]);
        if (!leaf) { unattributedSamples++; continue; }
        let node = leaf, core = null;
        const visited = new Set();
        while (node && !visited.has(node.id)) {
          visited.add(node.id);
          if (matches(node.callFrame?.url)) { core = node; break; }
          node = profile.nodes.get(node.parent);
        }
        if (!core) continue;
        sampleCount++;
        inclusiveUs += raw;
        add(inclusive, frameKey(core.callFrame), raw);
        scripts.add(core.callFrame.url);
        if (Number.isFinite(timestamp)) { first = Math.min(first, timestamp); last = Math.max(last, timestamp); }
        if (matches(leaf.callFrame?.url)) { selfUs += raw; add(self, frameKey(leaf.callFrame), raw); }
        else add(children, frameKey(leaf.callFrame || {}), raw);
      }
    }
  }
  const ranked = (map) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .map(([location, us]) => ({ location, sampledMs: Number((us / 1000).toFixed(3)) }));
  const directEvents = events.filter((event) => event.ph === "X" && Number.isFinite(event.dur) && matches(event.args?.data?.url))
    .sort((a, b) => b.dur - a.dur).slice(0, 15)
    .map((event) => ({ name: event.name, durationMs: event.dur / 1000, pid: event.pid, tid: event.tid }));
  const timings = events.filter((event) => /user_timing/.test(event.cat || "") && /bootstrap|storage|bridge|feature|runtime/i.test(event.name || ""))
    .slice(0, 100).map((event) => ({ name: event.name, phase: event.ph, timestampUs: event.ts, durationMs: Number.isFinite(event.dur) ? event.dur / 1000 : null }));
  return {
    schemaVersion: 1,
    eventCount: events.length,
    cpuProfileCount: profiles.size,
    matchedScriptCount: scripts.size,
    coreSampleCount: sampleCount,
    unattributedSamples,
    coreSelfSampledMs: Number((selfUs / 1000).toFixed(3)),
    coreInclusiveSampledMs: Number((inclusiveUs / 1000).toFixed(3)),
    coreSampleActivitySpanMs: Number.isFinite(first) && Number.isFinite(last) ? (last - first) / 1000 : null,
    selfHotspots: ranked(self),
    inclusiveHotspots: ranked(inclusive),
    calledCodeHotspots: ranked(children),
    directEvents,
    explicitTimings: timings,
    limitations: [
      "Self and inclusive CPU estimates overlap; do not sum them.",
      "Activity span is not CPU time or a verified bootstrap duration.",
      "Whole-recording totals can include runtime callbacks and user interaction, not just startup.",
      "Called-code costs can include add-on callbacks and userscript-manager work invoked through core.",
      "No source URL does not prove a frame is a browser-native operation.",
      "Compilation, idle waits, and asynchronous rendering are not fully attributed by these CPU totals.",
      "Minified locations require the exact recorded bundle or matching source maps before source-level changes.",
    ],
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const input = args[0];
    if (!input || input.startsWith("--")) throw new Error("Usage: node scripts/core-load-trace.cjs TRACE.json [--out REPORT.json] [--match REGEX]");
    const patternIndex = args.indexOf("--match");
    const report = analyzeTrace(JSON.parse(fs.readFileSync(input, "utf8")), patternIndex < 0 ? {} : { scriptPattern: new RegExp(args[patternIndex + 1], "i") });
    const json = JSON.stringify(report, null, 2) + "\n";
    const outputIndex = args.indexOf("--out");
    if (outputIndex >= 0) {
      if (!args[outputIndex + 1]) throw new Error("Missing --out path");
      const output = path.resolve(args[outputIndex + 1]);
      if (output === path.resolve(input)) throw new Error("Refusing to overwrite the input trace");
      fs.writeFileSync(output, json);
      console.log(`Wrote ${output}`);
    } else process.stdout.write(json);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { analyzeTrace };
