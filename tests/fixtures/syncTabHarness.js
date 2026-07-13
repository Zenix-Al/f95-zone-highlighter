import { config } from "../../src/config.js";
import { toggleCrossTabSync, resetSyncServiceForTests } from "../../src/services/syncService.js";

export async function enableSync() {
  config.globalSettings.enableCrossTabSync = true;
  await toggleCrossTabSync(true);
}

export function snapshotConfig() {
  return JSON.parse(JSON.stringify(config));
}

export function resetSync() {
  resetSyncServiceForTests();
}
