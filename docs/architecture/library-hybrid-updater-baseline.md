# Library hybrid updater: wave 1 baseline

Recorded 2026-10-17. Investigation, fixtures and regression tests only; no
production changes, new updater requests, settings, version bumps or distribution rebuilds.
The completed implementation is documented in the
[hybrid request budget and behavior contract](library-hybrid-request-budget.md).

## Payload evidence

`tests/fixtures/library-latest-api-chilling-ridge.json` preserves the supplied
response values as offline test data. Its source is the user's pasted response,
not a newly harvested listing. The HTML fixture alongside it is synthetic.

The list endpoint is `/sam/latest_alpha/latest_data.php`, using `cmd=list`,
`cat=games`, `page=1`, `search`, `sort=date` and `rows=15`. The sample has
`status: "ok"`, one `msg.data` row, `msg.pagination` and `msg.count`.
Identity is numeric `thread_id: 281676`; title, creator, version and public rating
are strings/numbers. Tags and prefixes are numeric ID arrays, not labels. The
row has no thread URL. `ts`/`date` describe listing time, not observation time.

The earlier direct headless Chromium inspection returned JSON successfully.
Wave 1 inspection of the containing Latest page returned HTTP 200 with only
`Sorry, you have to be logged in to access this page`: no scripts or catalog
globals were available in that clean session. No login, challenge bypass,
guessed catalog endpoint or additional list queries were attempted for wave 1.
Neither the site's actual hourly limit nor server-side cost is established by
these observations. CI never contacts the site.

## Catalog contracts

| Source | Verified contract | Limitations |
| --- | --- | --- |
| `config.getTagPrefs` | Existing storage-capability core action; returns `tags`, preferred/excluded/marked arrays and color config. Core's normalized tag entries are `{ id: number, name: string }`. | No prefix catalog, fetched-at timestamp, catalog revision, freshness guarantee or refresh operation. Successful reads may contain an empty tag array. |
| `src/services/tagsService.js` | Reads `latestUpdates.tags` and `.prefixes` directly or through the existing page bridge; tags normalize from ID/name objects or entry pairs. | Requires usable page globals. This is core-owned ingestion, not an add-on HTTP lookup API. Missing input preserves the old catalog. |
| `src/services/prefixService.js` | Upstream category groups contain `{ id, name, prefixes }`; each prefix has `{ id, name, class }`. Normalized config has `items` plus `categories`. | Prefix ID 2's real label/class was not independently verified. Test labels are explicitly synthetic, not a hardcoded mapping. |
| `src/services/settingsService.js` | Tags and prefixes are restored as separately persisted runtime caches. | Library must not read the private storage keys to work around missing public access. |

`actionConfigGetTagPrefs` returns `payload_too_large` if the combined payload
exceeds the configured action limit and `storage_unavailable` on a failed read.
It does not itself fetch catalogs. Returned arrays are not proof that every
listing ID is mapped; later waves must handle empty, stale or partial coverage.

**Catalog decision for later implementation:** reuse the existing public tag
action and extend its public contract to expose the existing normalized prefix
catalog (prefer an additive `prefixes: { items, categories }` field, subject to
payload-limit verification). Core already retains numeric IDs, names and CSS
classes; the gap is public API exposure, not ingestion stripping those fields.
The Library record's display-oriented label/color prefixes are a separate
contract from that catalog. Older cores without the new field must preserve
existing prefixes/use HTML fallback when mapping is needed. No standalone tag/prefix HTTP endpoint was verified;
do not create one from guesswork or fetch catalogs once per record. This is an
explicit integration gap, not a reason to expose private Latest capture bodies.

## Title and version boundaries

`thread/detector.js` obtains a valid thread heading/starter-post snapshot and
stores `title`, `canonicalTitle`, `titleNormalized`, developer and current version.
`thread/title.js` removes conventional trailing version/developer brackets from
a raw heading such as `Chilling Ridge [v0.0.5.6] [Catmilk Studios]`.

At baseline the extractor left nonstandard version brackets such as
`[Demo v0.46]` in the title. The subsequent title fix removes at most two trailing
bracket groups from raw headings: last is developer, second-last is version.
With only one trailing group, it removes that developer group; earlier brackets
remain part of the name. Fetched HTML uses the same extracted version when the
starter post has no explicit Version field. Never run this extractor twice or
apply it to already-canonical API/search titles. Existing saved titles are not
mass-rewritten; a later valid thread observation can correct them.

Version identity comparison separately ignores the separator/v before labeled
numeric versions, retaining edition suffixes: `Twine v0.41 TF` and `Twine 0.41 TF`
compare equal, but different numbers, labels or editions do not. Historical
events are not deleted or existing unread states automatically acknowledged.

`library/updateEventModel.js` owns version identity: `v0.0.5.6` equals
`0.0.5.6`, and `Demo - 0.46` equals `Demo v0.46`. This equivalence concerns
version comparisons, not title search or identity. Updated selection policy:
search page 1 with `rows=15`, inspect every returned row, and select by the saved
thread ID only. A changed title does not disqualify a same-ID result, regardless
of response size. A missing ID or conflicting same-ID rows requires HTML fallback;
do not fetch another page or request more rows. Wave 3 now implements this as a
pure, bounded selector, covered by offline fixtures; Wave 5 connects transport.

## Existing updater path to preserve

| Component | Current ownership / future boundary |
| --- | --- |
| `api/threadHtml.js` | Credentialed same-origin HTML request, timeout/size limits and HTTP challenge/rate-limit classification. Keep the HTML fallback. |
| `library/manualUpdateChecker.js` | Serial HTML requests, configured transient HTTP retries, parser invocation, version/title comparison, cancellation and batch stop on site blocks. A future source selector must not multiply retries across layers. |
| `library/service.js` | `previewManualUpdateCheck` loads saved records and delegates to that checker; the HTML request dependency can be replaced in tests without network access. |
| `commitManualUpdateCheck` in that service | For successful observations, currently forwards only URL, title and version to `observeThreadFacts`, with a fixed source marker. Developer, public rating, tags and prefixes supplied in a preview are not committed. API enrichment requires deliberate later changes. |
| `library/autoUpdateQueueWorker.js` | Owns automatic queue claims, pacing (at least 10 seconds), daily allowance, heartbeat/ownership checks, commit-before-settlement, retries and site cooldown. Do not bypass it for API checks. |
| `library/autoUpdateQueueRepository.js` | `daily-allowance-v1` survives snapshot replacement; master and allowance share an atomic bulk write. A separate hourly reservation mechanism is not implemented yet. |
| `library/autoUpdateScheduler.js` | Automatic owner election, recovery, run/start/stop and scheduling. Its cooperative lease must not be mistaken for an atomic lock covering all manual requests. |
| Manager manual-check handler | Reads automatic pacing config but calls preview/commit directly. Manual selected-record checks do **not** currently run under the automatic queue lease or spend its daily allowance. |

The last distinction is important: a shared **hourly API** ledger must protect
manual and automatic requests together. Do not silently change whether manual
checks consume the automatic daily cap as part of source selection. A bulk put
can atomically save rows, but cannot alone serialize competing read-modify-write
reservations. Later accounting work must address that explicitly.

## Verification and follow-up

`tests/groups/library-hybrid-baseline.cjs` covers the supplied payload, cached
tag API shape/error paths, synthetic prefix structure, title/version boundaries,
and the existing HTML-only preview/commit path. The commit test verifies unchanged
personal data, preserved non-forwarded thread metadata, successful version
observation and normal changed/current state updates.

Run it with the existing harness; it is also registered in `tests/run.cjs`.
Existing manual-update tests continue to own request retry, cancellation,
authentication/challenge and site-block behavior. Existing queue/schema tests
own daily allowance, cross-tab handover and ownership behavior.

Wave 1 was not a hybrid implementation. Wave 2 subsequently added a default-off
toggle, an HTML-only source selector and a public cached-catalog adapter.
`config.getTagPrefs` now optionally includes normalized prefixes when requested
with `{ includePrefixes: true }`; default callers remain unchanged under the
existing 16 KB limit. The table above records the original Wave-1 findings.
Planning clarification after Wave 2: the user observed the crawler's allowance
returning at a clock-hour change. The plan now specifies 80 updater requests per
fixed clock-hour bucket, replacing the original rolling 60-minute proposal.
This is observational evidence, not a verified site contract; server/local hour
alignment remains unverified. Hour rollover must not clear a site cooldown.

Updated hybrid fallback decision: API errors, including 429/challenge, may fall
back once to paced HTML. Persist API-only suppression so subsequent records/tabs
use HTML directly instead of repeatedly hitting the blocked API. Its duration and
Retry-After policy must be defined before live transport. Only HTML 429/challenge
uses the existing 30-minute global pause; successful HTML fallback continues.
API plus fallback remains one daily check, with only the API attempt charged to
the hourly API allowance. Existing HTML failure/refund semantics remain intact.

Wave 4 now provides a separate durable hourly ledger, native Web Lock coordinator,
request pacing and API/global suppression, exposed through the Library service.
See [request-budget contract](library-hybrid-request-budget.md). The source selector
now enables opt-in API-first lookup with cached mapping and gated HTML fallback
in Wave 5, through the existing observation/commit pipeline. Wave-1 tables above
are historical baseline findings; automated tests still make no F95 requests.
