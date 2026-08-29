import { initAddonsConsoleBridge, refreshAddonSecurityPolicies } from "./services/addonsService.js";
import { startStorageBootstrap } from "./services/storageBootstrapService.js";
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
import {
  markRuntimeRunning,
  markRuntimeStarting,
  registerTeardownResetter,
  resumeRuntime,
  suspendRuntime,
  teardownAll,
} from "./core/teardown.js";
import { initGlobalErrorListeners } from "./core/featureFactory.js";
import { flushQueuedToasts } from "./ui/components/toast.js";
import { showStorageUpgradeNotice } from "./ui/storageUpgradeNotice.js";
import { initRouteObserver } from "./core/routeObserver.js";
import { beginRoute, getRouteContext } from "./core/routeState.js";
import { createPageLifecycleHandlers } from "./core/pageLifecycle.js";

let globalTeardownHooksRegistered = false;
let startupPromise = null;

async function startRequiredStorageBootstrap() {
  try {
    return await startStorageBootstrap();
  } catch (error) {
    showStorageUpgradeNotice(error);
    throw error;
  }
}

const { handlePageHide, handlePageShow } = createPageLifecycleHandlers({
  suspendRuntime, teardownAll, resumeRuntime, beginRoute, detectPage,
  refreshFastBootstrapFeatures, reconcileFeatures, refreshAddonSecurityPolicies,
});

registerTeardownResetter(() => {
  globalTeardownHooksRegistered = false;
  startupPromise = null;
});

function registerGlobalTeardownHooks() {
  if (globalTeardownHooksRegistered) return;
  globalTeardownHooksRegistered = true;
  addListener("global-teardown-pagehide", window, "pagehide", handlePageHide);
  addListener("global-pageshow", window, "pageshow", handlePageShow);
}

async function runFastBootstrap() {
  // Classification rationale: route/config prerequisites are required;
  // diagnostics and the add-on console bridge are optional; feature capture
  // and route observation have explicit degraded fallbacks.
  return runBootstrapPipeline([
    {
      id: "storageBootstrap",
      classification: "required",
      timeoutMs: 15000,
      run: () => startRequiredStorageBootstrap(),
    },
    {
      id: "beginRoute",
      classification: "required",
      timeoutMs: 5000,
      run: () => beginRoute(),
    },
    {
      id: "detectPage",
      classification: "required",
      timeoutMs: 5000,
      run: () => detectPage(),
    },
    {
      id: "loadFastBootstrapFeatures",
      classification: "recoverable",
      timeoutMs: 10000,
      run: () => loadFastBootstrapFeatures(getRouteContext()),
      fallback: () => null,
    },
    {
      id: "registerGlobalTeardownHooks",
      classification: "required",
      timeoutMs: 5000,
      run: () => registerGlobalTeardownHooks(),
    },
    {
      id: "initGlobalErrorListeners",
      classification: "optional",
      timeoutMs: 5000,
      run: () => initGlobalErrorListeners(),
    },
    {
      id: "initRouteObserver",
      classification: "recoverable",
      timeoutMs: 5000,
      run: () =>
        initRouteObserver((routeContext) => {
          detectPage(window.location, routeContext);
          refreshFastBootstrapFeatures(routeContext);
          return reconcileFeatures(routeContext);
        }),
      fallback: () => null,
    },
    {
      id: "initAddonsConsoleBridge",
      classification: "optional",
      timeoutMs: 5000,
      run: () => initAddonsConsoleBridge(),
    }
  ]);
}

async function runBodyBootstrap() {
  // Validated config and page detection are required. UI/toasts are optional,
  // while feature loading may degrade because individual features remain
  // independently diagnosable and retryable.
  const summary = await runBootstrapPipeline([
    {
      id: "storageBootstrap",
      classification: "required",
      timeoutMs: 15000,
      run: () => startRequiredStorageBootstrap(),
    },
    {
      id: "detectPage",
      classification: "required",
      timeoutMs: 5000,
      run: () => detectPage(),
    },
    {
      id: "initUiPhaseIfApplicable",
      classification: "optional",
      timeoutMs: 10000,
      run: () => initUiPhaseIfApplicable(),
    },
    {
      id: "flushQueuedToasts",
      classification: "optional",
      timeoutMs: 5000,
      run: () => flushQueuedToasts(),
    },
    {
      id: "loadBodyBootstrapFeatures",
      classification: "recoverable",
      timeoutMs: 15000,
      run: () => loadBodyBootstrapFeatures(getRouteContext()),
      fallback: () => null,
    },
  ]);
  if (summary.status !== "failed") markRuntimeRunning();
}

export function startRuntime() {
  if (startupPromise) return startupPromise;
  markRuntimeStarting();
  startupPromise = Promise.all([
    runFastBootstrap().catch(createBootstrapFailureHandler("fast-bootstrap")),
    waitForBodyReady()
      .then(() => runBodyBootstrap())
      .catch(createBootstrapFailureHandler("body-bootstrap")),
  ]);
  return startupPromise;
}

void startRuntime();
