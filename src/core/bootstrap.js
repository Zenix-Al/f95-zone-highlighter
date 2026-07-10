import { reportFeatureFailure, reportFeatureWarning } from "./featureHealth.js";

let lastBootstrapSummary = null;

function correlationId() {
  return `bootstrap:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function timeoutPromise(timeoutMs, controller, stepId) {
  if (!timeoutMs || timeoutMs <= 0) return null;
  return new Promise((_, reject) => setTimeout(() => {
    controller.abort(new DOMException("bootstrap step timeout", "AbortError"));
    reject(new Error(`Bootstrap step '${stepId}' timed out`));
  }, timeoutMs));
}

export async function runBootstrapStep(step, fn, fallbackValue = undefined, context = {}) {
  const descriptor = typeof step === "object"
    ? step
    : { id: String(step || "bootstrap-step"), classification: "optional", run: fn, fallbackValue };
  const id = String(descriptor.id || descriptor.name || "bootstrap-step");
  const classification = descriptor.classification || "optional";
  const controller = new AbortController();
  const startedAt = Date.now();
  try {
    const run = descriptor.run || fn;
    const value = await Promise.race([
      Promise.resolve().then(() => run({ ...context, signal: controller.signal, stepId: id })),
      timeoutPromise(descriptor.timeoutMs, controller, id),
    ].filter(Boolean));
    return { id, classification, status: "ok", value, durationMs: Date.now() - startedAt };
  } catch (error) {
    const result = { id, classification, status: "failed", error, durationMs: Date.now() - startedAt };
    if (classification === "recoverable" && typeof descriptor.fallback === "function") {
      try {
        result.value = await descriptor.fallback({ ...context, signal: controller.signal, stepId: id, error });
        result.status = "degraded";
      } catch (fallbackError) {
        result.fallbackError = fallbackError;
      }
    }
    return result;
  }
}

export async function runBootstrapPipeline(steps = [], context = {}) {
  const summary = { correlationId: context.correlationId || correlationId(), status: "healthy", steps: [], failedSteps: [], degradedSteps: [] };
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!step || typeof step.run !== "function") continue;
    const result = await runBootstrapStep(step, null, undefined, summary);
    summary.steps.push(result);
    if (result.status === "ok") {
      try { step.onResult?.(result.value); } catch (error) { reportFeatureWarning("Bootstrap", error, `${result.id}:onResult`); }
      continue;
    }
    if (result.status === "degraded") {
      summary.status = "degraded";
      summary.degradedSteps.push(result.id);
      reportFeatureWarning("Bootstrap", result.error, `${result.id}:${summary.correlationId}`);
      continue;
    }
    summary.failedSteps.push(result.id);
    if (result.classification === "required") {
      summary.status = "failed";
      reportFeatureFailure("Bootstrap", result.error, `${result.id}:${summary.correlationId}`);
      break;
    }
    summary.status = summary.status === "healthy" ? "degraded" : summary.status;
    summary.degradedSteps.push(result.id);
    reportFeatureWarning("Bootstrap", result.error, `${result.id}:${summary.correlationId}`);
  }
  lastBootstrapSummary = summary;
  return summary;
}

export function getLastBootstrapSummary() {
  return lastBootstrapSummary && JSON.parse(JSON.stringify(lastBootstrapSummary));
}

export function createBootstrapFailureHandler(step = "bootstrap") {
  return (error) => reportFeatureFailure("Bootstrap", error, step);
}
