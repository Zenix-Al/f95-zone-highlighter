export function createExampleLifecycle({ onEnable, onDisable, onRefresh, onTeardown, onTeardownAcknowledged }) {
  let queue = Promise.resolve();
  let generation = 0;
  let activeController = null;
  let terminal = false;
  let acknowledged = false;
  let teardownPromise = null;

  function enqueue(kind, operation) {
    const nextGeneration = ++generation;
    if (kind === "disable" || kind === "refresh" || kind === "teardown") {
      activeController?.abort();
    }
    queue = queue.catch(() => {}).then(async () => {
      if (terminal && kind !== "teardown") return { ok: false, reason: "terminated" };
      const controller = new AbortController();
      activeController = controller;
      try {
        return await operation({
          generation: nextGeneration,
          signal: controller.signal,
          isCurrent: () => !controller.signal.aborted && generation === nextGeneration && !terminal,
        });
      } finally {
        if (activeController === controller) activeController = null;
      }
    });
    return queue;
  }

  function enable() {
    return enqueue("enable", onEnable);
  }

  function disable() {
    return enqueue("disable", onDisable);
  }

  function refresh() {
    return enqueue("refresh", onRefresh);
  }

  function teardown(reason = "teardown") {
    if (teardownPromise) return teardownPromise;
    terminal = true;
    teardownPromise = enqueue("teardown", async (context) => {
      const result = await onTeardown({ ...context, reason });
      if (!acknowledged) {
        acknowledged = true;
        await onTeardownAcknowledged(reason);
      }
      return result;
    });
    return teardownPromise;
  }

  return {
    enable,
    disable,
    refresh,
    teardown,
    getGeneration: () => generation,
    isTerminated: () => terminal,
    isTeardownAcknowledged: () => acknowledged,
  };
}
