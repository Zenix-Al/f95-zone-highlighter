# Library Latest Marker Provider

## Goal

Show an optional Library-owned state marker on Latest cards without giving the
Library Add-on ownership of Latest-card DOM, delaying the core overlay boot, or
requiring core to read the Library IndexedDB database.

## Fixed boundaries

- Core Latest Overlay remains the sole owner of card discovery, marker layout,
  rendering, ordering, card-replacement cleanup, and accessibility treatment.
- Library owns the meaning and source data for its markers: saved status,
  personal status, and any future Library-only state.
- Core persists only generic provider integration preferences. It must not copy
  Library records into core config or open the Library IndexedDB database.
- A provider returns structured data only. It never returns HTML, CSS classes,
  selectors, or DOM callbacks.
- Latest Overlay must render immediately when core boots. An unavailable,
  disabled, slow, or late-loading provider must leave its marker absent rather
  than delaying the card.

## Proposed provider contract

Introduce a narrow, add-on-facing Latest marker-provider registration API.
The example below describes the logical provider interface, **not** a payload
that can be sent through the existing add-on bridge. The exact wire actions
remain to be chosen, but their data should remain bounded and data-only:

```js
{
  id: "library-status",
  priority: 50,
  getMarkers(threadIds) {
    return {
      "123": { label: "Playing", tone: "info", description: "In your Library: Playing" },
      "456": { label: "Saved", tone: "muted", description: "In your Library: Saved" },
    };
  },
}
```

## Pre-implementation investigation (core)

- The existing add-on-to-core action bridge accepts data payloads and returns
  replies; it cannot register a callable `getMarkers` function. Core's
  `f95ue:addon-command` channel sends commands to add-ons, but the shared
  `bindAddonCommands` helper has no correlated reply path. Wave 1 must define
  a request ID, response action, timeout, and ownership checks for core-to-add-on
  marker queries (or explicitly choose a different data-only protocol).
- Add-on capabilities are allowlisted in `src/services/addons/shared.js` and
  checked at invocation. A marker capability/action needs an explicit policy;
  registration must be bound to the authenticated add-on ID, not an ID supplied
  inside the marker payload. Decide whether only trusted add-ons may provide
  markers, including when the global untrusted-add-on option is enabled.
- `latestSettings` uses a closed schema in `src/config/schema.js`. Generic
  provider preferences need defaults, strict validation, tolerant sanitization,
  export/sync metadata, and Settings UI behavior. Define a bounded provider-ID
  map and the default when an add-on is absent or has not yet registered.
- Latest Overlay currently processes `resource-tile` elements by generation and
  thread ID. Provider results should be consumed by that lifecycle in Wave 2;
  Wave 1 should expose a DOM-free registry/query service and tests, without
  changing card rendering yet.

Contract constraints:

- `threadIds` is a deduplicated bounded list of visible Latest-card IDs.
- The response is a map keyed only by requested IDs; unknown IDs are omitted.
- Labels, descriptions, and supported tone values are length-limited and
  normalized by core before rendering.
- Calls are cancellable, time-bounded, and may be coalesced per provider.
- Core may cache the most recent result only for the active page/session; it
  must never persist marker data as configuration.
- The provider can notify core that its data changed. Core then re-queries only
  the currently visible IDs and reconciles its own marker slot.

## Late boot and reconciliation flow

```text
Core Latest Overlay boots
  -> renders its normal markers immediately
  -> tracks visible card thread IDs
  -> observes enabled registered providers

Library Add-on finishes bootstrap later
  -> registers its Library marker provider
  -> core requests markers for currently visible IDs
  -> core reconciles the Library-owned marker slot on those cards

Library state changes
  -> Library invalidates/updates its local cache and signals provider change
  -> core requests markers only for visible IDs
  -> core updates or removes the affected marker slots
```

No overlay path waits for Library. A missed or timed-out response is treated as
an empty result and can be retried on the next normal reconciliation.

## Core-owned settings

Core should store a generic setting keyed by provider ID, for example:

```js
latestOverlay.providers.libraryStatus.enabled = true
```

Provider registration supplies display metadata for the core Settings UI (name,
description, and supported state). The setting may exist before the add-on
loads; core applies it when that provider registers.

## Implementation waves

### Wave 1 — Core contract and safety [x]

- Choose and document a data-only registration, query, response, invalidation,
  and unregister protocol. Do not send functions across the bridge. Correlate
  responses to the originating request, provider, add-on, and active generation.
- Define the marker capability/action policy; bind provider ownership to the
  authenticated, installed, trusted add-on descriptor. Reject spoofed provider
  IDs and responses from disabled, out-of-scope, or unregistered owners.
- Define a fixed marker schema with bounded IDs, batch size, payload bytes,
  label/description length, tone values, and at most one marker per requested
  thread ID per provider. Drop unsolicited IDs and malformed entries.
- Add bounded request timeout, cancellation/late-reply discard, result-size
  limits, coalescing, and safe tone normalization. Clear pending requests and
  session cache on provider unregister, disable, and route teardown.
- Add core-owned Settings metadata and a schema-backed, bounded enablement map
  keyed by provider ID; specify default behavior for absent providers and
  preserve preferences across late registration.
- Test absent, disabled, malformed, spoofed, slow, late, and duplicate
  providers, plus teardown and stale-response behavior. Keep Wave 1 DOM-free.

### Wave 2 — Overlay lifecycle

- Add one core-owned marker slot to each Latest card.
- Request data only for deduplicated visible IDs.
- Reconcile after registration, route changes, card replacement, pagination,
  and provider invalidation without duplicate marker nodes.
- Preserve the existing overlay's ordering and performance budget.

### Wave 3 — Library provider

- Add the `library-status` provider behind the core integration setting.
- Read Library state through its own service/cache and return only requested
  IDs.
- Start with a single marker representing saved/personal status; do not expose
  update acknowledgement or played-version detail until its visual vocabulary
  is intentionally designed.
- Signal invalidation after Library save/remove/status/import changes.
- Verify Library booting after Latest Overlay, disabled integration, IDB
  unavailability, and card route replacement.

### Wave 4 — Generalization review

- Validate the API with a second non-Library provider before widening the
  schema or adding arbitrary card decorations.
- Keep provider ownership, settings, cache bounds, and teardown diagnostics
  explicit in architecture documentation.

## Acceptance criteria

1. Latest cards render normally before any add-on provider is ready.
2. A late Library registration decorates already visible matching cards without
   a reload.
3. Core never reads or persists Library records.
4. Library never mutates Latest-card DOM.
5. Disabled, failed, timed-out, or malformed provider calls leave core cards
   intact and do not block other providers.
6. Reconciliation is bounded to visible IDs and does not create duplicate
   markers after route changes or repeated registration.
7. The provider API remains useful to a second add-on without adding
   Library-specific fields to core.
