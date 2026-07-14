import { config } from "../../src/config.js";
import { applyConfigChange } from "../../src/services/configChangeApplication.js";
import { registerSettingsMetadata, resetSettingsMetadataForTests } from "../../src/ui/settings/metaRegistry.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function runSyncCoverage() {
  resetSettingsMetadataForTests();
  const seen = [];
  const effect = (name) => (value) => seen.push([name, value]);
  registerSettingsMetadata("sync-coverage", {
    color: { config: "color.completed", effects: { custom: effect("color") } },
    overlay: { config: "overlaySettings.completed", effects: { custom: effect("overlay") } },
    thread: { config: "threadSettings.marked", effects: { custom: effect("thread") } },
    latest: { config: "latestSettings.priorityWeights.rating", effects: { custom: effect("latest") } },
    modifier: { config: "latestSettings.tagModifiers.preferred", effects: { custom: effect("modifier") } },
    global: { config: "globalSettings.configVisibility", effects: { custom: effect("global") } },
    tag: { config: "tags[0].name", effects: { custom: effect("tag") } },
    preference: { config: "preferredTags[0]", effects: { custom: effect("preference") } },
  }, "TEST-01:sync-coverage");

  const data = clone(config);
  data.color.completed = "#abc";
  data.overlaySettings.completed = !data.overlaySettings.completed;
  data.threadSettings.marked = !data.threadSettings.marked;
  data.latestSettings.priorityWeights.rating += 1;
  data.latestSettings.tagModifiers.preferred += 1;
  data.globalSettings.configVisibility = !data.globalSettings.configVisibility;
  data.tags = [{ id: 1, name: "Synced tag" }];
  data.preferredTags = [1];

  const applied = applyConfigChange(data, { origin: "remote-sync", syncableOnly: true });
  await applied.effects;
  resetSettingsMetadataForTests();
  return { seen, appliedPaths: applied.appliedPaths };
}

export async function runEffectFailureIsolation() {
  resetSettingsMetadataForTests();
  const seen = [];
  registerSettingsMetadata("sync-failure", {
    failing: {
      config: "latestSettings.tagModifiers.preferred",
      effects: { custom: async () => { throw new Error("effect_secret_token=redact-me"); } },
    },
    succeeding: {
      config: "globalSettings.configVisibility",
      effects: { custom: () => seen.push("succeeding") },
    },
  }, "TEST-01:sync-failure");

  const data = clone(config);
  data.latestSettings.tagModifiers.preferred += 1;
  data.globalSettings.configVisibility = !data.globalSettings.configVisibility;
  const applied = applyConfigChange(data, { origin: "remote-sync", syncableOnly: true });
  await applied.effects;
  resetSettingsMetadataForTests();
  return { seen, value: config.latestSettings.tagModifiers.preferred };
}
