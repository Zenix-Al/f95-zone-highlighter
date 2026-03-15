# TODO

## LOC Reduction Execution Board

Use this file as the single source of truth for each refactor execution.

### How to use per execution

- Set `Status` to `planned`, `in-progress`, `done`, `reverted`, or `blocked`.
- Fill `Result` with `works`, `partial`, or `fails`.
- Record `LOC Delta` as `-N` (or `+N` if increased).
- Add short `Evidence` (what was tested/linted).
- If reverted, add the reason in `Notes`.

---

## Phase 1 - Low Risk / High Confidence

### 1) Shared String Validation Helpers

- Goal: replace repeated non-empty string checks with helper functions.
- Target files:
  - `src/utils/typeHelpers.js` (new)
  - `src/features/direct-download/index.js`
  - `src/features/direct-download/hostBreaker.js`
  - `src/utils/processingDownloadTrigger.js`
  - other repeated call sites
- Example duplication:
  - `typeof value === "string" && value.trim().length > 0`

Execution record:

- Status: done
- Result: partial
- LOC Delta: pending (new helper files added; tracked net delta captured in execution log)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: implemented in `src/utils/typeHelpers.js` and adopted in direct-download/processing trigger paths

### 2) Object/Array Normalization Helpers

- Goal: replace repeated object guards with shared helpers.
- Target files:
  - `src/utils/objectPath.js` (extend)
  - `src/services/settingsService.js`
  - `src/features/direct-download/hostBreaker.js`
- Example duplication:
  - `value && typeof value === "object" ? value : {}`

Execution record:

- Status: done
- Result: partial
- LOC Delta: pending (mixed tracked/untracked file state)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: implemented `normalizeObject` / `normalizeArray` in `src/utils/objectPath.js` and adopted in `settingsService.js`

### 3) Numeric/Data Normalization Utility

- Goal: centralize `toNonNegativeInteger` + similar sanitizers.
- Target files:
  - `src/utils/normalization.js` (new)
  - `src/services/settingsService.js`
  - `src/features/direct-download/hostBreaker.js`

Execution record:

- Status: done
- Result: partial
- LOC Delta: pending (mixed tracked/untracked file state)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: added `src/utils/normalization.js` and adopted in `settingsService.js` + `hostBreaker.js`

---

## Phase 2 - Settings Metadata Consolidation

### 4) Data-Driven `colorSettings`

- Goal: replace repeated setting declarations with a config array + factory.
- Target files:
  - `src/ui/settings/colorSettings.js`
  - `src/ui/settings/metaFactory.js`
- Constraint: no behavior change, keep same labels/tooltips/effects.

Execution record:

- Status: done
- Result: works
- LOC Delta: `+29 / -132` in `src/ui/settings/colorSettings.js` (net reduction)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: migrated to `COLOR_SETTING_DEFS` + `buildSettingsMap` + `createColorSetting`

### 5) Data-Driven `threadSettings`

- Goal: convert repetitive toggles into declarative config + builder.
- Target files:
  - `src/ui/settings/threadSettings.js`
  - `src/ui/settings/metaFactory.js`
- Constraint: keep existing effect handlers/toast semantics.

Execution record:

- Status: done
- Result: partial
- LOC Delta: pending (diff impacted by formatter/line endings in working tree)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: migrated repeated toggle/package declarations to definition arrays + map builders; runtime smoke still recommended

---

## Phase 3 - Direct Download Service Cleanup

### 6) Unify Host Resolution API

- Goal: simplify host lookup and enabled-state checks behind one API.
- Target files:
  - `src/features/direct-download/hostPackages.js`
  - `src/features/direct-download/hostBreaker.js`
  - `src/features/direct-download/fileHostHelper.js`
- Constraint: preserve current package key mapping and health behavior.

Execution record:

- Status: done
- Result: works
- LOC Delta: `+102 / -30` across `hostPackages`, `downloadRouter`, `dom`, `msgHandler`, `fileHostHelper`
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: added `getDirectDownloadHostContext()` and migrated key call sites from split resolve+enabled checks

### 7) Expand Shared Failure Handling Adoption

- Goal: ensure all direct-download hosts use one failure helper path.
- Target files:
  - `src/features/direct-download/attention.js`
  - host handlers in `src/features/direct-download/*.js`
- Current state: partially implemented.

Execution record:

- Status: done
- Result: works
- LOC Delta: completed in prior direct-download host refactor
- Evidence: host handlers use `handleDirectDownloadFailure` (`datanodes`, `gofile`, `pixeldrain`) + lint passed
- Notes: one shared failure helper path now used across all current normal direct-download host handlers

---

## Deferred / Medium Risk

### 8) Feature Lifecycle Boilerplate Reduction

- Goal: reduce repetitive `enable/disable` scaffolding across features.
- Risk: touches many call sites; defer unless maintenance pain stays high.

Execution record:

- Status: done
- Result: fails (for LOC reduction goal)
- LOC Delta: `+56 / -23` across `featureFactory`, `direct-download/index`, `latest-control/index` (net increase)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: lifecycle consistency improved via `composeLifecycle`, but not worth it if primary KPI is LOC reduction only

### 9) Debounced Task Registry Consolidation

- Goal: centralize repeated debounced task declarations.
- Risk: API migration may affect many callers.

Execution record:

- Status: done
- Result: fails (for LOC reduction goal)
- LOC Delta: `+60 / -30` in `src/core/tasksRegistry.js` (net increase)
- Evidence: file diagnostics clean + `npm run lint` passed
- Notes: centralized registry shape works and preserves compatibility exports, but not worth it for pure LOC reduction KPI

---

## Execution Log (Chronological)

Use one entry per implementation attempt.

Template:

- Date:
- Item:
- Branch/Commit:
- Files changed:
- Status:
- Result:
- LOC Delta:
- Validation run:
- Notes:

Entries:

- Date: 2026-03-15
  - Item: Debounced task registry consolidation trial
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/core/tasksRegistry.js`
  - Status: done
  - Result: fails for LOC-only objective
  - LOC Delta: `+60 / -30` by `git diff --numstat` (net increase)
  - Validation run: file-level diagnostics passed; `npm run lint` passed
  - Notes: behavior-compatible refactor using centralized task definitions, but line count increased

- Date: 2026-03-15
  - Item: Feature lifecycle boilerplate reduction (`composeLifecycle` trial)
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/core/featureFactory.js`, `src/features/direct-download/index.js`, `src/features/latest-control/index.js`
  - Status: done
  - Result: fails for LOC-only objective
  - LOC Delta: `+56 / -23` by `git diff --numstat` (net increase)
  - Validation run: file-level diagnostics passed; `npm run lint` passed
  - Notes: keep only if we prioritize consistency/maintainability over pure line-count reduction

- Date: 2026-03-15
  - Item: Phase 3 direct-download host resolution + failure-path completion
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/features/direct-download/hostPackages.js`, `src/services/downloadRouter.js`, `src/core/dom.js`, `src/features/direct-download/msgHandler.js`, `src/features/direct-download/fileHostHelper.js`
  - Status: done
  - Result: works
  - LOC Delta: `+102 / -30` by `git diff --numstat` for Phase 3 touched files
  - Validation run: file-level diagnostics passed; `npm run lint` passed
  - Notes: unified host-context API in place; key direct-download call sites migrated

- Date: 2026-03-15
  - Item: Phase 2 settings metadata consolidation
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/ui/settings/metaFactory.js`, `src/ui/settings/colorSettings.js`, `src/ui/settings/threadSettings.js`
  - Status: done
  - Result: partial (runtime UX smoke test pending)
  - LOC Delta: `+330 / -205` across 3 files by `git diff --numstat` (includes mixed formatting/line-ending churn in workspace)
  - Validation run: file-level diagnostics passed; `npm run lint` passed
  - Notes: color settings reduced with data-driven factory; thread settings moved to definition arrays for maintainability

- Date: 2026-03-15
  - Item: Phase 1 utilities execution (string/object/normalization)
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/utils/typeHelpers.js`, `src/utils/normalization.js`, `src/utils/objectPath.js`, `src/features/direct-download/index.js`, `src/utils/processingDownloadTrigger.js`, `src/features/direct-download/hostBreaker.js`, `src/services/settingsService.js`
  - Status: done
  - Result: partial (needs runtime smoke test)
  - LOC Delta: tracked net `+107 / -36` from `git diff --numstat` (plus untracked/new-file additions)
  - Validation run: file-level diagnostics passed; `npm run lint` passed
  - Notes: behavior-preserving helper extraction completed for planned Phase 1 targets

- Date: 2026-03-15
  - Item: Direct-download attention routing to one target tab
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/features/direct-download/attention.js`, `src/features/direct-download/index.js`, `src/services/downloadRouter.js`, `src/utils/processingDownloadTrigger.js`
  - Status: done
  - Result: pending runtime confirmation
  - LOC Delta: pending
  - Validation run: file-level diagnostics passed
  - Notes: intended to prevent multi-tab duplicate alerts

- Date: 2026-03-15
  - Item: Shared direct-download failure helper adoption (partial)
  - Branch/Commit: local workspace (uncommitted)
  - Files changed: `src/features/direct-download/attention.js`, `src/features/direct-download/datanodes.js`, `src/features/direct-download/pixeldrain.js`, `src/features/direct-download/gofile.js`
  - Status: in-progress
  - Result: pending runtime confirmation
  - LOC Delta: pending
  - Validation run: file-level diagnostics passed
  - Notes: continue migrating remaining hosts to helper path
