# Latest Overlay capture

Latest capture is private infrastructure owned by
`src/features/latest-overlay/capture/`. It observes the site's first
`latest_data.php` XHR or fetch request before normal feature enable, retains one
bounded snapshot, and lets Latest Overlay reuse that response instead of issuing
a duplicate request.

It is not a general core service or an add-on API. Feature descriptors do not
accept capture rules, and no action, bridge command, settings entry, or trusted
add-on can read captured response bodies.

## Lifecycle

1. The loader explicitly starts capture during fast bootstrap, before a body is
   required, and passes whether the current route is Latest.
2. The page transport installs the page-world XHR/fetch hooks. The sandbox
   transport remains the fallback when the page bridge is unavailable.
3. Matching same-origin responses enter the bounded queue. Valid
   `payload.msg.data` replaces the single current snapshot.
4. When Latest Overlay enables, its handler installs the sole private consumer
   callback and immediately reads the current snapshot. This covers a response
   that arrived before enable without replaying or duplicating it.
5. Later valid responses notify that callback and replace the snapshot.
6. Disable removes the handler callback and clears its derived record index.
   Route refresh advances the capture generation and rejects queued stale work.

The initial recovery watch checks resource performance entries for a matching
request that completed before interception. If found, it performs one
same-origin credentialed fetch and feeds the result through the same validation
path.

## Fixed contract and limits

- Endpoint substring: `latest_data.php`
- Payload path: `msg.data`
- Transports: XHR and fetch
- Retention mode: newest valid response only
- Snapshot TTL: 30 seconds
- Maximum response: 512 KiB
- Maximum queued responses: 20
- Maximum retained bytes: 2 MiB (the single-response limit is narrower)

Only same-origin HTTP(S) URLs are accepted. Invalid transports or URLs,
foreign origins, unsupported response types, oversized payloads, malformed
JSON, missing data, queue overflow, and stale route generations cannot commit a
new valid snapshot. A malformed later response does not destroy the previous
valid snapshot.

Diagnostics expose status, age, byte counts, queue state, recovery state, and
bounded drop counters. They never include response bodies. The implementation
entry point is `src/features/latest-overlay/capture/index.js`; it intentionally
has no compatibility facade under `src/services/`.
