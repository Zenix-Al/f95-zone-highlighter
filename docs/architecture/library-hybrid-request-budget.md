# Library hybrid request budget (Wave 4)

Wave 5 connects this tested accounting layer to the opt-in hybrid updater.
The default remains HTML-only; enabling Prefer Latest API uses API lookup,
cached fact mapping and bounded HTML fallback through the existing commit path.

The ID selector accepts nonempty version strings (up to 160 characters) or finite
numeric versions, converting numbers to strings before fact mapping, including
zero. It does not mutate the API row. Null/boolean/object/blank/nonfinite versions
remain invalid; identity checks and duplicate-conflict detection are unchanged.

## Search-query follow-up

Live diagnostic observations showed ignored title filters returning default listings,
while cleaned title/creator queries could find the saved ID. Production queries now
use separate title and creator parsers. Both remove the observed whole-word
problem terms `a`, `an`, `the`, `of`, `no`, `not`, `on`, `in`, `and`, `to`, `with`, `was`.
Title queries remove possessive apostrophe-s and replace punctuation/non-ASCII
characters with spaces, preserving all remaining word fragments and digits.
Creator queries split on every character other than ASCII letters, digits,
underscores and whitespace after NFKC normalization, and choose the longest usable contiguous
candidate (ties retain original order). They never recombine pieces across those
separators. Underscores remain intact, as observed for `Under_Formatman`.
Thus `pu-re ga-me` produces `re ga`, not `pu re ga me`, and
`Savin/Salamander Studios` produces `Salamander Studios`. This selection is a
deterministic client heuristic, not proof that every chosen fragment will match.
Both parsers use NFKC normalization. Each query retains complete words within 30 characters,
with a final stopword check after limiting. These are conservative heuristics,
not a verified server stopword list or a universal server length specification.

A trailing stored version bracket is removed from search input only when it
matches the record's known version. This does not run raw-heading extraction
again on canonical/API titles. Saved title/developer facts are never rewritten
with lossy query text. Empty title queries skip API and use normal gated HTML;
an empty/absent creator is omitted rather than guessed. Requests use `%20` for
spaces and a fresh `_` timestamp, while page 1, games and 15 rows remain fixed.
There is still one API lookup per check, not a series of query variations.
Only the saved thread ID can authorize a match; budgets, cooldowns, mapping and
commit behavior remain unchanged. This follow-up has focused regression evidence;
the prior Wave-7 full-suite result predates it.

## Ownership and persistence

`createHybridRequestBudget` uses the browser's native exclusive Web Lock named
`f95ue:library:hybrid-requests:v1`. It holds the lock across ledger reads, pacing,
reservation, the bounded request callback and result persistence. Two tabs or
manual/automatic callers cannot concurrently reserve the last token or start
unpaced requests when both use the gate. The scheduler lease continues to own
automatic queue work; it is not repurposed as an atomic reservation mechanism.
An IndexedDB bulk write alone would not protect read-modify-write operations.

The existing add-on `meta` store holds `hybrid-request-budget-v1`, schema version
1. Fields are `hour`, `used`, `lastClockAt`, `nextAttemptAt`, `apiBlockedUntil`,
`apiBlockedReason`, `siteBlockedUntil`, and `siteBlockedReason`. The row is bounded
and independent of the active cycle, daily allowance and settings. There is no
schema/store upgrade, reservation array, recurring timer or new core action.

Only a successful read returning null initializes an empty ledger. Bad versions,
invalid counters/timestamps, unknown fields, failed reads/writes, unavailable
Web Locks or a regressed clock fail closed. Do not delete/reinitialize corrupt
state automatically, or bypass the gate with raw fallback requests on these
errors: its cooldown/accounting state may be unknown. Supported secure browser
contexts gate HTML-only checks too, so changing the preference does not bypass
shared pacing/blocks. Without browser Web Locks, preference-off retains legacy
HTML-only behavior; preference-on fails closed before any API request.
The lock coordinates the current origin, not different origins/subdomains or
unrelated scripts/browser profiles. No new userscript grants are needed.

## Fixed-hour accounting

The key is `Math.floor(Date.now() / 3600000)`: an absolute UTC clock-hour bucket,
not the local hour number and not a rolling window. This aligns with local hour
boundaries in whole-hour-offset timezones, including Bangkok; it does not prove
alignment with F95's undocumented server quota. Changing timezone or DST display
does not reopen a bucket. A newer hour replenishes to 80; midnight is an ordinary
hour transition. Forward wall-clock jumps advance buckets; the client cannot
prove server time. Backward movement fails closed until the persisted clock is
caught up. Hour changes never clear API/global suppression or minimum spacing.

Every API attempt persists an increment BEFORE invoking the request callback.
Errors, timeouts, retries and blocks all spend tokens. Cancellation/lease loss
after reservation leaves that token spent, even if no request is ultimately
sent. No refunds. Each retry must call the gate again. HTML consumes no API
token. Completing a request across an hour boundary leaves its charge in the
old bucket; the new bucket is available normally, not charged a second time.

`getStatus()` exposes updater-accounted usage, limit, remaining tokens and
`nextApiAt`, plus both suppression deadlines/reasons. It is not F95's actual
remaining quota. The service exposes it as `getHybridRequestStatus`; the Auto Update
dialog displays its usage and next eligibility. Exhaustion returns `api_exhausted`, permitting a gated HTML
attempt without touching daily usage or creating a new cycle.

## Pacing, blocks and result contract

`attempt("api" | "html", callback, options)` serializes all cooperating requests
and enforces at least 15 seconds between attempts, including after completion
before fallback. Higher configured spacing is honored. Existing manual/queue
between-record jitter remains outside the gate; it does not replace this minimum.
The callback must have bounded timeout/cancellation and classify HTTP/body
challenges before returning `{ ok, reason, retryAfter? }`. The gate does not
retry, parse thread facts, consume daily slots, or commit records.

The outer result's `ok` means the gate completed its operation; inspect `result`
for the callback's success/failure. Denied/cancelled/lost-owner requests have
`ok: false` and no usable callback result. Callers must pass the current
AbortSignal and automatic queue ownership predicate. Ownership is rechecked
after pacing, after reservation and before releasing a callback result. A lost
owner must never commit that response.

API `rate_limited`/`challenge_page` suppresses only API for 30 minutes, extended
to a later valid `Retry-After` deadline (integer seconds or HTTP date). Invalid
or past headers do not shorten the minimum; extremely large numeric values
saturate safely instead of allowing an early retry. Subsequent callers skip API
until that deadline, but one paced HTML fallback is allowed. Other API failures
remain eligible for the ordinary bounded HTML fallback.

HTML `rate_limited`/`challenge_page` sets a 30-minute global deadline and blocks
both sources. The gate also reads/mirrors an active existing queue site block.
Hour rollover, reload, restart and setting changes do not erase either deadline.
The existing explicit Retry now action clears only the global HTML/site block,
through the scheduler and locked ledger hook; API suppression/usage and spacing
remain intact. This is a user-requested retry, never an automatic deadline reset.
Other HTML errors retain existing retry/terminal handling, not a global pause.
If final persistence fails, halt rather than assume a failed API result is safe
to bypass via raw HTML. Existing daily-slot refunds for HTML site blocks remain
the queue worker's responsibility, never a refund of the API token.

## Evidence and integration boundary

`library-hybrid-budget` tests offline deterministic clocks and shared locks for
80-token contention, failure accounting, pacing, expiry, suppression, corrupt
storage, cancellation and lost ownership. A separate regression uses native
Web Locks and real IndexedDB across two Chromium tabs on a loopback-only page;
90 contending attempts produce exactly 80 reservations and 10 denials. CI installs
the lockfile-matched Chromium revision. No F95 network calls or credentials.

Wave 5 routes actual manual and automatic requests/retries through this one
service-owned gate. API lookup is tried once per record in a check; transient HTML
retries do not repeat it. The production 107/110-entry and daily-limit regression
now runs both legacy and hybrid paths. New tests cover real queue settlement,
HTML-site-block daily refunds without API refunds, and persistence failure.
All API responses in tests are fixtures/mocks; no live F95 network calls.

Daily extra-batch bonuses have since been removed. The configured automatic daily
limit applies without extensions; old bonuses are ignored, never exchanged for
new hourly API tokens. Existing daily usage is preserved, including usage already
above the configured limit. Manual-check daily accounting remains unchanged.

The core catalog read is cached on demand for five minutes per service (including
unusable responses); it does not trigger HTTP catalog refreshes. If the bounded
public catalog action fails, skip API and use gated HTML rather than repeatedly
spend tokens on unresolvable metadata. Unknown IDs in a successful lookup use
HTML fallback; absent fields preserve saved facts and explicit empty arrays clear
them. Core action payload limits remain unchanged.

## UI and diagnostics (Wave 6)

The Auto Update dialog explains the opt-in API-first policy and uncertain search
coverage. It shows updater-accounted requests out of 80 per UTC clock hour, next
API eligibility, and API-only suppression separately from a global HTML/site pause.
Ordinary browsing and other scripts are not counted; this is not server quota telemetry.
An exhausted/suppressed API does not alter scheduler state, buttons or activity rings
while HTML checks continue. Existing daily allowance and lease recovery still apply.

Opening the dialog and existing scheduler notifications refresh the shared budget
snapshot. Reads are coalesced and asynchronous so an active request lock does not
freeze controls. There is no new polling timer or observer; idle displays are snapshots,
not live countdowns. Reopen the dialog to refresh another tab's latest usage.
Closing/reopening aborts pending UI reads and removes the scheduler subscription.
Only dedicated text nodes are patched; settings, focus and disclosure state remain intact.

The last fetch source/reason is a bounded, session-local service diagnostic, not durable
history or proof that a fetch committed successfully. It updates for manual and automatic
checks, identifies ID-match success or HTML fallback reasons, and contains no response
body, title, cookies or personal state. Other tabs' last fetches are not inferred.
Copy diagnostics includes the displayed source/accounting snapshot even without a cycle.

### Recent error log

The existing `meta` store holds one `update-errors-v1` row with its own `version: 1`
and at most 20 entries, newest first. No new object store or database-version bump.
Each entry has an opaque ID, timestamp, thread ID, source, bounded error code,
outcome and action. New API error entries also include the original public title
(up to 200 characters), developer (120), and actual cleaned title/creator query
terms (30 each). Control characters are stripped and copied text is quoted.
No URL, response body, cookie or personal note is stored. These optional fields
are additive within the existing row format: no database-version bump or log reset.
Old entries cannot be backfilled with the historical query and show empty fields.
Copy diagnostics reads this shared log on demand, including when no cycle exists,
and reports unavailable logging explicitly rather than pretending it is empty.

Actual API transport errors and unusable lookup/mapping results are recorded before
HTML fallback starts with `fallback_pending`. Completion updates that same entry to
`recovered`, `failed`, `deferred` or `cancelled`; a crash can leave it pending.
HTML failures get separate entries, including retries. `retry_eligible` means the
error allows existing retry handling, not that a retry necessarily occurred.
API quota exhaustion/suppression are routing decisions, not additional errors;
successful API checks, catalog skips and unissued requests do not flood the log.
Recovered fetches do not guarantee the later record commit succeeded.

Reads and read-modify-write updates use the existing native request Web Lock, only
after an attempt releases it. Concurrent tabs cannot overwrite each other's append.
A fallback cannot resurrect an entry that has already aged out of the 20-entry ring.
Log failures/corrupt rows are best-effort diagnostics only: never retry a fetch,
refund a token, reset a ledger, or fail a successful update because logging failed.
Unsupported native locking means persistent logging is unavailable too.
