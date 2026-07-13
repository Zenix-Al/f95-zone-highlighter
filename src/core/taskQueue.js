import { debugLog } from "./logger.js";
import { registerDiagnosticsProvider, reportFeatureWarning } from "./featureHealth.js";
import { resourceManager } from "./resourceManager.js";

const DUPLICATE_POLICIES = new Set(["drop-new", "drop-old", "replace-pending"]);
const OVERFLOW_POLICIES = new Set(["drop-oldest", "drop-new", "reject"]);
const taskQueues = new Map();

export function getTaskQueueDiagnostics() {
  const queues = [...taskQueues.values()].map((queue) => queue.snapshot());
  return { queueCount: queues.length, pendingCount: queues.reduce((total, queue) => total + queue.pendingCount, 0), runningCount: queues.filter((queue) => queue.runningKey).length, queues };
}

export function pauseAllTaskQueues(reason = "runtime suspended") {
  let cancelled = 0;
  for (const queue of taskQueues.values()) {
    cancelled += queue.clear(reason).pendingCount;
    queue.pause();
  }
  return { queueCount: taskQueues.size, cancelled };
}

export function resumeAllTaskQueues(routeContext = null) {
  for (const queue of taskQueues.values()) {
    if (routeContext) queue.setRouteContext(routeContext);
    queue.resume();
  }
  return getTaskQueueDiagnostics();
}

export async function disposeAllTaskQueues(reason = "runtime teardown") {
  const queues = [...taskQueues.values()];
  await Promise.all(queues.map((queue) => queue.dispose(reason)));
  return { disposed: queues.length, ...getTaskQueueDiagnostics() };
}

function createAbortError(message = "task cancelled") {
  return Object.assign(new Error(message), { name: "AbortError" });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

/**
 * Sequential, owner-scoped queue. Tasks receive a cancellation-aware context
 * and every accepted task settles when it runs, is cancelled, or fails.
 */
export function createTaskQueue({
  delay = 100,
  name = "UnnamedQueue",
  ownerId = `queue:${name}`,
  healthId = name,
  duplicatePolicy = "replace-pending",
  maxPending = 100,
  overflowPolicy = "drop-oldest",
  timeoutMs = 0,
  generation = 0,
  routeContext = null,
} = {}) {
  if (!DUPLICATE_POLICIES.has(duplicatePolicy)) throw new Error(`Unknown duplicate policy '${duplicatePolicy}'`);
  if (!OVERFLOW_POLICIES.has(overflowPolicy)) throw new Error(`Unknown overflow policy '${overflowPolicy}'`);
  if (!String(name).trim() || !String(ownerId).trim()) throw new Error("Task queues require name and ownerId");

  const pending = new Map();
  const idleWaiters = new Set();
  const resourceId = `queue:${ownerId}:${name}`;
  let currentGeneration = Number(routeContext?.generation ?? generation) || 0;
  let running = null;
  let timer = null;
  let paused = false;
  let disposed = false;
  let processing = false;
  let lastFailure = null;

  function settleCancelled(entry, reason) {
    entry.deferred.resolve({ status: "cancelled", key: entry.key, reason: String(reason || "cancelled") });
  }

  function snapshot() {
    return {
      name,
      ownerId,
      generation: currentGeneration,
      runningKey: running?.key || null,
      pendingKeys: [...pending.keys()],
      pendingCount: pending.size,
      paused,
      disposed,
      duplicatePolicy,
      maxPending,
      overflowPolicy,
      lastFailure: lastFailure && { ...lastFailure },
    };
  }

  function notifyIdle() {
    if (running || pending.size > 0 || processing) return;
    for (const resolve of idleWaiters) resolve(snapshot());
    idleWaiters.clear();
  }

  function whenIdle() {
    if (!running && pending.size === 0 && !processing) return Promise.resolve(snapshot());
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  function resolveDrainResult(reason = "queue disposed") {
    return { status: "cancelled", reason };
  }

  function reportQueueWarning(message, phase) {
    reportFeatureWarning(healthId, message, `taskQueue:${name}:${phase}`);
  }

  function schedule() {
    if (disposed || paused || processing || timer || pending.size === 0) return;
    timer = setTimeout(() => {
      timer = null;
      void processNext();
    }, Math.max(0, Number(delay) || 0));
  }

  async function processNext() {
    if (disposed || paused || processing) return;
    const next = pending.entries().next().value;
    if (!next) {
      notifyIdle();
      return;
    }
    const [key, entry] = next;
    pending.delete(key);
    if (entry.generation !== undefined && entry.generation !== currentGeneration) {
      settleCancelled(entry, "stale generation");
      schedule();
      return;
    }

    processing = true;
    const controller = new AbortController();
    if (entry.routeSignal?.aborted) controller.abort(entry.routeSignal.reason);
    else entry.routeSignal?.addEventListener("abort", () => controller.abort(entry.routeSignal.reason), { once: true });
    const startedAt = Date.now();
    running = { ...entry, controller, startedAt };
    let timeoutId;
    const taskContext = {
      signal: controller.signal,
      key: entry.key,
      queueName: name,
      ownerId,
      generation: entry.generation ?? currentGeneration,
      correlationId: entry.correlationId || "",
      routeGeneration: entry.generation ?? currentGeneration,
      enqueuedAt: entry.enqueuedAt,
      startedAt,
    };
    const result = Promise.resolve().then(() => entry.task(taskContext));
    result.catch(() => undefined);
    const effectiveTimeoutMs = Math.max(0, Number(entry.timeoutMs) || 0);
    const timeout = new Promise((_, reject) => {
      if (effectiveTimeoutMs <= 0) return;
      timeoutId = setTimeout(() => {
        controller.abort(createAbortError("task timeout"));
        reject(createAbortError("task timeout"));
      }, effectiveTimeoutMs);
    });
    const aborted = new Promise((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(controller.signal.reason || createAbortError()),
        { once: true },
      );
    });

    try {
      const value = await Promise.race([result, timeout, aborted]);
      if (controller.signal.aborted) {
        settleCancelled(entry, controller.signal.reason || "cancelled");
      } else {
        entry.deferred.resolve({ status: "completed", key, value });
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        settleCancelled(entry, controller.signal.reason || error?.message || "cancelled");
      } else {
        lastFailure = { key, message: error?.message || String(error), timestamp: Date.now() };
        reportQueueWarning(lastFailure.message, "task-failure");
        entry.deferred.reject(error);
      }
    } finally {
      clearTimeout(timeoutId);
      if (running?.key === key) running = null;
      processing = false;
      if (!disposed && !paused) schedule();
      notifyIdle();
    }
  }

  function cancelPending(reason = "cancelled") {
    const entries = [...pending.values()];
    pending.clear();
    entries.forEach((entry) => settleCancelled(entry, reason));
    notifyIdle();
    return entries.length;
  }

  function cancelRunning(reason = "cancelled") {
    if (!running) return false;
    running.controller.abort(createAbortError(reason));
    return true;
  }

  function clear(reason = "cleared") {
    if (timer) clearTimeout(timer);
    timer = null;
    const pendingCount = cancelPending(reason);
    const runningCancelled = cancelRunning(reason);
    return { pendingCount, runningCancelled };
  }

  function add(key, task, taskGeneration = currentGeneration, taskTimeoutMs = timeoutMs) {
    if (disposed) return Promise.resolve({ status: "cancelled", key, reason: "queue disposed" });
    if (typeof task !== "function") return Promise.reject(new TypeError("Task queue task must be a function"));
    const suppliedRouteContext = taskGeneration && typeof taskGeneration === "object" ? taskGeneration : null;
    const resolvedGeneration = suppliedRouteContext ? Number(suppliedRouteContext.generation) || 0 : taskGeneration;
    if (resolvedGeneration !== undefined && resolvedGeneration !== currentGeneration) {
      return Promise.resolve({ status: "cancelled", key, reason: "stale generation" });
    }

    const existing = pending.get(key);
    if (existing || running?.key === key) {
      if (duplicatePolicy === "drop-new") {
        reportQueueWarning(`duplicate task '${key}' dropped`, "duplicate");
        return Promise.resolve({ status: "cancelled", key, reason: "duplicate drop-new" });
      }
      if (existing) {
        pending.delete(key);
        settleCancelled(existing, `${duplicatePolicy} duplicate`);
      } else if (duplicatePolicy === "drop-old") {
        cancelRunning("drop-old duplicate");
      } else {
        reportQueueWarning(`running duplicate task '${key}' dropped`, "duplicate");
        return Promise.resolve({ status: "cancelled", key, reason: "running duplicate" });
      }
    }

    if (pending.size >= Math.max(1, Number(maxPending) || 1)) {
      if (overflowPolicy === "reject") return Promise.reject(new Error(`Task queue '${name}' is full`));
      if (overflowPolicy === "drop-new") {
        reportQueueWarning("task dropped due to queue overflow", "overflow");
        return Promise.resolve({ status: "cancelled", key, reason: "queue overflow" });
      }
      const oldest = pending.entries().next().value;
      if (oldest) {
        pending.delete(oldest[0]);
        settleCancelled(oldest[1], "queue overflow drop-oldest");
      }
    }

    const deferred = createDeferred();
    pending.set(key, {
      key,
      task,
      generation: resolvedGeneration,
      correlationId: suppliedRouteContext?.correlationId || "",
      routeSignal: suppliedRouteContext?.signal || null,
      timeoutMs: taskTimeoutMs,
      enqueuedAt: Date.now(),
      deferred,
    });
    debugLog(name, `Task '${key}' added. Queue size: ${pending.size}`);
    schedule();
    return deferred.promise;
  }

  function setGeneration(nextGeneration) {
    currentGeneration = nextGeneration;
    for (const [key, entry] of pending.entries()) {
      if (entry.generation !== undefined && entry.generation !== currentGeneration) {
        pending.delete(key);
        settleCancelled(entry, "stale generation");
      }
    }
    if (running && running.generation !== undefined && running.generation !== currentGeneration) {
      cancelRunning("stale generation");
    }
    schedule();
  }

  function setRouteContext(nextRouteContext) {
    setGeneration(Number(nextRouteContext?.generation) || 0);
    return snapshot();
  }

  function start() {
    paused = false;
    schedule();
  }

  function pause() {
    paused = true;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function resume() {
    if (disposed) return;
    paused = false;
    schedule();
  }

  function dispose(reason = "disposed") {
    if (disposed) return Promise.resolve({ status: "disposed", reason });
    disposed = true;
    clear(reason);
    resourceManager.unregister(resourceId);
    taskQueues.delete(resourceId);
    notifyIdle();
    return Promise.resolve({ status: "disposed", reason });
  }

  function drain(reason = "queue disposed") {
    if (disposed) return Promise.resolve({ status: "disposed", reason });
    return whenIdle().then((snapshotState) => {
      if (snapshotState.disposed) {
        return resolveDrainResult(reason);
      }
      return { status: "cancelled", reason };
    });
  }

  resourceManager.register(resourceId, () => dispose("owner released"), ownerId);
  const api = {
    add,
    start,
    clear,
    cancelPending,
    cancelRunning,
    whenIdle,
    drain,
    pause,
    resume,
    dispose,
    setGeneration,
    setRouteContext,
    snapshot,
    size: () => pending.size,
  };
  taskQueues.set(resourceId, api);
  return api;
}

registerDiagnosticsProvider("queues", () => {
  const diagnostic = getTaskQueueDiagnostics();
  return { queueCount: diagnostic.queueCount, pendingCount: diagnostic.pendingCount, runningCount: diagnostic.runningCount };
});

export function createDebouncedTask(task, delay = 100) {
  let timeoutId = null;
  const debouncedTask = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => task.apply(this, args), delay);
  };
  debouncedTask.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  return debouncedTask;
}
