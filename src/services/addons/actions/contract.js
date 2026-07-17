import { getAddonActionScopePolicy } from "./policy.js";

export function objectPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? true
    : { ok: false, reason: "invalid_payload" };
}

export function redactActionResult(result) {
  return result && typeof result === "object"
    ? result
    : { ok: false, reason: "invalid_action_result" };
}

export function defineAction({
  id,
  requiredCapabilities,
  execute,
  validatePayload = objectPayload,
  validateResult,
  timeoutMs = 5_000,
  auditCategory = String(id).split(".")[0],
  ownership,
  cleanup,
}) {
  return Object.freeze({
    id,
    protocolVersion: 1,
    requiredCapabilities,
    validatePayload,
    validateResult,
    timeoutMs,
    auditCategory,
    scopePolicy: getAddonActionScopePolicy(id),
    ownership,
    cleanup,
    execute,
    redactResult: redactActionResult,
  });
}
