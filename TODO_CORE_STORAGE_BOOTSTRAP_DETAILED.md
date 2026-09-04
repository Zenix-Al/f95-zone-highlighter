# Core Storage Bootstrap and Schema Boundary TODO

## Objective

Replace the configuration service's implicit `loadConfig()`/`configReady`
boolean with one chronological storage bootstrap. The bootstrap must identify the
userscript manager's storage capabilities, initialize a fresh installation,
load or recover supported configuration, expose health diagnostics, and only
then permit core or add-on writes.

The immediate compatibility target is ScriptCat, where a fresh installation can
load runtime defaults while remaining permanently non-writable. Core settings
then visually revert and core-mediated add-on settings report `storage_error`.
The work must reproduce that behavior in ScriptCat itself before changing the
readiness contract.

## Confirmed issue

- On a fresh ScriptCat installation, core settings controls revert immediately.
- Masked + Direct Download settings can reach the core but fail with
  `Failed to save settings: storage error`.
- `loadConfig()` currently treats `defaults`, `migration-busy`, and
  `migration-failed` as the same not-ready condition.
- `ensureConfigReady()` cannot recover after the cached load promise settles.
- A fresh installation without a migration marker enters historical migration
  orchestration even though it has no historical data to migrate.
- The supplied fresh-install exports confirm that ScriptCat successfully wrote
  a structurally valid schema-1 canonical envelope at revision 1. The failure is
  therefore later than the first canonical write/read, not a total inability to
  use userscript storage.
- The ScriptCat export has no last-known-good backup and no migration-version
  marker, but retains an expired migration lock and a `migration-failed`
  recovery marker. The matching Tampermonkey export has a canonical envelope,
  last-known-good backup, migration-version 1, and no lock/recovery marker.
- The canonical payload sizes are effectively equivalent in both supplied
  exports, so the evidence does not currently support payload size as the
  primary cause.
- Setting readiness to `true` for every resolved load would hide the symptom but
  could allow defaults to overwrite recoverable configuration after a real
  storage or migration failure. That replacement is not an accepted fix.

## Accepted product decisions

- Storage initialization is an explicit required bootstrap concern, not a
  side-effect of the settings service.
- Runtime readability and persistent writability are separate capabilities.
- A fresh install receives its own initialization path and never runs the
  historical surface-key migration.
- Storage state is visible through feature health and bounded diagnostics.
- The next canonical configuration format increments from schema 1 to schema 2.
- The new release directly supports fresh schema 2 installations, existing
  schema 2 installations, and one migration from schema 1 to schema 2.
- Pre-schema/surface-key installations are no longer migrated by the current
  release. They fail closed and are instructed to run a documented bridge
  release first.
- Unsupported old data is never deleted, normalized, or replaced with defaults.
- The exact bridge release must be proven from repository/release evidence; it
  must not be guessed in source or UI text.
- Core configuration and core-mediated add-on storage use the same storage
  capability result and stable failure reasons.
- No generated distribution or version bump occurs until explicitly requested.

## Required invariants

1. No persistent write is allowed before storage bootstrap settles as writable.
2. A successful runtime-default load does not by itself prove persistence is
   writable.
3. A genuinely fresh install is distinguishable from an unsupported legacy
   install before either one writes canonical storage.
4. Fresh initialization is complete only after canonical write and read-back
   validation succeed.
5. Schema migration is complete only after canonical and backup verification.
6. A failed or interrupted migration leaves the previous supported data
   recoverable and does not report `ready`.
7. Unsupported pre-schema and future-schema data remain untouched.
8. A settled transient failure can be retried; a cached rejected/not-ready
   promise cannot poison the page for its lifetime.
9. Competing tabs cannot initialize or migrate the same storage concurrently.
10. Settings UI must not pretend a write succeeded and then silently revert.
11. Add-on storage must distinguish readiness, upgrade, capability, and actual
    write failures instead of collapsing all of them to `storage_error`.
12. Diagnostics never contain configuration values, add-on payloads, tokens, or
    complete storage contents.

## Proposed storage state contract

The exact module and property names remain subject to baseline evidence, but the
service must expose one immutable snapshot shaped around these states:

```js
{
  state: "ready",
  // idle | probing | initializing | loading | migrating | ready
  // | degraded-readonly | upgrade-required | unavailable
  source: "canonical",
  schemaVersion: 2,
  canRead: true,
  canWrite: true,
  usingFallback: false,
  requiresUpgrade: false,
  manager: "scriptcat",
  reason: "",
  startedAt: 0,
  settledAt: 0,
  attempt: 1
}
```

The manager name is diagnostic context, not a behavioral allowlist. Decisions
must be based on observed API capability and verified storage operations rather
than user-agent guessing.

## Startup classification

| Evidence | Required result |
| --- | --- |
| No canonical, backup, marker, or recognized historical data | Initialize a fresh schema 2 envelope |
| Valid schema 2 canonical | Load and become ready without writes |
| Invalid schema 2 canonical with valid schema 2 backup | Recover transactionally, then become ready |
| Valid schema 1 canonical or supported backup | Run the single schema 1 to 2 migration |
| Recognized surface/pre-schema data | `upgrade-required`; preserve all data |
| Canonical schema newer than 2 | Unsupported-newer/read-only; preserve all data |
| Storage probe cannot verify persistence | `unavailable` or `degraded-readonly` with a stable reason |
| Unknown corrupt data without valid backup | Fail closed; never initialize over it |

## Wave 1 — ScriptCat reproduction and storage baseline

### [x] CORE-STORAGE-SCRIPTCAT-BASELINE-01

- Trace current storage adapter selection and the exact GM APIs used by
  ScriptCat, Tampermonkey, and Violentmonkey.
- Add a focused manager-compatible harness for sync values, Promise-returning
  values, missing-key defaults, clone behavior, exceptions, and rejected
  operations.
- Record the exact fresh-install sequence for marker, lock, canonical, backup,
  caches, and readiness.
- Use the supplied `scriptcat-storage.json` and `tampermonkey-storage.json` as
  private diagnostic inputs to lock the observed structural difference. Tests
  and documentation must derive bounded fixtures and must not copy personal
  preference values from those exports.
- Instrument the boundary after canonical verification through backup write,
  second canonical verification, completion-marker write, and lock deletion.
  Capture the exact thrown/rejected operation in ScriptCat; do not infer it only
  from the final missing keys.
- Confirm whether ScriptCat exposes `GM.deleteValue`, whether it returns a
  Promise, and whether missing optional delete support currently turns lock
  release into a silent no-op.
- Reproduce the permanently false readiness state in automated tests where
  possible without changing runtime behavior.
- Trace one core setting save and one Masked + Direct Download core-mediated
  setting save to their final failure result.
- Record current source/bundle size and relevant test count.

Checkpoint: no runtime behavior changes. Install the unchanged diagnostic build
in ScriptCat and capture the bounded startup/save result. Stop if the reported
failure cannot be reproduced or its failing operation between canonical commit
and migration completion is still unknown.

## Wave 2 — Capability probe and normalized adapter results

### [x] CORE-STORAGE-CAPABILITY-PROBE-01

- Add a bounded probe using an isolated namespaced key: read absence, write a
  small nonce, read it back, and delete it.
- Verify cleanup; retain only a bounded health warning if cleanup fails.
- Normalize sync returns, Promise returns, thrown errors, rejected promises,
  false/undefined completion values, unsupported delete behavior, and cloning
  differences at the adapter boundary.
- Treat a missing delete API as an explicit capability result instead of the
  current optional-call success shape.
- Return stable capability/reason codes without exposing stored values.
- Do not special-case ScriptCat by name when verified behavior is sufficient.
- Test concurrent probes and ensure they cannot delete another tab's probe key.

Checkpoint: ScriptCat, Tampermonkey, and Violentmonkey complete the probe without
altering user configuration. Stop if ScriptCat requires manager-specific
semantics that cannot be safely normalized in the shared adapter.

## Wave 3 — Storage bootstrap state and health integration

### [x] CORE-STORAGE-BOOTSTRAP-01

- Create one storage bootstrap service that owns probe, classification,
  initialization/load/migration sequencing, retry, and the current snapshot.
- Expose one in-flight attempt to concurrent callers and allow a later explicit
  retry after a settled transient failure.
- Register a bounded diagnostics provider with `featureHealth`.
- Add a Storage health owner/status with stable `CONFIG_` or `STORAGE_` event
  codes and no configuration payloads.
- Add the service as a required/degraded-aware core bootstrap step before
  writable settings, feature reconciliation, and the add-on bridge are exposed.
- Keep the old settings persistence behavior behind the service until the
  subsequent cutover package.

Checkpoint: startup health shows the real storage state in all three managers,
but persistence format and compatibility behavior remain unchanged.

## Wave 4 — Fresh-install initialization

### [x] CORE-STORAGE-FRESH-INIT-01

- Classify a truly empty store before acquiring any historical migration lock.
- Build, persist, read back, and strictly validate a fresh canonical envelope.
- Keep cache initialization separate and recoverable; optional cache failure
  must not falsely imply canonical configuration failure.
- Become writable only after canonical persistence verification.
- Ensure a second tab observes the first tab's completed initialization instead
  of creating a competing envelope.
- Replace the current `defaults`-means-not-ready behavior with an explicit fresh
  initialization result.

Checkpoint: on a completely fresh ScriptCat profile, change a core checkbox,
reload, and verify persistence; then save and reload one Masked + Direct
Download setting. Do not proceed to schema retirement until both browser checks
pass.

## Wave 5 — Unified readiness and write gate

### [x] CORE-STORAGE-WRITE-GATE-01

- Replace the `configReady` boolean and `ensureConfigReady()` recursion with the
  storage bootstrap snapshot/capability contract.
- Queue writes only while initialization or a supported migration is actively
  progressing; reject terminal states immediately and specifically.
- Route core config commits, cache commits, config transfer commits, and
  core-mediated add-on storage through the shared gate where applicable.
- Preserve add-on-owned storage boundaries; do not move unrelated add-on data
  into the core config envelope.
- Return stable failures such as `storage_not_ready`, `storage_read_only`,
  `storage_unavailable`, `upgrade_required`, and `storage_write_failed`.
- Map those failures to actionable settings/add-on messages rather than a
  generic popup or silently reverted control.
- Ensure failed commits leave mounted controls synchronized with the last
  persisted state while explaining why the requested change was rejected.

Checkpoint: repeat fresh and existing-install saves in ScriptCat, Tampermonkey,
and Violentmonkey. Stop if any path can write while health reports non-writable.

## Wave 6 — Schema 2 and the one supported migration

### [x] CORE-STORAGE-SCHEMA-2-01

- Increment the canonical configuration schema from 1 to 2.
- Define the smallest necessary schema-1-to-2 migration even if the data shape
  is unchanged; the version boundary records the new bootstrap contract.
- Perform migration transactionally with previous-envelope backup, canonical
  write, strict read-back, and completion evidence.
- Make migration ownership safe across tabs and recover stale ownership after a
  bounded lease.
- Recover from a valid supported backup when canonical migration is interrupted.
- Keep future schema versions read-only and untouched.
- Add fixtures for current schema 1, valid backup recovery, interruption at
  every write/verification boundary, concurrent tabs, and schema newer than 2.

Checkpoint: update an existing schema-1 installation in each supported manager
and confirm settings/add-on persistence after reload. No historical migration
code is removed yet.

## Wave 7 — Historical migration retirement and upgrade guard

### [x] CORE-STORAGE-LEGACY-GUARD-01

- Identify and document the exact released bridge version that converts the
  historical surface-key layout into a valid schema-1 canonical envelope.
- Remove the historical transform, surface-key merge, cleanup writes, and its
  migration lock path only after the bridge evidence is recorded.
- Retain a minimal read-only detector for recognized pre-schema/surface-key
  installations.
- Return `upgrade-required` before defaults, canonical config, caches, markers,
  add-on state, or cleanup keys are written.
- Present a blocking startup/settings notice explaining that data was preserved
  and the user must install/open the bridge release once before returning.
- Keep safe diagnostics and any proven non-mutating export/recovery path
  available; block features and add-on mutations that depend on configuration.
- Test direct jumps from recognized historical layouts, historical data beside
  an absent/corrupt canonical envelope, successful bridge completion, and a
  subsequent schema-1-to-2 migration.

Checkpoint: browser-test a disposable historical fixture. Confirm the current
release writes nothing, shows the correct bridge instruction, and accepts the
same profile only after the bridge release has run. Stop if the exact bridge
release or legacy detector cannot be proven.

## Wave 8 — Feature Health storage integration and recovery actions

### [x] CORE-STORAGE-HEALTH-INTEGRATION-01

- Keep Feature Health as the sole general diagnostic surface. Do not create a
  separate storage dashboard, storage modal, or duplicate health section owned
  by the storage service.
- Feed the existing Storage health owner/provider with state, source, schema,
  readable/writable capability, manager context, bounded reason, failed step,
  and last-attempt time. Continue excluding configuration values, storage keys,
  probe nonces, and add-on payloads.
- Map storage states into the existing Feature Health severity and lifecycle
  model so `ready`, transient failure, degraded read-only, `upgrade-required`,
  and unsupported-newer states are distinguishable in the normal health report.
- Refresh Feature Health from storage snapshot changes through its existing
  update path, without requiring the settings modal to reopen and without
  adding duplicate listeners or a second state store.
- Mark ordinary settings controls read-only when storage is not writable and
  retain the last persisted value. Their inline failure text should point users
  to Feature Health for diagnostics instead of reproducing the complete health
  report in settings UI.
- Add recovery actions only through an existing Feature Health action mechanism
  if one is already available and bounded. Otherwise retain the service-level
  retry API for a later shared Feature Health action package; do not invent a
  storage-only action framework.
- Expose Retry only for a settled transient capability/bootstrap failure. Never
  present Retry for `upgrade-required`, unsupported-newer, or unknown corrupt
  storage as though those states were transient.
- Keep the Wave 7 blocking upgrade notice as the sole exceptional presentation:
  it is an actionable startup guard, not a second health UI. It must use the
  proven bridge instructions and remain available when normal feature loading
  is blocked.
- Do not add reset or destructive recovery controls in this wave. A reset needs
  its own evidence, exact storage scope, confirmation contract, and recovery
  tests before it can be proposed.

Checkpoint: every storage state appears accurately in Feature Health, settings
cannot silently revert, transient retry remains correctly bounded, and no new
storage-specific diagnostic UI exists.

## Wave 9 — Compatibility cleanup

### [x] CORE-STORAGE-COMPAT-CLEANUP-01

- Remove obsolete readiness flags, duplicate migration status interpretation,
  unreachable recovery branches, and retired fixtures only after parity tests
  pass.
- Keep config transfer format migration separate from persisted-storage schema
  migration.
- Verify settings UI preferences, catalog caches, add-on registry/state,
  Library IndexedDB, and other independently owned storage are not accidentally
  classified as core canonical configuration.
- Update config architecture, storage recovery, bootstrap, observability, and
  add-on error-contract documentation.
- Record the permanent schema-1 bridge boundary and the separately retired
  pre-schema bridge release.

Checkpoint: one bootstrap path and one write gate are authoritative; no second
readiness or historical migration path remains.

## Wave 10 — Verification and release evidence

### [ ] CORE-STORAGE-VERIFY-01

- Test fresh install, schema-2 load, schema-1 migration, valid-backup recovery,
  recognized pre-schema direct jump, corrupt unknown data, future schema,
  denied storage, quota/write failure, read-back mismatch, delete failure,
  timeout, and retry.
- Test simultaneous startup and writes across at least ten tabs.
- Test interruption at every initialization and migration transition.
- Verify core settings, config transfer, cache writes, and representative
  core-mediated add-on storage behavior.
- Perform clean-profile and existing-profile browser smoke tests in ScriptCat,
  Tampermonkey, and Violentmonkey.
- Run lint, focused storage/config/add-on tests, the full suite, inventory and
  baseline checks, core size audits, smoke build, and `git diff --check`.
- Update changelog and release evidence only after all mandatory browser gates
  pass.

Checkpoint: implementation is release-ready. Distribution generation and the
version bump remain a separate explicit release action.

## Explicit non-goals

- No general-purpose unbounded migration framework.
- No automatic destructive reset of unsupported or corrupt storage.
- No manager-name allowlist used in place of capability verification.
- No migration of Library IndexedDB or add-on-owned schemas as part of the core
  configuration schema bump.
- No storage-value dumps in health reports.
- No release build or version bump during implementation packages unless the
  user requests it separately.
