# Masked Direct standalone automation baseline

This records `MASKED-DIRECT-STANDALONE-BASELINE-01`. It is characterization
only; no production source, persisted format, manifest, version, or generated
distribution changes in this package.

## Current gates

On F95, `bootstrapMaskedDirectAddon()` completes bounded core ping retries,
falls back to `addon.access`, registers, refreshes access, and then restores the
persisted enabled state. A conclusively missing core currently stops the F95
branch without publishing any external-host policy.

External hosts intentionally skip core ping. `shouldRunHostAutomation()` still
requires a fresh exact managed request proven by URL markers, matching session
context, or an explicitly supported unambiguous source lookup. A supported
host visited manually is therefore blocked even while the add-on's local state
starts enabled.

## Managed identity storage

- `processingTrigger.js` creates, reads, updates, expires, and clears isolated
  request records. It also creates and removes bounded source lookups.
- `routeContextRepository.js` owns same-tab redirect identity.
- `downloadPageController.js` reads exact or recovered identity, assigns the
  active request, and renews its lease while a challenge is present.
- `flowController.js` creates requests before F95 opens a host, resolves the
  active request after host success/failure, publishes outcomes, clears the
  exact request, and starts managed closing.

Legacy compatibility reads remain documented in
`masked-direct-reliability.md`; they do not authorize a request without an
exact request ID.

## Managed-only side effects

The origin-result transport lives in `attention.js`. Success, failure,
challenge, and close events carry request and owner-tab identity when one is
available. `managedTabs.js` closes the origin-owned `GM_openInTab` handle.
`managedClose.js` separately refuses both the origin close request and local
`window.close()` fallback when no fresh managed identity exists.

The important future boundary is `flowController.js`: handlers currently call
shared failure and healthy callbacks. Those callbacks can still attempt a
requestless result publication before close protection refuses the tab. A
standalone engine must therefore gate signaling at the callback boundary; it
cannot rely on close refusal alone.

## Host eligibility

The deterministic matrix is in
`masked-direct-standalone-baseline.json`. KrakenFiles, DelaFil, download.gg,
UploadHaven, and exact Pixeldrain `/u|d|f/<id>` routes are approved without
enabling broad fallback pages. Other conditional hosts need a standalone one-shot,
stage, or single-file guard. Buzzheavier, Datanodes, and MediaFire are deferred
until they gain sufficiently narrow standalone route classification.

This is deliberately a limited standalone baseline: a compiled-in host is not
automatically standalone-safe merely because managed automation supports it.

## Retained regression evidence

- The new baseline group proves every canonical host is blocked on a manual
  visit, exact managed identity is selected without claiming a sibling request,
  and unmanaged tabs cannot enter managed closing.
- `masked-direct-parallel-requests.cjs` already proves URL/session identity,
  markerless redirect recovery, ambiguity refusal, exact cleanup, and parallel
  isolation.
- `masked-direct-reliability.cjs` already proves host routes, challenge
  behavior, signaling, and managed close timing.
