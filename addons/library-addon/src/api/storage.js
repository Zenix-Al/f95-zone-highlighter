export async function getStoredValue(core, key, defaultValue = null) {
  const result = await core.invokeCoreAction("storage.get", { key, defaultValue });
  return result?.ok ? result.value : defaultValue;
}

export const setStoredValue = (core, key, value) =>
  core.invokeCoreAction("storage.set", { key, value });
export const getTagPrefs = (core) => core.invokeCoreAction("config.getTagPrefs", {});
