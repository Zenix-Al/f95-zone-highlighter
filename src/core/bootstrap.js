function logBootstrapError(step, error) {
  console.error(`[Bootstrap] ${step} failed:`, error);
}

export async function runBootstrapStep(step, fn, fallbackValue = undefined) {
  try {
    return await fn();
  } catch (error) {
    logBootstrapError(step, error);
    return fallbackValue;
  }
}

export async function runBootstrapPipeline(steps = []) {
  for (const step of Array.isArray(steps) ? steps : []) {
    if (!step || typeof step !== "object") continue;

    const name = String(step.name || "bootstrap-step");
    const run = typeof step.run === "function" ? step.run : null;
    if (!run) continue;

    const result = await runBootstrapStep(name, run, step.fallbackValue);

    if (typeof step.onResult === "function") {
      try {
        step.onResult(result);
      } catch (error) {
        logBootstrapError(`${name}:onResult`, error);
      }
    }
  }
}

export function createBootstrapFailureHandler(step = "bootstrap") {
  return (error) => {
    logBootstrapError(step, error);
  };
}
