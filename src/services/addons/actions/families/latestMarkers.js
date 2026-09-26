import { defineAction } from "../contract.js";

const markerAction = (id, execute) => defineAction({
  id, requiredCapabilities: ["latest.markers"],
  ownership: "authenticated trusted add-on; provider ID is scoped to that owner",
  cleanup: "broker clears pending requests on disable, unregister and route teardown",
  execute,
});

export const latestMarkerActions = Object.freeze([
  markerAction("latest.markers.register", ({ addonId, payload, deps }) => deps.latestMarkerBroker.register(addonId, payload)),
  markerAction("latest.markers.unregister", ({ addonId, payload, deps }) => deps.latestMarkerBroker.unregister(addonId, payload.id)),
  markerAction("latest.markers.respond", ({ addonId, payload, deps }) => deps.latestMarkerBroker.respond(addonId, payload)),
  markerAction("latest.markers.invalidate", ({ addonId, payload, deps }) => deps.latestMarkerBroker.invalidate(addonId, payload.id)),
]);
