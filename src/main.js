import { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { initAddonsConsoleBridge } from "./services/addonsService.js";
import { detectPage, waitForBodyReady } from "./core/dom";
import { createBootstrapFailureHandler, runBootstrapPipeline } from "./core/bootstrap.js";

import { initUiPhaseIfApplicable } from "./ui";
import {
  loadBodyBootstrapFeatures,
  loadFastBootstrapFeatures,
  refreshFastBootstrapFeatures,
} from "./loader";
import { addListener } from "./core/listenerRegistry.js";
import { teardownAll } from "./core/teardown.js";
import { initGlobalErrorListeners } from "./core/featureFactory.js";
import { flushQueuedToasts } from "./ui/components/toast.js";
import { initRouteObserver } from "./core/routeObserver.js";

let globalTeardownHooksRegistered = false;
let configLoadPromise = null;

function registerGlobalTeardownHooks() {
  if (globalTeardownHooksRegistered) return;
  globalTeardownHooksRegistered = true;
  addListener("global-teardown-pagehide", window, "pagehide", () => teardownAll("pagehide"));
  addListener("global-teardown-beforeunload", window, "beforeunload", () =>
    teardownAll("beforeunload"),
  );
}

async function ensureConfigLoaded() {
  if (!configLoadPromise) {
    configLoadPromise = loadData().catch((error) => {
      configLoadPromise = null;
      throw error;
    });
  }

  const loadedConfig = await configLoadPromise;
  if (loadedConfig && typeof loadedConfig === "object") {
    Object.assign(config, loadedConfig);
  }

  return loadedConfig;
}

async function runFastBootstrap() {
  detectPage();
  loadFastBootstrapFeatures();

  await runBootstrapPipeline([
    {
      name: "registerGlobalTeardownHooks",
      run: () => registerGlobalTeardownHooks(),
    },
    {
      name: "initGlobalErrorListeners",
      run: () => initGlobalErrorListeners(),
    },
    {
      name: "initRouteObserver",
      run: () =>
        initRouteObserver(() => {
          detectPage();
          refreshFastBootstrapFeatures();
        }),
    },
    {
      name: "loadData",
      run: ensureConfigLoaded,
      fallbackValue: null,
    },
  ]);
}

async function runBodyBootstrap() {
  await runBootstrapPipeline([
    {
      name: "loadData",
      run: ensureConfigLoaded,
      fallbackValue: null,
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
      name: "flushQueuedToasts",
      run: () => flushQueuedToasts(),
    },
    {
      name: "initAddonsConsoleBridge",
      run: () => initAddonsConsoleBridge(),
    },
    {
      name: "loadBodyBootstrapFeatures",
      run: () => loadBodyBootstrapFeatures(),
    },
  ]);
}

void runFastBootstrap().catch(createBootstrapFailureHandler("fast-bootstrap"));
void waitForBodyReady()
  .then(() => runBodyBootstrap())
  .catch(createBootstrapFailureHandler("body-bootstrap"));
