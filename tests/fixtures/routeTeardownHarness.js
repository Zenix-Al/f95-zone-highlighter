import { initRouteObserver } from "../../src/core/routeObserver.js";
import { resetTeardownForTests, teardownAll } from "../../src/core/teardown.js";

export async function runRouteTeardownScenario() {
  resetTeardownForTests();
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  initRouteObserver(() => {});
  const patched = window.history.pushState !== originalPushState
    && window.history.replaceState !== originalReplaceState;
  await teardownAll("ROUTE-01:test");
  const restored = window.history.pushState === originalPushState
    && window.history.replaceState === originalReplaceState;
  resetTeardownForTests();
  return { patched, restored };
}
