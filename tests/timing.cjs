"use strict";

const { performance } = require("perf_hooks");

function createTimingCollector({ enabled = false, now = () => performance.now() } = {}) {
  const startedAt = now();
  const records = [];
  function start() { return enabled ? now() : 0; }
  function record(kind, name, startAt, details = {}) {
    if (enabled) records.push({ kind, name, durationMs: now() - startAt, ...details });
  }
  function snapshot() {
    return { schemaVersion: 1, node: process.version, platform: process.platform,
      totalMs: now() - startedAt, records: records.map((item) => ({ ...item })) };
  }
  return { start, record, snapshot };
}

const timing = createTimingCollector({ enabled: Boolean(process.env.F95UE_TEST_TIMINGS) });
module.exports = { createTimingCollector, timing };
