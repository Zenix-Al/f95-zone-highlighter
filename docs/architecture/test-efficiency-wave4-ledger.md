# Test efficiency: Wave 4 infrastructure work

Scope: test infrastructure and setup only. No production wait, updater spacing,
rate limit, behavior, version, distribution or CI safety gate was modified.

## Real wait exercised with virtual time

The worker abort-listener cleanup case no longer sleeps through three real
15-second waits. It still invokes the production default `waitFor`, not a no-op
replacement. The existing fake clock drives global timeout callbacks while the
worker's normal async operations settle. The test checks enforced 15000ms delays,
listener removal, no pending timers and completion of all three records. A second
scenario aborts during the first actual wait, verifies cancellation and checks
that no later record runs. Original timers are restored in `finally`.

The 17 worker cases passed before proceeding. The profiled cleanup case took
45.8ms versus approximately 45.05 seconds in both Wave 1 baseline processes.

## Compiled-byte cache investigated and rejected

A process-local prototype cached compiled bytes, never module instances. It
checked dependency contents, loader/define/replacement options and configuration
files, with conservative resolver fallbacks. Isolation/invalidation regressions
passed. An exception-heavy missing-config check was improved during investigation.

However, the broad comparison did not establish a useful benefit:

| Expanded focused process | Elapsed | Summed module-load time |
| --- | ---: | ---: |
| Initial cache prototype | 62.35s | 15.50s |
| Cache bypassed | 61.46s | 14.30s |
| Revised cache prototype | 61.06s | 14.59s |

All three ran 441 cases with zero failures. A favorable microbenchmark (40 repeated
library-service loads: 1.52s cached versus 5.03s uncached) did not translate into a
convincing broad-suite improvement. Keeping the complexity for that isolated
result would not meet this plan's evidence requirement.

The compiler prototype, its cache-only regression cases and bypass switch were
therefore removed. `loadModule` retains fresh synchronous compilation and module
evaluation. No dormant compile-cache feature, shared initialized exports, persistent
cache, test parallelism or background watcher ships from this investigation.

## Report setup reuse

The library-personal group previously generated the same full report five times.
It now retains one group-local result for ordinary consumers and returns a fresh
structured clone for each reader. Input fingerprints cover authored core/add-on
source, manifest, scripts/build helpers, package metadata and the library fixture.
Changes/additions invalidate the value; rejected generation is not retained.
Disposable references, distributions, archive code and temporary outputs are not
producer inputs and are excluded from the tree snapshot.

The determinism test deliberately still generates a second independent full
report. Its working-tree, deterministic-content and committed-report assertions
remain intact. Later assertions can request evidence independently of whether an
earlier assertion passed. Tests prove clone isolation, input changes/additions and
failure recovery. No report or initialized application instance is shared globally.

No broader API/size-audit/regular-versus-release reuse was adopted: those checks
exercise distinct producer paths or intentional independent generations. Their
measurement cost is retained rather than weakening tool determinism/CI drift
coverage. Real offline browser locking tests remain unchanged.

## Validation and timings

Experimental expanded focused runs passed **441 cases** across test infrastructure/timing,
core/config/load traces, current Masked + Direct groups, add-on matrix/integration,
build/audit tools, library-personal, IDB schema, manual/automatic updater and queue
worker boundaries. This is broader than Wave 3 because the loader is shared, but
is not the full repository suite or CI-equivalent validation.

Raw experiment evidence: `tests/.tmp/timing-wave4-cached.json`,
`timing-wave4-uncached.json`, `timing-wave4-cached-final.json` and corresponding logs.
The redirected
PowerShell logging command can return exit=1 on native stderr while the harness
and JSON contain zero failures; explicit outcomes are checked, not hidden.

After removing the cache prototype, the **final 31 changed-area cases passed**:
report-fixture regression, timing regressions, all worker cases and all
library-personal cases. That process took **11.21 seconds**. The worker cleanup
case took **61ms** versus about **45050ms** before; the library-personal group took
**7.31s** versus **13.13s** in the Wave 3 run (and 15.92s in Wave 1). These are
local observations, not fixed CI budgets or a new full-suite timing claim.
Final evidence: `tests/.tmp/timing-wave4-final.json` and `.log`.

The added report-fixture regression verifies isolated reader copies, content and
new-file invalidation, and retry after producer failure. Touched-file lint, docs,
inventory and diff checks passed. The compiler experiments are not counted as
permanent product coverage. Full-suite timing, coverage reconciliation and final
validation ownership remain Wave 5. No reports or distributions were rebuilt.
