import { config } from "./config.js";
import { loadData } from "./services/settingsService";
import { initAddonsConsoleBridge } from "./services/addonsService.js";
import { waitForBodyReady } from "./utils/dom";
import { detectPage } from "./core/pageDetection.js";
import { createBootstrapFailureHandler, runBootstrapPipeline } from "./core/bootstrap.js";

import { initUiPhaseIfApplicable } from "./ui";
import {
  loadBodyBootstrapFeatures,
  loadFastBootstrapFeatures,
  reconcileFeatures,
  refreshFastBootstrapFeatures,
} from "./loader";
import { addListener } from "./core/listenerRegistry.js";
import { markRuntimeRunning, resumeRuntime, suspendRuntime, teardownAll } from "./core/teardown.js";
import { initGlobalErrorListeners } from "./core/featureFactory.js";
import { flushQueuedToasts } from "./ui/components/toast.js";
import { initRouteObserver } from "./core/routeObserver.js";
import { beginRoute, getRouteContext } from "./core/routeState.js";

let globalTeardownHooksRegistered = false;
let configLoadPromise = null;

function handlePageHide(event) {
  if (event?.persisted === true) {
    suspendRuntime("bfcache");
    return;
  }
  void teardownAll("pagehide");
}

function handlePageShow(event) {
  if (!event.persisted) return;
  resumeRuntime();
  const routeContext = beginRoute();
  detectPage();
  refreshFastBootstrapFeatures(routeContext);
  void reconcileFeatures(routeContext);
}

function registerGlobalTeardownHooks() {
  if (globalTeardownHooksRegistered) return;
  globalTeardownHooksRegistered = true;
  addListener("global-teardown-pagehide", window, "pagehide", handlePageHide);
  addListener("global-pageshow", window, "pageshow", handlePageShow);
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
  // Start config loading immediately so service-level gates such as
  // disableAddonsService are known before the addon bridge is exposed.

  beginRoute();
  detectPage();
  const configReady = ensureConfigLoaded();
  loadFastBootstrapFeatures(getRouteContext());

  await runBootstrapPipeline([
    {
      name: "registerGlobalTeardownHooks",
      classification: "required",
      run: () => registerGlobalTeardownHooks(),
    },
    {
      name: "initGlobalErrorListeners",
      classification: "optional",
      run: () => initGlobalErrorListeners(),
    },
    {
      name: "initRouteObserver",
      classification: "recoverable",
      run: () =>
        initRouteObserver((routeContext) => {
          detectPage();
          refreshFastBootstrapFeatures(routeContext);
          return reconcileFeatures(routeContext);
        }),
      fallback: () => null,
    },
    {
      name: "loadData",
      classification: "required",
      run: () => configReady,
      fallbackValue: null,
    },
    {
      name: "initAddonsConsoleBridge",
      classification: "optional",
      run: () => initAddonsConsoleBridge(),
    }
  ]);
}

async function runBodyBootstrap() {
  const summary = await runBootstrapPipeline([
    {
      name: "loadData",
      classification: "required",
      run: ensureConfigLoaded,
      fallbackValue: null,
    },
    {
      name: "detectPage",
      classification: "required",
      run: () => detectPage(),
    },
    {
      name: "initUiPhaseIfApplicable",
      classification: "optional",
      run: () => initUiPhaseIfApplicable(),
    },
    {
      name: "flushQueuedToasts",
      classification: "optional",
      run: () => flushQueuedToasts(),
    },
    {
      name: "loadBodyBootstrapFeatures",
      classification: "recoverable",
      run: () => loadBodyBootstrapFeatures(getRouteContext()),
      fallback: () => null,
    },
  ]);
  if (summary.status !== "failed") markRuntimeRunning();
}

void runFastBootstrap().catch(createBootstrapFailureHandler("fast-bootstrap"));
void waitForBodyReady()
  .then(() => runBodyBootstrap())
  .catch(createBootstrapFailureHandler("body-bootstrap"));
