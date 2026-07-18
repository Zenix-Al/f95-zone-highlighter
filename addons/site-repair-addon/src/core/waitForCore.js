import { debugLog } from "../../../shared/debugLog.js";

export async function waitForCorePingUntilReady(
  core,
  {
    maxAttempts = 40,
    pingTimeoutMs = 500,
    retryDelayMs = 250,
    delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
  } = {},
) {
  const attempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await core.waitForCorePing(pingTimeoutMs);
    debugLog("site-repair-addon", `Core readiness ping ${attempt}/${attempts} settled.`, {
      data: result,
    });
    if (result?.ok) return { ...result, attempts: attempt };
    if (attempt < attempts) await delay(retryDelayMs);
  }
  return { ok: false, apiVersion: "", attempts };
}
