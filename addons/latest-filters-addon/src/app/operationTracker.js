export function createOperationTracker(state) {
  function begin(context, id, promise, kind) {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    state.pendingCancellers.add(cancel);
    const tracked = context?.trackPendingOperation
      ? context.trackPendingOperation(id, promise, { kind, cancel })
      : Promise.resolve(promise);
    return {
      cancelled: () => cancelled,
      promise: Promise.resolve(tracked).finally(() =>
        state.pendingCancellers.delete(cancel),
      ),
    };
  }

  return {
    begin,
    cancelAll() {
      for (const cancel of state.pendingCancellers) cancel();
      state.pendingCancellers.clear();
    },
  };
}
