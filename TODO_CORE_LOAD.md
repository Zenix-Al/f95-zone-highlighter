# Core load reduction — evidence before changes

Goal: reduce actual startup CPU work, not merely move it to another frame or make
the add-on bridge available earlier. Preserve the current framework and lifecycle.
This plan does not authorize a new architecture, storage policy, or feature rewrite.

## Measure

Run the read-only analyzer from the repository root:

```powershell
node scripts/core-load-trace.cjs PATH_TO_TRACE.json --out tests/.tmp/core-load-report.json
```

`--match REGEX` selects a differently named core script. The report lists sampled
self CPU, inclusive CPU, call-site hotspots, directly attributed trace events, and
existing user-timing markers. Self and inclusive overlap; never sum them. It does
not modify the userscript, its storage, the trace, versions, or distributions.
The output directory must already exist; omit `--out` to print JSON instead.

Current historical trace: approximately **169.647 ms self / 300.502 ms inclusive**
CPU over the whole recording, not an established 400-ms startup measurement.
The analyzer separates CPU profiles by process/profile ID. Incomplete sample
deltas prevent a reliable activity-span measurement here. There are no explicit
core startup marks. The recording also contains site/extension/Cloudflare work.

Top direct sampled locations in the recorded minified bundle:

| Location | Self CPU |
| --- | ---: |
| `co`, line 26, column 22022 | 26.198 ms |
| `at`, line 76, column 21741 | 12.947 ms |
| anonymous, line 75, column 9068 | 11.968 ms |
| `r`, line 75, column 13902 | 11.765 ms |

Called-code samples include about 21.857 ms at `setTimeout` and 14.527 ms at
`dispatchEvent`. These include work invoked through core, potentially involving
the userscript manager and add-ons; they are not proof of a timer/event bug.
Names without source URLs must not automatically be classified as browser native.
Do not map these locations onto a different locally rebuilt minified bundle.

## Mandatory baseline gate

### Wave 1 evidence (2026-10-11)

- Browser copy received: `docs/references/core-traced.user.js`. Its header is
  one line shorter than the trace locations. At recorded line 26/column 22022,
  the adjusted location starts `co`, matching `getConfigPathMetadata()`; its
  full scan/split implementation matches the source. The `at` location maps
  to a JSON-cloning helper. This is local hotspot identification, not proof
  that every byte of the recorded and supplied artifacts is identical.
- Implemented the low-risk metadata lookup candidate: precompile schema pattern
  segments once and cache up to 256 resolved non-exact paths (including misses).
  The cache contains immutable schema metadata, never live config or DOM state.
- Equivalence tests cover schema entries, wildcard/indexed paths, unknown paths,
  and eviction after 1,000 unique misses. Returned metadata identity is preserved.
- Reproduce the isolated benchmark: `node scripts/core-load-wave1.cjs`.
  Five local Node runs of 20,000 mixed, repeated lookups: baseline median
  **344.788 ms**, optimized median **5.043 ms**. This synthetic warm-cache
  workload does not establish browser startup savings or a reduction from 400 ms.
- [x] Wave 1 implementation and equivalence tests complete (728 tests passed).
- [x] First browser before/after pair supplied and analyzed: `core-traced.user.js`
  / `Trace-20261010T160240.json` and `core-wave1-after.user.js`
  / `Trace-wave1-after.json`. The after bundle contains the bounded cache.
- [x] Target function mapped by body/location, not by minified name alone:
  before `co`, after `uo`. Sampled self CPU **26.198 → 0.986 ms**;
  inclusive CPU **26.740 → 2.010 ms**. Only three after self samples hit this
  function, so treat its sub-millisecond precision as approximate.
- Whole-recording core self CPU **169.647 → 170.394 ms** and inclusive CPU
  **300.502 → 303.976 ms**: no demonstrated total-core improvement from this
  single pair. JSON-clone `at` self CPU increased **12.947 → 22.304 ms**;
  workloads, caching, extensions, and run-to-run variation need control.
- [ ] Representative repeated cold/warm browser comparison and actual startup
  boundary measurement remain open. This pair validates the targeted reduction,
  not the full mandatory baseline gate or a reduction from 400 ms.
- The user rebuilt and supplied the after release bundle. No version bump or
  distribution rebuild is performed by this comparison. Keep cloning/storage
  equality and pipeline structure unchanged.

- [ ] Obtain the exact recorded core bundle, or record the current bundle and keep
  that exact artifact with the trace. Record version, build mode, route, enabled
  features/add-ons, browser, and any CPU throttling.
- [ ] Capture at least five comparable release-build runs on the same page, with
  no user interaction until startup completes. Separate cold and warm cache runs.
- [ ] Compare core-only and add-ons-enabled runs. Compare debug builds separately.
- [ ] Map the top four sampled locations to source before choosing an edit.
- [ ] Establish explicit start/storage/UI/bridge/features-ready timings if the
  existing trace cannot identify startup boundaries. Any instrumentation must be
  opt-in, bounded, removable, and use current lifecycle/resource ownership.
- [ ] Record median/range for startup elapsed time and CPU separately; report
  parse/compile/rendering separately where trace attribution supports it.

## Opportunities, lowest → highest risk

Risk ranking is provisional. Only the locations above are measured hotspots;
the following are investigation candidates, not confirmed causes or promised savings.

### 1. Development logging overhead — low risk

- [ ] Measure the same configuration in debug and release; confirm release strips
  diagnostic logging before changing anything.
- [ ] If costly, avoid eager construction of debug-only payloads while preserving
  warnings, health events, and failure visibility.
- [ ] Verify release stripping and debug diagnostics tests.
- Do not count debug-only savings as a release startup improvement.

### 2. Repeated pure calculations — low to medium risk

Wave 2 implementation: `listKnownAddons()` now uses one fresh detached,
alias-normalized add-on config snapshot instead of cloning the whole root for
installation metadata and again for each card's state. Existing standalone
getters and transactional write paths are unchanged; no live-state cache.
Regression coverage checks canonical precedence, installation-history parity,
nested isolation, one clone per listing, and fresh enabled state on the next call.
`node scripts/core-load-wave2.cjs` measures synthetic warm read preparation:
seven add-ons with 30 presets each, five runs of 1,000 operations; local medians
865.111 ms before versus 104.774 ms after. This excludes the rest of listing
work and is not a browser startup improvement claim. Browser trace confirmation
remains optional follow-up; no distribution rebuild or version bump.

- [ ] Inspect mapped hotspots for redundant normalization, metadata construction,
  cloning, sorting, or serialization of immutable inputs.
- [ ] Reuse stable results only where ownership and invalidation are explicit.
- [ ] Add equivalence tests; test changed inputs and repeated startup/teardown.
- Do not cache live configuration or DOM state as immutable.

### 3. Duplicate DOM discovery — medium risk

Wave 3 retained experiment: reset/reprocess now snapshots Latest tiles once and
passes that operation-local array into cleanup and evaluation. Standalone cleanup
still discovers current tiles by default. Marker reconciliation remains separate;
no cross-pass DOM cache or lifecycle change. The static array also avoids walking
a live HTMLCollection while cleanup modifies classes.
`node scripts/core-load-wave3.cjs` runs actual headless Chromium, seven alternating
warm trials of 150 passes per variant. Two separate executions measured cleanup
plus discovery medians (ms/pass): 15 tiles 0.076/0.062 before versus 0.070/0.047
after; 60 tiles 0.449/0.371 versus 0.222/0.193; 200 tiles 2.585/2.592 versus
0.621/0.623. Small pages save little; the larger fixture improves consistently.
This is repeated synthetic cleanup, not full evaluation/painting or live startup.
Focused tests cover one discovery, replaced cards on the next pass, cleanup,
non-reset behavior, stale generations, and standalone cleanup. Final live-site
validation is deferred to the user's combined check; no distribution/version bump.

- [ ] Profile selectors in feature/UI initialization; establish whether overlapping
  scans actually account for significant CPU before sharing results.
- [ ] Reuse results within a single operation or route generation where safe.
- [ ] Test initial load, route changes, replaced nodes, toggles, and BFCache resume.
- Preserve observer and listener registries; no parallel DOM lifecycle.

### 4. Timer/event churn — medium risk

Initial Wave 4 hover experiment (superseded below): `hoverTagHandler.js` ignores mouseover movement within
the same card using relatedTarget, retains the immediate check and 50 ms retry,
and owns at most one pending retry per card. Teardown cancels all retries;
disconnected cards are skipped. A controlled one-entry/20-child-moves scenario
previously queued 21 timers (all surviving teardown); now it queues one and
teardown leaves zero. Tests cover 25 ms late insertion, immediate styling,
cross-card movement, re-entry coalescing, detached nodes and disable/re-enable.
This measures callback counts, not startup CPU, and does not establish the cause
of the site's intermittently absent hover panels. Readiness, lease, route,
marker coalescing and capture recovery timers are unchanged.

Hover readiness correction after browser feedback: the fixed 50 ms retry missed
later-rendered tags. It is replaced by a filtered callback on the existing shared
observer, tracking only the currently hovered card. Entry styles existing content;
child-list mutations inside its hover panel handle late and partial batches while
the card remains hovered. One five-second deadline bounds the no-tags wait and is
cancelled when non-empty tags are found; observation remains active for later
batches until pointer leave, disconnection or disable. Internal mouse moves do
not queue checks. Tests cover delayed insertion at 250 ms, subsequent batches,
empty elements later receiving text, highlighted styles, timeout, leave,
disconnection and teardown/re-enable. No second MutationObserver or polling loop.

Latest Control follow-up: the existing shared observer now accepts added Latest
cards (directly or inside a container) and newly inserted control buttons only.
Card arrival remains the signal that pagination has reset the existing buttons;
route-only synchronization would be too early. Hover children, overlay decoration,
text and removal-only mutations do not schedule sync. Relevant batches share one
pending 100 ms timer; disable cancels and resets it. The 400 ms notification delay
and auto-refresh dependency are unchanged. Fake-clock tests cover filtering,
coalescing, pagination resetting the same controls, notification order and teardown.

- [ ] Map the sampled timer/event call stacks to their owners and count calls.
- [ ] Coalesce only demonstrably redundant work using existing task/debounce tools.
- [ ] Test cancellation, event ordering, late replies, timeout handling, and teardown.
- Do not reduce correctness-critical readiness, storage, or lease checks merely
  because timer scheduling appears in the profile.

### 5. Storage initialization transformations — medium to high risk

Wave 5 retained reductions in settingsService: buildEnvelope no longer JSON-clones
getCanonicalData's already-detached result. Backup rotation clones only envelope
metadata and canonicalizes data once instead of cloning the entire old data then
discarding it. Healthy initialization no longer eagerly clones unused defaults;
fallback branches still obtain fresh defaults. Validation, catalog validation,
result/config snapshot isolation, storage readback, revision/lock behavior,
migrations, recovery and write order are unchanged. No storage keys are deleted.
`node scripts/core-load-wave5.cjs`: five alternating warm trials, 1,000 synthetic
envelope-build plus backup preparations; medians 465.594 -> 180.807 ms with
empty catalogs, 1418.356 -> 202.355 ms with 2,000 tags in the old envelope.
The larger case models old/noncanonical catalog payloads, not normal schema-2
storage. These are transformation costs only, not manager I/O or startup timings;
normal healthy startup benefits only from the eliminated unused default clone.
Focused coverage verifies backup equivalence, nested isolation, catalog exclusion
and backup-before-current order. Full persistence/integration regression is required.

- [ ] Measure reads, validation, clone/serialization counts, and lock waits.
- [ ] Remove proven duplicate transformations without weakening schema validation,
  readback verification, revision checks, recovery, or simultaneous-write safety.
- [ ] Run config/storage/legacy-guard/cross-tab regression tests.
- Shared storage bootstrap already deduplicates its in-flight operation; do not
  assume the two pipeline calls perform two independent loads.

### 6. Feature module import-time work — high risk

- [ ] Measure module evaluation separately from feature enable calls.
- [ ] If material, move expensive feature-specific initialization to its existing
  lifecycle, only when the feature can remain inactive without it.
- [ ] Test manifest discovery, settings metadata, every route, feature toggles,
  teardown/re-enable, and capture timing.
- No second loader, framework rewrite, or generic replacement architecture.

### 7. Pipeline restructuring / lazy loading — highest risk; last resort

- [ ] Consider only after lower-risk candidates show insufficient measured savings.
- [ ] Define ordering, trust/storage gates, cancellation, and readiness guarantees.
- [ ] Prove total work decreases; deferring the same work is a separate responsiveness
  optimization, not fulfillment of the CPU-reduction goal.
- Keep early Latest capture, error behavior, page lifecycle, and add-on contracts.
- Existing modal CSS is already split into startup and on-open layers; measure
  current behavior rather than repeating an already-completed optimization.

## Acceptance for each change

- [ ] One focused change with its own before/after traces and regression test.
- [ ] Improvement exceeds normal run-to-run variation; no unsupported percentage target.
- [ ] No worse first-use latency hidden behind a faster reported startup.
- [ ] Run proportional tests/lint, then full tests and affected audit/CI checks.
- [ ] Document retained improvement or reject the experiment; never silently
  change features, data guarantees, or visible behavior to improve a benchmark.
- [ ] Do not bump versions or rebuild distributions until requested.
