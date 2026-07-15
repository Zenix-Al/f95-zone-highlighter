export async function invokeOptionalCoreAction(core, action, payload, fallback, timeoutMs) {
  const result = await core.invokeCoreAction(action, payload, timeoutMs);
  if (result?.reason === "unsupported_action" && typeof fallback === "function") {
    return await fallback(result);
  }
  return result;
}
