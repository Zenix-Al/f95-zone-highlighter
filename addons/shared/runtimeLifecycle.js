const LIFECYCLE_STATES = Object.freeze([
  "new",
  "starting",
  "enabled",
  "disabling",
  "disabled",
  "refreshing",
  "tearing-down",
  "terminated",
  "failed",
]);

function normalizeReason(value, fallback) {
  const reason = String(value || "").trim();
  return reason || fallback;
}

function normalizeCommandInput(input, fallbackReason) {
  if (typeof input === "string") return { reason: input };
  if (!input || typeof input !== "object") return { reason: fallbackReason };
  return {
    commandId: String(input.commandId || "").trim(),
    reason: normalizeReason(input.reason, fallbackReason),
    routeContext: input.routeContext ?? null,
  };
}

function cancellationReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason.message
    : String(signal?.reason || "superseded");
}

/**
 * Shared post-registration lifecycle contract for core-connected add-ons.
 *
 * This helper owns only add-on runtime state. Registration, authentication, and
 * transport remain in coreBridge.js and the core add-on service.
 */
export function createAddonRuntimeLifecycle({
  addonId = "addon",
  onEnable = async () => ({ ok: true }),
  onDisable = async () => ({ ok: true }),
  onRefresh = async () => ({ ok: true }),
  onTeardown = async () => ({ ok: true }),
  onTeardownAcknowledged = async () => {},
} = {}) {
  let state = "new";
  let generation = 0;
  let routeContext = null;
  let terminal = false;
  let teardownAcknowledged = false;
  let teardownPromise = null;
  let commandSequence = 0;
  let queue = Promise.resolve();
  let active = null;
  const pendingOperations = new Map();
  const resources = new Map();

  function nextCommandId(kind, requestedId = "") {
    return requestedId || `${String(addonId || "addon")}:${kind}:${++commandSequence}`;
  }

  function isCurrentContext(controller, operationGeneration) {
    return (
      !controller.signal.aborted &&
      generation === operationGeneration &&
      !terminal
    );
  }

  function registerResource(id, cleanup, kind = "resource") {
    const resourceId = String(id || "").trim();
    if (!resourceId || typeof cleanup !== "function") return () => {};
    const existing = resources.get(resourceId);
    existing?.cleanup?.();
    resources.set(resourceId, { id: resourceId, kind: String(kind || "resource"), cleanup });
    return () => releaseResource(resourceId);
  }

  function releaseResource(id) {
    const resourceId = String(id || "").trim();
    const resource = resources.get(resourceId);
    if (!resource) return false;
    resources.delete(resourceId);
    try {
      resource.cleanup();
    } catch {
      // Resource cleanup is best effort. The owner remains observable until
      // the entry has been removed, so a later hard cleanup is idempotent.
    }
    return true;
  }

  function releaseAllResources() {
    for (const id of [...resources.keys()]) releaseResource(id);
  }

  function trackPendingOperation(id, promise, metadata = {}) {
    const operationId = String(id || `operation-${++commandSequence}`);
    const entry = {
      id: operationId,
      kind: String(metadata.kind || "operation"),
      generation: Number(metadata.generation || generation),
      command: String(metadata.command || ""),
      cancel: typeof metadata.cancel === "function" ? metadata.cancel : null,
    };
    pendingOperations.set(operationId, entry);
    return Promise.resolve(promise).finally(() => {
      if (pendingOperations.get(operationId) === entry) pendingOperations.delete(operationId);
    });
  }

  function abortActive(reason) {
    const hadActive = Boolean(active);
    active?.controller.abort(reason);
    for (const entry of pendingOperations.values()) {
      if (entry.cancel) entry.cancel(reason);
    }
    return hadActive;
  }

  function shouldAbortActive(kind) {
    if (!active) return false;
    if (kind === "refresh" && ["disabling", "tearing-down"].includes(state)) return false;
    return ["disable", "refresh", "teardown"].includes(kind);
  }

  function operationState(kind) {
    if (kind === "enable") return "starting";
    if (kind === "disable") return "disabling";
    if (kind === "refresh") return "refreshing";
    return "tearing-down";
  }

  function enqueue(kind, input, operation) {
    const details = normalizeCommandInput(input, kind);
    if (terminal && kind !== "teardown") return Promise.resolve({ ok: false, reason: "terminated" });
    if (kind === "enable" && state === "enabled" && !active) return Promise.resolve({ ok: true });
    if (kind === "disable" && state === "disabled" && !active) return Promise.resolve({ ok: true });
    if (shouldAbortActive(kind)) abortActive(`${kind}_superseded`);

    const operationGeneration = ++generation;
    const commandId = nextCommandId(kind, details.commandId);
    const run = async () => {
      if (terminal && kind !== "teardown") return { ok: false, reason: "terminated" };
      if (kind === "refresh" && state !== "enabled") return { ok: false, reason: "disabled" };

      const controller = new AbortController();
      const context = {
        commandId,
        command: kind,
        reason: details.reason,
        generation: operationGeneration,
        routeContext: details.routeContext ?? routeContext,
        signal: controller.signal,
        terminal: kind === "teardown" || terminal,
        isCurrent: () => isCurrentContext(controller, operationGeneration),
        trackPendingOperation: (id, promise, metadata = {}) =>
          trackPendingOperation(id, promise, {
            ...metadata,
            generation: operationGeneration,
            command: kind,
            signal: controller.signal,
          }),
      };
      active = { kind, commandId, generation: operationGeneration, controller };
      pendingOperations.set(commandId, {
        id: commandId,
        kind: "lifecycle",
        generation: operationGeneration,
        command: kind,
      });
      const previousState = state;
      state = operationState(kind);
      try {
        const result = await operation(context);
        if (kind === "enable" && context.isCurrent()) state = "enabled";
        else if (kind === "disable" && !terminal) state = "disabled";
        else if (kind === "refresh" && context.isCurrent()) state = "enabled";
        else if (!terminal && state === operationState(kind)) state = previousState;
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          return { ok: false, reason: "cancelled", details: { reason: cancellationReason(controller.signal) } };
        }
        state = "failed";
        throw error;
      } finally {
        pendingOperations.delete(commandId);
        if (active?.controller === controller) active = null;
      }
    };

    queue = queue.catch(() => {}).then(run);
    return queue;
  }

  function enable(input) {
    return enqueue("enable", input, onEnable);
  }

  function disable(input) {
    return enqueue("disable", input, onDisable);
  }

  function refresh(input) {
    return enqueue("refresh", input, onRefresh);
  }

  function invalidate(reason = "invalidated", nextRouteContext = routeContext) {
    generation += 1;
    routeContext = nextRouteContext;
    abortActive(reason);
    return { ok: true, generation, routeContext };
  }

  function teardown(input = "teardown") {
    if (teardownPromise) return teardownPromise;
    const details = normalizeCommandInput(input, "teardown");
    terminal = true;
    generation += 1;
    abortActive(details.reason);
    teardownPromise = enqueue("teardown", details, async (context) => {
      let result;
      try {
        result = await onTeardown(context);
      } catch {
        result = { ok: false, reason: "teardown_failed" };
      } finally {
        releaseAllResources();
        if (!teardownAcknowledged) {
          teardownAcknowledged = true;
          try {
            await onTeardownAcknowledged(context.reason, context);
          } catch {
            if (result?.ok !== false) result = { ok: false, reason: "teardown_ack_failed" };
          }
        }
      }
      state = "terminated";
      return result;
    });
    return teardownPromise;
  }

  function getSnapshot() {
    return {
      addonId: String(addonId || ""),
      state,
      generation,
      terminal,
      teardownAcknowledged,
      routeContext,
      resources: [...resources.values()].map(({ id, kind }) => ({ id, kind })),
      pendingOperations: [...pendingOperations.values()].map(({ id, kind, generation: operationGeneration, command }) => ({
        id,
        kind,
        generation: operationGeneration,
        command,
      })),
    };
  }

  return {
    enable,
    disable,
    refresh,
    invalidate,
    teardown,
    registerResource,
    releaseResource,
    trackPendingOperation,
    getSnapshot,
    getResourceSnapshot: () => getSnapshot().resources,
    getPendingOperationSnapshot: () => getSnapshot().pendingOperations,
    getGeneration: () => generation,
    getState: () => state,
    isTerminated: () => terminal,
    isTeardownAcknowledged: () => teardownAcknowledged,
    states: LIFECYCLE_STATES,
  };
}

export { LIFECYCLE_STATES };
