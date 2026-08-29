export { config, stateManager } from "../../src/config.js";
export {
  CONFIG_BACKUP_KEY,
  CONFIG_ENVELOPE_KEY,
  CONFIG_SCHEMA_VERSION,
  CONFIG_MIGRATION_VERSION_KEY,
  CONFIG_PREFIXES_CACHE_KEY,
  CONFIG_TAGS_CACHE_KEY,
} from "../../src/services/settingsService.js";
import { loadConfig as loadStoredConfig } from "../../src/services/settingsService.js";
import { publishStorageReadiness } from "../../src/services/storageReadiness.js";
export { updateTags } from "../../src/services/tagsService.js";

export async function loadConfig() {
  const loaded = await loadStoredConfig();
  publishStorageReadiness({
    state: loaded.persisted === false ? "degraded-readonly" : "ready",
    source: loaded.source,
    canRead: true,
    canWrite: loaded.persisted !== false,
    canDelete: true,
  });
  return loaded;
}
