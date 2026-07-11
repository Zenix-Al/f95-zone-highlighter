export function createPageLifecycleHandlers({
  suspendRuntime, teardownAll, resumeRuntime, beginRoute, detectPage,
  refreshFastBootstrapFeatures, reconcileFeatures,
} = {}) {
  return {
    handlePageHide(event) {
      if (event?.persisted === true) return suspendRuntime("bfcache");
      return teardownAll("pagehide");
    },
    handlePageShow(event) {
      if (!event?.persisted) return null;
      resumeRuntime();
      const routeContext = beginRoute();
      detectPage();
      refreshFastBootstrapFeatures(routeContext);
      return reconcileFeatures(routeContext);
    },
  };
}
