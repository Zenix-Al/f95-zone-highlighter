import { reportFeatureFailure } from "./featureHealth.js";

export function createPageLifecycleHandlers({
  suspendRuntime, teardownAll, resumeRuntime, beginRoute, detectPage,
  refreshFastBootstrapFeatures, reconcileFeatures, refreshAddonSecurityPolicies,
} = {}) {
  return {
    handlePageHide(event) {
      if (event?.persisted === true) return suspendRuntime("bfcache");
      return teardownAll("pagehide");
    },
    async handlePageShow(event) {
      if (!event?.persisted) return null;
      try {
        const routeContext = beginRoute(undefined, { force: true });
        resumeRuntime(routeContext);
        detectPage(undefined, routeContext);
        refreshAddonSecurityPolicies?.();
        refreshFastBootstrapFeatures(routeContext);
        return await reconcileFeatures(routeContext);
      } catch (error) {
        reportFeatureFailure("Runtime", error, "bfcache.resume");
        return { status: "failed", reason: "resume_failed" };
      }
    },
  };
}
