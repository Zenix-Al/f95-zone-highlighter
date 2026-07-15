export function createStorageAdapter(api = globalThis.GM) {
  const getApi = () => api || globalThis.GM || (() => { throw new Error("Userscript storage API is unavailable"); })();
  return {
    get: (key, fallback) => getApi().getValue(key, fallback),
    set: (key, value) => getApi().setValue(key, value),
    delete: (key) => getApi().deleteValue?.(key),
    async getMany(keys) {
      if (typeof getApi().getValues === "function") return (await getApi().getValues(keys)) || {};
      return Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await getApi().getValue(key)])));
    },
  };
}

export const storageAdapter = createStorageAdapter();
