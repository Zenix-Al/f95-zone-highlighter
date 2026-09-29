# Latest marker provider: core contract (Wave 1)

Latest Overlay does not wait for add-ons. The DOM-free broker in
`src/services/addons/latestMarkerBroker.js` owns provider registration, query
correlation, validation, and cancellation. Card rendering is deliberately not
connected by the separate overlay lifecycle documented in
`latest-marker-overlay-lifecycle.md`.

An add-on with the `latest.markers` capability and current trusted, enabled,
in-scope registration may invoke these core actions:

| Action | Data | Result |
| --- | --- | --- |
| `latest.markers.register` | `{ id, name, description, priority? }` | Provider metadata or reason. ID is unique globally; authenticated add-on ID is the owner. |
| `latest.markers.unregister` | `{ id }` | Removes only that add-on's provider. |
| `latest.markers.invalidate` | `{ id }` | Notifies current subscribers to re-query visible IDs. No records cross this action. |
| `latest.markers.respond` | `{ providerId, requestId, markers }` | Settles only a matching live request owned by the caller. |

Core consumers call `latestMarkerBroker.query(providerId, visibleThreadIds,
{ signal })`. A query sends `latest-markers.query` over the existing
`f95ue:addon-command` channel with `providerId`, `requestId`, and deduplicated
thread IDs. Add-ons respond using `latest.markers.respond`; no function is
serialized through the bridge. Repeated identical uncancelled queries coalesce.
An abort, 1.5-second timeout, unregister, disable, route change, or service
shutdown settles pending requests empty. A route change retains registrations
so a provider that stays in scope need not re-register. Late or wrong-owner responses are
rejected. Core never persists marker data or opens add-on storage.

The broker bounds providers and simultaneous requests to 16, and requested IDs
to 100 per query. Invalidation cancels old requests before notifying consumers. A
thread ID must be a positive decimal string; provider IDs are lowercase
ASCII identifiers of at most 64 characters. A result over 32 KiB in UTF-8 is dropped.
Only requested IDs can appear in normalized output; each gets one text-only
marker with a 40-character label, 160-character description, and one of
`muted`, `info`, `success`, `warning`, or `danger`. Unknown tones become
`muted`. No HTML, selectors, or CSS classes are accepted.

Preferences live at `latestSettings.latestMarkerProviders.<providerId>.enabled`.
The map is schema validated, exportable with Latest settings, and capped at 16
entries. An absent preference is **off**; registration does not implicitly
enable an add-on marker. Registered providers are shown as toggles in the
Latest Overlay settings dialog. Preferences remain after the provider leaves,
so a late registration can use the existing setting.

Only trusted add-ons may serve markers, even if the global untrusted-add-on
setting permits other capabilities. The runtime checks current registration,
trust, enabled state, route scope, and activation URL on every query/response.
Broker teardown is tied to add-on disable, unregister, route change, and
service shutdown. Latest Overlay owns the subscription and card slot.

## Generalization review (Wave 4)

The independent `editor-pick` test provider represents editorial recommendations,
not saved records. It registers with priority zero, receives the same bounded ID
query, and returns the existing text/tone/description schema. It coexists with
Library without either provider being able to answer the other's requests.
No Library fields, arbitrary decorations, HTML or new tone values were needed.
This fixture is test-only: no second add-on is installed or modified by the review.

Ownership remains session-scoped; core persists only generic enablement
preferences. There is no marker cache: diagnostics explicitly report
`cachedMarkers: 0`. Provider and pending-request counts are bounded to 16.
The `latestMarkerProviders` health diagnostics expose provider ID, add-on owner,
priority, allowed/enabled state, subscriber count and pending-request count.
They omit thread IDs, request payloads, descriptions and marker content.
After owner removal or service reset, the affected registrations and requests
are gone. Overlay disable additionally releases its subscription and DOM slots.

The current global provider-ID namespace and 16-entry preference limit are
deliberate v1 constraints, not a general plugin-decoration system. Unknown or
retired preference entries remain persisted; users with many retired entries
may eventually need an explicit preference-pruning UI. Cold Library reads still
share core IDB throttling and may time out; failure means absent markers, never
blocked card rendering. Browser performance/visual evidence and a released
second consumer should precede any schema expansion.
