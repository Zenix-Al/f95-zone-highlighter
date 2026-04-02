import { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { detectPage, waitForBody } from "./core/dom";

import { initUiPhaseIfApplicable } from "./ui";
import { loadFeatures } from "./loader";
import { addListener } from "./core/listenerRegistry.js";
import { teardownAll } from "./core/teardown.js";

function registerGlobalTeardownHooks() {
  addListener("global-teardown-pagehide", window, "pagehide", () => teardownAll("pagehide"));
  addListener("global-teardown-beforeunload", window, "beforeunload", () =>
    teardownAll("beforeunload"),
  );
}

function logBootstrapError(step, err) {
  console.error(`[Bootstrap] ${step} failed:`, err);
}

async function runBootstrapStep(step, fn, fallbackValue = undefined) {
  try {
    return await fn();
  } catch (err) {
    logBootstrapError(step, err);
    return fallbackValue;
  }
}

async function bootstrap() {
  await runBootstrapStep("registerGlobalTeardownHooks", async () => {
    registerGlobalTeardownHooks();
  });

  // --- Load user config ---
  const loadedConfig = await runBootstrapStep("loadData", loadData, null);
  if (loadedConfig && typeof loadedConfig === "object") {
    Object.assign(config, loadedConfig);
  }

  // --- Detect page type/state ---
  await runBootstrapStep("detectPage", async () => {
    detectPage();
  });

  // --- Initialize UI phase ---
  await runBootstrapStep("initUiPhaseIfApplicable", async () => {
    initUiPhaseIfApplicable();
  });

  // --- Execute Page-specific functionality ---
  await runBootstrapStep("loadFeatures", async () => {
    loadFeatures();
  });
}

waitForBody(() => {
  void bootstrap().catch((err) => {
    logBootstrapError("bootstrap", err);
  });
});
