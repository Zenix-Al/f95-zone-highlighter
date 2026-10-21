# Test efficiency: Wave 2 retirement ledger

Completed 2026-10-20. Scope: obsolete Masked + Direct test retirement, current
replacement coverage and correction of the stale matrix. Production behavior,
versions, distributions and audit thresholds were not changed.

## Removed contracts and surviving owners

74 obsolete cases were removed, including all 72 explicitly HISTORICAL cases and
two unlabeled historical assertions. Two current behavioral cases were added.
The implementation archive remains available; it is not an actively tested product.
No permanently skipped cases or conditional bypasses were introduced.

| Removed tests | Reason | Supported contract retained elsewhere |
| --- | --- | --- |
| Entire masked-direct-masked-standalone-baseline/context/preference/runtime groups | Old masked POST/CAPTCHA flow and fallback no longer ship | Current context matrix, retirement bundle graph, current-contract Continue checks and single-pipeline settings/policy tests |
| Entire masked-direct-parallel-requests and parallel-baseline groups | Origin/request orchestration retired; baseline described its historical defects | current-contract independent tab guards/local close; single-pipeline final-action evidence, delay, policy recheck and teardown |
| Entire masked-direct-standalone-baseline/policy/recovery/signal-gate groups | Old managed/standalone branches and missing-core forced policy no longer ship | single-pipeline v1-to-v2 compatibility, explicit false, corrupt/storage failure, current controller dispatch; feedback isolation tests |
| Six historical reliability cases | Old runtime context matrix, thread observer, managed-only dispatch, attention listener/toast and correlated outcomes retired | Current context, host, lifecycle, feedback and challenge tests remain in their respective groups |
| Historical engine managed-precedence case and helper | Managed identity no longer authorizes automation | Remaining engine tests exercise current routes, disabled policy, stale-marker independence and ambiguous recovery rejection |
| Historical simple/direct expansion managed-ownership cases | Archived controller precedence is not a current boundary | All current host routes, Drive navigation, MixDrop stages, UploadNow shares, Gofile folder/single-file guards and MediaFire destination validation retained |
| Expansion-baseline initial-denial and managed-first source-order cases | Asserted a pre-expansion limitation and archived branch order | Current approved-route test retained; actual host guards/staged continuation tests remain. Static route/continuation inventories left for Wave 3 review |
| Historical integration mismatched/expired handoff case | Retired route-context repository | Current context, identity/module boundaries and continuation repository coverage retained; unrelated integration cases untouched |
| Archived handoff subsection inside current addon-matrix test | Mixed test exercised obsolete repository in addition to current contexts | Current context test kept and expanded with numeric download intermediate, malformed route and spoofed-host negatives |

Ten obsolete group files and their runner registrations were deleted. Dead
archive-loading helpers in retained groups were removed. No remaining test executes
the archive; the retirement graph test still asserts the archive exists and cannot
enter either production bundle. Source searches confirmed no consumers of deleted
test modules remain.

The old masked HTML/response fixtures still have historical-document consumers,
so they were deliberately retained. The standalone expansion fixture remains used
by current route/inventory tests. No fixture was deleted merely because one reader
was retired. Deleted test files can be recovered from Git; archive code was not deleted.

## Current coverage strengthened

- `MASKED-DIRECT-DOWNLOADGG-FAILURE-01` invokes the real current handler and its real
  polling loop under the existing fake clock. Missing controls settle as failure
  with zero final-action success and no pending timers. No live requests or real
  20-second timeout, and no mocked replacement of the handler itself.
- `MASKED-DIRECT-CURRENT-06` verifies a disabled Continue control cannot submit,
  readiness schedules the 250ms delay, and pagehide during that delay cancels the
  action even if its callback is later invoked. The existing current-contract case
  now explicitly checks timer delays; it retains skip-off, policy-change, bounded
  wait, one-shot and no-close assertions.
- The add-on manifest activation matrix now expects ordinary F95 pages to support
  Masked + Direct settings/feedback, consistent with the approved manifest. Runtime
  context checks separately retain `/masked` rejection, numeric `/dl/` handling,
  malformed `/dl/` rejection, unsupported hosts and spoofed F95-domain rejection.
  Production scope was not altered to satisfy the test.

## Validation and timing

All 210 cases passed in the retained Masked + Direct groups, complete add-on matrix
and complete integration group. Touched-test lint, docs, inventory and diff checks
passed. The profiler JSON records no failed cases. PowerShell's redirected native
stderr produced exit=1 for the logging command despite the harness reporting all
passes; both explicit results and JSON were inspected, not treated as a test failure.

Comparable scope from Wave 1's second full-run profile:

| Scope | Before | After |
| --- | ---: | ---: |
| Registered cases in these groups | 282 | 210 |
| Failed cases | 1 stale matrix | 0 |
| Explicit historical cases | 72 | 0 |
| Summed test-body time | 37.40s | 13.46s |

The focused harness finished in 14.93s; this is not a new full-suite time. Its new
missing-control case took 29.9ms. Baseline came from a full process and current
measurement from a focused process, so cache/order noise is possible; the removed
real 20-second historical wait is a concrete change, not an inferred guarantee.
Raw evidence: `tests/.tmp/timing-wave2-focused.json` and `.log`.

No full repository rerun or CI-equivalent pass is claimed in this wave. The current
45-second queue-listener wait remains for Wave 4. Full-suite timing/verification
remains Wave 5 with explicit ownership. Waves 3 and 4 have not been preemptively
executed: current inventory duplicates, repeated report setup and module bundling
remain for their planned reviews.
