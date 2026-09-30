export const EXAMPLE_MARKER_PROVIDER_ID = "example-demo";

export function createExampleMarkerProvider({ core, isActive }) {
  let registered = false;
  let generation = 0;

  async function register() {
    if (!isActive()) return { ok: false, reason: "addon_disabled" };
    if (registered) return { ok: true, value: { alreadyRegistered: true } };
    const current = generation;
    const result = await core.invokeCoreAction("latest.markers.register", {
      id: EXAMPLE_MARKER_PROVIDER_ID,
      name: "Example marker",
      description: "Opt-in API demo: label the first visible Latest card.",
      priority: 0,
    });
    if (current !== generation || !isActive()) {
      if (result?.ok) await core.invokeCoreAction("latest.markers.unregister", { id: EXAMPLE_MARKER_PROVIDER_ID });
      return { ok: false, reason: "registration_superseded" };
    }
    registered = result?.ok === true;
    return result;
  }

  async function unregister() {
    generation += 1;
    if (!registered) return { ok: true, value: { alreadyUnregistered: true } };
    registered = false;
    return core.invokeCoreAction("latest.markers.unregister", { id: EXAMPLE_MARKER_PROVIDER_ID });
  }

  function invalidate() {
    return registered && isActive()
      ? core.invokeCoreAction("latest.markers.invalidate", { id: EXAMPLE_MARKER_PROVIDER_ID })
      : Promise.resolve({ ok: false, reason: "provider_not_registered" });
  }

  async function query(detail) {
    if (!registered || !isActive() || detail?.providerId !== EXAMPLE_MARKER_PROVIDER_ID || typeof detail.requestId !== "string") return;
    const current = generation;
    const id = (Array.isArray(detail.threadIds) ? detail.threadIds : [])
      .find((value) => typeof value === "string" && /^[1-9]\d{0,19}$/.test(value));
    const markers = id ? { [id]: { label: "Example", tone: "info", description: "Example Add-on marker API demo" } } : {};
    if (current === generation && registered && isActive()) {
      await core.invokeCoreAction("latest.markers.respond", {
        providerId: EXAMPLE_MARKER_PROVIDER_ID, requestId: detail.requestId, markers,
      });
    }
  }

  return { register, unregister, invalidate, query };
}
