import { createFeature } from "../../src/core/featureFactory.js";
import { registerFeature, resetFeatureCatalogForTests } from "../../src/core/featureCatalog.js";
import { clearHealthEventsForTests, getHealthEvents } from "../../src/core/featureHealth.js";
import { detectPage } from "../../src/core/pageDetection.js";
import { beginRoute, resetRouteStateForTests } from "../../src/core/routeState.js";
import { reconcileFeatures } from "../../src/loader.js";

export async function runRouteApplicabilityScenario() {
  resetFeatureCatalogForTests();
  resetRouteStateForTests();
  clearHealthEventsForTests();
  const lifecycle = [];
  const feature = createFeature("ROUTE-01 Fixture", {
    id: "route-01-fixture",
    pageScopes: ["isThread"],
    enable: (context) => lifecycle.push(`enable:${context.routeGeneration}`),
    disable: (context) => lifecycle.push(`disable:${context.routeGeneration}`),
  });
  registerFeature(feature);

  async function apply(href) {
    const locationLike = new URL(href);
    const context = beginRoute(locationLike);
    detectPage(locationLike, context);
    await reconcileFeatures(context);
    return context;
  }

  const a = await apply("https://f95zone.to/threads/a.1/");
  const duplicate = await apply("https://f95zone.to/threads/a.1/");
  const b = await apply("https://f95zone.to/sam/latest_alpha?cat=games");
  const c = await apply("https://f95zone.to/threads/c.3/#updates");
  const result = { a, duplicate, b, c, lifecycle: [...lifecycle], events: getHealthEvents() };
  await feature.disable({ routeGeneration: c.generation, reason: "teardown" });
  resetFeatureCatalogForTests();
  resetRouteStateForTests();
  clearHealthEventsForTests();
  return result;
}
