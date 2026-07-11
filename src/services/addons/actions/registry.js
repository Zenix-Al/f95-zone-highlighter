const actions = new Map();

function readonlyDescriptor(descriptor) {
  return Object.freeze({
    id: descriptor.id,
    protocolVersion: descriptor.protocolVersion,
    requiredCapabilities: Object.freeze([...descriptor.requiredCapabilities]),
    timeoutMs: descriptor.timeoutMs,
    auditCategory: descriptor.auditCategory,
  });
}

export function registerAction(descriptor) {
  const id = String(descriptor?.id || "").trim();
  if (!id || typeof descriptor?.execute !== "function" || typeof descriptor?.validatePayload !== "function") {
    throw new Error("Add-on action descriptor requires id, validatePayload, and execute.");
  }
  if (actions.has(id)) throw new Error(`Duplicate add-on action '${id}'.`);
  const normalized = Object.freeze({
    ...descriptor,
    id,
    protocolVersion: Number(descriptor.protocolVersion) || 1,
    requiredCapabilities: Object.freeze([...(descriptor.requiredCapabilities || [])]),
    timeoutMs: Math.max(1, Number(descriptor.timeoutMs) || 5_000),
    auditCategory: String(descriptor.auditCategory || "addon-action"),
    redactResult: typeof descriptor.redactResult === "function" ? descriptor.redactResult : (result) => result,
  });
  actions.set(id, normalized);
  return normalized;
}

export function getAction(id) { return actions.get(String(id || "").trim()) || null; }
export function getActionSnapshot() { return Object.freeze([...actions.values()].map(readonlyDescriptor)); }
export function resetActionRegistryForTests() { actions.clear(); }

export async function executeActionDescriptor(descriptor, context) {
  const authorization = typeof context?.authorize === "function" ? context.authorize() : null;
  if (authorization) return { ok: false, reason: authorization };
  const validation = descriptor.validatePayload(context.payload);
  if (validation !== true && validation?.ok !== true) {
    return { ok: false, reason: validation?.reason || "invalid_payload" };
  }
  let timeoutId;
  try {
    const result = await Promise.race([
      Promise.resolve(descriptor.execute(context)),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("action_timeout")), descriptor.timeoutMs); }),
    ]);
    return descriptor.redactResult(result);
  } catch (error) {
    return { ok: false, reason: error?.message === "action_timeout" ? "action_timeout" : "action_failed" };
  } finally { clearTimeout(timeoutId); }
}
