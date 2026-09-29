# Latest marker overlay lifecycle (Wave 2)

`markers.js` connects the core-owned renderer to the data-only broker through
`markerLifecycle.js`. The existing Latest Overlay enable/disable functions own
its subscription and a framework observer named `latest-overlay-markers`.
No additional raw observer or DOM ownership is granted to providers.

Normal card painting starts before marker enablement; provider requests never
join that paint promise. Reconciliation runs after a coalesced microtask and
uses the shared frame-budget runner for slot removal and marker painting.
Queries use deduplicated IDs from connected, laid-out, non-hidden Latest cards
(not only cards inside the viewport), in batches of at most 100 per provider.

Registration, unregister and invalidation trigger reconciliation. Card additions
and removals, including pagination replacements, are detected by the framework
observer. Normal overlay snapshot/settings reprocessing also refreshes markers.
Mutations to marker nodes themselves are excluded from the marker observer's
filter, preventing a render/query feedback loop.

Each refresh aborts the previous request generation. Results cannot paint after
replacement, disable, or a newer refresh. Detached/replaced cards lose their
slots, and feature disable unsubscribes, cancels requests and removes all slots.
Provider failures do not stop other providers or core card rendering.

Each decorated thumbnail has one `.f95ue-latest-markers` slot at the upper-right:
below the score when present, or in its position when absent. CSS reacts to score
insertion/removal without a new provider query. Reason, score and marker use a
45%-opaque black background. Text-only chips are ordered by
priority then provider ID, regardless of reply order. Only the first is visible;
additional providers appear as a bounded `+N` indicator. Their labels and accessible
descriptions are provided through text content and aria labels. Theme tones are
core-owned CSS. Missing or disabled provider results leave no chip.

Focused tests cover late registration, removal, replacement, duplicate rendering,
stale replies, disable, batching, failure isolation, safe text, core-decoration
preservation, and the observer's own-mutation exclusion. Library registration
and state mapping remain Wave 3.

`latest-marker-placement.visual.cjs` uses the supplied card HTML with a controlled
page-style shell to verify normal/narrow card geometry, score-on/off alignment,
background alpha and multi-provider overflow. Screenshots are attached to the
Playwright report; this is not a substitute for a live site stylesheet smoke check.
