# Library Latest marker provider (Wave 3)

The Library app registers `library-status` after storage preparation and enable.
It answers the core `latest-markers.query` command through the existing bridge,
using only requested IDs and the Library service's entry cache/IndexedDB reads.
Missing records and failed reads produce no marker. It never touches Latest DOM.

Saved, Backlog, Playing, Paused, Completed and Dropped each return one label,
core tone, and accessible description. Update acknowledgement and played-version
state are intentionally excluded. The integration is opt-in through the core
Latest Overlay settings toggle named **Library status**; provider registration
does not change that preference.

Successful record puts, deletes, and bulk import writes signal coalesced
invalidation through the service callback. Route changes invalidate in-progress
queries; disable and terminal teardown stop the provider. Unsupported older
core APIs leave the provider inactive without blocking Library's normal UI.
Registration signals invalidation once ready to cover a core query arriving
before the registration reply. Core still enforces timeout and ownership.

The manifest declares `latest.markers`, and the trusted catalog is regenerated
without building userscripts or bumping versions. Tests cover all six status
mappings, absent entries, invalidation coalescing, stale route replies and older
core fallback, alongside the core broker/overlay lifecycle tests.
