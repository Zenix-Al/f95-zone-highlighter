# Observability and Health Events

`featureHealth.js` records bounded, immutable diagnostic events. Error codes use
the `FEATURE_`, `ROUTE_`, `BOOT_`, `RESOURCE_`, `QUEUE_`, `CONFIG_`, `SYNC_`,
`ADDON_`, `SELECTOR_`, and `FAST_CAPTURE_` namespaces.

Events carry an owner, subsystem, correlation ID, operation ID, route generation,
repeat count, and bounded redacted details. Diagnostics are collected on demand;
full registry or payload objects are never attached to every event.

Selector helpers accept an optional `{ key, required, routeContext }` argument.
An optional miss is recorded as a bounded skip. A required miss records a
degradation decision for the owning feature; it does not cause a global failure.

Add-on request diagnostics use the request ID as their correlation ID and never
record the add-on payload, storage values, captured responses, HTML, CSS, or raw
stack details.
