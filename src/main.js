import stateManager, { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { updateButtonVisibility } from "./ui/components/configButton";
import { detectPage, waitForBody } from "./core/dom";

import { toggleCrossTabSync } from "./services/syncService";
import { initUI } from "./ui";
import { skipMaskedPage } from "./features/masked-link-skipper/index.js";
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

  // --- Preventing further unnecessary code execution ---
  const isMaskedLink = await runBootstrapStep("checkMaskedLinkPage", async () =>
    stateManager.get("isMaskedLink"),
  );
  if (isMaskedLink) {
    if (config.threadSettings.skipMaskedLink) {
      await runBootstrapStep("skipMaskedPage", async () => {
        skipMaskedPage();
      });
    }
    return;
  }

  // --- Initialize ---
  const isF95Zone = await runBootstrapStep("checkF95ZonePage", async () =>
    stateManager.get("isF95Zone"),
  );
  if (isF95Zone) {
    await runBootstrapStep("initUI", async () => {
      initUI();
    });
    await runBootstrapStep("updateButtonVisibility", async () => {
      updateButtonVisibility();
    });
    await runBootstrapStep("toggleCrossTabSync", async () => {
      toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
    });
  }

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
