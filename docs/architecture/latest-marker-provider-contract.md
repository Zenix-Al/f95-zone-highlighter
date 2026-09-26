# Latest marker provider: core contract (Wave 1)

Latest Overlay does not wait for add-ons. The DOM-free broker in
`src/services/addons/latestMarkerBroker.js` owns provider registration, query
correlation, validation, and cancellation. Card rendering is deliberately not
connected until Wave 2.

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

The broker bounds providers to 16 and requested IDs to 100 per query. A
thread ID must be a positive decimal string; provider IDs are lowercase
ASCII identifiers of at most 64 characters. A result over 32 KiB is dropped.
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
service shutdown. Wave 2 will own the overlay subscription and card slot.
