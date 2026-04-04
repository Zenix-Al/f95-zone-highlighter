import { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { initAddonsConsoleBridge } from "./services/addonsService.js";
import { detectPage, waitForBody } from "./core/dom";
import { createBootstrapFailureHandler, runBootstrapPipeline } from "./core/bootstrap.js";

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

async function bootstrap() {
  await runBootstrapPipeline([
    {
      name: "registerGlobalTeardownHooks",
      run: () => registerGlobalTeardownHooks(),
    },
    {
      name: "loadData",
      run: loadData,
      fallbackValue: null,
      onResult: (loadedConfig) => {
        if (loadedConfig && typeof loadedConfig === "object") {
          Object.assign(config, loadedConfig);
        }
      },
    },
    {
      name: "detectPage",
      run: () => detectPage(),
    },
    {
      name: "initUiPhaseIfApplicable",
      run: () => initUiPhaseIfApplicable(),
    },
    {
      name: "initAddonsConsoleBridge",
      run: () => initAddonsConsoleBridge(),
    },
    {
      name: "loadFeatures",
      run: () => loadFeatures(),
    },
  ]);
}

waitForBody(() => {
  void bootstrap().catch(createBootstrapFailureHandler("bootstrap"));
});
