import {
  registerDiagnosticsProvider,
  reportFeatureFailure,
  reportFeatureWarning,
  setFeatureStatus,
} from "./featureHealth.js";

const BOOTSTRAP_CLASSIFICATIONS = new Set(["required", "optional", "recoverable"]);
const DEFAULT_STEP_TIMEOUT_MS = 15000;
let lastBootstrapSummary = null;
const activeBootstrapControllers = new Set();

function createCorrelationId() {
  return `bootstrap:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error) {
  return error?.message ? String(error.message) : String(error || "Unknown bootstrap error");
}

function validateStep(step) {
  if (!step || typeof step !== "object") return "bootstrap step must be an object";
  if (!String(step.id || "").trim()) return "bootstrap step id is required";
  if (!BOOTSTRAP_CLASSIFICATIONS.has(step.classification)) return `bootstrap step '${step.id}' has invalid classification`;
  if (typeof step.run !== "function") return `bootstrap step '${step.id}' must provide run()`;
  if (step.classification === "recoverable" && typeof step.fallback !== "function") {
    return `recoverable bootstrap step '${step.id}' must provide fallback()`;
  }
  if (!Number.isFinite(Number(step.timeoutMs)) || Number(step.timeoutMs) <= 0) {
    return `bootstrap step '${step.id}' must provide a positive timeoutMs`;
  }
  return null;
}

function createStepController(parentSignal) {
  const controller = new AbortController();
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener("abort", () => controller.abort(parentSignal.reason), { once: true });
  return controller;
}

function copyStepResult(result) {
  const copy = { ...result };
  delete copy.value;
  return copy;
}

export async function runBootstrapStep(step, context = {}) {
  const validationError = validateStep(step);
  const id = String(step?.id || "invalid-step").trim() || "invalid-step";
  const classification = BOOTSTRAP_CLASSIFICATIONS.has(step?.classification)
    ? step.classification
    : "required";
  const startedAt = Date.now();
  if (validationError) {
    return { id, classification, status: "failed", errorMessage: validationError, startedAt, completedAt: Date.now(), durationMs: 0, timedOut: false };
  }

  const controller = createStepController(context.signal);
  const timeoutMs = Number(step.timeoutMs || DEFAULT_STEP_TIMEOUT_MS);
  let timeoutId;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const error = new DOMException(`Bootstrap step '${id}' timed out`, "AbortError");
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    const value = await Promise.race([
      Promise.resolve().then(() => step.run({ ...context, signal: controller.signal, stepId: id })),
      timeout,
    ]);
    return { id, classification, status: "ok", value, startedAt, completedAt: Date.now(), durationMs: Date.now() - startedAt, timedOut: false };
  } catch (error) {
    const result = { id, classification, status: "failed", errorMessage: errorMessage(error), startedAt, completedAt: Date.now(), durationMs: Date.now() - startedAt, timedOut };
    if (classification === "recoverable") {
      try {
        result.value = await step.fallback({ ...context, signal: context.signal, stepId: id, error });
        result.status = "degraded";
        result.fallbackApplied = true;
      } catch (fallbackError) {
        result.fallbackApplied = false;
        result.fallbackErrorMessage = errorMessage(fallbackError);
      }
    }
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runBootstrapPipeline(steps = [], context = {}) {
  const controller = new AbortController();
  activeBootstrapControllers.add(controller);
  if (context.signal?.aborted) controller.abort(context.signal.reason);
  else context.signal?.addEventListener("abort", () => controller.abort(context.signal.reason), { once: true });
  const startedAt = Date.now();
  const summary = {
    correlationId: String(context.correlationId || createCorrelationId()),
    status: "healthy",
    startedAt,
    completedAt: 0,
    durationMs: 0,
    steps: [],
    failedSteps: [],
    degradedSteps: [],
  };

  try {
    for (const step of Array.isArray(steps) ? steps : []) {
      if (controller.signal.aborted) break;
      const result = await runBootstrapStep(step, { correlationId: summary.correlationId, signal: controller.signal });
      if (result.status === "ok" && !controller.signal.aborted) {
        try { step.onResult?.(result.value); }
        catch (error) {
          result.status = "failed";
          result.errorMessage = errorMessage(error);
        }
      }
      summary.steps.push(copyStepResult(result));
      if (result.status === "ok") continue;

      const eventContext = { correlationId: summary.correlationId, details: { stepId: result.id, classification: result.classification, timedOut: result.timedOut } };
      if (result.status === "degraded") {
        summary.status = "degraded";
        summary.degradedSteps.push(result.id);
        reportFeatureWarning("Bootstrap", result.errorMessage, `BOOT_STEP_${result.id}`, eventContext);
        continue;
      }

      summary.failedSteps.push(result.id);
      if (result.classification === "required") {
        summary.status = "failed";
        reportFeatureFailure("Bootstrap", result.errorMessage, `BOOT_STEP_${result.id}`, eventContext);
        controller.abort(new Error(`required bootstrap step '${result.id}' failed`));
        break;
      }
      summary.status = "degraded";
      summary.degradedSteps.push(result.id);
      reportFeatureWarning("Bootstrap", result.errorMessage, `BOOT_STEP_${result.id}`, eventContext);
    }
  } finally {
    activeBootstrapControllers.delete(controller);
  }

  if (controller.signal.aborted && controller._f95ueTeardownAbort) {
    summary.status = "cancelled";
    summary.cancelled = true;
  }
  summary.completedAt = Date.now();
  summary.durationMs = summary.completedAt - startedAt;
  if (!summary.cancelled) {
    lastBootstrapSummary = summary;
    setFeatureStatus("Bootstrap", summary.status === "healthy" ? "running" : summary.status === "degraded" ? "degraded" : "failing", `${summary.status} startup`);
  }
  return getLastBootstrapSummary() || JSON.parse(JSON.stringify(summary));
}

export function getLastBootstrapSummary() {
  return lastBootstrapSummary && JSON.parse(JSON.stringify(lastBootstrapSummary));
}

export function clearBootstrapSummary() {
  lastBootstrapSummary = null;
}

export function abortActiveBootstrap(reason = "bootstrap cancelled") {
  const abortReason = reason instanceof Error ? reason : new DOMException(String(reason), "AbortError");
  for (const controller of activeBootstrapControllers) {
    controller._f95ueTeardownAbort = true;
    controller.abort(abortReason);
  }
  return activeBootstrapControllers.size;
}

export const resetBootstrapForTests = clearBootstrapSummary;

export function createBootstrapFailureHandler(step = "bootstrap") {
  return (error) => reportFeatureFailure("Bootstrap", error, step);
}

registerDiagnosticsProvider("bootstrap", () => getLastBootstrapSummary() || { status: "idle" });
