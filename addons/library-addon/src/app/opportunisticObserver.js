export function createOpportunisticObserver({ library, isEnabled }) {
  let generation = 0;

  function invalidate() {
    generation += 1;
  }

  async function observe(snapshot, context = null) {
    const token = ++generation;
    const isCurrent = () =>
      token === generation &&
      isEnabled() &&
      (!context || typeof context.isCurrent !== "function" || context.isCurrent());
    if (!snapshot?.threadId || !isCurrent()) {
      return { ok: false, reason: "cancelled" };
    }

    const existing = await library.getEntry(snapshot.threadId);
    if (!isCurrent()) return { ok: false, reason: "cancelled" };
    if (!existing) return { ok: true, saved: false, unchanged: true };

    const result = await library.observeThreadFacts(existing, snapshot, {
      shouldCancel: () => !isCurrent(),
    });
    return isCurrent()
      ? { ...result, saved: true }
      : { ok: false, reason: "cancelled" };
  }

  return {
    observe,
    invalidate,
    getSnapshot: () => ({ generation }),
  };
}
