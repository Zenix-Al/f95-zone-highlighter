import { sanitizeAddonId } from "./shared.js";

const DB_PREFIX = "f95ue-addon";
const DB_CACHE = new Map();

function sanitizeSegment(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function buildDbName(addonId, dbName) {
  return `${DB_PREFIX}:${sanitizeSegment(addonId, "unknown")}:${sanitizeSegment(dbName, "main")}`;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("idb_request_failed"));
  });
}

function normalizeStoreName(payload) {
  return sanitizeSegment(payload?.storeName, "records");
}

function normalizeDbName(payload) {
  return sanitizeSegment(payload?.dbName, "library");
}

function normalizeIndexes(payload) {
  if (!Array.isArray(payload?.indexes)) return [];
  return payload.indexes
    .map((index) => {
      if (!index || typeof index !== "object") return null;
      const name = sanitizeSegment(index.name, "");
      if (!name) return null;
      const keyPath =
        typeof index.keyPath === "string" || Array.isArray(index.keyPath) ? index.keyPath : name;
      return {
        name,
        keyPath,
        options: {
          unique: Boolean(index.unique),
          multiEntry: Boolean(index.multiEntry),
        },
      };
    })
    .filter(Boolean);
}

function normalizeVersion(payload) {
  const candidate = Number(payload?.version || 1);
  if (!Number.isFinite(candidate) || candidate < 1) return 1;
  return Math.floor(candidate);
}

function normalizeKeyRange(query) {
  if (query === null || typeof query === "undefined") return null;
  if (typeof query !== "object" || Array.isArray(query)) return query;

  const kind = String(query.kind || "").trim();
  if (!kind || typeof IDBKeyRange === "undefined") return null;

  if (kind === "only") return IDBKeyRange.only(query.value);
  if (kind === "lowerBound") return IDBKeyRange.lowerBound(query.lower, Boolean(query.open));
  if (kind === "upperBound") return IDBKeyRange.upperBound(query.upper, Boolean(query.open));
  if (kind === "bound") {
    return IDBKeyRange.bound(
      query.lower,
      query.upper,
      Boolean(query.lowerOpen),
      Boolean(query.upperOpen),
    );
  }

  return null;
}

function ensureStoreAndIndexes(db, storeName, payload) {
  const keyPath =
    typeof payload?.keyPath === "string" || Array.isArray(payload?.keyPath)
      ? payload.keyPath
      : "id";
  const autoIncrement = Boolean(payload?.autoIncrement);
  const indexes = normalizeIndexes(payload);

  let store;
  if (db.objectStoreNames.contains(storeName)) {
    store = db.transaction.objectStore(storeName);
  } else {
    store = db.createObjectStore(storeName, { keyPath, autoIncrement });
  }

  indexes.forEach((index) => {
    if (store.indexNames.contains(index.name)) return;
    store.createIndex(index.name, index.keyPath, index.options);
  });
}

function openAddonDatabase(addonId, payload = {}) {
  const normalizedAddonId = sanitizeAddonId(addonId);
  if (!normalizedAddonId) {
    return Promise.reject(new Error("invalid_addon_id"));
  }

  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }

  const dbName = buildDbName(normalizedAddonId, normalizeDbName(payload));
  const storeName = normalizeStoreName(payload);
  const version = normalizeVersion(payload);
  const cacheKey = `${dbName}@${version}#${storeName}`;

  if (DB_CACHE.has(cacheKey)) {
    return DB_CACHE.get(cacheKey);
  }

  const pending = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = () => {
      ensureStoreAndIndexes(request.result, storeName, payload);
    };

    request.onsuccess = () => resolve({ db: request.result, storeName });
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
    request.onblocked = () => reject(new Error("indexeddb_blocked"));
  }).catch((error) => {
    DB_CACHE.delete(cacheKey);
    throw error;
  });

  DB_CACHE.set(cacheKey, pending);
  return pending;
}

async function withStore(addonId, payload, mode, cb) {
  const { db, storeName } = await openAddonDatabase(addonId, payload);
  return new Promise((resolve, reject) => {
    let done = false;

    const finish = (fn) => (value) => {
      if (done) return;
      done = true;
      fn(value);
    };

    const complete = finish(resolve);
    const fail = finish(reject);

    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      fail(error);
      return;
    }

    tx.onabort = () => fail(tx.error || new Error("indexeddb_tx_aborted"));
    tx.onerror = () => fail(tx.error || new Error("indexeddb_tx_failed"));

    Promise.resolve(cb(tx.objectStore(storeName), tx))
      .then((value) => {
        tx.oncomplete = () => complete(value);
      })
      .catch((error) => fail(error));
  });
}

export function idbGetForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readonly", (store) => {
    const req = store.get(payload?.key);
    return requestToPromise(req);
  });
}

export function idbPutForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readwrite", (store) => {
    const hasKey = Object.prototype.hasOwnProperty.call(payload || {}, "key");
    const req = hasKey ? store.put(payload?.value, payload?.key) : store.put(payload?.value);
    return requestToPromise(req);
  });
}

export function idbDeleteForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readwrite", (store) => {
    const req = store.delete(payload?.key);
    return requestToPromise(req);
  });
}

export function idbBulkPutForAddon(addonId, payload = {}) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return withStore(addonId, payload, "readwrite", (store) => {
    const writes = entries.map((entry) => {
      const hasKey = Object.prototype.hasOwnProperty.call(entry || {}, "key");
      const req = hasKey ? store.put(entry?.value, entry?.key) : store.put(entry?.value);
      return requestToPromise(req);
    });
    return Promise.all(writes);
  });
}

export function idbCountForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readonly", (store) => {
    const keyRange = normalizeKeyRange(payload?.query);
    const req =
      typeof keyRange === "undefined" ? store.count() : store.count(keyRange || undefined);
    return requestToPromise(req);
  });
}

export function idbQueryForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readonly", (store) => {
    const indexName = sanitizeSegment(payload?.index, "");
    const source = indexName ? store.index(indexName) : store;
    const keyRange = normalizeKeyRange(payload?.query);
    const direction = String(payload?.direction || "next").trim() || "next";
    const limit = Math.max(0, Number(payload?.limit || 100));
    const offset = Math.max(0, Number(payload?.offset || 0));
    const includeKeys = Boolean(payload?.includeKeys);

    return new Promise((resolve, reject) => {
      const items = [];
      let skipped = 0;
      const req = source.openCursor(keyRange || undefined, direction);

      req.onerror = () => reject(req.error || new Error("indexeddb_query_failed"));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(items);
          return;
        }

        if (skipped < offset) {
          skipped += 1;
          cursor.continue();
          return;
        }

        const value = includeKeys ? { key: cursor.primaryKey, value: cursor.value } : cursor.value;
        items.push(value);

        if (items.length >= limit) {
          resolve(items);
          return;
        }

        cursor.continue();
      };
    });
  });
}
