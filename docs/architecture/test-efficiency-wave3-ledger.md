# Test efficiency: Wave 3 consolidation ledger

Scope: current-test ownership, immutable inputs and clearer case IDs. No production
behavior, build/report cache, initialized-module reuse, CI gate or version changes.

## Consolidations and surviving coverage

| Removed repetition | Current owner / preserved distinction |
| --- | --- |
| Expansion-baseline approved-route test | `masked-direct-standalone-host-guards` already checks the identical five host/URL pairs through the same classifier. `standalone-engine` still checks controller authorization as a separate boundary. |
| Expansion-baseline proposed-route and continuation report inventories | These only asserted historical JSON contents. Current exact aliases, rejected routes, single-file guards and actual continuation ownership/stages remain in host-guards, simple/direct/staged expansion and engine tests. Historical documents/fixtures remain reference evidence. |
| Retirement context/native-anchor case | Current addon-matrix owns retired/CAPTCHA/unsupported context checks. Current-contract owns delayed/hidden native links and now also checks cleanup on each apply. The unique absence of old settings was moved to the settings metadata test. |
| Reliability docs/token and local-toast source case | Toast-removal owns the single local-presentation absence scan and the core-toast API surface. Runtime feedback failure/delivery/cleanup behavior remains in feedback tests. Literal documentation tokens are no longer a software contract; normal documentation link checks remain. |
| Repeated exact grants/run-at assertions in toast-removal | Integration's current manifest identity/core-boundary case retains them. Toast-removal retains its distinct presentation, toast capability/API and diagnostic-redaction checks. |

Five cases were removed, with unique supported assertions moved rather than lost.
The retired expansion-baseline group and runner registration were deleted. Its
JSON route fixture still has a historical-document consumer and was not deleted.
No unrelated integration or report determinism case was removed.

## Layout and test input precision

- Masked composition/entry physical line caps were replaced by syntax-aware
  ownership checks: the entry imports its composition module and has no feature
  declarations; settings/command imports stay in their owning modules. This avoids
  formatting changes failing an architecture check. Existing production size audits,
  bundle exclusion and core limits remain unchanged. Unrelated add-ons' layout
  checks were not silently rewritten in this scoped consolidation.
- The five approved host/URL pairs now live in
  `tests/fixtures/masked-direct-approved-routes.cjs`. Both the outer collection and
  each tuple are frozen. Classifier and controller tests share only these values,
  not DOM, storage, policy or compiled/initialized modules. The controller case
  retains the plain download.gg URL and blocked inputs, and now also tests the
  shared Pixeldrain route through policy authorization.
- The intermediate-route feedback test description now reflects that numeric
  `/dl/` routes are distinguished, not universally inert.
- Duplicate numeric IDs were resolved within the reviewed Masked + Direct,
  add-on matrix/build/size and library-personal baseline families. Descriptive
  case titles remain intact, and cases were not combined merely to reduce counts.
  Historical timing ledgers intentionally retain the IDs that existed when measured.
  Unrelated suite-wide ID families remain outside this targeted rename.

## Concrete Wave 4 setup-sharing candidates

| Setup | Actual repeated work | Safe next step / invalidation requirements |
| --- | --- | --- |
| library-personal baseline | Five `createLibraryPersonalBaseline()` calls; each internally invokes whole-catalog `createBaseline()`, although subsequent assertions read different fields of the same report | Keep two independent full generations for determinism and working-tree checks. Other immutable consumers can use one validated result through group-local setup, with defensive copies/freeze and no dependency on prior assertion success. Invalidate if source, manifest, fixtures, builder or options change. |
| Add-on baseline | Two independent generations in its tool test; library report also rebuilds this underlying evidence | Do not replace independent determinism runs with the same cached object. Investigate extracting/reusing immutable build inputs only after proving input keys and read-only behavior. |
| API audit | Two synchronous `createAuditReport()` calls; it inventories current manifest/actions/source and compares rendered output to committed evidence | Preserve independent generations and drift assertions. Do not assume it accepts or uses the same report as the baseline tool. Profile its internal scans before adding a separate cache. |
| Add-on size determinism | Two fresh child processes; each rebuilds add-on metrics and core smoke bundles, reading the current checked-in baseline | Keep process-independent determinism/read-only assertions. Other tests that only inspect committed report fields are already cheap and do not justify a global mutable report cache. |
| All-add-on smoke | addons uses build-tools regular/release smoke; integration also exercises baseline smoke behavior | Different entry points/options/metadata contracts. Reuse only identical input/option bundles, never collapse release and regular mode or assume reports have interchangeable byte representations. |
| loadModule | Repeated compilation and fresh evaluation (870 calls in Wave 1) | Cache compiled output only if dependency/content/options/source-replacement keys are sound; retain fresh module evaluation, DOM initialization and independent exports. Do not cache initialized services. |

These are investigation inputs, not implemented caches. The current 45-second
real wait remains Wave 4's first priority. There is no claim that five fewer cases
or renumbering IDs by itself materially speeds the suite.

## Validation

All 268 cases passed across retained Masked + Direct groups, full addon-matrix,
full integration, addons, library-personal and addon-size groups. The 87 reviewed
numeric IDs are unique, and all 268 complete case titles are unique. Touched-test
lint, docs, inventory and diff checks passed.

The profiled focused process took 53.23 seconds including the intentionally
expensive report/tool groups. The scope comparable with Wave 2 has 205 cases
(previously 210) and 14.08 seconds summed test-body time (previously 13.46 seconds).
That small variation is not a demonstrated regression or optimization; do not
claim a speedup from this consolidation. Raw evidence:
`tests/.tmp/timing-wave3-focused.json` and `.log`.

The redirected PowerShell command again reported exit=1 on native stderr despite
the harness and timing JSON showing zero failures; explicit results were inspected.
No full-suite/CI-equivalent pass, distribution rebuild or report refresh is claimed.
