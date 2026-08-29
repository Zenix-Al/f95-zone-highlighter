export { config } from "../../src/config.js";
export * from "../../src/services/settingsService.js";
export {
  getStorageBootstrapSnapshot,
  resetStorageBootstrapForTests,
  startStorageBootstrap,
} from "../../src/services/storageBootstrapService.js";

import {
  resetStorageBootstrapForTests,
  startStorageBootstrap,
} from "../../src/services/storageBootstrapService.js";
import { publishStorageReadiness } from "../../src/services/storageReadiness.js";
import { loadConfig } from "../../src/services/settingsService.js";

export async function bootstrapStorage() {
  resetStorageBootstrapForTests();
  return startStorageBootstrap();
}

export async function authorizeStorageForTest() {
  const loaded = await loadConfig();
  publishStorageReadiness({
    state: "ready",
    source: loaded.source,
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
  return loaded;
}
