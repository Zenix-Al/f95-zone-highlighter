// One destination-page operation; no timers or global scheduling of its own.
export function createHostRunScope(isCurrent = () => true) {
  const controller = new AbortController();
  const cleanups = new Set();
  function dispose() {
    if (controller.signal.aborted) return;
    controller.abort();
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error("[masked-direct-addon] Run cleanup failed.", error);
      }
    }
    cleanups.clear();
  }
  function current() {
    if (!controller.signal.aborted && !isCurrent()) dispose();
    return !controller.signal.aborted;
  }
  return {
    signal: controller.signal,
    current,
    dispose,
    own(cleanup) {
      if (controller.signal.aborted) cleanup();
      else cleanups.add(cleanup);
    },
  };
}
