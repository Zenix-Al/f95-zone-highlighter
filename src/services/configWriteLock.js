const CONFIG_WRITE_LOCK_NAME = "f95ue:config:canonical-write:v1";

export class ConfigWriteLockError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ConfigWriteLockError";
    this.code = reason;
  }
}

/** Serialize complete GM config transactions across tabs on the supported HTTPS origin. */
export async function withConfigWriteLock(operation, {
  lockManager = globalThis.navigator?.locks,
  pageLocation = globalThis.location,
} = {}) {
  if (pageLocation?.protocol !== "https:") throw new ConfigWriteLockError("config_https_required");
  if (typeof lockManager?.request !== "function") throw new ConfigWriteLockError("config_lock_unavailable");
  return lockManager.request(CONFIG_WRITE_LOCK_NAME, { mode: "exclusive" }, async (lock) => {
    if (!lock) throw new ConfigWriteLockError("config_lock_unavailable");
    return operation();
  });
}
