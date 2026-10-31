# Library-only Latest: implementation and revised boundary

## Current decision

Library owns this view. No new core capability/action, public data-source API,
private capture event, core UI controller, or per-mode scoring policy is required.
The previous core-owned implementation was removed after browser experiments
proved an add-on-only path. Production core modules have been restored to their
original implementation; user-built catalog/version artifacts are preserved.

This supersedes the earlier parallel-snapshot design and its core ownership
assumptions. Wave 2's metadata/history changes remain. Wave 5 offline verification
and the local v1.5.0 release build are recorded below; full-suite and structured
live-site verification remain handoff checks, not claimed as completed here.

## Native rendering contract

The supplied native `latest.min.js` uses jQuery AJAX for a GET to
`/sam/latest_alpha/latest_data.php?cmd=list&cat=games...`. Its success callback
builds cards and calls `ma(count,total,page)`. The `popstate` handler invokes
`Z(false,true)`, which reparses the hash, refreshes controls, and requests the list.
The reference userscript's toggle instead reloads; we do not copy that behavior.

`latestNativeView.js` is an ordinary Library-owned lifecycle resource, not injected
core code. Library is a `@grant none` userscript using the page's jQuery. Its
keyboard-accessible book toggle is inserted immediately before
`#controls_auto-refresh` in that control's own block. Native selected styling and
`aria-pressed` show state; a visually hidden live status does not widen the toolbar.
No raw MutationObserver or new observer permission is added. The existing retry
budget handles late toolbar/jQuery readiness; native request/redraw paths remount
the toggle after toolbar replacement.

Entry remembers the normal hash, selects page 1, and dispatches native `popstate`.
Library prepares local query results, then allows exactly the ordinary native
list request through. A per-request `xhr` factory shadows responseText/response
only on that instance. Both jQuery and core's existing loadend capture therefore
read the same substituted collection. XHR prototypes are not modified by Library.
HTTP errors are not rewritten to success: a 403/challenge still follows the site's
error handler. There is no crawler, enrichment request, second updater, or offline
renderer. Each successful local redraw still costs its ordinary site list request.

## Capture compatibility, including recovery

Core captures response bodies, not only card mutations. An XHR response accessor
works whether core's capture wrappers were installed before or after Library.
One real complication was reproduced: core's performance-entry recovery fetch can
race the substituted XHR and overwrite capture with a genuine response.

`latestNativeTransport.js` conservatively recognizes the current recovery HTTP
signature: a same-origin games GET-list URL, string input, and an options object
containing only `credentials:"same-origin"`. While a current local request is
prepared, the add-on supplies its same wire body to that recovery fetch. Recovery's
existing processing path consumes it normally; Library does not call any private
core function or emit a private event. This mirror makes no server request.

This is a compatibility dependency on the current recovery request shape, not
authenticated caller identification or a promised public API. Requests with other
options, methods, origins, or endpoints pass through. In particular, Library's
manual/automatic updater uses `credentials:"include"`, headers and a signal and is
not redirected to the collection. Both wrappers become passthroughs after disable;
later third-party wrappers are not overwritten during restoration.

Capture's original single-snapshot semantics remain: substituted Library data is
the current snapshot in this mode; normal exit captures a new genuine response.
There is no separate protected genuine snapshot. Other genuine Latest API traffic
can update core capture exactly as it could before this feature. Local record
commits invalidate cached data for the next redraw, but we do not claim isolation
from every caller.
This limitation belongs in Wave 5 background-updater/mode-switch verification.

Unknown numeric facts are omitted on the capture wire rather than passed as null
that core might interpret as a zero rating. jQuery's dataFilter supplies native-only
dashes/default rating/Unknown date for display. These defaults are not persisted or
fed back as known facts. Overlay's normal tag highlights, hover handling, rating
logic, preference-based scores, and Library marker provider are unchanged. There
is no new Library-specific score suppression or alternate overlay implementation.

## Storage, adapter, and history (Wave 2 retained)

- Optional `thread.latest` stores validated cover/screens URLs, views/likes/feed
  timestamp, and supplied last-observed site flags. It stores URLs, not images or
  full API bodies. HTTPS URL lengths are bounded to 2048 characters and screenshot
  arrays to 20 unique entries; malformed values are not adopted.
- Shared manual/auto observation commits retain those fields. Sparse HTML/API
  patches preserve existing facts; explicit empty screenshots clear that list.
  Normalize, merge, and import/export paths preserve optional fields without an
  object-store/index/schema-version change or extra enrichment requests.
- Canonical tags remain strings and prefixes remain display label/color objects.
  Core's existing `config.getTagPrefs({includePrefixes:true})` supplies catalogs
  for cached reverse mappings. Missing/ambiguous matches never invent numeric IDs.
- Presentation-only changes update current facts and existing invalidation paths,
  not update/activity history, changed state, version notifications, or game-change
  time. New update-history snapshots/diffs omit tags entirely. Existing tag-bearing
  history is preserved, readable, and exportable; current tags remain up to date.
- The pure adapter locally applies search, include/exclude tag/prefix filters,
  sorting, date filtering, and pagination. Missing numeric/date sorts go last, with
  ID tie-breaks. Unknown covers/screens use neutral/empty native inputs. A known
  category is not inferred from membership; native games-view limitations remain
  explicit for arbitrary saved threads.
- Keyset reads use the existing service with generation cancellation/cooperative
  yields and a 10,000-read-record cap. Overflow reports an error rather than
  silently truncating; there is no duplicate persisted collection.

## Freshness and lifecycle

`latestCollectionController.js` owns entry-session cache and local reads. It rereads
on entry, including other-tab changes; continuous cross-tab synchronization is not
added. The existing `onRecordsChanged` callback fans out to marker invalidation and
one coalesced changed hint/cache invalidation for save/remove/edit/import/updater
commits. They do not force a native HTTP request for each write: this would double
traffic during an updater batch. Cards reload on the next native redraw or toggle;
existing status-marker invalidation still works immediately. Query reads do not
write records or trigger refresh loops. Canceled local preparation may retry at
most twice if a concurrent write invalidated it, without sending an extra request.

Old preparation generations cannot send or paint after another query, toggle,
disable or route exit. Initial native requests predating installation must settle
before enabling the collection. A six-second preparation timeout reports an error;
the site's normal request timeout still governs HTTP. A 1.5-second missing-router
watchdog backs out instead of hanging, fetching repeatedly, or reloading.

BFCache freezes cancel owned work, restore the normal hash without a request, and
redraw normal Latest on persisted return. Disable removes the UI, listeners and
timers and restores transport functions without clobbering later wrappers. Retained
inner wrappers are inert and release DOM/prepared-query references. Readiness is
bounded to an immediate attempt plus twenty 500-ms retries, canceled on stop.

## Evidence and remaining verification

The revised deterministic tests use committed fake HTTP/jQuery fixtures plus real,
unchanged core capture, indexing, overlay painting, hover and marker components.
They cover both installation orders, sparse metadata, HTTP failure, canceled
preparation, entry caching, invalidation, BFCache, remounting, missing native router,
and updater-fetch passthrough. No live F95/API requests or disposable reference
files are dependencies of the unit suite. Obsolete core-broker/source-switch tests
were removed and replaced, not retained as tests of deleted architecture.

An additional disposable Chromium experiment used actual jQuery 3.7.1, actual XHR,
unchanged production capture/overlay code and intercepted fixture HTTP responses.
All four combinations (Library first/core first, page transport/sandbox fallback)
captured game 42, painted its preferred-tag overlay, survived overlay re-enable,
then captured normal game 1 on exit. Each context made two API fixture requests:
one entry redraw and one normal exit. No manual private capture event was emitted.
This proves the transport boundary, not the entire live site's minified renderer
or every third-party/userscript-manager execution world. Full site rendering,
large collections, background traffic and final release checks remain Wave 5.

No tracked distribution, version bump, manifest permission change, or user build
cache reset is part of this revision. Only the Library add-on needs new feature
code; it does not require a new core API/version.

## Revision validation

- The broader focused boundary run passed 209 tests; the final add-on/capture/
  adapter follow-up passed 15 tests (overlapping coverage, not summed).
- Both temporary Chromium experiments passed all four transport/order cases.
  The second used the actual revised add-on view, jQuery 3.7.1, real XHR, unchanged
  core capture/overlay, normal exit, and overlay disable/re-enable. API traffic
  was intercepted fixture traffic, not live F95 requests.
- Targeted ESLint, diff checks, core smoke, and Library regular/release smoke
  passed. The affected API/size/baseline/CSS/Library reports were refreshed and
  checked. The regenerated core baseline exactly matches the original gate hash;
  its original gate definition/rationale was restored, not relaxed or rebaselined.
  Core minified bundle delta is zero. Core and add-on report checks passed.
- Existing user manifest version, build cache, and catalog changes were preserved.
  No tracked distribution or release build was produced. Full-suite and live-site
  checks are still pending; the current native renderer was not executed in full
  by the focused fixture tests.

## Wave 5 — v1.5.0 release verification (2026-10-31)

The add-on-only architecture is the released design. The Library manifest moves
from 1.4.3 to 1.5.0; core's version and feature/API implementation are unchanged.
The release userscript is generated for Library only, with release optimizations
and the builder's normal beautification. Changelog and Greasy Fork usage notes describe local
membership, cached metadata, ordinary native requests, quiet invalidation, and
the absence of a new core API requirement. Feed timestamps now produce readable
relative dates (minutes/hours/days/weeks/months/years), not huge minute counts.

### Offline browser matrix

A disposable Chromium/jQuery 3.7.1 harness exercised the real controller, adapter,
XHR substitution, original core capture and overlay, and a native-like DOM
renderer. All HTTP API responses were intercepted fixtures; storage/catalog
providers were mocked. It does not establish actual core-bridge/IndexedDB
throughput or full live-site CSS/minified-renderer compatibility.

| Initial records | Cold entry, fixture ms | Requests across complete scenario | Updater requests included | Heap delta after 10 toggle pairs, GC bytes |
| --- | ---: | ---: | ---: | ---: |
| 0 | 127 | 27 | 0 | 308704 |
| 1000 | 95 | 32 | 1 | 158392 |
| 10000 | 544 | 32 | 1 | 162436 |

These are one-run diagnostic timings, not a benchmark or proof of zero memory
growth. Scenarios included local filtering, page clamping, empty results, external
membership changes on re-entry, ten repeated toggle pairs, canceled preparation,
HTTP 429, and disposal. At most 30 cards were rendered per page and one toggle was
mounted. Stop left zero owned pagehide/pageshow listeners, no toggle, and restored
the original AJAX/fetch identities. No uncaught page errors occurred. Local record
writes made no additional HTTP requests. The initial harness needed native-like
control dimensions because Font Awesome/site CSS was intentionally not loaded;
this was a fixture correction, not a production change.

Background updater traffic with include/headers/signal reached its genuine
fixture response. As expected, that response replaced core's shared snapshot;
the next explicit native redraw captured Library results again. Thus an unrelated
Latest API request may temporarily affect overlay data/reprocessing. This is an
observed existing core-capture limitation, not a new protected-source guarantee.
No new permission or core patch was introduced to hide it. Large real databases
can also encounter existing core action/payload limits; the 10,000-record matrix
does not claim to validate those bridge limits under load.

The user informally reported the Library/Latest Overlay combination working. No
structured live-site matrix was supplied; host styling, hover behavior across
userscript managers, and all live filter/sort cases remain manual checks. The
current native script was inspected but not executed in full by this fixture.
The main unit suite has no live API or disposable reference-file dependency.

The implementation TODO is removed after release preparation; these verification
notes retain the completed scope, evidence, and remaining manual/full-suite gaps.

Final focused validation: 426 tests passed, zero failed, across Library groups,
add-on service/matrix, Latest marker overlay/provider, integration, and core load
trace groups. Library source and affected test lint passed. The full test suite
remains the user's pre-push check, not a claimed result of this release pass.

Core/source size gates, CSS, add-on baseline/API/size, Library personal baseline,
catalog/manifest/structure, feature manifest, and inventory checks passed. The docs
check remains blocked by six pre-existing links to the separately deleted masked
download rework and test-efficiency TODOs; those unrelated deletions were preserved.
Core feature/API source and the core version were not changed for this release.
