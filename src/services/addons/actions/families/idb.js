import { defineAction } from "../contract.js";

async function runIdb(operation) {
  try { return await operation(); }
  catch (error) {
    console.warn("[addonsService] idb core-action failed:", error);
    return { ok: false, reason: "idb_error" };
  }
}

export async function actionIdbGet(addonId, payload, measure, maxBytes, get) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  if (!Object.hasOwn(payload || {}, "key")) return { ok: false, reason: "key_required" };
  return runIdb(async () => {
    const value = await get(addonId, payload || {});
    return { ok: true, value: typeof value === "undefined" ? null : value };
  });
}

export async function actionIdbPut(addonId, payload, measure, maxBytes, put) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  if (!Object.hasOwn(payload || {}, "value")) return { ok: false, reason: "value_required" };
  return runIdb(async () => ({ ok: true, value: await put(addonId, payload || {}) }));
}

export async function actionIdbDelete(addonId, payload, measure, maxBytes, remove) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  if (!Object.hasOwn(payload || {}, "key")) return { ok: false, reason: "key_required" };
  return runIdb(async () => { await remove(addonId, payload || {}); return { ok: true }; });
}

export async function actionIdbBulkPut(addonId, payload, measure, maxBytes, maxItems, put) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length > maxItems) return { ok: false, reason: "too_many_items" };
  return runIdb(async () => { await put(addonId, { ...payload, entries }); return { ok: true, value: entries.length }; });
}

export async function actionIdbBulkDelete(addonId, payload, measure, maxBytes, maxItems, remove) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (keys.length > maxItems) return { ok: false, reason: "too_many_items" };
  return runIdb(async () => { await remove(addonId, { ...payload, keys }); return { ok: true, value: keys.length }; });
}

export async function actionIdbQuery(addonId, payload, measure, maxBytes, query) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  return runIdb(async () => ({ ok: true, value: await query(addonId, payload || {}) }));
}

export async function actionIdbCount(addonId, payload, measure, maxBytes, count) {
  if (measure(payload) > maxBytes) return { ok: false, reason: "payload_too_large" };
  return runIdb(async () => ({ ok: true, value: Number(await count(addonId, payload || {}) || 0) }));
}

function contextArgs(context) {
  return [context.addonId, context.payload, context.deps.measurePayloadBytes, context.limits.maxAddonIdbPayloadBytes];
}

export const idbActions = Object.freeze([
  defineAction({ id: "idb.get", requiredCapabilities: ["idb"], execute: (c) => actionIdbGet(...contextArgs(c), c.deps.idbGetForAddon) }),
  defineAction({ id: "idb.put", requiredCapabilities: ["idb"], execute: (c) => actionIdbPut(...contextArgs(c), c.deps.idbPutForAddon) }),
  defineAction({ id: "idb.delete", requiredCapabilities: ["idb"], execute: (c) => actionIdbDelete(...contextArgs(c), c.deps.idbDeleteForAddon) }),
  defineAction({ id: "idb.bulkPut", requiredCapabilities: ["idb"], execute: (c) => actionIdbBulkPut(...contextArgs(c), c.limits.maxAddonIdbBulkItems, c.deps.idbBulkPutForAddon) }),
  defineAction({ id: "idb.bulkDelete", requiredCapabilities: ["idb"], execute: (c) => actionIdbBulkDelete(...contextArgs(c), c.limits.maxAddonIdbBulkItems, c.deps.idbBulkDeleteForAddon) }),
  defineAction({ id: "idb.query", requiredCapabilities: ["idb"], execute: (c) => actionIdbQuery(...contextArgs(c), c.deps.idbQueryForAddon) }),
  defineAction({ id: "idb.count", requiredCapabilities: ["idb"], execute: (c) => actionIdbCount(...contextArgs(c), c.deps.idbCountForAddon) }),
]);
