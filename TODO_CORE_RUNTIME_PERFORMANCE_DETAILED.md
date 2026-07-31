# Core Runtime Performance, Data Indexing, and Lazy UI Plan

This is a standalone, agent-executable plan for improving the runtime performance of the F95Zone Ultimate Enhancer core userscript without removing existing features.

The primary goals are:

1. use shared runtime `Map` and `Set` indexes for large tag and prefix catalogs;
2. remove repeated linear scans from Latest, Thread, and settings hot paths;
3. stop cloning data-heavy tag and prefix catalogs during unrelated config changes;
4. inject only critical dock/toast CSS during startup;
5. inject settings/modal CSS immediately before the first modal or dependent dialog is created;
6. defer settings panels, tag synchronization, and expensive DOM rendering until they are actually needed;
7. preserve persisted config formats, add-on contracts, and visible behavior.

This plan is about **runtime performance first**. Size changes are useful secondary measurements, but a package is not successful merely because source lines or bundle bytes decrease.

Prepared against the repository layout visible on `main` and the supplied readable userscript artifact inspected on **2026-07-26**.

---

## Current observations

The supplied readable artifact shows these relevant behaviors:

- `src/ui/assets/css.css` contributes approximately **25.5 KB of CSS text** and about **219 rules**.
- `initUiPhaseIfApplicable()` currently creates the shadow root, injects the complete shadow UI stylesheet, injects the settings button, and updates colors on every applicable F95Zone page.
- The settings HTML skeleton is already deferred until `openModal()`, but its complete stylesheet is not.
- `openModal()` calls `initModalUi()`, which can refresh all settings sections, add-on views, and tag/prefix data even when the user only needs one panel.
- tag ID lookups still use `config.tags.find(...)` in multiple UI and thread paths.
- tag membership still uses repeated `some(...)` and `includes(...)` checks.
- the Latest overlay already builds local tag and prefix maps, but those indexes are owned by the overlay rather than shared by Thread and settings UI.
- tag search precomputes no normalized search key and can create a large result DOM with three button listeners per tag.
- tags and prefixes are already persisted under separate cache keys, but generic config update paths still deep-clone the runtime config containing those catalogs.

These observations must be rechecked against the selected branch before editing. Do not assume line numbers in the built artifact match authored source.

---

## Scope

### Included

- `src/services/tagsService.js`
- `src/services/prefixService.js`
- new or existing runtime catalog/index services
- `src/utils/resolveTagStatus.js`
- `src/features/latest-overlay/**`
- `src/features/thread-overlay/**`
- `src/ui/components/tag-search/**`
- `src/ui/settings/**`
- `src/ui/components/modal.js`
- `src/ui/helpers/cssInjector.js`
- `src/ui/assets/**`
- `src/ui/index.js`
- `src/services/settingsService.js`
- `src/services/configChangeApplication.js`
- core performance tests, fixtures, audits, and documentation
- add-on-owned core UI entry points only where they must request the correct lazy CSS layer

### Excluded

- removing user-facing features;
- changing tags or prefixes to persisted `Map` objects;
- changing existing stored tag, prefix, preferred, excluded, or marked formats;
- add-on registration, trust, capabilities, or bridge redesign;
- minification as a performance strategy;
- speculative worker or WebAssembly infrastructure;
- network-dependent tests;
- broad source-size cleanup unrelated to measured runtime work;
- changing userscript matches, grants, run timing, namespace, or update identity.

---

## Non-negotiable data-model decision

Persisted configuration remains JSON-compatible:

```js
config.tags = [{ id, name }, ...];
config.prefixes = {
  items: [...],
  categories: {...},
};
config.preferredTags = [id, ...];
config.excludedTags = [id, ...];
config.markedTags = [id, ...];
```

`Map` and `Set` values are **derived runtime indexes only**.

Reasons:

- `GM.setValue` compatibility remains straightforward;
- import/export remains JSON-compatible;
- schema validation remains understandable;
- array order remains available where the UI needs it;
- migrations do not need to understand serialized `Map` values;
- runtime indexes can be rebuilt safely after load or config replacement.

Do not put `Map` or `Set` instances into the persisted config object.

---

## Runtime-index design contract

Create one shared owner for catalog-derived indexes. Do not create separate tag maps in Latest, Thread, tag search, and persistence.

A suitable private snapshot is conceptually:

```js
{
  revision,
  tagsRevision,
  prefixesRevision,
  membershipsRevision,

  tagById: Map<number, Tag>,
  tagIdByExactName: Map<string, number>,
  tagIdByNormalizedName: Map<string, number>,
  searchableTags: Array<{
    id: number,
    tag: Tag,
    searchText: string,
  }>,

  preferredIds: Set<number>,
  excludedIds: Set<number>,
  markedIds: Set<number>,

  prefixById: Map<number, Prefix>,
  prefixStatusById: Map<number, "completed" | "onhold" | "abandoned">,
}
```

The maps and sets must remain private. Export lookup functions and snapshots of counts/revisions, not mutable map references.

Minimum lookup API:

```js
getTagById(id)
getTagIdByExactName(name)
getTagIdByNormalizedName(name)
getTagStatus(id)
isPreferredTag(id)
isExcludedTag(id)
isMarkedTag(id)
searchTags(query, options)
getPrefixById(id)
getPrefixStatus(id)
getCatalogIndexSnapshot()
refreshCatalogIndexes(changedRoots)
```

### Index rules

- Normalize numeric IDs once while building indexes.
- Preserve existing tag-status precedence:
  1. preferred;
  2. excluded;
  3. marked.
- Preserve exact-name behavior where an existing caller is case-sensitive.
- Use normalized names only for callers whose current behavior is already case-insensitive, or after characterization proves the change is acceptable.
- Substring search remains an ordered array scan over precomputed `searchText`; a normal `Map` does not optimize arbitrary substring matching.
- Rebuild only affected index groups:
  - `tags` rebuilds tag maps and searchable entries;
  - `prefixes` rebuilds prefix maps;
  - preferred/excluded/marked paths rebuild membership sets;
  - unrelated config changes rebuild nothing.
- Catalog arrays are treated as immutable snapshots and replaced rather than mutated in place.

---

## Performance measurement contract

Do not use a single wall-clock number as proof.

Each package should report the most appropriate combination of:

- operation counts;
- allocated collection counts where observable;
- DOM node and listener counts;
- style element count and CSS bytes injected at each phase;
- startup functions executed before first user interaction;
- first-modal and repeat-modal work;
- synthetic benchmark medians after warm-up;
- frame-budget completion behavior;
- authored and bundled byte changes as secondary information.

### Required fixture sizes

Use deterministic synthetic fixtures at minimum:

| Fixture | Tags | Prefixes | Preferred | Excluded | Marked | Latest tiles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 100 | 50 | 10 | 10 | 10 | 50 |
| Typical | 500 | 200 | 50 | 50 | 25 | 200 |
| Large | 2,000 | 1,000 | 250 | 250 | 100 | 1,000 |
| Stress | 5,000 | 2,000 | 750 | 750 | 250 | 2,000 |

Stress fixtures may be audit-only when running them in the default test command would make CI excessively slow.

### Timing-test policy

- Warm up before measuring.
- Use multiple iterations and report median and p95.
- Keep hard CI assertions algorithmic where possible.
- Do not fail CI because one shared runner is a few milliseconds slower.
- A wall-clock gate may use a generous regression ratio only after the baseline is stable.
- No benchmark may reach F95Zone or another live network host.

---

## How to use this document

1. Execute one work-package ID at a time unless its wave explicitly permits parallel execution.
2. Read `AGENTS.md`, relevant architecture documents, and every named file before editing.
3. Characterize behavior before replacing a lookup, comparison, render, or initialization path.
4. Edit authored source only.
5. Add tests in the same change.
6. Run temporary, non-version-bumping builds.
7. Attach before/after performance and size reports.
8. Do not combine an index migration with an unrelated visual redesign.
9. Put the package ID in the pull request title or description.
10. Stop after the selected package and record deferred work.
11. Do not introduce a generic framework when a narrow service is enough.

---

## Global definition of done

A package is complete only when all applicable items pass:

- [ ] Every package-specific acceptance criterion passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build:core:smoke` passes.
- [ ] `npm run check:core` passes or the reviewed report is regenerated.
- [ ] `npm run check:core:size` passes or a reviewed size rationale is attached.
- [ ] `npm run check:css` passes for CSS/HTML work.
- [ ] `git diff --check` passes.
- [ ] Temporary builds do not bump versions or modify tracked `dist/`.
- [ ] Persisted tag, prefix, and tag-list formats are unchanged.
- [ ] Fresh installs and existing stored config both work.
- [ ] No mutable `Map` or `Set` escapes from the runtime-index owner.
- [ ] Indexes rebuild after every applicable config load or update.
- [ ] Unrelated config changes do not rebuild tag/prefix indexes.
- [ ] Latest and Thread overlay output remains visually equivalent.
- [ ] Modal opening is free of an unstyled-content flash.
- [ ] Toast and page-dock UI remain styled before the settings modal has ever opened.
- [ ] Add-on dock/dialog entry points request any deferred styles they require.
- [ ] Repeated modal opening does not add duplicate styles, listeners, or rendered panels.
- [ ] No stale async tag search or catalog refresh commits after a newer generation.
- [ ] Performance reports identify the owning functions and fixture sizes.
- [ ] No performance improvement is claimed solely from authored source deletion.

---

## Required execution order

### Wave 0 — Baseline and deterministic performance evidence

1. `PERF-BASELINE-01`
2. `PERF-HARNESS-01`

### Wave 1 — Shared data indexes

1. `PERF-CATALOG-INDEX-01`
2. `PERF-INDEX-INVALIDATION-01`

### Wave 2 — Migrate hot consumers

These may run in parallel after Wave 1:

- `PERF-LATEST-TAG-LOOKUPS-01`
- `PERF-THREAD-TAG-LOOKUPS-01`
- `PERF-TAG-UI-LOOKUPS-01`
- `PERF-PREFIX-LOOKUPS-01`

### Wave 3 — Isolate large catalogs from generic config copies

1. `PERF-CONFIG-CATALOG-ISOLATION-01`
2. `PERF-CATALOG-COMPARISON-01`

### Wave 4 — Critical CSS and lazy UI initialization

1. `PERF-CSS-LAYERS-01`
2. `PERF-MODAL-INIT-SPLIT-01`
3. `PERF-SETTINGS-PANEL-LAZY-01`
4. `PERF-TAGS-PANEL-LAZY-01`

### Wave 5 — Scale tag-search DOM work

1. `PERF-TAG-SEARCH-RENDER-01`
2. `PERF-TAG-SEARCH-EVENTS-01`

### Wave 6 — Integrated tuning and final evidence

1. `PERF-FRAME-BUDGET-TUNE-01`
2. `PERF-FINAL-AUDIT-01`

---

# Work packages

## PERF-BASELINE-01 — Record startup, modal, catalog, and overlay behavior

**Priority:** Critical  
**Depends on:** None  
**Primary files:** existing tests, `scripts/**`, `docs/architecture/**`, temporary benchmark fixtures

### Agent execution command

> Execute `PERF-BASELINE-01` only. Record current behavior and performance evidence without changing production code.

### Objective

Create a stable baseline showing where time, allocations, CSS injection, catalog scans, and DOM work currently occur.

### Required investigation

- [ ] Trace startup from `src/main.js` through UI initialization.
- [ ] Record every stylesheet injected before first interaction:
  - ID;
  - target;
  - CSS bytes;
  - rule count;
  - owning source file.
- [ ] Record which modal functions execute:
  - before first modal open;
  - during first open;
  - during repeat open.
- [ ] Count first-open settings rows, tag nodes, add-on cards, listeners, and style elements.
- [ ] Inventory every linear tag lookup:
  - `.find`;
  - `.some`;
  - `.includes`;
  - repeated `.filter`;
  - repeated lowercase normalization.
- [ ] Inventory every prefix catalog reconstruction.
- [ ] Identify every full runtime-config clone and whether tags/prefixes are included.
- [ ] Record Latest overlay lookup counts for typical and large fixtures.
- [ ] Record Thread overlay lookup counts for threads with 10, 50, and 200 tags.
- [ ] Record tag-search behavior for empty focus and queries returning 10, 100, 500, and 2,000 results.
- [ ] Record current CSS source totals using the repository CSS audit.
- [ ] Record readable release bytes as secondary evidence.

### Required output

Create a deterministic JSON report plus a readable Markdown summary containing:

- startup CSS bytes and rules;
- startup style count;
- first/repeat modal operation counts;
- tag and prefix scan sites;
- full-clone sites;
- result DOM/listener counts;
- synthetic timing medians;
- current bundle/source measurements;
- candidate ownership map.

### Required tests

- [ ] Two unchanged audit runs produce byte-identical JSON.
- [ ] Absolute paths and timestamps are excluded.
- [ ] Every configured fixture size appears.
- [ ] No production file changes.
- [ ] No tracked build output changes.

### Acceptance criteria

- [ ] Later packages can show exact before/after deltas.
- [ ] The report distinguishes startup, first-open, repeat-open, and overlay costs.
- [ ] The report does not treat bundle size as a substitute for runtime evidence.

---

## PERF-HARNESS-01 — Add reusable deterministic performance fixtures

**Priority:** Critical  
**Depends on:** `PERF-BASELINE-01`  
**Primary files:** `tests/**`, `scripts/core-performance-audit.cjs`, package scripts, documentation

### Agent execution command

> Execute `PERF-HARNESS-01` only. Add deterministic benchmark and operation-count support; do not optimize production code.

### Objective

Make performance work repeatable and reviewable without live pages or fragile CI timing.

### Required implementation

- [ ] Add synthetic tag/prefix/tile fixture generators.
- [ ] Add deterministic seeded data.
- [ ] Add warm-up and repeated measurement helpers.
- [ ] Add median and p95 reporting.
- [ ] Add operation counters for:
  - exact tag lookups;
  - membership checks;
  - normalized-name calculations;
  - index rebuilds;
  - full catalog iterations;
  - config-cloned bytes or catalog item counts;
  - DOM nodes;
  - listeners;
  - style bytes/rules injected.
- [ ] Add a non-mutating package command such as:
  - `npm run audit:performance`;
  - `npm run check:performance`.
- [ ] Keep strict gates algorithmic initially.
- [ ] Store an accepted report only after measurement behavior is stable.
- [ ] Document local browser profiling steps separately from deterministic Node tests.

### Required tests

- [ ] Fixture generation is deterministic.
- [ ] Two unchanged reports are identical except explicitly excluded timing fields.
- [ ] Operation-count assertions are stable.
- [ ] The command does not modify versions, build cache, or `dist/`.
- [ ] The stress fixture can be selected explicitly.

### Acceptance criteria

- [ ] Every later package can use the same fixture and reporting contract.
- [ ] Performance claims no longer rely on anecdotal browser impressions.
- [ ] CI is not made flaky by narrow millisecond thresholds.

---

## PERF-CATALOG-INDEX-01 — Create one shared runtime index for tags and prefixes

**Priority:** Critical  
**Depends on:** `PERF-HARNESS-01`  
**Primary files:** new `src/services/catalogIndex.js` or equivalent, `src/config/state.js`, tests

### Agent execution command

> Execute `PERF-CATALOG-INDEX-01` only. Add the shared derived index and tests. Do not migrate all consumers in the same package.

### Objective

Create one runtime owner for exact tag lookup, normalized tag lookup, tag membership, prefix lookup, and prefix status.

### Required implementation

- [ ] Add a narrow catalog-index service.
- [ ] Build:
  - tag ID map;
  - exact-name map;
  - normalized-name map;
  - pre-normalized ordered search entries;
  - preferred/excluded/marked sets;
  - prefix ID map;
  - prefix-status map.
- [ ] Normalize IDs to finite numbers once.
- [ ] Preserve source array order in searchable entries.
- [ ] Preserve existing duplicate-resolution behavior, or explicitly characterize and test the chosen deterministic rule.
- [ ] Keep maps/sets private.
- [ ] Expose lookup functions, counts, and revisions.
- [ ] Provide a complete rebuild entry point for startup/load.
- [ ] Provide targeted rebuild functions for each root.
- [ ] Add a diagnostic snapshot containing counts and revisions only.
- [ ] Do not import UI or feature modules into the service.
- [ ] Do not change persisted formats.
- [ ] Do not remove existing overlay-local caches yet.

### Required tests

- [ ] Empty, malformed, duplicate, and large catalogs.
- [ ] Numeric-string IDs normalize consistently.
- [ ] Exact and normalized name lookup are distinct.
- [ ] Status precedence remains preferred, excluded, marked.
- [ ] Prefix status normalization matches current Completed/On Hold/Abandoned behavior.
- [ ] Returned tag/prefix objects are not silently mutable through the index API.
- [ ] No map/set is serialized to storage.
- [ ] Large fixture rebuild completes within the frame-independent audit budget.

### Acceptance criteria

- [ ] One tested index can replace all current exact lookup scans.
- [ ] No production behavior changes yet.
- [ ] The service remains smaller and clearer than multiple feature-owned indexes.

---

## PERF-INDEX-INVALIDATION-01 — Rebuild only affected runtime indexes

**Priority:** Critical  
**Depends on:** `PERF-CATALOG-INDEX-01`  
**Primary files:** `src/services/configChangeApplication.js`, settings load/application paths, catalog index, tests

### Agent execution command

> Execute `PERF-INDEX-INVALIDATION-01` only. Connect the shared index to config load and change application without migrating consumers.

### Objective

Keep derived indexes correct without rebuilding all catalogs after every settings change.

### Required implementation

- [ ] Perform one complete index build after loaded config is applied.
- [ ] Detect affected roots from `changedPaths`.
- [ ] Rebuild tag maps only for changes rooted at `tags`.
- [ ] Rebuild prefix maps only for changes rooted at `prefixes`.
- [ ] Rebuild membership sets only for:
  - `preferredTags`;
  - `excludedTags`;
  - `markedTags`.
- [ ] Treat a root replacement as one rebuild, not one rebuild per child path.
- [ ] Coalesce multiple affected paths in one config transaction.
- [ ] Increment separate revisions for tags, prefixes, and membership.
- [ ] Make repeated application of equivalent snapshots a no-op where cheaply detectable.
- [ ] Ensure tolerant load/sanitization still triggers a correct initial build.
- [ ] Ensure recovery/default paths also initialize the index.
- [ ] Record rebuild counts in performance diagnostics.
- [ ] Avoid circular imports between config services and feature modules.

### Required tests

- [ ] Color changes rebuild no catalog index.
- [ ] Overlay toggle changes rebuild no catalog index.
- [ ] A preferred-list reorder rebuilds membership once.
- [ ] A tags replacement rebuilds tag maps once.
- [ ] A combined tags and prefixes update rebuilds each affected group once.
- [ ] Failed config commits do not update indexes.
- [ ] Index revisions agree with live config after load, recovery, import, and update.

### Acceptance criteria

- [ ] Index correctness no longer depends on callers remembering to refresh.
- [ ] Unrelated config changes cause zero catalog iterations.
- [ ] Rebuild counts are deterministic and testable.

---

## PERF-LATEST-TAG-LOOKUPS-01 — Remove repeated Latest overlay tag scans

**Priority:** High  
**Depends on:** `PERF-INDEX-INVALIDATION-01`  
**Primary files:** `src/features/latest-overlay/overlayCache.js`, `overlayEvaluator.js`, `hoverTagHandler.js`, `tileProcessor.js`, tests

### Agent execution command

> Execute `PERF-LATEST-TAG-LOOKUPS-01` only. Migrate Latest tag and membership lookups to the shared index while preserving output.

### Objective

Reduce allocation and lookup cost for every processed Latest tile.

### Required implementation

- [ ] Replace overlay-owned tag ID/name maps with shared index lookups.
- [ ] Remove duplicate map rebuilds from `refreshCaches()`.
- [ ] Keep overlay-owned settings flags and gradient cache where appropriate.
- [ ] Change preference matching to iterate the usually small tile tag list and query shared membership sets.
- [ ] Do not allocate a new `Set(tileTagIds)` for every preference check.
- [ ] Compute preferred and excluded matches in one pass over tile tag IDs where practical.
- [ ] Preserve:
  - first displayed matching label;
  - preferred/excluded counts;
  - overlay color order;
  - score inputs;
  - disabled overlay flags.
- [ ] Use shared normalized-name lookup in hover handling only if behavior matches the current lowercase lookup.
- [ ] Remove repeated `Number(...)` conversion from per-tile hot loops where normalized records already guarantee numbers.
- [ ] Keep frame-budget cancellation and generation checks unchanged.
- [ ] Record operation-count and allocation deltas.

### Required tests

- [ ] Visual patch snapshots are identical for all status combinations.
- [ ] Preferred/excluded label selection remains deterministic.
- [ ] Duplicate tag IDs do not inflate counts.
- [ ] Large tile batches perform no full configured-list scans per tile.
- [ ] Hover tags receive the same classes/colors.
- [ ] Index changes followed by reprocess use the new revision.
- [ ] Disable and generation invalidation remain correct.

### Acceptance criteria

- [ ] Latest tile evaluation uses O(tile tag count) membership checks.
- [ ] No feature-local tag catalog map remains.
- [ ] Typical and large fixture operation counts decrease materially.

---

## PERF-THREAD-TAG-LOOKUPS-01 — Use indexed name and status lookup on thread pages

**Priority:** High  
**Depends on:** `PERF-INDEX-INVALIDATION-01`  
**Primary files:** `src/features/thread-overlay/index.js`, `src/utils/resolveTagStatus.js`, tests

### Agent execution command

> Execute `PERF-THREAD-TAG-LOOKUPS-01` only. Replace thread tag linear scans and membership scans with shared index calls.

### Objective

Make processing each thread tag constant-time with respect to catalog and configured-list size.

### Required implementation

- [ ] Characterize current case and whitespace matching.
- [ ] Replace `config.tags.find(...)` with the appropriate exact or normalized index lookup.
- [ ] Replace repeated preferred/excluded/marked `.some(...)` scans.
- [ ] Make `resolveTagStatus()` a thin shared-index facade or remove it after all callers migrate.
- [ ] Preserve status precedence and shadow-class behavior.
- [ ] Cache `Object.values(STATUS)` outside per-element loops if it remains in a hot path.
- [ ] Avoid rebuilding indexes during feature enable.
- [ ] Record lookup counts for 10, 50, and 200 thread tags.

### Required tests

- [ ] Existing exact-name cases remain identical.
- [ ] Case-difference behavior is explicitly preserved or intentionally documented.
- [ ] Unknown tags receive no overlay.
- [ ] Repeated enable/disable produces no stale classes.
- [ ] Membership-list changes followed by sync use current sets.
- [ ] Processing performs no catalog-length-dependent lookup.

### Acceptance criteria

- [ ] Each thread tag requires constant-time catalog and status lookup.
- [ ] Thread output is visually equivalent.
- [ ] The generic status helper no longer scans arrays.

---

## PERF-TAG-UI-LOOKUPS-01 — Use shared indexes in tag settings UI

**Priority:** High  
**Depends on:** `PERF-INDEX-INVALIDATION-01`  
**Primary files:** `src/ui/components/tag-search/index.js`, `tagMutations.js`, `src/services/tagsService.js`, tests

### Agent execution command

> Execute `PERF-TAG-UI-LOOKUPS-01` only. Replace exact tag and selected-membership scans; do not redesign result rendering yet.

### Objective

Remove repeated full-catalog and list scans from tag-list rendering and mutations.

### Required implementation

- [ ] Replace `getTagById()` array scans with shared lookup.
- [ ] Replace duplicate/moved tag name lookup scans.
- [ ] Replace three `.includes(...)` checks per search result with shared membership sets.
- [ ] Use precomputed `searchText` for case-insensitive filtering.
- [ ] Keep result ordering identical.
- [ ] Keep tag-list order controlled by persisted ID arrays.
- [ ] Preserve all add/remove/reorder/move toasts and mutations.
- [ ] Ensure successful mutations update the index before rerender.
- [ ] Ensure failed or skipped mutations do not advance index revisions.
- [ ] Remove duplicated query-normalization functions where safe.

### Required tests

- [ ] Preferred/excluded/marked filtering is identical.
- [ ] Moved and duplicate toasts display the same tag names.
- [ ] Search order and validation remain unchanged.
- [ ] Reorder behavior remains array-order based.
- [ ] Large-result filtering performs one ordered search scan and O(1) membership checks.
- [ ] No direct `config.tags.find(...)` remains in tag-search modules.

### Acceptance criteria

- [ ] Exact tag lookup and selected-membership checks are constant-time.
- [ ] No visible behavior changes.
- [ ] Search prepares no lowercase copy on every keystroke for every tag.

---

## PERF-PREFIX-LOOKUPS-01 — Centralize prefix and status indexes

**Priority:** High  
**Depends on:** `PERF-INDEX-INVALIDATION-01`  
**Primary files:** `src/features/latest-overlay/overlayCache.js`, `src/services/prefixService.js`, catalog index, tests

### Agent execution command

> Execute `PERF-PREFIX-LOOKUPS-01` only. Move prefix exact/status lookup to the shared index without changing prefix persistence or refresh behavior.

### Objective

Avoid rebuilding or duplicating prefix lookup maps inside Latest overlay features.

### Required implementation

- [ ] Migrate prefix status resolution to the shared index.
- [ ] Expose exact prefix lookup only where there is a real consumer.
- [ ] Remove duplicate `itemsById` and status maps from overlay code.
- [ ] Preserve category and group normalization behavior.
- [ ] Keep prefix update normalization frame-budgeted.
- [ ] Rebuild prefix indexes once after a successful prefix commit.
- [ ] Do not rebuild tags when only prefixes change.
- [ ] Record prefix index rebuild and lookup counts.

### Required tests

- [ ] Prefix objects and `prefixIds` group forms both work.
- [ ] Completed, On Hold, and Abandoned statuses match current behavior.
- [ ] Unknown and malformed prefix IDs are ignored.
- [ ] Large prefix fixture produces one index build per replacement.
- [ ] Latest tile processing performs only direct status lookups.

### Acceptance criteria

- [ ] One prefix status map exists in the core runtime.
- [ ] Overlay enable/reprocess does not reconstruct the full prefix catalog.
- [ ] Persistence format is unchanged.

---

## PERF-CONFIG-CATALOG-ISOLATION-01 — Stop cloning tags and prefixes for unrelated config updates

**Priority:** Critical  
**Depends on:** Wave 2 migrations and stable catalog-index invalidation  
**Primary files:** `src/services/settingsService.js`, `src/services/configChangeApplication.js`, config clone helpers, tests

### Agent execution command

> Execute `PERF-CONFIG-CATALOG-ISOLATION-01` only. Reduce generic config-copy cost while preserving commit, validation, rollback, and result contracts.

### Objective

Keep large cache-backed catalogs out of full deep clones and diffs when an unrelated setting changes.

### Background

Tags and prefixes are already stored under separate cache keys and removed from the canonical envelope. The runtime config still contains them, so generic JSON cloning can copy thousands of catalog objects during a checkbox, color, or numeric setting update.

### Required investigation

- [ ] Characterize every caller that uses:
  - returned `previousConfig`;
  - returned `config`;
  - full strict validation;
  - changed paths;
  - rollback values.
- [ ] Measure cloned catalog item counts for:
  - one toggle;
  - one color change;
  - one tag-list reorder;
  - one tags replacement;
  - one prefixes replacement.
- [ ] Confirm whether any updater mutates `tags` or `prefixes` through the generic `updateConfig()` draft.
- [ ] Confirm import/export and migration expectations.

### Required implementation

Choose the least invasive design that satisfies the tests:

- [ ] Add a canonical-config clone that excludes cache-backed catalogs before deep cloning.
- [ ] Treat current tag/prefix snapshots as immutable references for unrelated runtime updates.
- [ ] Clone a catalog only when that catalog is the section being replaced.
- [ ] Keep strict validation for changed canonical sections.
- [ ] Keep strict validation for tag/prefix replacement through their dedicated cache validators.
- [ ] Avoid calling `getCanonicalData()` only after an expensive full clone.
- [ ] Avoid full recursive diff of unchanged catalog references.
- [ ] Preserve returned result shapes unless characterization proves a field is internal.
- [ ] Preserve atomicity: storage success precedes live-state change.
- [ ] Preserve rollback and backup behavior.
- [ ] Replace catalog arrays rather than mutating them.
- [ ] Keep migration and recovery paths correct.
- [ ] Add cloned-item counters to the performance audit.

### Required tests

- [ ] A color change clones zero tag and prefix items.
- [ ] A boolean toggle clones zero tag and prefix items.
- [ ] A preferred-list reorder does not clone tag/prefix catalog objects.
- [ ] A tags replacement validates and replaces tags once.
- [ ] A prefixes replacement validates and replaces prefixes once.
- [ ] Failed storage leaves live config and indexes unchanged.
- [ ] Import, recovery, backup, and migration tests still pass.
- [ ] Public result consumers receive compatible data.

### Acceptance criteria

- [ ] Unrelated settings changes have catalog-size-independent copy cost.
- [ ] Cache-backed catalogs remain safe from accidental mutation.
- [ ] Persistence correctness is not weakened for speed.

---

## PERF-CATALOG-COMPARISON-01 — Remove allocation-heavy full-catalog string comparisons

**Priority:** Medium  
**Depends on:** `PERF-CONFIG-CATALOG-ISOLATION-01`  
**Primary files:** `src/services/tagsService.js`, `src/services/prefixService.js`, normalization helpers, tests

### Agent execution command

> Execute `PERF-CATALOG-COMPARISON-01` only. Replace JSON-string comparison with deterministic allocation-conscious equality/signatures.

### Objective

Avoid constructing large JSON strings merely to determine whether normalized tags or prefixes changed.

### Required implementation

- [ ] Replace tag JSON stringification with ordered field comparison or a signature computed during normalization.
- [ ] Replace prefix JSON stringification with:
  - a deterministic signature produced while normalizing; or
  - a bounded structural comparison over normalized fields.
- [ ] Do not use a cryptographic hash.
- [ ] Keep collision-free equality when deciding whether to persist.
- [ ] Reuse normalized numeric IDs and names.
- [ ] Store signatures only in runtime state unless a persisted signature has a separately justified compatibility purpose.
- [ ] Preserve ordering sensitivity where catalog order is meaningful.
- [ ] Avoid a second complete traversal after normalization when practical.
- [ ] Record allocated comparison bytes where measurable.

### Required tests

- [ ] Equal catalogs with different object identity skip persistence.
- [ ] Changed ID, name, class, group, category, or order is detected as applicable.
- [ ] Malformed values normalize before comparison.
- [ ] No large JSON string is produced in the update path.
- [ ] Successful replacement still refreshes indexes once.

### Acceptance criteria

- [ ] Catalog update comparison has bounded transient allocation.
- [ ] Equality decisions remain exact.
- [ ] Storage writes are not increased.

---

## PERF-CSS-LAYERS-01 — Inject critical CSS at startup and modal CSS on demand

**Priority:** Critical  
**Depends on:** `PERF-HARNESS-01`  
**Primary files:** `src/ui/assets/css.css`, new CSS layer files, `src/ui/helpers/cssInjector.js`, `src/ui/index.js`, modal/dialog/add-on UI entry points, CSS audit tests

### Agent execution command

> Execute `PERF-CSS-LAYERS-01` only. Split CSS by runtime need and defer noncritical style injection. Do not claim single-file payload reduction unless measured.

### Objective

Reduce startup CSS parsing, style insertion, and shadow-root style work.

### Required layer contract

At minimum:

#### Critical shadow CSS

Injected during `initUiPhaseIfApplicable()`:

- page dock container and slots;
- settings button;
- generic add-on dock buttons/groups that can exist before settings open;
- dock collapsed/expanded behavior;
- toast container and toast transitions;
- any accessibility/focus rules required by those elements.

#### Deferred UI CSS

Injected once before the first dependent UI is appended:

- settings modal shell;
- settings navigation and panels;
- form controls;
- tags panel and drag UI;
- settings dialogs;
- color controls;
- feature-health UI;
- config transfer UI;
- add-on cards and settings-panel UI;
- add-on dialog/mount styling not covered by critical dock styles;
- mobile modal layout.

#### Document CSS

Continue injecting the small document-level CSS variable layer when page features require it.

### Required implementation

- [ ] Split the authored CSS into clearly named files.
- [ ] Add a small style-layer loader, for example:
  - `ensureCriticalUiStyles()`;
  - `ensureModalUiStyles()`;
  - optionally `ensureDialogUiStyles()` if independent dialogs justify it.
- [ ] Keep style acquisition idempotent.
- [ ] Inject critical CSS before creating the dock/button.
- [ ] Inject deferred CSS before creating the modal or dependent dialog DOM.
- [ ] Do not remove deferred CSS on modal close.
- [ ] Ensure add-on dialogs or mounts opened before the main settings modal request their required layer.
- [ ] Ensure toast rendering never depends on deferred CSS.
- [ ] Keep CSS variables available for dock and feature colors.
- [ ] Preserve Shadow DOM isolation.
- [ ] Update CSS audit ownership and selector checks.
- [ ] Record:
  - startup CSS bytes;
  - deferred CSS bytes;
  - startup rule count;
  - style elements before/after first modal.
- [ ] Document that this defers CSS parsing/injection but does not automatically remove the deferred string from the bundled userscript.

### Required tests

- [ ] Before modal open, only critical shadow CSS and required document CSS are injected.
- [ ] The settings button and add-on dock buttons are fully styled before modal open.
- [ ] Toasts are fully styled before modal open.
- [ ] Deferred CSS is present before modal DOM append.
- [ ] First modal has no FOUC.
- [ ] Repeated open creates no duplicate style element.
- [ ] Add-on dialog-first and modal-first flows both receive required styles.
- [ ] Mobile selectors remain in the deferred layer.
- [ ] CSS audit reports no modal-only selectors in critical CSS except documented shared selectors.

### Acceptance criteria

- [ ] Startup shadow CSS is materially smaller than the current complete stylesheet.
- [ ] Full UI styling remains correct after first demand.
- [ ] The report distinguishes runtime injection savings from bundle-byte changes.

---

## PERF-MODAL-INIT-SPLIT-01 — Separate one-time modal construction from per-open refresh

**Priority:** Critical  
**Depends on:** `PERF-CSS-LAYERS-01`  
**Primary files:** `src/ui/settings/index.js`, `modalLifecycle.js`, `src/ui/components/modal.js`, add-on registry UI bridge, tests

### Agent execution command

> Execute `PERF-MODAL-INIT-SPLIT-01` only. Make first initialization and repeat opening explicit without changing settings behavior.

### Objective

Prevent every modal open from repeating initialization, bindings, full-section refreshes, and unrelated work.

### Required implementation

- [ ] Split the current flow into explicit functions such as:
  - `initializeModalUiOnce()`;
  - `refreshModalForOpen()`;
  - `showModal()`.
- [ ] Ensure deferred CSS before skeleton creation.
- [ ] Initialize:
  - skeleton;
  - navigation;
  - delegated modal listener;
  - outside-click listener;
  - add-on registry subscription;
  - tag-panel base listeners;
  exactly once.
- [ ] Keep one stored initialization promise so rapid double-clicks share work.
- [ ] Do not mark initialization complete until required setup succeeds.
- [ ] Permit a safe retry after failed initialization.
- [ ] Make repeat open update only dirty/current content.
- [ ] Avoid duplicate add-on registry subscriptions.
- [ ] Avoid duplicate document listeners.
- [ ] Preserve active panel and mobile navigation behavior.
- [ ] Preserve modal close and keyboard event isolation.
- [ ] Record function-call and listener deltas for first and repeat open.

### Required tests

- [ ] Two simultaneous `openModal()` calls initialize once.
- [ ] Failed first initialization can retry.
- [ ] Repeat open adds zero listeners and zero styles.
- [ ] Active panel is preserved.
- [ ] Add-on registry update still refreshes visible UI.
- [ ] Close/reopen remains functional.
- [ ] Teardown removes owned listeners where global teardown expects it.

### Acceptance criteria

- [ ] First-open and repeat-open responsibilities are obvious.
- [ ] Repeat opening performs no full initialization.
- [ ] Modal lifecycle remains idempotent.

---

## PERF-SETTINGS-PANEL-LAZY-01 — Render settings panels only when activated or dirty

**Priority:** High  
**Depends on:** `PERF-MODAL-INIT-SPLIT-01`  
**Primary files:** settings panel navigation, settings section renderer, metadata registry, add-on renderer, tests

### Agent execution command

> Execute `PERF-SETTINGS-PANEL-LAZY-01` only. Replace unconditional all-panel rendering with dirty, activation-driven rendering.

### Objective

Reduce first-open DOM construction and repeat-open rerendering.

### Required implementation

- [ ] Add per-panel state:
  - never rendered;
  - clean;
  - dirty;
  - currently rendering if async work exists.
- [ ] Render the active panel before showing it.
- [ ] Render another panel on first activation.
- [ ] Mark a panel dirty when:
  - relevant metadata changes;
  - relevant config paths change;
  - add-on status/settings contributions change;
  - a panel-owned action requires refresh.
- [ ] Do not rerender clean hidden panels on modal open.
- [ ] Keep stable DOM for controls that do not need replacement.
- [ ] Preserve effect binding and config-path metadata.
- [ ] Ensure pinned add-on navigation can exist without rendering every add-on panel body.
- [ ] Avoid full `querySelectorAll` panel work where direct IDs are known.
- [ ] Record first-open row/node counts and per-panel activation deltas.

### Required tests

- [ ] First open renders only the selected panel and required navigation.
- [ ] Visiting each panel renders it once.
- [ ] Reopening with no changes rerenders zero panels.
- [ ] Relevant config change marks only affected panels dirty.
- [ ] Add-on registration marks add-on-related panels dirty.
- [ ] Hidden dirty panel updates when activated.
- [ ] Active panel update is visible without close/reopen.

### Acceptance criteria

- [ ] First-open DOM node count decreases materially.
- [ ] Repeat open does not rebuild all settings controls.
- [ ] Settings metadata remains authoritative.

---

## PERF-TAGS-PANEL-LAZY-01 — Load and refresh tags/prefixes only when needed

**Priority:** High  
**Depends on:** `PERF-SETTINGS-PANEL-LAZY-01`  
**Primary files:** `src/ui/settings/tagsSettings.js`, panel navigation hooks, `tagsService.js`, `prefixService.js`, tests

### Agent execution command

> Execute `PERF-TAGS-PANEL-LAZY-01` only. Move tag/prefix refresh from generic modal opening to Tags-panel activation or a documented idle policy.

### Objective

Prevent opening General, Latest, Thread, Color, or Add-ons settings from starting tag/prefix synchronization and rendering.

### Required implementation

- [ ] Remove unconditional `ensureTagsPanelDataLoaded()` from generic modal refresh.
- [ ] Start Tags-panel data work on first Tags-panel activation.
- [ ] Share one in-flight promise across repeated activation.
- [ ] Preserve retry after failure.
- [ ] Keep a refresh policy:
  - once per page generation;
  - explicit refresh action;
  - or bounded stale-after interval.
- [ ] Do not fetch/bridge tags merely because another panel opened.
- [ ] Render selected tag lists after data is available.
- [ ] Show a bounded loading state in the Tags panel.
- [ ] Cancel or suppress stale UI commits after route invalidation/teardown.
- [ ] Decide whether an idle refresh on Latest is worthwhile only after measurement.
- [ ] Keep pruning behavior and user toast.
- [ ] Record first-open background work before and after.

### Required tests

- [ ] Opening General triggers no tag/prefix bridge request.
- [ ] Opening Tags triggers one request/update flow.
- [ ] Repeated Tags activation shares in-flight work.
- [ ] Failure can retry.
- [ ] Pruned-list toast still appears.
- [ ] Route invalidation prevents late UI commit.
- [ ] Existing stored tags render when live refresh is unavailable.

### Acceptance criteria

- [ ] Generic modal opening performs zero tag/prefix synchronization work.
- [ ] Tags behavior remains available on demand.
- [ ] First-open work is proportional to the selected panel.

---

## PERF-TAG-SEARCH-RENDER-01 — Render large search result sets incrementally

**Priority:** High  
**Depends on:** `PERF-TAG-UI-LOOKUPS-01`, `PERF-TAGS-PANEL-LAZY-01`  
**Primary files:** `src/ui/components/tag-search/index.js`, tag-search CSS/HTML, tests

### Agent execution command

> Execute `PERF-TAG-SEARCH-RENDER-01` only. Scale result rendering without removing access to any tag.

### Objective

Avoid creating hundreds or thousands of result rows and action buttons in one synchronous operation.

### Required implementation

Use one of these measured, accessible approaches:

1. fixed-size chunks with a `Load more` control;
2. scroll-triggered incremental chunks;
3. a small virtual list with stable row height.

Prefer the simplest approach that preserves all tags.

- [ ] Render an initial bounded chunk, for example 50–100 rows.
- [ ] Preserve total-result count.
- [ ] Make every result reachable.
- [ ] Cancel stale rendering when the query changes.
- [ ] Use a render generation or AbortController.
- [ ] Yield between large chunks through the existing frame-budget helper where useful.
- [ ] Reuse the shared searchable entries.
- [ ] Preserve current result order.
- [ ] Keep keyboard focus predictable.
- [ ] Avoid resetting input selection during a stale render.
- [ ] Avoid showing thousands of rows merely on empty-input focus.
- [ ] Provide a clear empty-query behavior:
  - first bounded chunk;
  - or a “type to search” state with an explicit “show all” action.
- [ ] Record DOM nodes and first-result latency for each fixture.

### Required tests

- [ ] All tags remain reachable.
- [ ] Initial DOM rows stay within the configured chunk.
- [ ] Query changes cancel old chunks.
- [ ] Selected tags remain excluded from results.
- [ ] Add actions refresh the active query.
- [ ] Empty, no-result, exact, and large-result cases.
- [ ] Keyboard and pointer behavior remain usable.

### Acceptance criteria

- [ ] Large result sets no longer create all rows synchronously.
- [ ] First visible results appear quickly.
- [ ] No tag becomes inaccessible.

---

## PERF-TAG-SEARCH-EVENTS-01 — Reduce per-result listeners and input churn

**Priority:** Medium  
**Depends on:** `PERF-TAG-SEARCH-RENDER-01`  
**Primary files:** tag-search component, listeners, tag drag integration, tests

### Agent execution command

> Execute `PERF-TAG-SEARCH-EVENTS-01` only. Use delegation and bounded scheduling for search-result interaction.

### Objective

Reduce listener count and redundant renders during rapid typing.

### Required implementation

- [ ] Replace three click listeners per search row with one delegated listener on the result container.
- [ ] Encode action and tag ID through bounded data attributes.
- [ ] Validate delegated actions against the shared tag index.
- [ ] Schedule input filtering with:
  - one animation-frame task; or
  - a short debounced task.
- [ ] Cancel the previous pending task on new input.
- [ ] Keep clear-button and Escape behavior.
- [ ] Do not interfere with selected-list drag handlers.
- [ ] Avoid binding both legacy and delegated listeners.
- [ ] Record listener counts and render requests during rapid input fixtures.

### Required tests

- [ ] Preferred/excluded/marked actions all work through delegation.
- [ ] Invalid/stale tag IDs are ignored safely.
- [ ] Rapid typing commits only the newest query.
- [ ] Listener count is independent of result count.
- [ ] Clear and Escape behavior remain unchanged.
- [ ] Reopening the modal adds no duplicate delegated listener.

### Acceptance criteria

- [ ] Search result listener count is O(1).
- [ ] Rapid typing does not render every intermediate query.
- [ ] Selected-list drag behavior is unaffected.

---

## PERF-FRAME-BUDGET-TUNE-01 — Tune heavy catalog and tile work using evidence

**Priority:** Medium  
**Depends on:** all preceding performance packages  
**Primary files:** frame-budget helpers, tag/prefix normalization, Latest tile processing, performance report

### Agent execution command

> Execute `PERF-FRAME-BUDGET-TUNE-01` only. Tune existing budgets from measured post-migration behavior; do not redesign the scheduler.

### Objective

Ensure large data processing remains responsive after lookup and lazy-loading changes.

### Required implementation

- [ ] Re-measure:
  - tag normalization;
  - prefix normalization;
  - tag result chunk rendering;
  - Latest tile evaluation;
  - Latest tile patching.
- [ ] Adjust frame budgets only when measurements justify it.
- [ ] Keep separate budgets for CPU-only normalization and DOM patching.
- [ ] Preserve cancellation/generation semantics.
- [ ] Avoid tiny chunks that cause excessive scheduling overhead.
- [ ] Avoid large chunks that visibly block interaction.
- [ ] Record processed items per frame and total completion.
- [ ] Keep defaults stable on low-resolution timers.
- [ ] Do not add a generic task framework.

### Required tests

- [ ] Cancellation stops future chunks.
- [ ] Completion count is exact.
- [ ] Large fixtures yield across frames where configured.
- [ ] Small fixtures complete without unnecessary scheduling.
- [ ] Latest visual order remains stable.

### Acceptance criteria

- [ ] Budgets are supported by report evidence.
- [ ] No new scheduler abstraction is introduced.
- [ ] Large fixtures remain responsive and complete correctly.

---

## PERF-FINAL-AUDIT-01 — Verify integrated startup, modal, and large-data performance

**Priority:** Critical  
**Depends on:** every accepted package  
**Primary files:** performance audit, documentation, accepted baseline/report

### Agent execution command

> Execute `PERF-FINAL-AUDIT-01` only. Measure and explain the accepted architecture. Do not hide new optimization work inside the final audit.

### Objective

Produce the final before/after evidence and identify any remaining hot paths.

### Required measurements

#### Startup

- shadow CSS bytes/rules injected;
- style element count;
- DOM nodes added;
- listeners registered;
- catalog iterations;
- configuration cloned items;
- startup median/p95 in deterministic fixtures.

#### First modal open

- deferred CSS bytes/rules;
- initialization calls;
- rendered panels;
- settings rows;
- tag/prefix requests;
- DOM nodes/listeners;
- median/p95.

#### Repeat modal open

- new styles;
- new listeners;
- rerendered panels;
- catalog work;
- median/p95.

#### Tags and prefixes

- index build time and operation counts;
- exact lookup counts;
- membership lookup counts;
- search filtering and first-chunk time;
- DOM/listener counts;
- catalog comparison allocation;
- unrelated config-update clone cost.

#### Latest and Thread

- tile/thread-tag lookup counts;
- full-list scans;
- transient set/map allocations;
- evaluation and patch medians;
- frame-budget behavior.

#### Secondary size evidence

- authored bytes;
- readable regular bundle;
- readable release bundle;
- release-minified bundle;
- gzip comparison;
- CSS layer bytes.

### Required investigation

- [ ] Confirm no duplicate tag or prefix index remains.
- [ ] Confirm no hot-path `config.tags.find(...)` remains.
- [ ] Confirm no hot-path preferred/excluded/marked linear membership scan remains.
- [ ] Confirm no unrelated config update deep-clones catalogs.
- [ ] Confirm complete modal CSS is not injected at startup.
- [ ] Confirm hidden settings panels are not rendered on first open.
- [ ] Confirm generic modal open does not refresh tag/prefix data.
- [ ] Confirm search listeners are independent of result count.
- [ ] Identify remaining intentional linear scans and explain why a `Map` would not help.
- [ ] Identify any memory increase from indexes and compare it with CPU/DOM savings.

### Required output

Create:

1. deterministic JSON report;
2. readable Markdown comparison;
3. before/after table by fixture;
4. startup CSS layer table;
5. index memory/count table;
6. remaining hot-path list;
7. rejected optimization list with reasons;
8. recommended optional future budgets.

### Required tests

- [ ] Two unchanged reports are deterministic.
- [ ] Every fixture appears.
- [ ] Every accepted package has before/after ownership.
- [ ] No live network access.
- [ ] Smoke build and all core checks pass.
- [ ] Persisted format fixtures remain byte-compatible where applicable.

### Acceptance criteria

- [ ] Startup injects only critical UI CSS.
- [ ] First modal performs only active-panel-required work.
- [ ] Repeat modal performs near-zero initialization work.
- [ ] Exact tag/prefix and membership lookups are shared and constant-time.
- [ ] Unrelated config changes have catalog-size-independent cloning behavior.
- [ ] Large tag search avoids all-at-once DOM/listener creation.
- [ ] Latest and Thread behavior remains equivalent.
- [ ] The report acknowledges any memory tradeoff from runtime indexes.
- [ ] Remaining optimizations are evidence-backed rather than speculative.

---

# Required static audit rules

After the relevant migrations, add narrow static checks for hot modules.

Examples of disallowed patterns:

```text
src/features/thread-overlay/**:
  config.tags.find(
  preferredTags.some(
  excludedTags.some(
  markedTags.some(

src/features/latest-overlay/**:
  new Map(config.tags
  config.tags.find(
  config.preferredTags.includes(
  config.excludedTags.includes(

src/ui/components/tag-search/**:
  config.tags.find(
  config.preferredTags.includes(
  config.excludedTags.includes(
  config.markedTags.includes(
```

Do not ban `.find`, `.some`, or `.includes` repository-wide. They are appropriate for small bounded arrays and one-time logic.

Add a CSS ownership check that verifies:

- critical CSS contains required dock/toast selectors;
- deferred CSS contains modal/settings selectors;
- modal-only selectors do not drift back into critical CSS without an explicit allowlist rationale.

---

# Expected architecture

The completed plan should leave:

- JSON-compatible persisted config;
- one private shared tag/prefix runtime index;
- targeted index invalidation from config changed paths;
- Latest and Thread consumers using O(1) exact/membership lookup;
- a search array with pre-normalized text for substring matching;
- no duplicate overlay-owned catalog maps;
- cache-backed catalogs excluded from unrelated deep config clones;
- critical dock/toast CSS injected at startup;
- settings/modal CSS injected once on first demand;
- modal initialization separated from repeat-open refresh;
- settings panels rendered on activation or dirtiness;
- tag/prefix refresh initiated only from the Tags panel or a measured idle policy;
- bounded, cancellable tag-result DOM rendering;
- O(1) search-result listener count;
- deterministic startup, modal, catalog, and overlay performance reports.

---

# Expected performance direction

Do not treat these as guaranteed numeric budgets until `PERF-BASELINE-01` records the branch.

The expected direction is:

| Area | Current tendency | Target tendency |
| --- | --- | --- |
| Exact tag lookup | O(tag catalog) | O(1) |
| Tag status lookup | O(preferred + excluded + marked) | O(1) |
| Latest preference matching | scans configured lists and allocates tile set | scans tile tags with shared sets |
| Prefix status index | overlay-owned rebuild | shared revisioned map |
| Unrelated setting update | clones runtime catalogs | clones no catalog items |
| Startup shadow CSS | complete settings stylesheet | dock/toast critical layer |
| First modal rendering | all sections refreshed | active panel only |
| Generic modal open | may start tag/prefix work | no tag/prefix work |
| Search result listeners | O(results) | O(1) |
| Search DOM creation | all results synchronously | bounded incremental chunks |
| Repeat modal open | repeated refresh work | dirty/current work only |

---

# Final integrated verification

After every accepted package:

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build:core:smoke`
- [ ] `npm run check:core`
- [ ] `npm run check:core:size`
- [ ] `npm run audit:css`
- [ ] `npm run check:css`
- [ ] performance audit/check command
- [ ] `git diff --check`
- [ ] no version bump
- [ ] no tracked `dist/` modification
- [ ] no userscript metadata changes
- [ ] existing config fixtures load
- [ ] tag/prefix persisted formats unchanged
- [ ] exact tag and prefix lookup fixtures pass
- [ ] Latest and Thread visual snapshots pass
- [ ] modal-first, toast-first, add-on-dialog-first, and repeat-open UI flows pass
- [ ] no duplicate style, listener, panel render, or catalog rebuild
- [ ] no stale async result commits
- [ ] before/after performance evidence attached
