import {
  listRegisteredFeatures,
  registerFeature,
  resetFeatureCatalogForTests,
} from "../../src/core/featureCatalog.js";
import {
  clearHealthEventsForTests,
  getHealthEvents,
} from "../../src/core/featureHealth.js";

export function runProductionRegistrationScenario() {
  resetFeatureCatalogForTests();
  clearHealthEventsForTests();
  const invalidResult = registerFeature({
    id: "invalid-production-feature",
    featureKey: "invalid-production-feature",
    bootstrapMode: "later",
    pageScopes: [],
  });
  const valid = {
    id: "valid-production-feature",
    featureKey: "valid-production-feature",
    bootstrapMode: "waitForBody",
    pageScopes: [],
  };
  const validResult = registerFeature(valid);
  const result = {
    invalidResult,
    validAccepted: validResult === valid,
    registeredIds: listRegisteredFeatures().map((feature) => feature.id),
    events: getHealthEvents(),
  };
  resetFeatureCatalogForTests();
  clearHealthEventsForTests();
  return result;
}
