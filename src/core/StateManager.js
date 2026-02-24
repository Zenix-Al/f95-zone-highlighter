// src/core/StateManager.js
import { getByPath, setByPath } from "../utils/objectPath.js";

function buildKnownPathsFromObject(obj, prefix = "", out = new Set()) {
  if (!obj || typeof obj !== "object") return out;

  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    out.add(fullPath);
    if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
      buildKnownPathsFromObject(obj[key], fullPath, out);
    }
  }

  return out;
}

const createStateManager = (initialState = {}, options = {}) => {
  const {
    knownPaths = null,
    warnUnknown = false,
    throwUnknown = false,
    name = "StateManager",
  } = options;

  let state = JSON.parse(JSON.stringify(initialState)); // Deep copy
  const subscriptions = new Map();

  const known = knownPaths
    ? new Set(knownPaths)
    : buildKnownPathsFromObject(initialState);

  const isKnownPath = (path) => known.size === 0 || known.has(path);

  const handleUnknownPath = (path) => {
    const msg = `${name}: unknown state path '${path}'`;
    if (throwUnknown) throw new Error(msg);
    if (warnUnknown) console.warn(msg);
  };

  const get = (path) => getByPath(state, path);

  const set = (path, value) => {
    if (typeof path !== "string" || path.length === 0) return false;
    if (!isKnownPath(path)) {
      handleUnknownPath(path);
      return false;
    }

    setByPath(state, path, value);
    const pathParts = path.split(".");
    for (let i = 1; i <= pathParts.length; i++) {
      const currentPath = pathParts.slice(0, i).join(".");
      if (subscriptions.has(currentPath)) {
        subscriptions.get(currentPath).forEach((callback) => callback(get(currentPath)));
      }
    }
    return true;
  };

  const subscribe = (path, callback) => {
    if (!subscriptions.has(path)) {
      subscriptions.set(path, new Set());
    }
    subscriptions.get(path).add(callback);

    return () => {
      const subs = subscriptions.get(path);
      if (!subs) return;
      subs.delete(callback);
      if (subs.size === 0) {
        subscriptions.delete(path);
      }
    };
  };

  const getState = () => JSON.parse(JSON.stringify(state));
  const getKnownPaths = () => new Set(known);

  return {
    get,
    set,
    subscribe,
    getState,
    getKnownPaths,
  };
};

export default createStateManager;
