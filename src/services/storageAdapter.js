const STORAGE_PROBE_PREFIX = "f95ue:storage:probe:";

function storageReason(step, suffix) {
  return `${String(step || "storage")}_${String(suffix || "failed")}`;
}

function boundedManagerName(api) {
  const value = api?.info?.scriptHandler || globalThis.GM_info?.scriptHandler || "unknown";
  return String(value || "unknown").trim().slice(0, 80) || "unknown";
}

function createProbeId() {
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function operationResult(value, step) {
  if (value === false) throw new Error(storageReason(step, "returned_false"));
  return value;
}

export function getStorageCapabilities(api = globalThis.GM) {
  const source = api || globalThis.GM;
  return Object.freeze({
    manager: boundedManagerName(source),
    canRead: typeof source?.getValue === "function",
    canWrite: typeof source?.setValue === "function",
    canDelete: typeof source?.deleteValue === "function",
    canReadMany: typeof source?.getValues === "function",
  });
}

export async function probeStorageCapabilities(api = globalThis.GM, { probeId = createProbeId() } = {}) {
  const capabilities = getStorageCapabilities(api);
  const source = api || globalThis.GM;
  const key = `${STORAGE_PROBE_PREFIX}${String(probeId || createProbeId()).slice(0, 80)}`;
  const nonce = `probe:${createProbeId()}`;
  let wrote = false;
  let failedStep = "";
  let reason = "";
  let cleanupReason = "";

  for (const [supported, step] of [
    [capabilities.canRead, "read"],
    [capabilities.canWrite, "write"],
    [capabilities.canDelete, "delete"],
  ]) {
    if (supported) continue;
    return Object.freeze({
      ok: false,
      ...capabilities,
      failedStep: step,
      reason: storageReason(step, "unsupported"),
      cleanupReason: "",
    });
  }

  try {
    failedStep = "read";
    await source.getValue(key, null);
    failedStep = "write";
    operationResult(await source.setValue(key, nonce), "write");
    wrote = true;
    failedStep = "readback";
    const stored = await source.getValue(key, null);
    if (stored !== nonce) throw new Error("readback_mismatch");
  } catch (error) {
    reason = String(error?.message || storageReason(failedStep, "failed")).slice(0, 120);
  } finally {
    if (wrote) {
      try {
        operationResult(await source.deleteValue(key), "delete");
        const remaining = await source.getValue(key, null);
        if (remaining !== null && remaining !== undefined) throw new Error("delete_verification_failed");
      } catch (error) {
        cleanupReason = String(error?.message || "delete_failed").slice(0, 120);
      }
    }
  }

  if (cleanupReason) {
    return Object.freeze({
      ok: false,
      ...capabilities,
      failedStep: "delete",
      reason: reason || "cleanup_failed",
      cleanupReason,
    });
  }
  if (reason) {
    return Object.freeze({ ok: false, ...capabilities, failedStep, reason, cleanupReason: "" });
  }
  return Object.freeze({
    ok: true,
    ...capabilities,
    failedStep: "",
    reason: "",
    cleanupReason: "",
  });
}

export function createStorageAdapter(api = globalThis.GM) {
  const getApi = () => api || globalThis.GM || (() => { throw new Error("Userscript storage API is unavailable"); })();
  return {
    get: (key, fallback) => getApi().getValue(key, fallback),
    set: (key, value) => getApi().setValue(key, value),
    delete: (key) => {
      const method = getApi().deleteValue;
      if (typeof method !== "function") throw new Error("delete_unsupported");
      return method.call(getApi(), key);
    },
    async getMany(keys) {
      if (typeof getApi().getValues === "function") return (await getApi().getValues(keys)) || {};
      return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await getApi().getValue(key)])));
    },
    capabilities: () => getStorageCapabilities(getApi()),
    probe: (options) => probeStorageCapabilities(getApi(), options),
  };
}

export const storageAdapter = createStorageAdapter();
