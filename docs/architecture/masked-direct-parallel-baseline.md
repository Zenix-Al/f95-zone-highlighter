# Masked + Direct parallel-download baseline

This report records `MASKED-DIRECT-PARALLEL-BASELINE-01`. It is a
characterization only: production source, manifest/catalog metadata, versions,
build cache, and distributions are unchanged.

## Confirmed collisions

- Concurrent creation is a complete-ledger read-modify-write. If tabs A and B
  read the same empty value, the later write retains only its own request.
- Exact cleanup is also a complete-ledger read-modify-write. A stale cleanup
  can overwrite a concurrently created request.
- `reportAddonHealthy()` calls the no-ID cleanup on an ordinary F95 tab. That
  path writes an empty ledger and removes every live request.
- Close delay uses one shared GM value. Overlapping requests observe the last
  writer's delay rather than request-owned values.
- The result listener tracks one `lastEventTs`. For one owner tab, receiving a
  newer request result before an older sibling result discards the older
  sibling.
- Target-tab filtering occurs before timestamp mutation, so an event intended
  for another main tab is ignored. Local listener callbacks are also ignored.
- Sequential requests from one tab retain both entries. The demonstrated fault
  requires overlapping read-modify-write operations.

## Toast ownership

The add-on has progress, success, failure, timeout, lifecycle-blocking, and
cross-tab-result toast callers. F95 calls `toast.show` through the core and
falls back to a local element on failure. External hosts always use the local
element. `ui/controller.js` owns `#f95ue-addon-toast`, its CSS, hide timer, and
timer cleanup through the app teardown list.

The complete machine-readable call-site classification is in
`masked-direct-parallel-baseline.json`.

## Request identity path

The main tab generates `requestId` and uses its session-owned `ownerTabId`.
Both are placed in the automated URL and shared processing trigger. The
managed `GM_openInTab` handle is indexed by request ID. The external page
copies route identity into session storage, runs the host handler, and
publishes a targeted result containing both identities. The originating
listener filters by target tab; a close event resolves the managed handle by
request ID.

The weak boundary is the shared processing ledger and global delay—not request
ID generation or the managed-tab map.
