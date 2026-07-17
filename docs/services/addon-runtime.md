# Add-on Runtime and Security Contract

This document summarizes the add-on runtime, bridge, trust model, mounts, and recommended validation/testing.

Normalized core-required add-ons use the narrow `addons/shared/runtimeKit.js` for their equivalent
transport wrappers and core adaptor. The kit does not abstract selectors, policy, state, domain
behavior, or lifecycle decisions. `addons/shared/runtimeLifecycle.js` remains the explicit owner
of generation invalidation, AbortSignal cancellation, resource snapshots, pending operations,
reversible disable, and exactly-once terminal acknowledgment. Masked + Direct retains its own
hybrid bootstrap so external download hosts never invoke the core-required kit.

`ADDON-RUNTIME-KIT-01` reduced authored source by 83 bytes in Example, 438 bytes in Halloween,
438 bytes in Latest Filters, 376 bytes in Library, and 324 bytes in Site Repair. The accepted
deterministic baseline records regular-build deltas of -13, -86, -84, -26, and -30 bytes
respectively; release deltas are 0, 0, 0, +44, and +36 bytes. The small release increases in
Library and Site Repair are retained as the measured cost of the shared re-export path, while
the runtime kit remains tree-shaken to the wrappers each bundle uses. Masked + Direct is unchanged.

## Add-on registry and lifecycle

- The add-on service (`addonsService`) manages:
  - discovery of installed add-ons and catalog entries
  - runtime enable/disable
  - pinned state and UI mounts
  - installation traces and logs
- Add-ons expose actions and UI mounts via an agreed bridge API. The service normalizes metadata and enforces capabilities.

## Trust model and scopes

- Classify add-ons as: `trusted`, `untrusted`, `blocked`, `disabled`.
- Actions must declare required scopes; the service enforces scope checks at execution time, not just at registration.
- Sensitive actions must be denied for `untrusted` add-ons and audited/logged when executed for `trusted` add-ons.

## Bridge and mount contracts

- The add-on bridge uses structured messages (action, payload, requestId, timeout).
- Each bridge request should include a `requestId` and optional timeout; responses must be correlated and deduplicated.
- Add-on UI mounts (dialogs, settings panels, page mounts) must be sanitized and owned by the add-on service — mount removal must be guaranteed on disable/uninstall.

## Storage and commands

- Add-ons may use the service to store settings; storage APIs must validate payloads against declared schemas.
- Commands must be whitelisted per add-on and include rate limits and timeouts.

## Throttling and resource limits

- Add-on execution should be subject to concurrency limits and request quotas to avoid DoS from buggy add-ons.
- The service should expose health metrics (active commands, queue length, recent failures).

## Recommended validation and CI checks

- Validate that documented bridge event names match the constants in source (scripted check).
- Add schema validation for add-on metadata and settings.
- Add integration tests for mount lifecycle (install → mount → disable → unmount) and for denied actions for untrusted add-ons.

## Recovery and audit

- Keep installation traces for recent operations and provide a way to clear sensitive traces.
- Redact sensitive data in logs and health reports.
- Provide a mechanism for forced unmount/cleanup if an add-on fails to clean up.

This contract complements UI-level notes about add-on mounts and trust boundaries; enforce security at the service boundary.
