// Keep bulk workflows below the core's shared sliding-window action limit.
export function createActionBudget(invoke, { now = Date.now, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let tail = Promise.resolve();
  let starts = [];
  let active = 0;
  let config = { windowMs: 5000, maxCount: 100 };
  let nextAt = 0;

  function configure(throttle) {
    const source = throttle?.coreAction || {};
    config = {
      windowMs: Math.max(250, Number(source.windowMs) || 5000),
      maxCount: Math.max(1, Number(source.maxCount) || 100),
    };
  }

  async function request(action, payload) {
    if (!active || !action.startsWith("idb.")) return invoke(action, payload);
    const task = tail.catch(() => {}).then(async () => {
      // Reserve at least 20% of the shared budget for core/UI activity.
      const allowance = Math.max(1, Math.floor(config.maxCount * 0.8));
      let result;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const interval = Math.ceil(config.windowMs / allowance);
        if (nextAt > now()) await wait(nextAt - now());
        starts = starts.filter((started) => now() - started < config.windowMs);
        if (starts.length >= allowance) {
          await wait(Math.max(1, config.windowMs - (now() - starts[0]) + 1));
          starts = starts.filter((started) => now() - started < config.windowMs);
        }
        starts.push(now());
        nextAt = now() + interval;
        result = await invoke(action, payload);
        if (!["rate_limited", "too_many_concurrent_requests"].includes(result?.reason)) return result;
        if (attempt < 3) await wait(config.windowMs * (attempt + 1));
      }
      return result;
    });
    tail = task.then(() => {}, () => {});
    return task;
  }

  async function run(throttle, callback) {
    configure(throttle);
    active += 1;
    try { return await callback(); }
    finally { active -= 1; }
  }

  return { request, run };
}
