import {
  clearHealthEventsForTests,
  getFeatureStatus,
  getHealthDiagnostics,
  getHealthEvents,
} from "../../src/core/featureHealth.js";
import {
  getStorageBootstrapSnapshot,
  resetStorageBootstrapForTests,
  retryStorageBootstrap,
  startStorageBootstrap,
} from "../../src/services/storageBootstrapService.js";

export async function startStorageScenario({ concurrent = 1 } = {}) {
  resetStorageBootstrapForTests();
  clearHealthEventsForTests();
  const results = await Promise.all(
    Array.from({ length: concurrent }, () => startStorageBootstrap()),
  );
  return {
    results,
    snapshot: getStorageBootstrapSnapshot(),
    status: getFeatureStatus("Storage"),
    diagnostics: getHealthDiagnostics(),
    events: getHealthEvents(),
  };
}

export async function retryStorageScenario() {
  const result = await retryStorageBootstrap();
  return {
    result,
    snapshot: getStorageBootstrapSnapshot(),
    status: getFeatureStatus("Storage"),
    diagnostics: getHealthDiagnostics(),
    events: getHealthEvents(),
  };
}

export async function startStorageUpgradeScenario() {
  resetStorageBootstrapForTests();
  clearHealthEventsForTests();
  let error = null;
  try { await startStorageBootstrap(); } catch (caught) { error = caught; }
  return {
    error,
    snapshot: getStorageBootstrapSnapshot(),
    status: getFeatureStatus("Storage"),
    diagnostics: getHealthDiagnostics(),
    events: getHealthEvents(),
  };
}
