# Test workflow

Use the existing Node runner for both focused development and full validation.
Selection does not replace integration coverage or the default full suite.

## Commands

```powershell
# Complete suite; unchanged default used by CI
npm test

# List groups without initializing the harness or executing tests
npm test -- --list

# Focused Masked + Direct work plus integration boundaries
npm test -- --group "masked-direct-*" --group addon-matrix --group integration

# Updater work: include request/budget, worker, schema and integration boundaries
npm test -- --group "library-hybrid-*" --group library-manual-update --group library-auto-update --group "library-update-queue-*" --group library-idb-schema --group addon-service --group integration
```

`--group` accepts an exact name or a trailing `prefix*`, and may be repeated.
Selections are combined without duplicates and run in the original suite order.
Unknown arguments, missing/empty names, unmatched patterns and zero registered
tests fail nonzero. `--list` can be combined with group filters. No arguments
always runs every registered group; new groups belong in `tests/run.cjs`.

Use the case names to locate failures. During development, run changed-area groups,
affected integration boundaries, relevant lint and `git diff --check`. Changes to
shared harness/helpers warrant broader coverage. The final full CI-equivalent run
belongs to the user unless explicitly delegated; selecting a few groups is not
evidence that the full suite or CI passed.

## Local timing and output

```powershell
$env:F95UE_TEST_TIMINGS = 'tests/.tmp/test-timings.json'
npm test *> tests/.tmp/test-run.log
Remove-Item Env:F95UE_TEST_TIMINGS
```

The optional environment value is an output path. JSON includes group registration,
individual test outcomes/durations, module-load timings and total harness time.
Module-load times are nested within test durations; do not add both together.
These local measurements are not deterministic CI snapshots or hard speed gates.
PowerShell may classify native stderr as an error even when all tests pass: check
the explicit harness results and failure details, not just the redirected command's
wrapper status. Actual failures must never be waived on that basis.

Keep normal failure exit codes, async completion and cleanup assertions intact.
Use fake time for timing mechanics while retaining the real implementation under
test. Real offline browser concurrency tests remain necessary where mocks do not
exercise the browser's locking behavior. Automated tests must not contact live
F95 APIs, resolve signed download links or trigger downloads.

## Reports and builds

CI separately checks source/report drift, size limits, manifest/catalog/structure,
documentation, inventory and the non-bumping core smoke build. Audit-tool tests
also verify determinism and read-only behavior: these are distinct contracts.
Normal builds refresh current audit reports; they do not validate correctness or
automatically approve size-limit changes. Test cleanup alone does not require a
release build, version bump or distribution regeneration.

See the [efficiency plan](architecture/TODO_TEST_PRECISION_AND_EFFICIENCY.md) and
its evidence ledgers for removed-contract ownership and measured costs.
