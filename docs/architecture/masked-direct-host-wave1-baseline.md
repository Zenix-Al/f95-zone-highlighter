# Download hosts: Wave 1 baseline

Measured 2026-11-01 on Windows x64, Node v24.16.0. Runtime source unchanged.
Companion to the [simplification plan](TODO_MASKED_DIRECT_HOST_SIMPLIFICATION.md).

## Method and reproduction

The existing runner loads real production modules into the existing happy-dom
sandbox. The new `masked-direct-host-baseline` group uses `createFakeClock`;
no second runner, live HTTP, real downloads, sleeps in real time, or production
instrumentation was added. Its durable pilot fixture is
`tests/fixtures/masked-host-baseline.cjs`; remaining minimal DOM fixtures are inline.

Run `npm test -- --group masked-direct-host-baseline` for repeatable counters.
The group prints `HOST-BASELINE` records. Known-bug assertions explicitly say
legacy/gap: they characterize today's behavior, not permanent acceptance criteria.
Replace them with desired safety assertions as Waves 2/4 fix each issue. Do not
preserve a bug merely to keep this baseline green.

Counters cover document.querySelectorAll calls, shared computed-style calls and
virtual timer wakeups. They are not browser CPU, layout, network, or wall-clock
benchmarks; element-local queries and happy-dom internal work are not separately
counted. Pilot query counts include fixture querySelector calls and any DOM-library
delegation. Compare using the same instrumentation/fixture, not cross-engine totals.
Candidate inspections are directly counted for the candidate helper, and reflected
by style checks for the single-control pilot; this is not an all-host inspection
profiler. All 14 hosts were reviewed, but runtime counters intentionally target the
proposed two-host pilot and hot-path helpers, not synthetic performance rankings
for every specialized host.

## Repeated operation counts

Two complete 13-case runs produced the same counters; a preceding 12-case run
also matched all overlapping scenarios. Loading mounts one actionable button at
800ms. Ready starts with it present. Idle runs the full readiness timeout. All
successful pilot cases keep their original grace delay; elapsed fake time is not
CPU time. No production countdown/grace is removed for measurement.

| Host / scenario | queryAll calls | Style checks | Timer wakeups | Click / final report / failure |
| --- | ---: | ---: | ---: | --- |
| KrakenFiles idle, 30s deadline | 75 | 0 | 75 | 0 / 0 / 1 |
| KrakenFiles loading at 800ms | 4 | 1 | 4 | 1 / 1 / 0 |
| KrakenFiles ready | 2 | 1 | 1 | 1 / 1 / 0 |
| download.gg idle, 20s deadline | 200 | 0 | 50 | 0 / 0 / 1 |
| download.gg loading at 800ms | 13 | 1 | 4 | 1 / 1 / 0 |
| download.gg ready | 5 | 1 | 1 | 1 / 1 / 0 |

download.gg queries four selector alternatives per readiness poll, including
overlapping selectors. This is repeated work, but absolute runtime impact has not
been measured. Do not combine selectors if it changes priority/choice.

- Candidate helper: three inspections and three wakeups over 1200ms at 400ms;
  pagehide does not stop them. Natural timeout leaves zero pending timers.
- Challenge monitor: eight full body-text reads over 4000ms on an unchanged
  ordinary 1000-repeat text fixture: one start, five explicit gate calls and two
  interval checks. Dispose removes monitor timers in this ordinary scenario.
  Mutation-heavy real-browser cost remains unmeasured.
- Idle Datanodes: ten all-control snapshots, nine timer wakeups and two pending
  timers after 2000ms (poll and total timeout; initial timer has fired). Pagehide
  removes pending timers; another 1000ms produces no scans. Empty fixture means
  zero candidate style reads. Includes immediate + 500ms initial + 250ms polls.
- MediaFire: four initDownload calls over 1600ms of placeholder href polling;
  one timeout failure, zero final reports, no timer left after settlement.

## Safety and lifetime characterization

| Case | Observed current behavior | Follow-up |
| --- | --- | --- |
| Pagehide during Kraken readiness | Further readiness scan still occurs, but a disposed gate prevents click/report once a button appears | Wave 2 cancel polling promptly |
| Pagehide during Kraken grace | Handler sleep survives and later calls report; the real flow context's disposed check suppresses feedback/closing (existing single-pipeline coverage) | Cancel owned sleep, preserve suppression |
| Pagehide while Pixeldrain HEAD pending | Fetch options have only method HEAD, no signal; late result reaches final gate, which can prevent navigation | Abort request without changing validation policy |
| Disposed in-flight challenge | Monitor disposal leaves one 500ms sleep; its resumed wait returns true because check() returns false when disposed; a fresh wait correctly returns false | Cancellation must win over clear |
| Continuation claim fails | One pagehide callback remains until navigation | Unified early-exit cleanup |
| Initial challenge returns false | Three pagehide callbacks registered; monitor not disposed on return | Dispose monitor/resources immediately on terminal refusal |
| Continuation consume fails | Same three callbacks and no monitor disposal before navigation | Unified early-exit cleanup without erasing valid ownership incorrectly |
| Concurrent controller entry | Same active promise, one handler execution | Preserve deduplication; handler return is not universally terminal |
| Workupload foreign target | Hostname `workupload.com.evil.invalid` passes substring predicate | Exact approved target validation; test exposes predicate only, never navigates |
| UploadNow unproven stability | Timeout after first single-button sample still clicks despite four stable checks requested | Explicit timeout/identity stability fix, not generic runner behavior |

The test's pagehide listener tracker records registered callbacks before dispatch;
it does not pretend that once-listeners remaining in its Set after dispatch are
still browser listeners. Real early-path registrations are source-confirmed.

## Per-host preserved action/timing and test ownership

All readiness waits are bounded except the Pixeldrain network probe, which has no
explicit timeout/abort. Shared challenges can add their separate 10-minute wait.
These timings are source defaults, not claims about live host server behavior.
All handlers use pre-action challenge gates; the controller also gates entry.

| Host | Readiness / action / final evidence | Existing coverage group suffix |
| --- | --- | --- |
| Buzzheavier/Bzzhr | 20s, 400ms polling; same-origin endpoint native click, final report | standalone-expansion-simple, standalone-host-guards |
| KrakenFiles | 30s, 400ms; visible enabled Download now, click then 3s grace, final | standalone-host-guards, host-baseline |
| download.gg | 20s, 400ms; typed validated button, click then 8s grace, final | standalone-host-guards, reliability, host-baseline |
| DelaFil | 20s, 400ms; same-file token anchor click, final; tokenized URL healthy-only | standalone-host-guards |
| Gofile | 20s, 400ms; single-file inspection then 600ms, native click, final | standalone-expansion-simple |
| MediaFire | 12s, 400ms; HTTP(S) href navigation, final; placeholder init polls | standalone-expansion-simple, host-baseline |
| UploadHaven | 20s initial wait, 60s readiness at 400ms, click +10s grace; 30s recent-run suppression is healthy-only | standalone-expansion-simple |
| UploadNow | 30s, 500ms; four matching-count checks requested, one file click, final; timeout gap above | standalone-expansion-direct, host-baseline |
| Pixeldrain | HEAD validation, optional error GET; final direct navigation; no DOM wait on approved file paths | standalone-host-guards, single-pipeline, host-baseline |
| Google Drive | Preview replace is non-final; 20s/400ms confirmation form/link dispatch is final | standalone-expansion-direct, standalone-expansion-staged |
| MixDrop | 30s initial, 5s stage delay, 60s final-link readiness at 400ms, final click +10s grace | standalone-expansion-direct |
| Viking | 20s first-button readiness at 400ms; one standalone click +1.2s; entry non-final, continuation final | standalone-expansion-staged |
| Workupload | 15s/400ms then navigate to owned start stage, no final evidence; start settles 1.5s, health-only | standalone-expansion-simple, standalone-expansion-staged |
| Datanodes | 90s total, 250ms polling plus mutations, 5ms frame budget; 900ms per-element cooldown; priority/unique final control reports | reliability, standalone-expansion-staged, host-baseline |

Group names above start with `masked-direct-`. Route fixtures and shared policy/
one-shot/closing tests remain authoritative; this table is a coverage map, not
a claim that every live route/selector has browser verification.

## Retired branches and constants

- Pixeldrain approved routes all yield a nonempty file ID matching the handler's
  regex. Root/list/missing-ID routes are blocked, so its generic fallback button
  path is unreachable through current controller dispatch. Keep negative route
  tests when deleting it; do not expand list support to make it reachable.
- Controller decisions are blocked or standalone, never managed. Existing staged
  case STANDALONE-EXPANSION-STAGED-08 proves one Viking entry/continuation click
  and non-final/final split. No current direct Viking handler test was found that
  requires its older non-standalone two-click loop.
- MediaFire successful wait only returns an anchor together with a nonempty valid
  HTTP(S) href; timeout returns null/empty and exits before fallback. Thus its
  final fallback click branch is source-unreachable today. Keep navigation/init
  fixtures when removing it; do not silently broaden accepted hrefs.
- Twenty `DATANODES_*` timing keys (PAGE_READY, METHOD_FREE, DOWNLOAD stage,
  SECONDARY_DOWNLOAD, CONFIRM and SKIPPED_STEP families) have no production reads
  outside constants.js. Current production uses DATANODES_POLL_INTERVAL and
  DATANODES_TOTAL_FLOW_TIMEOUT only. Archived constants have their own copies.
  No current test references those twenty timing names. Archive stays excluded;
  a later removal should also verify the unused SELECTORS.DATANODES block.

## Size baseline

Measured with existing buildAddonToPath, deterministic header, temporary OS output
directory, regular/release flags, and gzip level 9; temporary outputs removed.
This uses the existing smoke build mode, not the release command's final
beautification. Includes userscript header and bundled shared bridge. No manifest,
catalog, build-cache, version, report or dist mutation occurred.

| Measurement | Bytes | Gzip bytes |
| --- | ---: | ---: |
| Add-on src: 45 JS/CSS/HTML files, excludes shared bridge/archive | 124351 | not measured |
| Regular smoke bundle | 127954 | 26334 |
| Release smoke bundle | 92103 | 22127 |

Reproduce using exported `buildAddonToPath(addon, release, { outputPath,
deterministicHeader: true, metafile: true })` from addons/build-addon.js, manifest
entry masked-direct-addon, and Node zlib.gzipSync(code, { level: 9 }). Temporary
smoke CLI is `node scripts/addon-build-tools.cjs --addon masked-direct-addon --regular --release`.
Compare like-for-like Node/build configuration; no historical size gate changed.

## Validation and next-wave decisions

Initial focused boundary run: 65 passed, zero failed (12 new baseline cases plus
single-pipeline, standalone-engine/host-guards, expansion simple/direct/staged and
reliability). After adding MediaFire characterization, two repeated baseline runs:
13 passed, zero failed each. New tests/fixture and tests/run.cjs lint passed.
Additional current-contract, addon-matrix and integration run: 134 passed, zero
failed. Documentation links, source/documentation inventory and git diff check
passed. The full default suite was not run. Only tests and documentation changed;
core/add-on production source, versions, catalog, cache and distributions did not.

Wave 2 should address cancellation/disposal before extracting pilot handlers.
Wave 3 remains KrakenFiles/download.gg only. Wave 4 safety fixes must retain clear
regression ownership; no performance claim justifies relaxing action validation.
All-host CPU traces, mutation-heavy browser timing, signed/live pages, actual host
downloads, hidden-tab timing and full-suite CI remain outside this offline baseline.

## Wave 2 — run-owned cancellation and cleanup

Implemented 2026-11-01, without a version bump or distribution build. The existing
destination controller owns one AbortController-backed scope and reversible
pagehide/hashchange/popstate listeners. It exposes dispose to app cleanup and
passes the signal through its existing host gate. No core dependency, new policy
store, scheduler or origin protocol was introduced.

The scope is disposed on terminal outcomes, early claim/challenge/consume refusal,
explicit teardown or navigation. It disposes the execution context and monitor,
removes listeners and releases only running one-shot claims. Completed claims
remain complete. Cancellation does not clear owned continuation records; stage
ownership is preserved for legitimate navigation/challenge reloads. Real flow
callbacks still distinguish health-only, final dispatch and delayed closing.

All active host candidate waits and delays accept the run signal. Pixeldrain's
HEAD and optional error GET are abortable. Datanodes retains its asynchronous
lifetime after handler return, while its timers, observer and pending animation
frame are canceled on disposal. Its scan cadence and priority rules are unchanged.
Candidate validity and run/challenge state are rechecked before dispatch/report;
close policy is still reread at the existing deadline. A disposed challenge wait
cancels its 500ms sleep and returns false rather than reporting clear.

Cancellation throws internally through abortable primitives; the controller
consumes that cancellation without failure feedback. Direct module tests assert
the rejection, while real-controller tests assert no late side effects. A pending
GM policy lookup cannot itself be aborted, but a canceled result cannot start a
handler. Programmatic history writes that emit no browser route event are caught
at the next gate/outcome/close check, not by a new history patch or idle polling.

### Evidence and costs

- Candidate cancellation: one initial inspection, zero later scans/wakeups and
  zero pending timers, versus three scans/wakeups in Wave 1's 1200ms scenario.
- Challenge disposal: zero surviving sleep timers, false result for the in-flight
  wait, and false for later waits.
- Early claim/challenge/consume failures remove the owned pagehide callback before
  return; monitor disposal occurs once. New tests cover DOM readiness and pending
  policy cancellation, real controller/handler readiness and grace, route/disable
  guards, delayed-close cancellation, candidate replacement/disable, Datanodes
  returned-handler ownership and animation-frame cancellation.
- Ready pilot revalidation intentionally adds one style check: KrakenFiles has
  three queryAll calls/two styles versus two/one; download.gg stays at five queries
  and increases to two styles. Idle query/poll totals and deliberate delays remain
  unchanged. Challenge body-read and Datanodes idle-scan optimization is Wave 4.
- Temporary regular/release smoke builds: 135425 / 98076 bytes, respectively,
  compared with 127954 / 92103 in Wave 1. Current audit gzip figures are 27682 /
  23373 bytes versus 26334 / 22127. This safety wave adds lifecycle machinery;
  it is not a bundle-size reduction. No historical thresholds were relaxed.

Focused validation: the wider download/matrix/integration run passed 222 cases
and exposed two stale test expectations (plain click mock missing getAttribute;
Kraken's new post-grace gate count). Both were corrected; the affected reliability,
single-pipeline and baseline rerun passed 43/43. After two additional cancellation
cases, the final baseline group passed 21/21. Relevant source/test lint passed.
The wider run's unchanged integration results are retained rather than rerunning
the entire suite after fixture-only fixes. Full-suite and live-host smoke remain
user release checks. No live requests/downloads were made.

Affected add-on baseline/API/size reports were regenerated. Temporary regular and
release builds verified unchanged versions, manifest, build cache and tracked dist.
Add-on baseline/API/size checks, inventory, lint and diff check passed. A docs-anchor
typo found by the docs checker was corrected. Workupload's target substring issue,
UploadNow stability timeout, MediaFire repeated init and retired-branch removal
remain explicitly deferred to Wave 4; their legacy characterization stays intact.

## Wave 3 — shared final-click pilot

Implemented 2026-11-01 for KrakenFiles and download.gg only. The small internal
`hosts/shared/finalClick.js` factory reuses existing candidate, click and sleep
helpers. Host JavaScript descriptors own route, ordered selectors, validator,
optional revalidation/preparation callbacks, readiness/grace defaults and existing
failure text. Route exports and postClickGraceMs overrides remain compatible.

The helper is final-click-only by construction, not a generic stage engine:
intermediate/navigation/API hosts remain custom. It performs one existing
clickElement dispatch (including that helper's pre-existing owner-realm fallback)
and never retries an uncertain/failed action. It owns no scheduler, closing timer,
settings, storage, observer, core API or permissions. Callbacks remain synchronous
host code, not user-provided or persisted configuration.

### Behavioral comparison against Wave 2

Existing idle/loading/ready fixtures retain identical queries/styles/wakeups:
KrakenFiles 75/0/75 idle, 5/2/4 loading, 3/2/1 ready; download.gg 200/0/50 idle,
13/2/4 loading, 5/2/1 ready. Each successful scenario clicks/reports once and has
no remaining timer. Idle times out without clicking/reporting. Readiness poll
interval remains 400ms and deadlines remain 30s/20s.

The counter scenario now also records exact fake-clock action/report times, using
100ms clock advancement so both original grace boundaries are represented exactly:

| Host | Ready click / report, ms | Button mounted at 800ms: click / report, ms |
| --- | --- | --- |
| KrakenFiles | 0 / 3000 | 800 / 3800 |
| download.gg | 0 / 8000 | 800 / 8800 |

These match the old source's readiness/grace contracts, not live network latency.
Added parity fixtures exercise disabled/hidden/text decoys, selector priority
over DOM order, unsupported routes, disconnected/disabled candidates across the
challenge await, challenge refusal, failed dispatch and no runner-level retry.
Existing real controller/handler/closing cancellation tests run through the new
factory, including overridden grace, pending close and original default timing.

### Size and retention decision

Same deterministic-header temporary builds/audit method as earlier waves:

| Measurement | Wave 2 bytes | Wave 3 bytes | Delta |
| --- | ---: | ---: | ---: |
| Authored src | 131644 | 131271 | -373 |
| Regular smoke bundle | 135425 | 135175 | -250 |
| Release smoke bundle | 98076 | 97748 | -328 |
| Regular gzip | 27682 | 27904 | +222 |
| Release gzip | 23373 | 23526 | +153 |

Retain the pilot for one shared orchestration sequence and smaller authored/raw
bundle code with measured behavioral parity. Compression is slightly worse; this
is not presented as a size or speed victory. Wave 4 must not grow a large
descriptor DSL merely to force special hosts into this shape.

Validation: 57/57 focused baseline/reliability/single-pipeline/host-guards/current-
contract tests passed. After making the dispatch-failure fixture restore its
prototype patch, baseline plus addon-matrix passed 31/31. Relevant lint passed.
Affected add-on baseline/API/size reports were regenerated; temporary regular and
release builds passed and reported no version/manifest/cache/dist mutation.
Full suite and live-host smoke remain user release checks; no live host traffic
or downloads were triggered. Final add-on baseline/API/size, docs, inventory and
diff checks passed. No core, version, manifest, build cache or distribution changed.

## Wave 4 — metadata and shared tools

Implemented 2026-11-01. User clarification permits a retained custom method only
for a genuinely unique host. The central HOST_AUTOMATIONS registry accounts for
all 14 hosts, with runtime metadata and a tested explicit exception list.

| Execution | Hosts | Retained host-owned behavior |
| --- | --- | --- |
| Shared final-click adapter into sequence tools | KrakenFiles, download.gg | Pure route/candidate validation and metadata |
| Sequence metadata | Buzzheavier/Bzzhr, DelaFil, UploadHaven, MediaFire, Gofile, UploadNow, MixDrop, Viking, Workupload | Pure routes, selectors, predicates/inspectors and action metadata |
| Repeat metadata | Datanodes | Pure visibility/route predicates and action priorities/exclusions |
| Justified custom method | Pixeldrain | HEAD validation, JSON error-body semantics and direct file navigation |
| Justified custom method | Google Drive | Preview/ID navigation and confirmation form/requestSubmit across approved Google origins |

No entire old handler was moved to a tools folder as a fake abstraction. The
shared automation tool implements candidate selection, readiness, identity-based
stability, one dispatch, validated navigation, optional native initialization,
delay, health-only completion and explicit final reporting. The existing
finalClick adapter delegates to it rather than retaining a parallel executor.
Predicates inspect only; the tool owns side effects. Unique methods still use
the existing gate, cancellation signal and flow/closing contract.

Sequence actions await readiness and dispatch, not browser file-write completion.
Intermediate clicks/navigation do not imply final initiation. Repeat mode starts
one scope-owned operation and returns after setup; the controller must not treat
that initial return as terminal. It ends via outcome, deadline or disposal.

### Repetition, challenge checks and safety

- Datanodes metadata declares a 90-second ceiling, 250ms poll cadence, 900ms
  per-element cooldown and 5ms frame budget. Legacy overrides can shorten but
  cannot extend its deadline. Unique-highest-priority and premium/wait exclusion
  are revalidated after waits. Relevant mutations mark the scan dirty; quiet
  full scans fall back to once per second, with no redundant 500ms initial scan.
- There is at most one in-flight scan/challenge wait; blocked polling cannot
  accumulate promise continuations. Terminal/final dispatch retires observation.
  Failed/uncertain final dispatch is not retried by the repeat tool. The existing
  click helper's owner-realm fallback is unchanged and counted separately.
- Challenge selectors/title/token are checked fresh. Full body text is cached
  between polls and invalidated by child/text mutations, body replacement and
  pending observer records before an action. Text-only late challenges are tested;
  this is not a permanent clean-page cache or challenge bypass.
- UploadNow requires the same candidate identity for the configured stable
  checks. Timeout no longer accepts the last unproven single-button sample.
- Workupload targets require the exact HTTPS host/start route, rejecting
  substring lookalikes. Owned continuation checks remain in the controller.
- Gofile refuses multi-file/folder rows even when an outside Download all button
  is present, and rechecks the inspected candidate after post-ready delay.
- MediaFire initialization runs once per candidate after its native function
  exists; late function availability is tested. Removed its unreachable final
  fallback click branch. Native readiness/grace controls otherwise remain.
- Removed twenty unused Datanodes timings and its unused selector block, Viking's
  obsolete managed two-click branch, and Pixeldrain's unreachable generic-button
  fallback. Pixeldrain lists remain unsupported.
- Removed the unused core observer API wrapper, observer.nodes command and empty
  page callback. Existing local observation moved into the shared repeat tool;
  no new core API, observer permission, origin service or remote cache was added.
  The archived resolver is untouched and remains excluded from builds.

### Measured comparison

Same fixture/fake-clock counters as earlier waves, not real-browser CPU timings:

| Counter scenario | Wave 3 | Wave 4 |
| --- | ---: | ---: |
| Idle Datanodes full scans in 2000ms | 10 | 3 |
| Idle Datanodes timer wakeups in 2000ms | 9 | 8 |
| Challenge full body reads in 4000ms with five explicit gate calls | 8 | 3 |
| MediaFire initialization calls over 1600ms placeholder polling | 4 | 1 |

Both idle Datanodes scenarios retain two live timers while active and zero after
pagehide. KrakenFiles/download.gg idle/loading/ready query/style/wakeup counts
and exact click/report times remain equal to Wave 3. Repeating observation is not
permission to repeatedly dispatch a final action.

| Measurement | Wave 3 bytes | Wave 4 bytes | Delta |
| --- | ---: | ---: | ---: |
| Authored src | 131271 | 125401 | -5870 |
| Regular smoke bundle | 135175 | 129138 | -6037 |
| Release smoke bundle | 97748 | 92438 | -5310 |
| Regular gzip | 27904 | 28144 | +240 |
| Release gzip | 23526 | 23775 | +249 |

Same deterministic-header temporary smoke/audit method; no historical threshold
or acceptance baseline was loosened. Raw/source size is lower but compression is
slightly worse. The new tool shape is retained for reduced duplicated mechanics,
tested ownership and measured idle work reductions, not a claimed global speedup.

### Coverage and handoff

The wider download/matrix/integration run passed 236/236. Subsequent focused
baseline tests cover revalidation to premium controls, late native initializer
availability, the metadata deadline ceiling and removal of Pixeldrain fallback;
the final baseline/host-guard selection passed 39/39. Source/test lint passed.
Ownership checks enumerate all 14 hosts, verify the two justified unique methods
and reject automation side effects in the other host files. Additional tests
cover sequence selection/priority, same-count candidate replacement, repeat
ambiguity, intermediate/final evidence, final failure no-retry, blocked gate
coalescing, deadline cleanup and same-turn text-cache invalidation.

Affected add-on reports were refreshed and temporary regular/release builds
passed with unchanged versions, manifest, build cache and tracked dist. No live
host or third-party request/download was made. Full-suite/live-host checks and
release notes/version changes remain Wave 5/user release work. Real browser
mutation timing, hidden-tab throttling and live selector drift are not proven by
the offline counter harness.

## Follow-up — plain automation settings

Implemented 2026-11-01 at the user's request. Replaced the standalone policy
repository with ports/automationSettingsRepository.js. Callers use read() and
getAutomationSettings, with plain preferences in decision.automationSettings.
The shared isAutomationEnabled predicate checks enabled, automateRegardless and
legacy refresh readiness; there is no extra effective-policy object or timestamp.

The existing GM key and v2 storage representation remain compatible. Decoding
userPreference and legacy version checks stay at the storage boundary. Reads do
not migrate/rewrite records. Successful writes omit unused observedAt/core-probe
fields; saved enabled, host, skip-countdown and close choices remain intact.
Legacy v1 still requires a complete successful settings mirror, now explicitly
including the enabled choice, before its refresh guard clears. Read failures
block automation; failed writes retain the previously saved preferences.

292 focused download/add-on/matrix/integration tests passed. Regression coverage
includes current v2 false preferences, v1/partial mirrors, read/write failure,
unsupported storage versions, host switches, countdown checks and changes to
enabled/automation/refresh/close choices before the closing deadline. Relevant
source and test lint passed. No core change, version bump, new storage key or
distribution build was requested. Add-on baseline/API/size, docs, inventory and
diff checks passed; temporary regular/release smoke builds passed without changing
their captured repository state. A masked release cache fingerprint changed
separately during work and was preserved, not reset. Full-suite/live-host release
checks remain with the user.

## Follow-up — source ownership and dead-code cleanup

Implemented 2026-11-01 after the remaining-source review. Host timing/selector
constants moved from the source root to hosts/constants.js. Default/minimum close
delay values are canonical there; shared/downloadCloseDelay.js only normalizes
and re-exports those values for settings/UI consumers. The lifecycle owns its
unchanged command event, leaving main.js as the only root source file.

Grouped the core adaptor, readiness fallback and toast wrapper in
app/coreIntegration.js, preserving their exports/call behavior while dropping
unused forwarding methods. Removed the unreachable api/page.js module, unused
normalizeUrl helper and obsolete requestId diagnostic field. Removed finalClick.js;
KrakenFiles/download.gg now declare sequence metadata directly, with the same
validation and grace overrides. The legacy waitForCloudflareChallenge helper and
unused request-preservation callback were retired; its challenge-clear/notification
test now exercises the active monitor using fake time.

No automation feature, storage identity, event name, permission or timing value
changed. The first wider selection passed 291 cases and found one stale API
report expectation after removing/grouping modules; reports were refreshed.
Canonical host close-delay aliases and diagnostic redaction are explicitly
asserted. After refreshing reports, the affected add-on/settings/reliability/
baseline selection passed 107/107. Lint, add-on baseline/API/size, docs, inventory
and diff checks passed, as did temporary regular/release builds. The in-memory
import graph found all 44 current source files reachable from the entry.
Deleted wrappers remain recoverable from Git history; the archive,
user reference files and unrelated build-cache changes were left untouched.

## Follow-up — one definition per host

Implemented 2026-11-01. Each host processor now exposes its own package ID,
canonical host, exact aliases, UI text, routes/stage identities and action recipe.
hosts/metadata.js collects those definitions; settings, dispatch and route checks
derive from that list. Removed the independent standaloneEligibility.js registry,
per-host route wrapper functions and shared/filePage.js. Pure matching lives in
hosts/shared/routes.js; hosts/hostRoutes.js supplies the controller's route/stage
view. Metadata never grants continuation ownership. Existing preferences,
one-shot guards, challenges, final-action evidence and close timing remain owned
by their existing boundaries. Also removed duplicate Gofile inspector branches.

The route fixtures now exercise production metadata/matching rather than deleted
per-host wrapper APIs. Two direct Buzzheavier tests used /f/file-123, a route
already rejected by production; their fixtures now use an approved file URL.
Added all-host alias/foreign-host, settings-order, same-definition and malformed
identity checks alongside existing staged/controller coverage. Host-specific pure
DOM/URL validators remain deliberate functions, not a new descriptor language.
Google Drive and Pixeldrain retain their two documented unique-method exceptions.

| Measurement | Before this follow-up | After | Delta |
| --- | ---: | ---: | ---: |
| Authored source bytes | 123,752 | 115,925 | -7,827 |
| Regular bundle bytes | 128,770 | 122,245 | -6,525 |
| Release bundle bytes | 92,532 | 87,341 | -5,191 |
| Regular gzip bytes | 27,833 | 27,183 | -650 |
| Release gzip bytes | 23,599 | 22,993 | -606 |

These are temporary-build size measurements, not browser CPU benchmarks. Release
output is 5.6% smaller than immediately before this follow-up. Gzip remains above
the original Wave 1 baseline; the broader lifecycle/safety refactor must not be
presented as an across-the-board compression win.

Validation: the masked-direct groups plus addon-matrix and integration passed
243 cases and found one test trying to sort the intentionally frozen approved-host
array. Fixed the assertion to sort a copy; its whole three-case host-guards group
then passed. Add-on lint and temporary regular/release builds passed. Affected
baseline/API/size reports were refreshed. Smoke tooling confirmed unchanged
versions, manifest, cache and tracked dist. No live requests/downloads or release
builds were performed; full-suite and live-host smoke remain user release gates.
