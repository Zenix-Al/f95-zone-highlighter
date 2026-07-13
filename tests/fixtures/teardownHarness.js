import { createTaskQueue, getTaskQueueDiagnostics } from "../../src/core/taskQueue.js";
import { getResourceSnapshot } from "../../src/core/resourceManager.js";
import { registerFeature, resetFeatureCatalogForTests } from "../../src/core/featureCatalog.js";
import { resetTeardownForTests, markRuntimeRunning, teardownAll } from "../../src/core/teardown.js";

export async function runTeardownResourceScenario() {
  resetTeardownForTests();
  resetFeatureCatalogForTests();
  markRuntimeRunning();

  const queue = createTaskQueue({ name: "TEARDOWN-01", ownerId: "teardown:queue", delay: 1000 });
  queue.add("pending", async () => "stale");
  registerFeature({
    id: "teardown-stubborn-feature",
    featureKey: "teardown-stubborn-feature",
    bootstrapMode: "waitForBody",
    pageScopes: [],
    disable: () => new Promise(() => {}),
  });

  const first = await teardownAll("TEARDOWN-01:test", { featureTimeoutMs: 5 });
  const second = await teardownAll("TEARDOWN-01:repeated", { featureTimeoutMs: 5 });
  const result = {
    first,
    second,
    queues: getTaskQueueDiagnostics(),
    resources: getResourceSnapshot(),
  };
  resetFeatureCatalogForTests();
  resetTeardownForTests();
  return result;
}
