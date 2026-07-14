import { getHealthEvents, clearHealthEventsForTests } from "../../src/core/featureHealth.js";
import { loadConfig } from "../../src/services/settingsService.js";

export async function loadWithHealth() {
  clearHealthEventsForTests();
  const loaded = await loadConfig();
  return { loaded, events: getHealthEvents() };
}
