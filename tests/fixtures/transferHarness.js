import { config } from "../../src/config.js";
import { commitConfigImport } from "../../src/services/configTransfer/index.js";
import { registerSettingsMetadata, resetSettingsMetadataForTests } from "../../src/ui/settings/metaRegistry.js";

export async function runTransferEffectScenario() {
  resetSettingsMetadataForTests();
  const seen = [];
  registerSettingsMetadata("transfer", {
    testEffect: {
      type: "number",
      config: "latestSettings.minVersion",
      effects: { custom: (value) => seen.push(value) },
    },
  }, "TEST-01:transfer-effect");

  const nextVersion = config.latestSettings.minVersion === 0.9 ? 0.8 : 0.9;
  const result = await commitConfigImport({
    formatVersion: 1,
    schemaVersion: 1,
    settings: { latestSettings: { minVersion: nextVersion } },
  });
  resetSettingsMetadataForTests();
  return { result, seen };
}
