import {
  getLastBootstrapSummary,
  resetBootstrapForTests,
  runBootstrapPipeline,
} from "../../src/core/bootstrap.js";
import {
  clearHealthEventsForTests,
  getHealthDiagnostics,
  getHealthEvents,
} from "../../src/core/featureHealth.js";
import { teardownAll } from "../../src/core/teardown.js";

export async function runDegradedBootstrapScenario() {
  resetBootstrapForTests();
  clearHealthEventsForTests();
  const summary = await runBootstrapPipeline([
    { id: "success", classification: "required", timeoutMs: 100, run: () => "ready" },
    { id: "optional", classification: "optional", timeoutMs: 100, run: () => { throw new Error("optional unavailable token=secret"); } },
    { id: "recover", classification: "recoverable", timeoutMs: 100, run: () => { throw new Error("primary unavailable"); }, fallback: () => "fallback" },
  ], { correlationId: "bootstrap:test-degraded" });
  return { summary, diagnostics: getHealthDiagnostics(), events: getHealthEvents() };
}

export async function runFreshBootstrapScenario() {
  resetBootstrapForTests();
  const first = await runBootstrapPipeline([
    { id: "first", classification: "required", timeoutMs: 100, run: () => true },
  ], { correlationId: "bootstrap:first" });
  await teardownAll("BOOT-01:test-reset", { featureTimeoutMs: 1 });
  const idle = getLastBootstrapSummary();
  const second = await runBootstrapPipeline([
    { id: "second", classification: "required", timeoutMs: 100, run: () => true },
  ], { correlationId: "bootstrap:second" });
  return { first, idle, second };
}
