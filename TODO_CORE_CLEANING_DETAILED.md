# Core-Only Lean Cleanup and Size Reduction Plan

This is a standalone execution plan for **core cleanup only**. It extracts the non-add-on work from `TODO_NEXT_DETAILED.md`, adds the requested zero-migration and metrics-removal decisions, and turns the remaining size investigation into bounded implementation packages.

Prepared against the repository `main` branch inspected on **2026-07-13**.

The current release size of **approximately 480 KB** is a user-reported baseline. The first package below creates a reproducible local measurement before any reduction claim is accepted.

---

## Scope decision

### Included

- `src/config/**`
- `src/core/**`, except changes whose purpose is the add-on runtime
- non-add-on modules under `src/services/**`
- non-add-on modules under `src/features/**`
- core settings and UI under `src/ui/**`
- core build/audit tooling under `scripts/**` and `build.js`
- core tests and contributor documentation

### Explicitly excluded

Do not modify these paths or contracts in this plan:

- `addons/**`
- `addons/addons.manifest.json`
- `addons/build-addon.js`
- `src/services/addons/**`
- `src/services/addonsService.js`
- `src/services/addons/trusted-catalog.json`
- add-on bridge actions, scopes, capabilities, throttling, catalog, trust, or registration
- add-on cards, add-on lifecycle UI, or add-on-specific CSS
- `ADDON-*`, `SITE-REPAIR-*`, `CORE-ACTIONS-02`, and `CORE-FACADE-01`
- add-on portions of `CORE-BOILERPLATE-01`, `BUILD-TOOLS-01`, and `CORE-SIZE-GATE-01`
- moving Latest Ajax Error Recovery into Site Repair

`src/features/latest-ajax-error-recovery/**` remains untouched in this core-only pass because its planned removal depends on add-on work. Record its bundle contribution separately, but do not partially migrate or duplicate it.

---

## Fixed design decisions

### 1. Evidence-backed one-time storage migration

The previous unconditional zero-migration decision is superseded for the release-blocking configuration recovery incident. Retain only evidence-backed, one-time, marker-gated migrations for real released storage layouts. The normal post-migration startup path must not inspect legacy storage or execute migration transforms.

The following obsolete field-cleanup lists are not permanent migration stages:

```js
const LEGACY_THREAD_SETTINGS_KEYS = Object.freeze([
  "skipMaskedLink",
  "directDownloadLinks",
  "directDownloadPackages",
  "directDownloadHealth",
]);

export const LEGACY_STORAGE_KEYS = Object.freeze(["minVersion"]);
```

The restored migration is intentionally bounded to the historical surface-level layout proven by Git history and `config-ref.json`, including pre-envelope installations that stored the complete raw config object at `f95ue:config` or its backup key. It also separates `tags` and `prefixes` into cache keys, drops removed metrics/transient fields, verifies the canonical write, and sets one migration-generation marker only after success. Cleanup is a best-effort post-verification step over the explicit historical key list; unknown keys remain untouched.

After the supported historical installations have migrated, or after an explicit compatibility-breaking release decision, remove `src/services/configMigrationService.js`, the bounded source list, marker handling, and migration tests together. Do not remove it while released installations can still be at the pre-canonical surface-key layout.

**Important:** zero migration steps does **not** mean changing the persisted envelope schema version from `1` to `0`. Existing canonical envelopes already use schema version `1`; lowering it would make valid version-1 data look like unsupported future data.

Use these separate concepts:

```js
export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_MIGRATIONS = Object.freeze([]);
export const CONFIG_MIGRATION_COUNT = 0;
```

A current version-1 envelope with the current migration marker uses the fast path. Unsupported older envelope versions still recover from backup or enter the bounded historical migration path only when the marker is absent or old.

### 2. Config persistence constants belong in `src/config/`

Create a narrow config-owned persistence contract, preferably:

```text
src/config/persistence.js
```

It owns:

- `CONFIG_SCHEMA_VERSION`;
- canonical storage key names;
- the empty migration registry/count;
- pure helpers that answer whether a persisted envelope version is current or supported.

It must not own storage I/O, health reporting, live-config mutation, or DOM behavior.

Recommended shape:

```js
export const CONFIG_STORAGE_KEYS = Object.freeze({
  current: "f95ue:config",
  backup: "f95ue:config:last-known-good",
  recovery: "f95ue:config:recovery",
});

export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_MIGRATIONS = Object.freeze([]);
export const CONFIG_MIGRATION_COUNT = CONFIG_MIGRATIONS.length;
```

`CONFIG_WRITER_ID` remains runtime/session state and does not belong in the static config contract.

### 3. Remove core metrics

Remove the experimental persisted metrics stack entirely:

- `src/services/metricsService.js`;
- `defaultMetrics`;
- `config.metrics`;
- the metrics schema descriptor;
- metrics persistence calls;
- metrics UI or toast rendering;
- metrics import/export/sync handling;
- metrics tests and documentation.

Existing persisted `metrics` data is ignored by tolerant sanitization. It is not migrated and does not invalidate valid sibling configuration.

Retain bounded framework health/error diagnostics. `featureHealth` and structured failure events are correctness and support mechanisms, not the experimental performance counters being removed here.

### 4. Tolerant load must preserve valid siblings

After removing `metrics` and legacy fields, old version-1 envelopes can contain now-unknown properties. Tolerant load must:

1. validate the envelope structure and schema version;
2. sanitize `data`;
3. keep all valid known values;
4. drop unknown or invalid fields from the in-memory result;
5. return structured sanitization issues;
6. report degraded/sanitized load once;
7. avoid rewriting storage during load.

A schema-version mismatch remains fatal. Unknown data fields are recoverable sanitization issues, not whole-envelope corruption.

### 5. Size reduction means bundle reduction

Moving a file, splitting a large module, renaming symbols, or changing formatting does not count as a size win.

Every reduction package must report:

- authored source bytes;
- readable release userscript bytes;
- uglified/minified userscript bytes;
- gzip bytes for comparison only;
- largest module contributors from an esbuild metafile;
- before/after deltas.

Do not weaken validation, cancellation, teardown, security, or health reporting merely to reduce bytes.

---

## Global definition of done

A package is complete only when all applicable items pass:

- [x] Only core-scoped paths were edited.
- [x] `git diff --name-only` contains no excluded add-on path.
- [x] `npm run lint` passes.
- [x] `npm run test` passes.
- [x] `git diff --check` passes.
- [x] Generated manifests are unchanged or regenerated through the documented generator.
- [x] Core smoke builds do not bump `version.json`.
- [x] Core smoke builds do not modify tracked `dist/` files.
- [x] Before/after source and bundle measurements are included.
- [x] Removed config fields do not erase valid sibling settings.
- [x] No new compatibility shim, wrapper, registry, or abstraction is added without a current caller.
- [x] Documentation is updated only where the core contract changed.

---

## CORE-CONFIG-MIGRATION-RECOVERY-01 — Restore historical configuration safely and isolate regenerable storage

**Status:** release-blocking investigation and implementation package; complete before resuming any later cleanup.

- [x] Verify the historical surface-key lineage against `10a0e54`, `e51cf89`, `b1f737f`, current source, and `config-ref.json`.
- [x] Restore a bounded, one-time, marker-gated migration service.
- [x] Recover explicit surface preferences without importing metrics, transient events, or unknown keys.
- [x] Preserve add-on state through owned normalization and section-specific merge rules.
- [x] Move tags and prefixes to separate cache keys without putting catalogs in canonical or backup envelopes.
- [x] Verify canonical, backup, cache, and marker writes before completion; retain source data until verification.
- [x] Add startup readiness protection so pre-load saves cannot write default-heavy config.
- [x] Keep marked fast startup free of legacy scans, migration transforms, and config/cache writes.
- [x] Cover real-world, synthetic-bloat, write/read-back/marker/cleanup failures, cache isolation, concurrency, readiness, and idempotency tests.
- [x] Document ownership, disposition, recovery, removal boundary, storage measurements, and remaining risks.
- [x] Run the global definition of done and leave later cleanup packages paused.

## CORE-CONFIG-INTERACTION-REGRESSION-02 - Restore responsive tag editing and deterministic Latest Overlay lifecycle

**Status:** release-blocking regression package; later TODO cleanup packages remain paused until this package passes.

**Behavior references:** `c9426f8`, `f9dd404`, `e51cf89`, and the current working branch.

### Regression boundary

Preserve the framework hardening validation, atomic persistence, revisioning, backup recovery, synchronization, and shared config-change application work. Restore the pre-regression interaction contract without reverting the broader hardening changes or introducing a second persistence architecture.

### Required implementation and acceptance criteria

- [x] Reproduce stale tag rendering, lost rapid tag operations, and Latest Overlay off/on lifecycle failures with focused tests.
- [x] Provide one serialized `updateConfig(updater, options)` repository API that builds drafts from the latest committed config and commits them through the existing persistence boundary.
- [x] Make add, remove, reorder, and cross-list tag mutations await the shared update API before rendering or reporting success.
- [x] Route tag-list effects through shared config metadata; remove duplicate manual tag effect triggering.
- [x] Register dialog-owned Latest Overlay and Thread Overlay config metadata so toggles and settings use the shared effect path.
- [x] Ensure rapid Latest Overlay transitions settle to the final requested state and cleanly release lifecycle resources.
- [x] Keep fetched tags/prefixes in dedicated cache keys and keep small tag-list updates out of cache/catalog writes.
- [x] Serialize concurrent config writes without lost updates or duplicate revision races.
- [x] Measure small tag-list and catalog updates for 10, 1,000, and 10,000 tags plus representative prefix categories.
- [x] Document the root cause, update contract, effect ownership, persistence activity, measurements, and remaining compatibility boundary.
- [x] Run package tests and the global definition of done; do not begin later cleanup packages.

---

## Required execution order

### Wave 0 — Establish the real baseline

1. `CORE-LEAN-BASE-01`

### Wave 1 — Remove requested legacy weight

These may run in parallel after the baseline:

- `CORE-CONFIG-STORAGE-01`
- `CORE-METRICS-REMOVE-01`

### Wave 2 — Finish existing core ownership cleanup

- `CORE-TRANSFER-LEAN-01` after the Wave 1 config contract stabilizes

### Wave 3 — Measured pruning

Run in this order so later audits see the simplified graph:

1. `CORE-DEAD-CODE-01`
2. `CORE-UI-ASSET-01`
3. `CORE-CONFIG-RUNTIME-LEAN-01`

### Wave 4 — Documentation and budget

1. `CORE-DOCS-01`
2. `CORE-SIZE-GATE-01`

---

# Work packages

## CORE-LEAN-BASE-01 — Add a deterministic core source and bundle audit

**Priority:** Critical  
**Depends on:** None  
**Primary files:** new `scripts/core-source-audit.cjs`, `build.js`, `package.json`, new baseline JSON, `docs/architecture/core-size-baseline.md`, tests

### Agent execution command

> Execute `CORE-LEAN-BASE-01` only. Measure the current core without moving production modules or touching add-on paths.

### Objective

Replace the approximate 480 KB observation with a reproducible baseline that shows what actually contributes to source and bundle size.

### Required implementation

- [x] Add a deterministic authored-source audit for:
  - `src/config/**`;
  - `src/core/**`;
  - non-add-on `src/services/**`;
  - non-add-on `src/features/**`;
  - non-add-on `src/ui/**`.
- [x] Exclude:
  - `src/services/addons/**`;
  - `src/services/addonsService.js`;
  - add-on UI modules identified by ownership;
  - `src/generated/**`;
  - `dist/**`;
  - test fixtures and vendored/generated data.
- [x] Report:
  - file count;
  - physical lines;
  - nonblank/noncomment lines;
  - bytes by top-level area;
  - largest files;
  - import fan-in/fan-out;
  - cycles;
  - cross-boundary imports;
  - unreferenced exports/files as review hints.
- [x] Add an esbuild analysis mode using `metafile: true`.
- [x] Report bundled input contribution by source file.
- [x] Add a non-mutating core smoke-build mode:
  - temporary output directory;
  - no version bump;
  - no tracked `dist/` write;
  - regular/readable and release/uglified outputs;
  - stable JSON size report.
- [x] Add package scripts such as:
  - `audit:core`;
  - `build:core:smoke`;
  - `check:core`.
- [x] Keep timestamp and machine-specific absolute paths out of stable JSON.
- [x] Record the user-reported 480 KB value separately from the measured result.

### Required tests

- [x] Repeated audits on unchanged source produce byte-identical JSON.
- [x] Generated and add-on files do not affect core authored totals.
- [x] A fixture cycle is reported deterministically.
- [x] A fixture orphan export is reported as a hint, not automatically deleted.
- [x] Smoke build leaves `version.json`, `dist/`, and the working tree unchanged.
- [x] Bundle report includes readable, uglified, and gzip byte counts.

### Acceptance criteria

- [x] The largest core contributors are visible by source and bundled bytes.
- [x] The report can compare two baselines and show deltas.
- [x] No production behavior changes in this package.
- [x] No arbitrary maximum-lines-per-file rule is introduced.

---

## CORE-CONFIG-STORAGE-01 — Move persistence definitions to config and remove all legacy migration paths

**Priority:** Critical  
**Depends on:** `CORE-LEAN-BASE-01`  
**Primary files:** new `src/config/persistence.js`, `src/config/schema.js`, `src/config.js`, `src/services/settingsService.js`, `src/services/configMigrationService.js`, storage tests

### Agent execution command

> Execute `CORE-CONFIG-STORAGE-01` only. Keep canonical version-1 envelope loading, backup recovery, atomic commits, and synchronization behavior. Remove targeted and per-key legacy migration behavior entirely.

### Objective

Make config ownership explicit while deleting obsolete migration code, duplicated legacy allowlists, and legacy storage reads.

### Required implementation

- [x] Create `src/config/persistence.js`.
- [x] Move `CONFIG_SCHEMA_VERSION` from schema ownership to the persistence contract.
- [x] Move canonical storage key names from `settingsService` to the persistence contract.
- [x] Export an empty immutable migration registry and count.
- [x] Update imports through the config barrel only where that remains clear and cycle-free.
- [x] Delete:
  - `LEGACY_THREAD_SETTINGS_KEYS`;
  - `LEGACY_STORAGE_KEYS`;
  - `LEGACY_MIGRATION_KEYS`;
  - `migrateLegacyConfigPayload`;
  - the v0-to-v1 migration;
  - legacy per-section key reads;
  - legacy per-section cleanup/deletion;
  - `LEGACY_CONFIG_KEYS`;
  - migration-only validation exceptions.
- [x] Delete `src/services/configMigrationService.js` when no current caller remains.
- [x] Remove migration orchestration from `settingsService`.
- [x] Preserve canonical envelope validation, backup recovery, atomic commit, revision, writer, and change-application behavior.
- [x] Change tolerant stored-data handling so unknown/invalid fields sanitize without invalidating valid siblings.
- [x] Return a structured result such as:
  - `status: "loaded"`;
  - `status: "sanitized"`;
  - `status: "recovered"`;
  - `status: "defaults"`.
- [x] Do not persist the sanitized result during load.
- [x] Treat missing canonical storage as a clean first run, even when obsolete standalone keys happen to exist.
- [x] Treat schema version `0` as unsupported rather than silently converting it.
- [x] Keep transfer-document normalization separate from persisted-envelope migration.

### Required tests

- [x] A valid version-1 canonical envelope loads with zero migration calls.
- [ ] A version-1 envelope containing `metrics` preserves all valid known sibling fields and drops only `metrics`.
- [x] A version-1 envelope containing old root/thread keys preserves valid siblings and drops the unknown keys.
- [x] Sanitized load emits one bounded health event and performs no storage write.
- [x] A version-0 envelope uses valid backup or defaults; no migration runs.
- [x] Missing canonical data loads defaults even when obsolete standalone keys exist.
- [x] Current canonical corruption still recovers from last-known-good.
- [x] Atomic commit and revision tests continue to pass.
- [x] `rg` finds none of:
  - `LEGACY_STORAGE_KEYS`;
  - `LEGACY_THREAD_SETTINGS_KEYS`;
  - `LEGACY_MIGRATION_KEYS`;
  - `migrateLegacyConfigPayload`;
  - the four removed direct-download thread keys in core migration code.
- [x] `CONFIG_MIGRATION_COUNT === 0`.
- [x] `CONFIG_SCHEMA_VERSION === 1`.

### Acceptance criteria

- [x] Persistence keys and version policy are defined under `src/config/`.
- [x] No legacy storage or targeted legacy-shape migration remains.
- [x] Existing valid version-1 settings survive removal of obsolete fields.
- [x] Load performs no hidden cleanup write.
- [x] `settingsService` is materially smaller.

### Scope guardrails

- Do not reset the envelope schema version to zero.
- Do not weaken strict commit validation.
- Do not move storage I/O into `src/config/`.
- Do not change sync conflict ordering or import document formats.
- Do not add a generic migration framework for hypothetical future use.

---

## CORE-METRICS-REMOVE-01 — Remove experimental persisted metrics from core

**Priority:** High  
**Depends on:** `CORE-LEAN-BASE-01`; coordinate stored-data behavior with `CORE-CONFIG-STORAGE-01`  
**Primary files:** `src/services/metricsService.js`, `src/config/defaults.js`, `src/config/schema.js`, callers, UI, tests, README/docs

### Agent execution command

> Execute `CORE-METRICS-REMOVE-01` only. Remove experimental counters and their persistence surface. Keep bounded framework health/error diagnostics.

### Objective

Delete unused experimentation code and prevent image/retry activity from causing config writes.

### Required implementation

- [x] Run repository-wide searches for:
  - `metricsService`;
  - `recordSuccess`;
  - `recordFail`;
  - `defaultMetrics`;
  - `config.metrics`;
  - `metrics:`;
  - metric labels in UI templates and CSS.
- [x] Delete `src/services/metricsService.js`.
- [x] Remove `defaultMetrics` and its exports.
- [x] Remove the `metrics` config schema section.
- [x] Remove `metrics` from default config assembly.
- [x] Remove all metric update calls and update-toast coupling.
- [x] Remove metric-only UI elements, CSS, selectors, and tests.
- [x] Remove metric import/export/sync assumptions.
- [x] Ensure a removed metric field in existing canonical data is treated as a recoverable unknown field by tolerant load.
- [x] Verify no event path persists config merely to record a success/failure counter.
- [x] Keep:
  - structured feature health;
  - bounded error retention;
  - bootstrap/route correlation;
  - failure events required by lifecycle and security tests.

### Required tests

- [x] Default config has no `metrics` key.
- [x] Exported config has no `metrics` key.
- [x] Synced paths have no `metrics` path.
- [x] Existing version-1 data containing metrics loads valid sibling settings.
- [x] No storage write occurs after the former metric-producing event.
- [x] UI initialization succeeds with no metric DOM or metadata.
- [x] No import remains for the deleted service.
- [x] Lint catches any stale `config.metrics` reference.

### Acceptance criteria

- [x] The metrics service, schema, defaults, calls, UI, and docs are gone.
- [x] Existing user configuration is not reset.
- [x] Core health diagnostics remain intact.
- [x] Before/after source and bundle deltas are recorded.

---

## CORE-TRANSFER-LEAN-01 — Finish Config Transfer as a service plus UI adapter

**Priority:** High  
**Depends on:** `CORE-CONFIG-STORAGE-01`, `CORE-METRICS-REMOVE-01`  
**Primary files:** `src/services/configTransferService.js`, new `src/services/configTransfer/**`, `src/features/config-transfer/**`, new `src/ui/configTransfer/**`, `src/ui/settings/globalSettings.js`, generated feature manifest, tests

### Agent execution command

> Execute `CORE-TRANSFER-LEAN-01` only. Remove feature-layer ownership and duplicate helpers without changing the current import/export user flow.

### Objective

Remove the service-to-feature dependency inversion and eliminate the unnecessary feature lifecycle wrapper around a settings action.

### Target ownership

- `src/services/configTransfer/**`
  - transfer document format;
  - serialization;
  - current supported normalization;
  - schema orchestration;
  - preview/diff;
  - commit coordination.
- `src/ui/configTransfer/**`
  - file picker;
  - Blob/object URL lifecycle;
  - download;
  - dialog/controller;
  - inline errors and reload prompt.
- `src/ui/settings/globalSettings.js`
  - only contributes the button/action opening the controller.

No `src/features/config-transfer/**` folder remains.

### Required implementation

- [x] Move `normalizeImportRoot`/transfer-only domain helpers into `src/services/configTransfer/**` (the current equivalent normalization helpers are now there).
- [x] Remove duplicated generic config validation and use `src/config/schema.js`.
- [x] Keep service functions DOM-free and runnable in Node.
- [x] Keep browser file I/O out of the service.
- [x] Keep preview and commit separate.
- [x] Revalidate the exact candidate at commit time.
- [x] Commit through the existing atomic config application path.
- [x] Move dialog/error behavior into `src/ui/configTransfer/**`.
- [x] Revoke object URLs and remove temporary inputs/listeners on success, cancel, close, and teardown.
- [x] Remove feature registration, lifecycle metadata, and generated-manifest entry.
- [x] Remove stale feature-owned files and imports.
- [x] Do not introduce persisted-storage migration logic here.
- [x] Review legacy transfer-document support separately:
  - retain only behavior currently covered by a public compatibility test;
  - do not add new migration layers;
  - record the byte cost of each retained format path.

### Required tests

- [x] Service imports nothing from `src/features/**` or `src/ui/**`.
- [x] UI imports the service, never the reverse.
- [x] Config Transfer is absent from generated feature discovery.
- [x] Export contains only schema-exportable keys and is detached from live config.
- [x] Preview does not mutate live config.
- [x] Commit failure leaves live and persisted config unchanged.
- [x] Successful commit applies effects once.
- [x] File cancel/close removes temporary DOM and listeners.
- [x] Current documented import format still works.
- [x] Existing supported legacy transfer fixtures remain tested.

### Acceptance criteria

- [x] No `src/features/config-transfer/**` folder remains.
- [x] The transfer domain is DOM-free and feature-free.
- [x] The UI flow remains available from global settings.
- [x] The bundle delta is measured; a pure file move is not reported as a win.

---

## CORE-DEAD-CODE-01 — Remove proven unreachable core code and compatibility wrappers

**Priority:** High  
**Depends on:** `CORE-TRANSFER-LEAN-01`  
**Primary files:** findings from `scripts/core-source-audit.cjs`, non-add-on `src/**`, tests

### Agent execution command

> Execute `CORE-DEAD-CODE-01` only. Delete code only when static reachability plus a repository-wide search and tests show that it has no runtime or documented public caller.

### Objective

Remove orphan modules, exports, wrappers, and duplicate helpers left after repeated architecture migrations.

### Required implementation

- [x] Produce an audit list grouped as:
  - unreachable file;
  - unused export;
  - compatibility re-export;
  - duplicate pure helper;
  - stale generated-manifest reference;
  - dead CSS/HTML identifier.
- [x] Check dynamic access before deletion:
  - generated feature exports;
  - string action IDs;
  - event names;
  - settings metadata paths;
  - HTML/CSS IDs and classes;
  - userscript globals.
- [x] Delete only entries with an explicit evidence note.
- [x] Prefer deleting a wrapper over adding another barrel.
- [x] Remove empty folders and stale documentation references.
- [x] Keep any public compatibility export that is still documented or tested.
- [x] Do not inspect or alter excluded add-on paths.

### Required tests

- [x] Audit fixtures distinguish static import usage from string/event usage.
- [x] Generated feature manifest check passes.
- [x] Main bootstrap and every core feature registration still load.
- [x] No deleted symbol is referenced by source, tests, docs, or generated output.
- [x] Build smoke passes with no unresolved imports.

### Acceptance criteria

- [x] Every deletion has reachability evidence.
- [x] No speculative helper consolidation is mixed into the package.
- [x] Source and bundle reductions are both reported.
- [x] Behavior remains unchanged.

---

## CORE-UI-ASSET-01 — Prune and consolidate core CSS and HTML with selector evidence

**Priority:** Medium/High  
**Depends on:** `CORE-DEAD-CODE-01`  
**Primary files:** `src/ui/assets/css.css`, `src/ui/assets/ui.html`, core UI renderers/components, selector audit script, tests

### Agent execution command

> Execute `CORE-UI-ASSET-01` only. Remove or consolidate styles/templates only when selector usage is proven. Do not touch add-on-owned UI or styles.

### Objective

Reduce the largest obvious static core asset without using unsafe regex purging or visual redesign.

### Investigation targets

The current CSS contains visible consolidation opportunities such as repeated selector blocks and comments describing earlier consolidation. Treat these as audit leads, not automatic deletions.

Inspect at minimum:

- repeated `.tag-chip` and drag-state declarations;
- repeated `#search-results` blocks;
- repeated button colors, borders, radius, hover states, and typography;
- repeated input/select focus rules;
- obsolete modal/dialog selectors;
- feature-health selectors versus current diagnostics DOM;
- classes created only by removed metrics or Config Transfer feature code;
- desktop/mobile rules that override identical declarations;
- CSS comments that survive the authored source but are stripped only during build.

### Required implementation

- [x] Add a selector inventory using:
  - static `ui.html`;
  - JS `className`, `classList`, `id`, selectors, and templates;
  - settings-renderer-generated identifiers;
  - documented dynamic selector allowlist.
- [x] Report:
  - definitely used;
  - dynamically used;
  - duplicate selector blocks;
  - conflicting declarations;
  - unreferenced candidates.
- [x] Add UI characterization screenshots or DOM/style assertions for critical surfaces before large edits.
- [x] Merge exact duplicate rules.
- [x] Consolidate repeated tokens through existing CSS variables only when output shrinks.
- [x] Remove dead selectors after runtime fixture coverage.
- [x] Remove metric-only and obsolete Config Transfer feature styles.
- [x] Remove dead static HTML elements and attributes.
- [x] Measure both authored CSS/HTML and final bundle deltas.
- [x] Revert any abstraction that increases the final bundle without a maintainability benefit.

### Required tests

- [x] Settings modal opens and renders all current core sections.
- [x] Tag search, chips, drag states, color controls, toast, dock, dialogs, and feature-health UI retain required classes and behavior.
- [x] Mobile breakpoint fixtures retain usable controls.
- [x] Dynamic selector allowlist is explicit and tested.
- [x] No add-on selector is removed or changed.
- [x] CSS selector audit is deterministic.

### Acceptance criteria

- [x] Every removed selector is proven unused.
- [x] Duplicate rules are materially reduced.
- [x] No visual redesign is hidden as cleanup.
- [x] Final userscript size decreases or the change is justified solely by removal of correctness risk.

### Scope guardrails

- Do not replace CSS with large JS style objects.
- Do not generate static HTML in JavaScript merely to reduce an HTML file.
- Do not purge selectors based only on literal grep.
- Do not touch add-on mount templates or add-on-specific styling.

---

## CORE-CONFIG-RUNTIME-LEAN-01 — Reduce schema and settings runtime overhead without weakening contracts

**Priority:** Medium  
**Depends on:** `CORE-CONFIG-STORAGE-01`, `CORE-DEAD-CODE-01`  
**Primary files:** `src/config/schema.js`, `src/config/defaults.js`, `src/services/settingsService.js`, config tests

### Agent execution command

> Execute `CORE-CONFIG-RUNTIME-LEAN-01` only after the bundle metafile identifies config/schema code as a meaningful contributor. Keep strict commit/import validation and tolerant loading behavior.

### Objective

Remove duplicated runtime structures and migration-only branches from the config stack while preserving its validation guarantees.

### Required investigation

Measure before editing:

- whether both `PATH_INDEX` and `METADATA_INDEX` are needed;
- whether descriptor default values and the separate `DEFAULTS` object duplicate shipped data;
- whether metadata lookup scans can use one immutable index;
- whether migration mode remains used after zero-migration cleanup;
- repeated schema-builder patterns that can be factored smaller in the emitted bundle;
- duplicate clone/record/issue helpers across config services;
- settings-service branches made unreachable by removal of legacy loading and metrics.

### Required implementation

- [x] Delete migration-only schema behavior with no current transfer or persistence caller.
- [x] Remove an index only when all public schema APIs remain deterministic.
- [x] Consolidate helpers only when at least three equivalent call sites exist or emitted code becomes smaller.
- [x] Keep defaults, schema constraints, and metadata coverage tests.
- [x] Keep exact-path validation issues.
- [x] Keep strict unknown-key rejection for commits/import.
- [x] Keep tolerant sibling preservation for stored data.
- [x] Avoid splitting files merely to lower per-file line counts.
- [x] Revert source-only “cleanup” that increases bundle size without a correctness benefit.

### Required tests

- [x] Every persistent default retains schema coverage.
- [x] Default values validate.
- [x] Strict mode rejects unknown and malformed nested fields.
- [x] Tolerant mode preserves valid siblings.
- [x] Exportable/syncable metadata remains correct.
- [x] Path metadata lookup handles arrays and wildcard object keys.
- [x] Atomic commit/load/recovery tests remain unchanged.
- [x] Before/after benchmark and bundle reports are attached.

### Acceptance criteria

- [x] Validation behavior is unchanged except intentional removal of legacy/metrics fields.
- [x] At least one duplicated runtime structure or unreachable branch is removed.
- [x] The bundle does not grow.
- [x] No validation dependency is added.

---

## CORE-DOCS-01 — Correct core ownership and remove stale maintenance instructions

**Priority:** Medium  
**Depends on:** preceding implementation packages  
**Primary files:** `readme.md`, `AGENTS.md`, core architecture docs, TODO/status indexes

### Agent execution command

> Execute `CORE-DOCS-01` only. Update core documentation to match merged code; do not rewrite add-on documentation or contracts.

### Required implementation

- [x] Remove `metrics` from the core service/repository map.
- [x] Document `src/config/persistence.js` and zero migration steps.
- [x] State that removed unknown fields are sanitized without a load-time rewrite.
- [x] Document that Config Transfer is a service plus UI adapter, not a feature.
- [x] Remove instructions to update feature-owned config-transfer validation.
- [x] Remove stale instructions to manually maintain `crossTabKeys` when schema metadata is authoritative.

## CORE-CONFIG-SYNC-REMOVE-01 — Remove unreleased core configuration synchronization

Status: completed in the current branch.

- Removed the unreleased core `enableCrossTabSync` setting, listener grants, sync service,
  synchronization metadata, UI control, and remote effect replay tests.
- Kept schema version `1`, zero schema migration steps, revision/writer metadata, atomic commits,
  backup recovery, and tolerant sibling-preserving sanitization.
- Existing version-1 data containing `globalSettings.enableCrossTabSync` is dropped from the
  in-memory candidate without a marked-load storage rewrite; no replacement migration framework
  was added.
- Retained add-on-owned manager transports, including masked-direct-addon value listeners, outside
  the core configuration boundary.
- [x] Document non-version-bumping core audit and smoke-build commands.
- [x] Add a short ownership boundary:
  - core cleanup belongs in this plan;
  - add-on runtime/catalog/bridge work belongs in a separate add-on plan.
- [x] Update status indexes so add-on tasks are not presented as core-cleaning prerequisites.
- [x] Keep historical changelog entries unchanged.

### Acceptance criteria

- [x] Documentation names no deleted metrics or migration module.
- [x] Contributor config instructions point to defaults, schema, persistence metadata, and tests.
- [x] Config Transfer ownership matches the source tree.
- [x] Core and add-on work are clearly separated.
- [x] No unrelated documentation rewrite is included.

---

## CORE-SIZE-GATE-01 — Add a core-only trend budget from the accepted lean baseline

**Priority:** Medium  
**Depends on:** all preceding packages  
**Primary files:** core audit script, accepted baseline JSON, `package.json`, CI workflow, docs

### Agent execution command

> Execute `CORE-SIZE-GATE-01` only after the post-cleanup baseline is reviewed. Gate unexpected growth; do not force unrelated deletions to satisfy an arbitrary cap.

### Required implementation

- [x] Store the accepted post-cleanup baseline.
- [x] Gate:
  - core authored bytes by area;
  - readable release bytes;
  - uglified release bytes;
  - gzip bytes as informational;
  - cycle/import-direction regressions.
- [x] Use both percentage and absolute thresholds so tiny changes do not fail.
- [x] Report largest positive deltas and owning files.
- [x] Add an explicit baseline-update command requiring a rationale file or commit note.
- [x] Keep add-on source and add-on builds outside this core-only gate.
- [x] Run:
  - lint;
  - tests;
  - manifest check;
  - core source audit;
  - non-mutating core smoke build;
  - git-diff cleanliness check.

### Acceptance criteria

- [x] A legitimate tiny change does not fail.
- [x] A meaningful unexplained increase identifies the responsible area/files.
- [x] Validation never bumps versions or modifies release artifacts.
- [x] Baseline changes are deliberate and reviewable.
- [x] The gate does not count add-on bytes as core growth.

---

# Current size-cut investigation summary

These are investigation priorities, not guaranteed savings.

## Highest-confidence removals

1. **Legacy migration stack**
   - dedicated migration service;
   - duplicated legacy key sets in schema;
   - legacy reads/deletes in settings persistence;
   - migration-only branches and tests.

2. **Experimental metrics stack**
   - metrics service;
   - defaults/schema section;
   - persistence writes;
   - callers, UI, tests, and docs.

3. **Config Transfer feature wrapper**
   - feature lifecycle registration;
   - feature-owned normalization/validation helpers;
   - inverted service dependency;
   - stale generated feature entry.

## High-value measured target

4. **Core UI CSS**
   - large static contribution;
   - repeated selector blocks are visible;
   - likely dead selectors after metrics and Config Transfer cleanup;
   - must be pruned with selector evidence and UI tests.

## Higher-risk targets; optimize only when the metafile proves value

5. **Config schema/runtime indexes**
   - essential correctness code;
   - investigate duplicated indexes/default structures and migration-only paths;
   - do not weaken validation for a small byte win.

6. **Settings persistence service**
   - legacy removal should shrink it naturally;
   - splitting the file alone does not reduce the bundle.

7. **Static UI HTML**
   - inspect for dead elements;
   - do not replace compact static markup with heavier JavaScript rendering.

## Deferred because they are add-on work

- add-on action registry/facade cleanup;
- `addonsService` decomposition;
- add-on scope/catalog normalization;
- add-on build tooling;
- moving Latest Ajax Error Recovery to Site Repair;
- add-on boilerplate factories;
- add-on lint/structure gates.

---

# Final release verification

After all accepted packages:

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] generated feature manifest check
- [ ] `npm run audit:core`
- [ ] `npm run build:core:smoke`
- [ ] `git diff --check`
- [ ] no excluded add-on path changed
- [ ] no version bump
- [ ] no tracked `dist/` modification
- [ ] current settings survive a version-1 envelope containing removed fields
- [ ] first-run defaults work with legacy standalone keys present
- [ ] Config Transfer remains available from settings
- [ ] readable, uglified, and gzip before/after sizes recorded
- [ ] largest remaining core contributors documented
- [ ] any deferred candidate has an evidence-based reason

---

# Expected result

The completed pass should leave:

- one config-owned persistence contract;
- zero targeted legacy migrations;
- no experimental metrics;
- no Config Transfer feature wrapper;
- fewer dead exports and compatibility layers;
- smaller, evidence-audited UI assets;
- a reproducible explanation of where the remaining core bytes come from;
- a core-only growth gate that prevents the userscript from drifting back upward;
- add-on code and add-on contracts unchanged.
