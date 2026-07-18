# Add-on API audit

Generated for **ADDON-API-AUDIT-01**. This report inventories source only; it adds no public action and does not redesign registration security.

## Coverage

6 of 6 manifest add-ons were inventoried. All raw action occurrences are mapped to the current descriptor list or the existing `addon.access` / `addon.throttle` management calls.

| Add-on | Source files | Raw action occurrences | Global listeners | Polling/timers/observers | Direct GM lines | Actions |
|---|---:|---:|---:|---:|---:|---|
| site-repair-addon | 19 | 9 | 1 | 3 | 0 | addon.access (1), observer.unwatch (1), observer.watch (1), page.getContext (1), storage.get (1), storage.set (1), toast.show (1), ui.style.register (1), ui.style.unregister (1) |
| masked-direct-addon | 37 | 7 | 5 | 13 | 60 | observer.waitFor (1), page.getContext (1), storage.get (1), storage.set (1), toast.show (1), ui.style.register (1), ui.style.unregister (1) |
| library-addon | 61 | 27 | 1 | 7 | 0 | addon.access (1), addon.throttle (1), config.getTagPrefs (2), idb.bulkPut (1), idb.delete (1), idb.get (1), idb.put (2), idb.query (1), observer.waitFor (1), page.getContext (1), storage.get (1), storage.set (1), toast.show (1), ui.confirm (1), ui.dialog.close (2), ui.dialog.open (2), ui.dialog.update (1), ui.mount (1), ui.style.register (2), ui.style.unregister (2), ui.unmount (1) |
| example-addon | 38 | 62 | 2 | 2 | 0 | addon.access (2), addon.throttle (2), config.getTagPrefs (2), feature.disable (2), feature.enable (2), feature.refresh (2), idb.bulkDelete (1), idb.bulkPut (1), idb.count (2), idb.delete (2), idb.get (2), idb.put (2), idb.query (2), observer.unwatch (2), observer.waitFor (2), observer.watch (2), page.getContext (2), storage.get (2), storage.getUsage (2), storage.set (2), toast.show (2), ui.confirm (2), ui.dialog.close (2), ui.dialog.open (2), ui.dialog.update (2), ui.dock.removeButtons (2), ui.dock.setButtons (2), ui.mount (2), ui.style.register (2), ui.style.unregister (2), ui.unmount (2), ui.update (2) |
| latest-filters-addon | 24 | 14 | 2 | 2 | 0 | config.getTagPrefs (1), observer.waitFor (1), page.getContext (1), storage.get (1), storage.set (1), toast.show (1), ui.confirm (1), ui.dialog.close (1), ui.dialog.open (1), ui.dialog.update (1), ui.mount (1), ui.style.register (1), ui.style.unregister (1), ui.unmount (1) |
| halloween-theme-addon | 9 | 0 | 0 | 1 | 0 | none |

## Candidate decisions

| Candidate | Consumers | Capability / scope | Decision | Rank | Reason |
|---|---:|---|---|---:|---|
| `page.getContext` | 3 | `page`; runtime; read-only and route-generation bound | **implement** | 1 | Three production add-ons have overlapping route parsing, and a bounded normalized result reduces correctness drift without exposing core DOM. |
| `observer.waitFor` | 4 | `observer`; runtime; one-shot, owner-scoped, core page scopes only | **implement** | 2 | At least four add-ons show bounded wait/poll behavior; central ownership directly reduces stale callbacks and cleanup risk. |
| `ui.dialog.update` | 3 | `ui.dialog`; runtime; add-on-owned dialog only | **implement** | 3 | Example, Library, and Latest Filters each maintain open dialog content outside the current dialog action. |
| `ui.mount.actions` | 1 | `ui.mount`; runtime; bounded declared action IDs only | **reject** | 8 | Only Library currently demonstrates the specific cross-boundary workaround; Example and Latest keep their click handlers inside add-on-owned UI, so the multi-consumer threshold is not met. |
| `storage.subscribe` | 1 | `storage`; runtime; own add-on storage bucket only | **reject** | 7 | The only value-change listener is Masked + Direct add-on transport, which must remain add-on-owned; Latest Filters uses direct GM only for its local preset fallback. No shared core-storage subscription gap is proven. |
| `addon.getContext` | 6 | `management/read`; management; read-only, never handshake or secret data | **defer** | 6 | All core add-ons already use the two stable, separately authorized projections; combining them changes no demonstrated correctness failure and risks mixing management policy with throttling. |
| `ui.progress` | 2 | `ui.dialog`; runtime; add-on-owned progress instance | **defer** | 5 | Example and Library are two consumers, but their immediate shared gap is dialog update ownership; measure ui.dialog.update first before adding a larger specialized progress API. |
| `addons.shared.cancellableTask` | 4 | `none (addons/shared)`; local add-on runtime; no core action | **use local shared helper** | 4 | This is repeated add-on boilerplate rather than a missing core capability; keep ownership local and avoid expanding the core service. |

The approved bounded list for the next package is: `page.getContext`, `observer.waitFor`, `ui.dialog.update`, `addons.shared.cancellableTask`. The first three are additive public APIs; `addons.shared.cancellableTask` is explicitly local and does not add a core action.

## Rejected and deferred

- `ui.mount.actions`: **reject** — Only Library currently demonstrates the specific cross-boundary workaround; Example and Latest keep their click handlers inside add-on-owned UI, so the multi-consumer threshold is not met.
- `storage.subscribe`: **reject** — The only value-change listener is Masked + Direct add-on transport, which must remain add-on-owned; Latest Filters uses direct GM only for its local preset fallback. No shared core-storage subscription gap is proven.
- `addon.getContext`: **defer** — All core add-ons already use the two stable, separately authorized projections; combining them changes no demonstrated correctness failure and risks mixing management policy with throttling.
- `ui.progress`: **defer** — Example and Library are two consumers, but their immediate shared gap is dialog update ownership; measure ui.dialog.update first before adding a larger specialized progress API.

## Security and compatibility

- Registration transport, identity, handshake fields, and response shapes are unchanged.
- No public action was added.
- Existing userscript matches, grants, run timing, storage keys, IDB names, and add-on state are outside this audit's mutation scope.
- Hybrid add-ons retain local behavior on standalone hosts.

The JSON report contains exact relative call sites, candidate payload/result bounds, cleanup ownership, compatibility requirements, estimated source impact, and ranking evidence.
