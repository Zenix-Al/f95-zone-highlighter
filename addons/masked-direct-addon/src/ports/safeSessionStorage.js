const FALLBACK_STORAGE = createMemoryStorage();

export function getSafeSessionStorage() {
  try {
    return window.sessionStorage || FALLBACK_STORAGE;
  } catch {
    return FALLBACK_STORAGE;
  }
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
