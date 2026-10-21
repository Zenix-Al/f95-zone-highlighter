# Test precision and efficiency

Status: all five waves complete; final verification recorded 2026-10-21. Delete,
replace or consolidate tests with contract evidence when the relevant wave is
authorized; the existence of this plan alone does not authorize those changes.

## Objective and boundaries

Make the default suite verify the supported product precisely, with less redundant
work. Success means maintained defect detection and clearer failures at lower cost,
not a particular test count or a faster green result obtained by reducing coverage.
Start with Masked + Direct's completed retirement, then investigate suite-wide costs.
No production behavior changes, new test framework, live downloads or network API
tests are authorized by this plan. Do not lower assertions, timeouts or safety gates
simply to make tests pass. Existing user changes must be preserved.

## Evidence already inspected

- `tests/run.cjs` registers current Masked + Direct groups alongside historical
  masked, parallel, policy and recovery characterization groups.
- Several retired assertions were deliberately redirected to `archive/` during
  the transition. Their historical value does not automatically justify running
  archived functionality as a supported product in every normal test run.
- `tests/harness.cjs` serializes tests through a promise chain. Its `loadModule`
  currently invokes a synchronous esbuild bundle for every call, clears the module
  cache and loads fresh exports. Fresh module state may be essential.
- Normal builds now refresh reports; CI also checks reports separately. Tests may
  exercise build/report generation too. Map those distinct purposes before removing
  apparently repeated work.
- The user reports 823 tests and a long run. This is not a measured timing baseline;
  neither the precise active count nor the dominant runtime cost is established here.

## Wave 1 — Measure and map the contracts

- [x] Add optional timing evidence to the existing runner/harness, not another
  runner: per-test execution, group attribution, registration/setup and total wall
  time. Attribute expensive builds/report generation/browser setup where possible.
  Include failed tests in timing; retain the current exit-code/failure behavior.
- [x] Establish comparable local before/after runs with the same Node/dependencies,
  commands and browser configuration. Record cold/warm conditions and a few runs
  when practical. Do not introduce flaky wall-clock thresholds in CI.
- [x] Produce a targeted coverage ledger: test/group, supported contract, production
  owner, fixture/setup cost, historical-only dependencies, and proposed disposition
  with rationale: keep, consolidate, replace, remove or investigate.
- [x] Inspect all tests in mixed groups individually. A historical name is not
  sufficient evidence for deletion, and a baseline name does not imply obsolescence.
- [x] Map ownership of unit, integration, browser and report/build checks between
  `npm test` and CI. Identify actual duplicate execution versus different contracts.

Exit: ranked measured costs and an evidence-backed coverage ledger. No guessed
speedup targets; count and runtime are recorded independently.

Evidence: [Wave 1 ledger](test-efficiency-wave1-ledger.md). Two full baseline
processes took 156.89s and 153.86s; one stale matrix activation expectation failed
both times and remains visible for Wave 2. No tests were removed. Added optional
profiling and two profiler regression cases only. Later waves must compare against
this baseline; the second run is a repeat baseline, not an optimization result.

## Wave 2 — Retire obsolete Masked + Direct assertions

- [x] Use the Wave 1 ledger to prioritize the obsolete signal-gate handler test
  costing about 20.4 seconds. It exercises archived outcomes against a current
  download.gg handler with a missing control. Remove that retired contract; ensure
  current missing-control/failure behavior retains deterministic coverage where
  needed. Do not retain a real 20-second wait merely by renaming the test.
- [x] Correct the reproduced `addon-matrix` ordinary-F95 activation expectation to
  the approved settings/feedback scope. Retain negative-host/unsupported-context
  assertions and the numeric `/dl/<id>/` distinction. Do not drop the failing matrix
  or change production activation just to satisfy its old expectation.
- [x] Review archive-only tests for old POST resolution/CAPTCHA fallback, managed
  request routing, origin-owned closing, old forcing/probing policy, and parallel
  orchestration. Remove assertions only for intentionally unsupported behavior.
- [x] Retain or replace current compatibility tests: saved false settings, v1 policy
  upgrade, enabled/host preferences, missing/corrupt storage and fail-closed behavior.
  Historical implementation tests are not substitutes for testing current upgrades.
- [x] Preserve retained host coverage: exact aliases/routes, folder/list rejection,
  one-shot guards, staged continuation claims, challenge handling, page teardown,
  independent tabs, explicit final-action evidence and optional delayed local close.
- [x] Cover the new F95 Continue contract directly: numeric route only, delayed or
  disabled button, 250ms delay, skip preference off, policy changes during the delay,
  no repeated submission, bounded wait and pagehide cancellation. Never self-close
  or publish a final-download success for this intermediate action.
- [x] Preserve feedback privacy, active-tab delivery, deduplication, expiry, bounded
  bursts, failure isolation and BFCache/disable cleanup coverage.
- [x] Keep a compact regular/release import-graph contract excluding archived code,
  retired ownership modules and grants. Do not restore every retired algorithm test
  just to assert its absence.
- [x] Remove obsolete runner entries and fixtures only after checking all consumers.
  Keep the implementation archive as reference; it need not remain executable test
  infrastructure. Record deleted contracts and surviving replacement coverage.

Exit: default tests exercise shipped behavior and supported compatibility, not an
archived second product. No unexplained coverage loss or permanently skipped tests.
Record each deletion and its obsolete-contract rationale or surviving current test
owner. Report counts separately from runtime; 72 HISTORICAL labels are evidence
to investigate, not a quota of tests that must be deleted.

Evidence: [Wave 2 retirement ledger](test-efficiency-wave2-ledger.md). Removed 74
obsolete cases and added two current checks. All 210 affected-group tests passed;
same-group test-body time decreased from 37.40s to 13.46s. The stale matrix is fixed.
Referenced historical fixtures were retained. No full-suite or CI pass is implied.

## Wave 3 — Consolidate redundant coverage

- [x] Prioritize repeated report consumers measured in Wave 1: library-personal
  (about 15.9 seconds per group), add-on baseline/API evidence, and add-on size
  determinism (about 10.1 seconds). Map identical-input reuse opportunities before
  changing setup in Wave 4. Keep intentionally independent determinism generations
  and distinguish report-tool correctness from CI snapshot drift checks.
- [x] Review overlapping current toast/source-layout/import-boundary assertions in
  masked-direct reliability, toast removal, retirement and integration groups.
  Preserve the clearest current owner plus complementary integration coverage.
- [x] Use the ledger to identify assertions testing the same contract through the
  same boundary. Keep the clearest owner; retain complementary integration coverage.
- [x] Parameterize equivalent inputs where useful while preserving independently
  identifiable failures. Moving many cases into one test is not itself a speedup.
- [x] Replace brittle physical-line/source-string assertions with behavioral checks
  where practical. Keep deliberate architecture, security and bundle-boundary checks.
- [x] Share deterministic immutable fixtures/setup helpers, not mutable application
  state. Permanent fixtures must not depend on disposable `reference/` files.
- [x] Give retained tests unique, meaningful IDs; fix duplicated IDs without erasing
  the distinction between cases or inflating reported coverage claims.

Exit: every removed duplicate has an identified surviving contract owner.
Produce the specific setup-sharing candidates for Wave 4; do not claim a speedup
from parameterization, renamed IDs or fewer reported test cases alone.

Evidence: [Wave 3 consolidation ledger](test-efficiency-wave3-ledger.md). Removed
five redundant/historical-inventory cases, moved unique current assertions to their
owners, shared frozen route inputs and resolved duplicate IDs in reviewed families.
All 268 focused cases passed; no full-suite pass or speedup is claimed. Concrete
report/build setup-sharing candidates are documented for Wave 4, not implemented.

## Wave 4 — Reduce measured infrastructure costs safely

- [x] First replace the approximately 45-second real-time wait in
  `LIBRARY-UPDATE-QUEUE-WORKER-02 removes abort listeners after each wait` with
  deterministic timer driving. Exercise the real production wait implementation,
  enforced minimum spacing and listener cleanup; do not inject a no-op wait that
  bypasses the very cleanup under test. Cover abort cancellation as appropriate.
- [x] Next investigate the 870 fresh `loadModule` calls costing 25–27 seconds per
  baseline run. Compilation/evaluation is nested within test durations; do not
  double-count it as additional wall time. Start with repeated high-cost entries,
  such as the library service, rather than broad cache changes without evidence.
- [x] Implement only justified same-input report/build setup reuse identified in
  Wave 3. Keep the two independent runs required to establish determinism; reuse
  their results for unrelated assertions only when fixtures/options stay unchanged.
- [x] Address the highest measured repeated work first: bundling/transforms, report
  generation, repeated all-add-on smoke builds, real waits or browser startup.
- [x] Investigate caching compiled module output within one process, not initialized
  exports. Account for entry content, dependencies, loader/define settings and source
  replacements. Preserve fresh module state and sandbox-sensitive initialization;
  prove no cross-test pollution before adopting caching. Do not persist stale output.
- [x] Reuse build evidence only for identical immutable inputs/options. Keep regular
  and release contracts distinct; do not reuse results after fixture/source mutation.
- [x] Prefer the existing fake clock for deterministic timing tests. Keep real browser
  scheduling/Web Locks/storage tests where those actual boundaries are the contract.
- [x] Do not parallelize tests sharing global DOM, navigator, module state, temp
  outputs or fixtures. Consider process isolation only if measurement justifies it
  and the repository's existing infrastructure can support it safely.
- [x] If report checks move out of `npm test`, preserve an explicit CI owner and a
  documented full-validation command. No check may silently disappear from both.

Exit: measured savings with regression tests for any changed runner/helper semantics.
Record before/after timings for each major change where practical. If a caching
proposal cannot safely preserve module isolation or mutable-fixture behavior, reject
it and document that outcome rather than treating every optimization as mandatory.

Evidence: [Wave 4 infrastructure ledger](test-efficiency-wave4-ledger.md). The
real wait now runs under fake timers with added cancellation coverage; library
report consumers reuse isolated, input-keyed evidence while determinism still
performs two independent generations. The compiled-byte cache prototype was
removed after its broad comparison failed to show a meaningful gain. No CI checks
moved and no test parallelism was added. Final changed-area validation: 31 passed;
full-suite timing and final verification remain Wave 5.

## Wave 5 — Focused workflow and final verification

- [x] Compare final timings with the Wave 1 156.89s / 153.86s baseline using the same
  profiling mechanism and comparable Node/dependency/browser conditions. Explain
  changed case counts, environment differences and residual waits. Repeat runs
  where practical; do not set a hard CI speed threshold or promise additive savings.
- [x] Reconcile the final coverage ledger: every removed case has either an obsolete
  contract rationale or an identified surviving current owner. Explicitly verify
  the stale activation matrix is corrected and the real wait cleanup remains tested.
  A faster suite that silently loses those checks does not meet acceptance.
- [x] Document or improve selection through the existing runner: changed-area groups
  plus affected integration boundaries. Fail loudly on unknown/empty selections.
  Default full execution must remain comprehensive; no second runner to maintain.
- [x] Verify failure reporting and nonzero exit codes with a controlled failing case;
  verify test selection, async completion, setup errors and cleanup remain reliable.
- [x] Demonstrate retained tests detect representative broken production behavior
  (for example wrong route authorization, ignored disabled preference, premature close
  or duplicate Continue click), using temporary reversible fault injection if useful.
  Do not leave injected defects or add a heavyweight mutation platform by default.
- [x] Compare before/after coverage ledger, executed cases and measured runtime under
  comparable conditions. Explain savings and remaining expensive checks honestly.
- [x] Run focused checks per implementation wave. At final acceptance, delegate or
  explicitly agree who runs the full repository suite and CI-equivalent checks.
  Do not claim a full pass from focused results.
- [x] Update test workflow docs/AGENTS only where actual commands or responsibilities
  changed. Refresh generated reports only if their inputs changed; no release/version
  bump or distribution rebuild solely for test cleanup.

Acceptance: obsolete behavior is no longer maintained by the default suite; every
supported high-risk contract retains an identified test owner; failures remain useful;
runtime savings are measured; full-validation ownership is explicit.
The known Wave 1 matrix failure must be resolved, not waived. Report any other
remaining failures honestly; fewer cases or lower runtime alone is not a full pass.

Final evidence: [Wave 5 verification](test-efficiency-wave5-ledger.md). Two full
runs passed 753/753 in 104.19s and 81.58s, versus 156.89s and 153.86s at baseline.
Local CI-equivalent checks passed after refreshing changed CSS test evidence.
Four in-memory defect probes were detected by retained tests. Default coverage
remains full; focused group selection is documented in [Test workflow](../testing.md).
No version bump, distribution rebuild, Git commit or external release was performed.
