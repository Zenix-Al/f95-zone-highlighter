# Core Modal CSS Performance TODO

This plan makes existing core behavior cheaper in three measured places:

1. avoid copying tag/prefix catalogs during unrelated config changes;
2. avoid rendering and binding every tag-search result at once;
3. inject only startup-critical CSS until the user first triggers `openModal()`.

It preserves current UI behavior. It does not introduce a new framework or
expand the change into other dialogs, add-ons, shared catalog-index architecture,
or unrelated performance work.

---

## Fixed scope

Included:

- stop unrelated config updates from deep-cloning live tag/prefix catalogs;
- bound tag-search result DOM and replace per-result listeners with delegation;
- identify the selectors from `src/ui/assets/css.css` required by core UI that
  can appear before the settings modal opens;
- keep that small critical portion in the startup UI path;
- move the remaining settings-modal CSS behind core `openModal()`;
- inject the deferred CSS once, before modal content becomes visible;
- measure startup and first/repeated modal CSS bytes, rules, and style elements;
- preserve current styling, ordering, specificity, and lifecycle behavior.

Excluded:

- add-on dialogs, add-on CSS, and public add-on/core API changes;
- a generic lazy-style registry, dependency system, or CSS framework;
- lazy settings panels, tag synchronization, and shared catalog indexes;
- changing tag-search matching, order, list membership, or drag behavior;
- modal redesign, selector cleanup, visual changes, and unrelated refactoring;
- changing userscript metadata, persisted config, build output, or versions.

If a selector cannot be safely classified, keep it in startup CSS until a
focused test proves it belongs in the deferred layer.

---

## Required execution order

### Wave 0 — Characterize current costs

1. `MODAL-CSS-BASELINE-01`

### Wave 1 — Split startup and modal CSS

1. `MODAL-CSS-SPLIT-01`

### Wave 2 — Remove confirmed data and DOM waste

1. `CONFIG-CATALOG-COPY-01`
2. `TAG-SEARCH-BOUND-01`

These packages are independent after the baseline and may be executed
separately. Do not combine their production changes.

### Wave 3 — Verify behavior and evidence

1. `MODAL-CSS-VERIFY-01`

Execute one package at a time and stop after its acceptance criteria pass.

---

## MODAL-CSS-BASELINE-01 — Record current CSS, config-copy, and tag-search costs

**Priority:** Critical  
**Production changes:** None

### Required work

- [x] Trace the existing startup stylesheet injection and core `openModal()`
      path using current source rather than bundled artifacts.
- [x] Record the current stylesheet target, style element count, authored CSS
      bytes, and rule count before first interaction.
- [x] Identify the selectors required by core dock, toast, settings launcher,
      and any other core UI that can appear before `openModal()`.
- [x] Identify settings-modal-only selectors.
- [x] Record style injection behavior during first and repeated `openModal()`.
- [x] Count tag/prefix items copied by an unrelated scalar config update.
- [x] Count tag-search result rows, action buttons, and listeners for empty
      focus and representative queries against the current catalog size.
- [x] Add focused characterization tests for startup UI and modal-first flows.
- [x] Produce concise deterministic JSON/Markdown evidence without timestamps
      or machine-specific paths.

### Acceptance criteria

- [x] Critical and deferred selector ownership is explicit.
- [x] Two unchanged evidence runs are byte-identical.
- [x] No production source, version, manifest, cache, or tracked `dist/` file is
      changed.

---

## MODAL-CSS-SPLIT-01 — Inject modal CSS on first demand

**Priority:** Critical  
**Depends on:** `MODAL-CSS-BASELINE-01`

### Required work

- [x] Split `src/ui/assets/css.css` into a small startup layer and the remaining
      settings-modal layer using the characterized ownership.
- [x] Keep startup-layer injection in the existing UI initialization path.
- [x] Add one narrow, idempotent `ensureModalCss()` operation to the existing
      core CSS/UI ownership module.
- [x] Call `ensureModalCss()` from core `openModal()` before constructing or
      exposing modal content.
- [x] Inject the modal layer only once and reuse it on repeated opens.
- [x] Preserve stylesheet order, variables, specificity, Shadow DOM target, and
      current modal appearance.
- [x] Preserve existing teardown semantics; do not add a second lifecycle owner.
- [x] Keep uncertain shared selectors in the startup layer.
- [x] Do not alter add-on dialog entry points or add public API surface.
- [x] Do not perform selector cleanup or unrelated UI refactoring.

### Required tests

- [x] Before `openModal()`, only startup CSS exists.
- [x] Dock, toast, and settings launcher are styled before any modal opens.
- [x] First `openModal()` installs modal CSS before content is visible.
- [x] Repeated `openModal()` calls add no duplicate style or CSS text.
- [x] Close/reopen and disable/re-enable behavior remains correct.
- [x] Existing modal selectors remain present in the deferred layer.

### Acceptance criteria

- [x] Startup injects fewer CSS bytes and rules than the baseline.
- [x] First modal open has no unstyled-content flash.
- [x] Existing core UI looks and behaves the same.
- [x] The implementation is a narrow split, not a lazy-CSS framework.

---

## CONFIG-CATALOG-COPY-01 — Avoid unrelated catalog cloning

**Priority:** High  
**Depends on:** `MODAL-CSS-BASELINE-01`

Current source deep-clones the live config in `settingsService` and
`configChangeApplication`. Because the runtime config includes cache-backed
`tags` and `prefixes`, unrelated updates copy those catalogs multiple times.

### Required work

- [x] Characterize clone ownership in `updateConfig()`, `saveConfigKeys()`,
      `commitConfigNow()`, and `applyConfigChange()`.
- [x] Measure copied tag/prefix item counts for one unrelated scalar update.
- [x] Reuse the existing separation between persisted core config and
      cache-backed `tags`/`prefixes`; do not add another repository or cache.
- [x] Keep catalogs out of unrelated drafts, previous snapshots, and result
      snapshots where callers do not require them.
- [x] Preserve atomic catalog replacement when `tags` or `prefixes` actually
      changes.
- [x] Preserve strict validation, recovery, backup, import/export, effects, and
      `changedPaths` behavior.
- [x] Keep public result shapes compatible unless characterization proves a
      field is private and unused.
- [x] Do not introduce a shared Map/Set index in this package.

### Required tests

- [x] Unrelated scalar updates copy zero tag/prefix catalog items.
- [x] Tag-only and prefix-only cache updates still persist and apply correctly.
- [x] Failed commits preserve the prior live config.
- [x] Existing config, recovery, cache, and import/export fixtures pass.
- [x] Changed paths and effects remain equivalent.

### Acceptance criteria

- [x] Unrelated update work is independent of catalog size.
- [x] No stored format or storage key changes.
- [x] The change removes measured copying without adding a new abstraction
      layer.

---

## TAG-SEARCH-BOUND-01 — Bound result DOM and listeners

**Priority:** High  
**Depends on:** `MODAL-CSS-BASELINE-01`

Current tag search may render every visible tag and creates three independently
bound action buttons per result. With about 400 tags, empty focus can create up
to roughly 1,200 result-action listeners before selected tags are excluded.

### Required work

- [x] Preserve existing filtering, ordering, validation, and membership rules.
- [x] Render a small initial chunk of results.
- [x] Provide a simple `Load more` action until every result is reachable.
- [x] Replace per-result action listeners with one delegated listener owned by
      the existing result container.
- [x] Keep action and tag identity in bounded data attributes and validate them
      against the current catalog before mutation.
- [x] Re-render the active query after an action exactly as current behavior
      requires.
- [x] Cancel or discard stale result work when input changes, results close, or
      the modal is torn down.
- [x] Preserve clear, Escape, focus/selection, selected-list, and drag behavior.
- [x] Do not add virtualization, a scheduler framework, or shared catalog index.

### Required tests

- [x] Empty focus and large matches render no more than the initial chunk.
- [x] `Load more` eventually exposes every matching tag in existing order.
- [x] Preferred, excluded, and marked actions work through delegation.
- [x] Listener count is constant regardless of result count.
- [x] Invalid or stale tag IDs are ignored safely.
- [x] Rapid query changes cannot commit stale rows.
- [x] Clear, Escape, focus, selection, and drag regressions remain covered.

### Acceptance criteria

- [x] Initial tag-search DOM and listener work is bounded.
- [x] All tags remain accessible.
- [x] Existing appearance and interaction remain familiar.

---

## MODAL-CSS-VERIFY-01 — Verify the integrated performance changes

**Priority:** Critical  
**Depends on:** `MODAL-CSS-SPLIT-01`, `CONFIG-CATALOG-COPY-01`, and
`TAG-SEARCH-BOUND-01`

### Required work

- [x] Record before/after startup CSS bytes, rules, and style elements.
- [x] Record first-open and repeated-open CSS injection counts.
- [x] Confirm all critical selectors remain available at startup.
- [x] Confirm modal-only selectors are absent before `openModal()` and present
      afterward.
- [x] Confirm no add-on source, API, dialog behavior, or CSS was changed.
- [x] Confirm unrelated config updates copy no tag/prefix catalog items.
- [x] Confirm tag-search initial row count and listener count are bounded.
- [x] Record source and bundle deltas as secondary evidence only.

### Required validation

- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run audit:css`
- [x] `npm run check:css`
- [x] `npm run audit:core`
- [x] `npm run check:core`
- [x] `npm run build:core:smoke`
- [x] `git diff --check`
- [x] no version bump, metadata change, build-cache change, or tracked `dist/`
      modification

### Acceptance criteria

- [x] Startup CSS work is measurably reduced.
- [x] First and repeated modal behavior is correct and deterministic.
- [x] No visual redesign, speculative abstraction, or unrelated optimization is
      included.

---

## Final integrated checklist

- [x] `MODAL-CSS-BASELINE-01`
- [x] `MODAL-CSS-SPLIT-01`
- [x] `CONFIG-CATALOG-COPY-01`
- [x] `TAG-SEARCH-BOUND-01`
- [x] `MODAL-CSS-VERIFY-01`
- [x] deterministic before/after CSS evidence recorded
- [x] all required validation passes
- [x] no release or metadata mutation
