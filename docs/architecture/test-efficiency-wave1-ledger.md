# Test efficiency: Wave 1 evidence and coverage ledger

Scope: investigation and optional timing only. No production code, assertion,
runner entry or CI gate was removed. Proposed removals below belong to Wave 2.

## Reproducing timing

Use the existing runner, optionally writing a local JSON timing report:

```powershell
$env:F95UE_TEST_TIMINGS = 'tests/.tmp/test-timings.json'
npm test *> tests/.tmp/test-run.log
Remove-Item Env:F95UE_TEST_TIMINGS
```

The environment variable is a file path, not a boolean. Leave it unset for normal
output. Reports include Node/platform, total elapsed time, group registration,
individual passed/failed tests, and `loadModule` compilation/evaluation durations
attributed to the active test. The `runTest.registerGroup` helper is used by the
existing runner; direct custom harness callers without it are unattributed.
Module-load durations are nested within tests/registration, so do not add them
to total test time. Child builds, browser launch and waits remain within their
owning test duration, not separately intercepted. No global tool monkey-patches,
test concurrency, timeouts or CI wall-clock thresholds were introduced.

Raw timing/log files stay in ignored `tests/.tmp/`; they are local evidence,
not deterministic CI snapshots. A failure remains a failure under profiling.

## Coverage/disposition ledger

Paths below refer to `tests/groups/` unless stated otherwise. Group entries cover
each registered test except the explicit mixed-group exceptions listed afterward.
Fixture deletion requires a consumer search during implementation.

| Group | Contract / production owner | Setup and historical dependency | Proposed disposition |
| --- | --- | --- | --- |
| masked-direct-masked-standalone-baseline/context/preference/runtime | Retired masked POST/CAPTCHA startup, settings and core fallback | Archived app/settings/policy and old manifest snapshots | Remove archive-only assertions; current Continue and policy tests own supported replacements |
| masked-direct-parallel-requests | Retired request records, origin ownership and correlated tab closing | Archived trigger/flow/repositories; fake GM/DOM/clocks | Remove; retain independent current guards and local-close tests |
| masked-direct-parallel-baseline | Historical report of old parallel defects, not shipped behavior | Static historical JSON | Remove from default tests; archive report may remain as documentation |
| masked-direct-standalone-baseline/policy/recovery/signal-gate | Retired managed-versus-standalone and missing-core forcing/recovery | Archive controller/policy/flow | Remove archive algorithms; retain current v1-to-v2 settings compatibility and disabled/storage behavior |
| masked-direct-retirement | Current bundle boundary and retired ownership absence | Two bundle graphs plus DOM/settings checks | Keep compact boundary; consolidate overlap with current contract/source-layout tests later |
| masked-direct-single-pipeline | Current policy/route gates, local closing, setting mirror and controller integration | Current policy, controller, flow; fake GM/DOM/clock | Keep; integration checks complement unit guards |
| masked-direct-current-contract | Current Continue, native anchors, isolated tabs, challenge disposal, upgraded settings | Current controllers/flow/guard/lifecycle; permanent fixture | Keep; expand missing edge cases in Wave 2 rather than treating one broad test as complete |
| masked-direct-feedback | Current bounded private mailbox and visible/focused delivery | Current feedback/flow/context; fake event/GM/tab/clock | Keep privacy, dedupe, BFCache and failure-isolation boundaries |
| masked-direct-standalone-host-guards | Current host metadata, route and single-file validation | Current eligibility/metadata/host DOM | Keep, assess same-boundary route duplicates only |
| masked-direct-standalone-settings | Current defaults, explicit saved choices and refresh mirroring | Current settings/lifecycle; fake bridge | Keep; consolidate duplicate IDs, not distinct compatibility inputs |
| masked-direct-standalone-expansion-staged | Current continuation ownership and staged host progression | Current continuation repositories/controllers/hosts; fake DOM/GM | Keep; no inference of obsolescence from expansion naming |
| masked-direct-toast-remove | Current presentation boundary and diagnostic redaction | Source scan plus current diagnostics | Keep diagnostics; consolidate presentation scan with reliability/retirement checks |
| addons | Current baseline determinism, build tooling, smoke builds and module layouts | Repeated whole-catalog baseline/builds; temporary outputs | Keep contracts; investigate duplicated setup and whole-catalog work |
| addon-size | Audit determinism, completeness and read-only behavior | Two child-process whole size reports plus committed snapshot | Keep tool regression; distinguish it from CI's drift check |
| library-personal | Supported library model/UI plus baseline-tool evidence | Repeated library baseline creation and DOM | Keep behavior; investigate repeated baseline generation, not broad deletion |
| core / core-size-reduction / core-runtime-performance | Core routes, behavior and audit/tool contracts | Source scans, smoke bundles, performance fixtures | Keep; rank actual cost before changing setup |
| library-hybrid-budget | Cross-tab quota/locking correctness | Actual offline Chromium plus deterministic budget tests | Keep actual browser concurrency boundary; do not replace it entirely with mocks |

## Mixed-group decisions (do not delete whole groups)

- `masked-direct-reliability`: remove only the six archive tests: old runtime
  context matrix, thread observer ownership, managed-only host dispatch, old
  attention listener ownership, old challenge-attention toast, and correlated
  overlapping/abandoned request outcomes. Keep Datanodes interval non-patching,
  exact host indexing, DelaFil routes, download.gg routes, clean Drive navigation,
  realm-safe clicks, delayed Buzzheavier row, signed Buzzheavier action, two-stage
  MixDrop, UploadHaven delay, UploadHaven one-shot, KrakenFiles challenge gating,
  UploadNow single-file rejection, terminal teardown, challenge clear/resume,
  late challenge appearance, and embedded Turnstile completion. Its final docs/toast
  surface check is a consolidation candidate, not grounds to remove those behaviors.
- `masked-direct-standalone-engine`: remove managed-identity precedence only.
  Keep approved routes, policy-off rejection, stale-marker independent authorization
  and ambiguous recovery rejection against the current controller. Rename stale
  terminology where it obscures the current contract.
- `masked-direct-standalone-expansion-simple`: remove the archived managed-ownership
  case only. Keep exact entries, unsafe/continuation rejection, controller policy,
  Gofile single-file page and single-file folder, Gofile multi-file/empty rejection,
  and MediaFire non-HTTP destination rejection.
- `masked-direct-standalone-expansion-direct`: remove archived managed ownership
  only. Keep Drive entry routes/navigation, MixDrop aliases/two-action bound,
  UploadNow locale shares and exact registered entry checks.
- `masked-direct-standalone-expansion-baseline`: remove the historical initial
  expansion-denial assertion and managed-first archive source ordering. Static
  proposed-route and continuation inventories are replace/consolidate candidates:
  assert actual supported behavior in current route/stage tests instead. Keep
  current approved-route checks until equivalent coverage is explicitly identified.
- `addon-matrix`: its current Masked context/route test also executes archived
  `routeContextRepository` handoffs inside the same test. Remove that subsection,
  not the current context assertions. The manifest activation matrix currently
  fails because it expects the old F95 activation scope; correct it to the approved
  current scope with negative-host cases, rather than dropping the matrix.
- `integration`: remove only the historical archived mismatched/expired route
  handoff test. Keep current Masked identity/module/core boundaries and all unrelated
  route/config/storage/UI integration cases.

All archive-only removal candidates still require a final consumer/contract check
when implemented. Historical labels were corroborated with archive imports and
asserted retired behavior; unlabeled historical baselines were inspected separately.

## Validation ownership / duplicated work

| Layer | Current owner | Distinct purpose and next investigation |
| --- | --- | --- |
| Behavioral unit/integration and offline browser cases | `npm test`, tests/run.cjs | Default supported-product regression coverage; remove retired product tests here |
| Real UI layouts | Separate `test:visual` Playwright commands | Not implicitly covered by Node suite or normal CI workflow |
| Audit determinism/completeness/read-only regressions | Node groups core, addons, addon-size, library-personal | Test audit tools, often multiple builds per case; potential identical-input reuse |
| Checked-in snapshot drift and size limits | validate-manifest workflow report steps | Compare current source to committed data and independent limits; not the same assertion as tool determinism |
| Manifest/catalog/structure/docs/inventory and core smoke | Explicit workflow steps | Preserve checks even if their setup is also exercised in unit tests |
| Normal build report refresh | build.js, addons/build-addon.js | Writes current evidence; not validation of correctness, not executed automatically in CI |

Likely duplication includes current toast/source checks and repeated report/smoke
generation. A drift check and a determinism test are complementary contracts even
when their underlying bundle work overlaps. No gate moves or caching in Wave 1.

## Measurement results

Environment: Windows, Node v24.16.0, existing installed dependencies/lockfile, same
workspace and sequential full `node tests/run.cjs` processes. No installs, rebuilds
or production edits between runs. Both runs have ordinary OS caches; neither is
a controlled cold-disk benchmark. A second timing regression case was added after
the first process registered its tests, so the second run has one additional case.

First run: **156.89 seconds**, **824 passed / 1 failed** (825 cases). Test execution
accounts for 154.69 seconds, registration for 0.60 seconds, and the remaining 1.61
seconds includes harness initialization and unclassified orchestration. The raw
report is `tests/.tmp/timing-wave1-first.json`.

| Priority | Measured first-run cost | Evidence / action for later waves |
| --- | --- | --- |
| 1 | 45.05s in queue-worker abort-listener cleanup | `library-update-queue-worker`: three-record test requests spacing=1 but exercises the enforced 15-second minimum using real timers. Keep cleanup assertions and actual wait implementation; drive its timers deterministically rather than bypassing the implementation with a no-op wait. Wave 4. |
| 2 | 20.39s in historical signal-gate handler test | Loads archived flow, calls current download.gg handler against a page with no control; handler uses a 20000ms timeout. Obsolete outcome contract should leave default suite in Wave 2. Preserve current missing-control/failure coverage with fake time where needed. |
| 3 | 27.43s nested in 870 loadModule calls | Compilation plus fresh evaluation; not additive to total test execution. Library service alone loads 47 times, 3.27s. Investigate safe compiled-output reuse in Wave 4 without sharing module instances. |
| 4 | 10.11s in addon-size deterministic report test | Two child-process whole reports. Keep determinism/read-only purpose; investigate matching-input setup reuse, not deletion of the independent CI drift check. |
| 5 | 7.00s baseline determinism + 5.86s API audit in addons | Full-catalog and tool-contract work. Identify reusable inputs; retain intentional independent determinism runs. |
| 6 | 15.92s library-personal group | First determinism test 6.76s; three other baseline consumers each cost about 2.88–3.08s. Repeated identical report generation is a reuse candidate; preserve independent model/UI tests. |
| 7 | 1.60s all-addon regular/release smoke test | Less significant than real waits; preserve mode-specific boundaries. Investigate overlap with integration smoke and report bundling only after larger costs. |

There are **72 explicitly HISTORICAL cases**, totaling **23.21 seconds** on this
run. Additional unlabeled historical report assertions exist. Removing every
historical case would not by itself solve the dominant current-library real wait.
Do not infer a fixed savings promise or sum nested module timings with test totals.

Known failure: `TEST-ADDONS-01 covers deterministic manifest, header, catalog, and
route support` in `addon-matrix`, ordinary F95 activation expected false but true.
This disagrees with the rework's approved ordinary-page settings/feedback scope.
Correct that stale expectation in Wave 2 while preserving scope negatives. Wave 1
deliberately leaves the failure visible; this baseline is not a green release claim.

Second run: **153.86 seconds**, **825 passed / 1 failed** (826 cases, including
the extra profiler regression case). It reproduced the exact same stale matrix
failure. Queue listener cleanup remained **45.06s**, the historical handler test
**20.38s**, and size-report determinism **10.17s**. The same 870 module loads took
**25.32s**; the same 72 historical cases took **23.09s**. Raw evidence:
`tests/.tmp/timing-wave1-second.json`. The roughly 3-second overall variation is
normal run-to-run evidence, not an optimization: no performance fix was applied.
Times measure harness startup through completion of registered tests, not any
additional process-exit tail. No final full-CI success is claimed from these runs.

Timing collector regression
checks cover disabled collection, monotonic elapsed arithmetic, isolated snapshots,
failed-case attribution, continued execution after failure and subprocess exit=1.
Focused timing tests (2), touched-file lint, docs, inventory and diff checks passed.
No audits, distribution builds or version changes were needed for this wave.
