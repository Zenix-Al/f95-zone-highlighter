import { sanitizeAddonId } from "./shared.js";

const DB_PREFIX = "f95ue-addon";
const DB_CACHE = new Map();
const MAX_SCHEMA_STORES = 16;
const MAX_SCHEMA_INDEXES_PER_STORE = 32;

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
      const name = String(index.name || "").trim();
      if (!/^[A-Za-z0-9_-]+$/.test(name)) return null;
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

function normalizeStoreDefinition(payload, fallbackName = "records") {
  return {
    name: normalizeStoreName({ storeName: payload?.name || payload?.storeName || fallbackName }),
    keyPath:
      typeof payload?.keyPath === "string" || Array.isArray(payload?.keyPath)
        ? payload.keyPath
        : "id",
    autoIncrement: Boolean(payload?.autoIncrement),
    indexes: normalizeIndexes(payload),
  };
}

export function normalizeDatabaseSchema(payload = {}) {
  const declared = Array.isArray(payload?.stores) ? payload.stores : null;
  if (declared && (declared.length < 1 || declared.length > MAX_SCHEMA_STORES)) {
    throw new Error("indexeddb_schema_store_limit");
  }
  const stores = (declared || [payload]).map((store, index) =>
    normalizeStoreDefinition(store, index === 0 ? normalizeStoreName(payload) : `store-${index}`),
  );
  const names = new Set();
  for (const store of stores) {
    if (names.has(store.name)) throw new Error("indexeddb_schema_duplicate_store");
    names.add(store.name);
    if (store.indexes.length > MAX_SCHEMA_INDEXES_PER_STORE) {
      throw new Error("indexeddb_schema_index_limit");
    }
  }
  return stores;
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

function compareIdbKeys(left, right) {
  if (typeof indexedDB !== "undefined" && typeof indexedDB.cmp === "function") {
    return indexedDB.cmp(left, right);
  }
  const leftText = JSON.stringify(left);
  const rightText = JSON.stringify(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function normalizeCursor(value) {
  if (!value || typeof value !== "object" || !Object.hasOwn(value, "key")) return null;
  return {
    key: value.key,
    primaryKey: Object.hasOwn(value, "primaryKey") ? value.primaryKey : value.key,
  };
}

function createCursorRange(cursor, direction) {
  if (!cursor || typeof IDBKeyRange === "undefined") return null;
  return direction === "prev"
    ? IDBKeyRange.upperBound(cursor.key)
    : IDBKeyRange.lowerBound(cursor.key);
}

function cursorIsAfterBoundary(cursor, boundary, direction) {
  if (!boundary) return true;
  const keyComparison = compareIdbKeys(cursor.key, boundary.key);
  if (keyComparison !== 0) return direction === "prev" ? keyComparison < 0 : keyComparison > 0;
  const primaryComparison = compareIdbKeys(cursor.primaryKey, boundary.primaryKey);
  return direction === "prev" ? primaryComparison < 0 : primaryComparison > 0;
}

function ensureStoreAndIndexes(db, transaction, definition) {
  const { name: storeName, keyPath, autoIncrement, indexes } = definition;
  let store;
  if (db.objectStoreNames.contains(storeName)) {
    store = transaction.objectStore(storeName);
  } else {
    store = db.createObjectStore(storeName, { keyPath, autoIncrement });
  }

  indexes.forEach((index) => {
    if (store.indexNames.contains(index.name)) return;
    store.createIndex(index.name, index.keyPath, index.options);
  });
}

export function ensureDatabaseSchema(db, transaction, stores) {
  stores.forEach((store) => ensureStoreAndIndexes(db, transaction, store));
}

function evictDatabase(dbName, exceptKey = "") {
  for (const [key, entry] of DB_CACHE) {
    if (key === exceptKey || entry.dbName !== dbName) continue;
    DB_CACHE.delete(key);
    entry.promise.then(({ db }) => db.close()).catch(() => {});
  }
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
  const stores = normalizeDatabaseSchema(payload);
  const cacheKey = `${dbName}@${version}`;

  if (DB_CACHE.has(cacheKey)) {
    return DB_CACHE.get(cacheKey).promise.then(({ db }) => ({ db, storeName }));
  }

  evictDatabase(dbName, cacheKey);
  const pending = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = () => {
      try {
        ensureDatabaseSchema(request.result, request.transaction, stores);
      } catch (error) {
        request.transaction?.abort();
        reject(error);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        if (DB_CACHE.get(cacheKey)?.promise === pending) DB_CACHE.delete(cacheKey);
      };
      resolve({ db });
    };
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
    request.onblocked = () => reject(new Error("indexeddb_blocked"));
  }).catch((error) => {
    DB_CACHE.delete(cacheKey);
    throw error;
  });

  DB_CACHE.set(cacheKey, { dbName, version, promise: pending });
  return pending.then(({ db }) => ({ db, storeName }));
}

export function resetAddonDatabaseCacheForTests() {
  for (const entry of DB_CACHE.values()) {
    entry.promise.then(({ db }) => db.close()).catch(() => {});
  }
  DB_CACHE.clear();
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

export function putValueInStore(store, value, key, hasExplicitKey = false) {
  const usesInlineKeys = store?.keyPath !== null && typeof store?.keyPath !== "undefined";
  return hasExplicitKey && !usesInlineKeys ? store.put(value, key) : store.put(value);
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
    const req = putValueInStore(store, payload?.value, payload?.key, hasKey);
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
      const req = putValueInStore(store, entry?.value, entry?.key, hasKey);
      return requestToPromise(req);
    });
    return Promise.all(writes);
  });
}

export function idbBulkDeleteForAddon(addonId, payload = {}) {
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  return withStore(addonId, payload, "readwrite", (store) => {
    const deletes = keys.map((key) => requestToPromise(store.delete(key)));
    return Promise.all(deletes);
  });
}

export function idbCountForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readonly", (store) => {
    const requestedIndex = String(payload?.index || "").trim();
    const indexName = /^[A-Za-z0-9_-]+$/.test(requestedIndex) ? requestedIndex : "";
    const source = indexName ? store.index(indexName) : store;
    const keyRange = normalizeKeyRange(payload?.query);
    const req =
      typeof keyRange === "undefined" ? source.count() : source.count(keyRange || undefined);
    return requestToPromise(req);
  });
}

export function readCursorPage(
  source,
  {
    keyRange = null,
    direction = "next",
    limit = 100,
    offset = 0,
    includeKeys = false,
    includeCursor = false,
    keysetMode = false,
    boundary = null,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const items = [];
    let skipped = 0;
    let nextCursor = null;
    const req = source.openCursor(keyRange || undefined, direction);

    req.onerror = () => reject(req.error || new Error("indexeddb_query_failed"));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(keysetMode ? { items, nextCursor, hasMore: false } : items);
        return;
      }

      if (keysetMode && !cursorIsAfterBoundary(cursor, boundary, direction)) {
        cursor.continue();
        return;
      }
      if (skipped < offset) {
        skipped += 1;
        cursor.continue();
        return;
      }
      if (items.length >= limit) {
        resolve(keysetMode ? { items, nextCursor, hasMore: true } : items);
        return;
      }

      const cursorToken = { key: cursor.key, primaryKey: cursor.primaryKey };
      const value = includeCursor
        ? { cursor: cursorToken, value: cursor.value }
        : includeKeys
          ? { key: cursor.primaryKey, value: cursor.value }
          : cursor.value;
      items.push(value);
      nextCursor = cursorToken;
      cursor.continue();
    };
  });
}

export function idbQueryForAddon(addonId, payload = {}) {
  return withStore(addonId, payload, "readonly", (store) => {
    const requestedIndex = String(payload?.index || "").trim();
    const indexName = /^[A-Za-z0-9_-]+$/.test(requestedIndex) ? requestedIndex : "";
    const source = indexName ? store.index(indexName) : store;
    const direction = String(payload?.direction || "next").trim() || "next";
    const keysetMode = payload?.pagination === "keyset";
    const boundary = keysetMode ? normalizeCursor(payload?.cursor) : null;
    const keyRange =
      normalizeKeyRange(payload?.query) ||
      (keysetMode ? createCursorRange(boundary, direction) : null);
    const limit = Math.min(keysetMode ? 500 : 10000, Math.max(0, Number(payload?.limit || 100)));
    const offset = Math.max(0, Number(payload?.offset || 0));
    const includeKeys = Boolean(payload?.includeKeys);
    const includeCursor = keysetMode && Boolean(payload?.includeCursor);

    return readCursorPage(source, {
      keyRange,
      direction,
      limit,
      offset,
      includeKeys,
      includeCursor,
      keysetMode,
      boundary,
    });
  });
}
