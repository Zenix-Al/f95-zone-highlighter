const ID = "library-status";
const STATES = {
  saved: ["Saved", "muted"], backlog: ["Backlog", "info"], playing: ["Playing", "info"],
  paused: ["Paused", "warning"], completed: ["Completed", "success"], dropped: ["Dropped", "muted"],
};

export function createLibraryLatestMarkerProvider({ core, getEntry, isActive }) {
  let registered = false;
  let generation = 0;
  let queued = false;
  async function start() {
    if (registered || !isActive()) return;
    const current = generation;
    const result = await core.invokeCoreAction("latest.markers.register", {
      id: ID, name: "Library status", description: "Show saved and personal Library status on Latest cards", priority: 50,
    });
    if (current !== generation || !isActive()) {
      if (result?.ok) await core.invokeCoreAction("latest.markers.unregister", { id: ID });
      return;
    }
    registered = result?.ok === true;
    if (registered) changed();
  }
  async function stop() {
    generation += 1;
    const wasRegistered = registered;
    registered = false;
    if (wasRegistered) await core.invokeCoreAction("latest.markers.unregister", { id: ID });
  }
  function cancel() { generation += 1; }
  function changed() {
    if (!registered || !isActive() || queued) return;
    generation += 1;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (registered && isActive()) void core.invokeCoreAction("latest.markers.invalidate", { id: ID });
    });
  }
  async function query(detail) {
    if (!registered || !isActive() || detail.providerId !== ID || typeof detail.requestId !== "string") return;
    const current = generation;
    const markers = {};
    const ids = [...new Set((Array.isArray(detail.threadIds) ? detail.threadIds : []).filter((id) => typeof id === "string" && /^[1-9]\d{0,19}$/.test(id)))].slice(0, 100);
    for (const id of ids) {
      if (current !== generation || !isActive()) return;
      try {
        const record = await getEntry(id);
        if (!record) continue;
        const [label, tone] = STATES[record.personal?.status] || STATES.saved;
        markers[id] = { label, tone, description: `In your Library: ${label}` };
      } catch { /* An unavailable record leaves its marker absent. */ }
    }
    if (current === generation && isActive()) await core.invokeCoreAction("latest.markers.respond", { providerId: ID, requestId: detail.requestId, markers });
  }
  return { start, stop, cancel, changed, query };
}
