/** Bounded readiness polling; registration and failure policy belong to the caller. */
export async function waitForCoreReady(core, {
  timeoutMs = 10000,
  pingTimeoutMs = 500,
  intervalMs = 750,
  signal,
  now = Date.now,
  delay,
} = {}) {
  const bounded = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : fallback;
  timeoutMs = bounded(timeoutMs, 10000);
  pingTimeoutMs = bounded(pingTimeoutMs, 500);
  intervalMs = bounded(intervalMs, 750);
  const deadline = now() + Math.max(1, timeoutMs);
  const maxAttempts = Math.ceil(Math.max(1, timeoutMs) / Math.max(1, intervalMs));
  let attempts = 0;
  let result = { ok: false, apiVersion: "" };
  while (!signal?.aborted && now() < deadline && attempts < maxAttempts) {
    const started = now();
    attempts += 1;
    result = await core.waitForCorePing(Math.min(pingTimeoutMs, deadline - started), signal);
    if (signal?.aborted) break;
    if (result?.ok) return { ...result, attempts };
    const pause = Math.min(Math.max(0, intervalMs - (now() - started)), Math.max(0, deadline - now()));
    if (pause > 0) {
      // Race cancellation without leaving an abort listener behind.
      await new Promise((resolve, reject) => {
        let timer;
        const abort = () => finish();
        const finish = (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) reject(error); else resolve(); };
        signal?.addEventListener("abort", abort, { once: true });
        if (delay) Promise.resolve().then(() => delay(pause)).then(() => finish(), finish);
        else timer = window.setTimeout(finish, pause);
        if (signal?.aborted) finish();
      });
    }
  }
  return { ok: false, apiVersion: "", attempts };
}
