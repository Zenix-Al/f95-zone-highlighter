# Test efficiency: final verification

Completed 2026-10-21. All five waves are complete. This is test maintenance, not
a product release, and does not change core/add-on versions or distributions.

## Full-suite timing and outcomes

Same local Windows workspace, Node v24.16.0, existing dependencies and profiling
mechanism. Processes ran separately; audit validation was not run concurrently
with either final timing process. OS cache/background load was not controlled.

| Process | Cases | Passed | Failed | Harness elapsed |
| --- | ---: | ---: | ---: | ---: |
| Wave 1 first baseline | 825 | 824 | 1 | 156.89s |
| Wave 1 repeat baseline | 826 | 825 | 1 | 153.86s |
| Final first full run | 753 | 753 | 0 | 104.19s |
| Final repeat full run | 753 | 753 | 0 | 81.58s |

The extra baseline case was the profiler regression added between baseline
registrations. Both baseline failures were the stale activation matrix expectation;
that matrix remains in the suite with its corrected current contract.

The first final run used `node tests/run.cjs`; the second used `npm test`, whose
script invokes that same default runner. No group selection was applied. There
are 69 registered groups, all selected by default. Raw local evidence/logs are
`tests/.tmp/timing-wave5-first.json` and `timing-wave5-second.json` and their logs.
Timings start at harness initialization and end at registered-test completion,
not npm startup or a separate process-exit tail.

Observed savings are roughly 50–75 seconds per full run, not a hard CI target.
The current abort-listener case measured 54–72ms instead of about 45050ms. The
library-personal group measured 6.82–7.77s versus 15.17–15.92s in Wave 1. Both
final processes still compiled modules freshly (772 module loads). The broader
compiler-cache experiment was rejected; no such cache remains in the runner.
Independent audit generations and the real offline Chromium locking case remain
among the slower checks intentionally. No claim is made that remaining work is
unnecessary merely because it costs time.

## Coverage reconciliation

- [Wave 2](test-efficiency-wave2-ledger.md) removed 74 obsolete assertions and
  added two supported behavior cases, with per-contract removal/survivor ownership.
- [Wave 3](test-efficiency-wave3-ledger.md) removed five overlapping or historical
  inventory cases, moving unique supported assertions to current owners.
- [Wave 4](test-efficiency-wave4-ledger.md) preserved production wait semantics
  under virtual time, expanded cancellation checks, and added one report-fixture
  regression. Independent report determinism remains two real generations.
- This wave added three runner regression cases. Relative to the 826-case repeat
  baseline: 79 removals + six additions = 753 final cases. Numeric-ID cleanup,
  parameterization and moving assertions did not masquerade as coverage gains.
- No production behavior, supported upgrade contract, CI gate or mandatory mode
  was skipped to reduce runtime. No test has been permanently disabled to achieve
  a green result. Historical fixtures with documentation consumers were retained.

## Focused selection and failure behavior

The existing `tests/run.cjs` now accepts repeated exact `--group` names or trailing
`prefix*` patterns and supports `--list`. It preserves default full execution and
canonical group order. Unknown flags/groups, unmatched patterns and empty values
fail before harness initialization. Duplicate selections run once. A selected
group that registers no cases cannot produce an empty green pass.

Runner regressions verify CLI listing without execution, selection unions/order,
invalid inputs, setup exceptions and unsettled-promise exit failures. Existing
timing regressions now verify async failure, sandbox cleanup and subsequent test
execution together. An initial export-order circularity found by these checks
was corrected before the full runs. The focused runner/helper check passed all
six cases before final validation.

Commands and boundary guidance live in [Test workflow](../testing.md); AGENTS
links to that workflow. No alternative runner or heavyweight mutation platform
was introduced.

## Representative defect-detection checks

Four one-off subprocess probes used the existing `loadModule` source-replacement
facility. They altered only compiled temporary test inputs, never production files.
Each selected retained case failed with an AssertionError and process exit=1:

| Injected defect | Retained detection owner |
| --- | --- |
| Treat arbitrary hosts as F95 | addon-matrix current context/unsupported-origin case |
| Ignore disabled/legacy-false automation policy | masked-direct-single-pipeline defaults/legacy-false case |
| Allow local closing without explicit final-action evidence | masked-direct-single-pipeline close/evidence case |
| Click Continue twice | masked-direct-current-contract one-shot intermediate case |

No fault injection remains in source or the default suite. The subsequent full
runs exercised original source, compiled freshly. These probes demonstrate useful
defect detection; they are not a comprehensive mutation-coverage percentage.

## Final local CI-equivalent validation

The agent performed final validation under the user's instruction to execute
Wave 5. Both full suites passed. Also passed:

- Core and add-on lint, plus targeted lint for modified test infrastructure.
- Core report, independent size gate and size-reduction report checks.
- CSS report; add-on baseline/API/size and library-personal report checks.
- Add-on manifest/catalog/structure and generated feature manifest checks.
- Documentation links, source/documentation inventory, whitespace and core smoke.
- A before/after hash of the already-dirty tracked diff confirmed validation
  commands did not change tracked files. A clean-worktree assertion was not used
  to erase or reject existing user changes.

The initial CSS check identified stale test call-site evidence: the new disabled
Continue-button fixture affected `evidenceMap` and `dynamicEvidenceFiles`. CSS
authored/bundle metrics were unchanged. Only the current CSS report was refreshed,
then its check and remaining CI steps passed. No size-limit or historical baseline
was raised; no other reports needed regeneration.

Logs: `tests/.tmp/test-efficiency-final-ci.log` records the initial passed steps
and stale CSS finding; `test-efficiency-final-ci-followup.log` records its successful
recheck, remaining checks and read-only guard. The first guard attempt exceeded
Node's default stdout buffer on the large dirty diff; the diagnostic guard was
rerun with sufficient buffer, not bypassed.

This is local validation using installed lockfile dependencies and an available
offline browser, not execution on GitHub's Linux runner or a fresh `npm ci` install.
Separate visual-suite and real-host smoke checks were not part of this test plan.
No release build, commit, push or upload was performed.
