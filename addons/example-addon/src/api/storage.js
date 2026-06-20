export function getStoredValue(core, key, defaultValue = null) {
  return core.invokeCoreAction("storage.get", {
    key: String(key || ""),
    defaultValue,
  });
}

export function setStoredValue(core, key, value) {
  return core.invokeCoreAction("storage.set", {
    key: String(key || ""),
    value,
  });
}

export function getStorageUsage(core) {
  return core.invokeCoreAction("storage.getUsage", {});
}

export function getTagPrefs(core) {
  return core.invokeCoreAction("config.getTagPrefs", {});
}
