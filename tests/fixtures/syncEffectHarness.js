import { config } from "../../src/config.js";
import { applyIncoming } from "../../src/services/syncService.js";
import { registerSettingsMetadata, resetSettingsMetadataForTests } from "../../src/ui/settings/metaRegistry.js";

export function runSyncEffectReplay() {
  resetSettingsMetadataForTests();
  const seen = [];
  registerSettingsMetadata("latest", {
    testLatestEffect: { type: "toggle", config: "latestSettings.autoRefresh", effects: { custom: (value) => seen.push(["latest", value]) } },
  }, "TEST-01:sync-latest");
  registerSettingsMetadata("global", {
    testGlobalEffect: { type: "toggle", config: "globalSettings.configVisibility", effects: { custom: (value) => seen.push(["global", value]) } },
  }, "TEST-01:sync-global");
  const data = JSON.parse(JSON.stringify(config));
  data.latestSettings.autoRefresh = !data.latestSettings.autoRefresh;
  data.globalSettings.configVisibility = !data.globalSettings.configVisibility;
  const applied = applyIncoming({ revision: 100, updatedAt: 100, writerId: "TEST-01:remote", data });
  resetSettingsMetadataForTests();
  return { applied, seen };
}
