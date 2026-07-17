export function getStoredValue(core, key, defaultValue) {
  return core.invokeCoreAction("storage.get", { key, defaultValue });
}
export function setStoredValue(core, key, value) {
  return core.invokeCoreAction("storage.set", { key, value });
}
