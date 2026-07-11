# Add-on Normalization, Hybrid Runtime, Site Repair, Config Transfer, Build Tooling, and Core Reduction Plan

This is a standalone execution plan for the next repository work only. It was prepared against the merged `main` branch on **2026-07-11**. Previous framework-hardening work packages have intentionally been removed so an agent can focus on the tasks in this document.

## How to use this document

1. Execute one work-package ID at a time unless its task explicitly permits parallel work.
2. Read `AGENTS.md`, the relevant architecture documentation, and the exact files named by the selected task before editing.
3. Run `rg` for every named symbol and inspect current merged code before assuming a path or implementation is unchanged.
4. Respect each task's dependencies and scope guardrails. Do not absorb a later task merely because adjacent code is visible.
5. Edit source files only. Do not manually edit `dist/` or generated artifacts.
6. Preserve user data, legacy add-on state, and public bridge behavior unless a task explicitly defines a migration.
7. Add or update tests in the same pull request as implementation.
8. Put the work-package ID in the pull request title or description.

## Global definition of done

A work package is complete only when all of the following are true:

- [ ] Every package-specific acceptance criterion passes.
- [ ] `npm run lint` passes, including add-on source once the relevant lint coverage is added.
- [ ] `npm run test` passes.
- [ ] `git diff --check` passes.
- [ ] Applicable add-on build or manifest validation passes without an unintended version bump.
- [ ] Generated files are unchanged or regenerated only through the documented generator.
- [ ] No new listener, observer, timer, style, task, mount, or registration bypasses the repository's ownership and teardown APIs.
- [ ] No rename or restructure loses existing settings, enabled state, grants, matches, or storage keys.
- [ ] The pull request states any intentionally deferred follow-up task IDs.

## Merged baseline assumptions

These are prerequisites already expected in the merged repository, not work packages in this document:

- The Library add-on's site-wide scope correction is merged: its runtime registration uses `f95zone`, and feature enable/disable controls remain available from the core UI outside the add-on's runtime page scope.
- The core already has registerable add-on action descriptors and a hardened/versioned add-on bridge. This plan improves their scope policy and completes remaining structural cleanup; it does not restart those earlier migrations.
- Existing configuration schema, persistence, synchronization, and config-transfer service foundations remain the source of truth. `TRANSFER-02` removes the remaining feature-layer ownership and dependency inversion.
- Existing lifecycle, resource ownership, queue, teardown, and add-on UI trust-boundary contracts must be preserved.

## Repository findings that drive these packages

### Add-on scope matrix

The core currently derives only these active scope names from page state: `f95zone`, `thread`, and `latest`. Runtime registrations are not validated against that vocabulary, so unsupported strings are silently accepted and then can never match.

| Add-on | Userscript matches | Current runtime `pageScopes` | Finding | Owning task |
| --- | --- | --- | --- | --- |
| `example-addon` | all F95Zone pages | `thread`, `latest`, `download` | Golden example is out of scope on ordinary F95Zone pages even though it mounts site-wide controls. `download` is not a core scope. | `ADDON-GOLDEN-01` |
| `halloween-theme-addon` | all F95Zone pages | `thread`, `latest`, `download`, `global` | `global` and `download` are not core scopes. The add-on is out of scope on ordinary and masked F95Zone pages. | `ADDON-HALLOWEEN-01` |
| `image-repair-addon` | thread pages | `thread` | Scope matches current behavior. Its problems are structure, uncancelled timers/listeners, and overly narrow product identity. | `SITE-REPAIR-01` |
| `latest-filters-addon` | Latest Updates only | `latest` | Scope is correct and should remain page-specific. Do not change it to `f95zone` merely for consistency. | `ADDON-LATEST-FILTERS-01` |
| `library-addon` | all F95Zone pages | `f95zone` | The merged Library scope correction is the desired site-wide pattern. Preserve it. | `ADDON-LIBRARY-02` |
| `masked-direct-addon` | thread, masked, and external download hosts | `thread`, `download`, `direct-download` | Keep every existing `@match` and `@run-at`, but split metadata responsibilities: F95 execution registers with core using `f95zone`; external-host execution is standalone and never becomes a core `download` scope. Catalog support must use exact match coverage plus core scope, not scope alone. | `ADDON-SCOPE-02`, `ADDON-MASKED-DIRECT-01` |

### Cross-cutting findings

- `feature.enable` and `feature.disable` are now intentionally exempted from `addon_out_of_scope`, but the exemption is hard-coded instead of being declared by action policy.
- `supportsCurrentPage` and execution authorization calculate scope compatibility separately. They must share one scope-intersection resolver; known-add-on UI status then adds the separate userscript-match check so UI support cannot overclaim route coverage.
- Runtime `pageScopes` are hard-coded inside add-on source while userscript `matches`, `grants`, `runAt`, capabilities, and core requirement are declared in `addons/addons.manifest.json`; `src/services/addons/trusted-catalog.json` contains another manually maintained projection. These sources already drift.
- Userscript activation metadata and core authorization metadata are currently conflated. `@match` decides where the add-on userscript is injected, `@run-at` decides bootstrap timing, and core `pageScopes` authorize bridge actions only after registration. They must remain separate contracts.
- `masked-direct-addon` is a hybrid userscript: F95Zone branches require/register with core, while external download-host branches intentionally run without core. The current boolean `requiresCore` cannot describe that accurately by itself.
- `src/services/addons/trusted-catalog.json` must remain at its current public path because the core header loads it through `@resource`; however, its contents should be generated or deterministically checked from manifest metadata rather than hand-edited.
- Root-level `stripCssComments.js` and `stripDebugLogs.js` are build-only modules. They belong under `scripts/`, but both the core and add-on build paths must be updated and smoke-tested without version bumps.
- The canonical add-on layout is documented, but only `example-addon` closely follows it. Its `createExampleAddonApp.js` is still a very large controller and its page-scope declaration is not a safe example.
- `src/services/configTransferService.js` exists, but it imports `normalizeImportRoot` from `src/features/config-transfer/transferIO.js`; the service therefore still depends on the feature/UI layer.
- `src/features/config-transfer/` still contains domain validation, normalization, browser file I/O, and dialog code in one feature-owned folder.
- `src/features/latest-ajax-error-recovery/` is still a core feature even though it is a narrowly targeted site-repair workaround.
- `src/services/addons/coreActions.js` still contains the legacy action implementations and imports descriptor registration, while `actions/descriptors.js` imports those implementations back from `coreActions.js`. The descriptor migration is not structurally complete.
- The root `lint` command currently targets `src/**` only. Add-on source is not protected by the same lint gate.

## Required execution order

### Wave 1 — Stabilize the public add-on and build contracts

1. `ADDON-SCOPE-02`
2. After `ADDON-SCOPE-02`, these may run in parallel:
   - `ADDON-GOLDEN-01`
   - `ADDON-IDENTITY-01`
   - `BUILD-TOOLS-01`

No production add-on should be reorganized before the golden example and scope metadata contract are updated. `BUILD-TOOLS-01` follows `ADDON-SCOPE-02` because both edit `addons/build-addon.js`; keeping that order prevents avoidable merge conflicts.

### Wave 2 — Normalize existing add-ons

These may run in parallel after `ADDON-GOLDEN-01`, except where noted:

- `ADDON-HALLOWEEN-01`
- `ADDON-LATEST-FILTERS-01`
- `ADDON-LIBRARY-02`
- `ADDON-MASKED-DIRECT-01`
- `SITE-REPAIR-01` after `ADDON-IDENTITY-01`

### Wave 3 — Move repair behavior out of core and finish Config Transfer

- `SITE-REPAIR-02` after `SITE-REPAIR-01`
- `TRANSFER-02` may run in parallel with `SITE-REPAIR-02`

### Wave 4 — Reduce core safely

1. `CORE-AUDIT-01`
2. `CORE-ACTIONS-02` and `CORE-FACADE-01` after `CORE-AUDIT-01`
3. `CORE-BOILERPLATE-01` after the two preceding refactors
4. `CORE-SIZE-GATE-01` last, after the new baseline is accepted

### Wave 5 — Integrated verification

- `TEST-ADDONS-01` after every affected add-on task and `SITE-REPAIR-02`
- Run the complete existing repository test suite as a release gate after `TRANSFER-02` and the core-reduction wave.

---

## ADDON-SCOPE-02 — Separate userscript activation metadata from core action scopes

**Priority:** Critical  
**Depends on:** None; the merged action-descriptor and bridge foundations listed above are required baseline.  
**Primary files:** `addons/addons.manifest.json`, `addons/build-addon.js`, `addons/README.md`, `header.txt`, `src/config/pageDefinitions.js`, `src/services/addonsService.js`, `src/services/addons/knownAddons.js`, `src/services/addons/registry.js`, `src/services/addons/catalog.js`, `src/services/addons/actions/**`, `src/services/addons/trusted-catalog.json`, new catalog generator/validator under `scripts/`, `tests/**`

### Agent execution command

> Execute `ADDON-SCOPE-02` only. Preserve every existing userscript match, grant, and run timing. Do not restructure individual add-ons beyond consuming injected metadata.

### Objective

Eliminate `addon_out_of_scope` caused by invalid or duplicated metadata without breaking hybrid add-ons that execute on pages where the core userscript is intentionally absent.

### Contract decision

Treat these as three separate contracts:

1. **Userscript activation metadata** — `matches`, `grants`, and `runAt` remain in `addons/addons.manifest.json`. The add-on builder generates the userscript header from them. They are never replaced by core scopes.
2. **Runtime mode** — add authoritative manifest metadata such as `runtimeMode: "core-required" | "standalone" | "hybrid"`:
   - `core-required`: every matched execution context expects the F95UE core;
   - `standalone`: no execution context uses the core bridge;
   - `hybrid`: F95Zone contexts use the core, while matched external-host contexts run standalone.
3. **Core action scopes** — `pageScopes` describe only where a registered add-on may invoke runtime-scoped core actions. Until a tested page definition is deliberately added, the public vocabulary is:
   - `f95zone`: any page on `f95zone.to` where the core is running;
   - `thread`: F95Zone thread routes;
   - `latest`: F95Zone Latest Updates routes.

Do not accept `global`, `download`, or `direct-download` as core scopes. External download hosts are userscript execution contexts, not core page scopes.

### Masked Direct metadata decision

For `masked-direct-addon`:

- Preserve the complete existing `matches` array, all grants, and `runAt: "document-idle"`.
- Set `runtimeMode: "hybrid"`.
- Set core `pageScopes: ["f95zone"]` for the F95Zone runtime because both `/threads/` and `/masked/` run under the core's `f95zone` state.
- Do not register on external hosts and do not call core APIs there.
- Do not use `pageScopes: ["f95zone"]` by itself to claim the add-on supports every F95Zone route. Catalog/UI support must also check the current URL against the add-on's actual userscript match patterns.

### Trusted catalog decision

Keep `src/services/addons/trusted-catalog.json` at the same path because `header.txt` references it via `@resource`. Change how it is maintained:

- Add catalog-only authoritative fields such as `downloadUrl` and `trusted` to each relevant manifest entry.
- Generate the catalog JSON as a deterministic projection of `addons/addons.manifest.json`, including at least identity, description, version, `matches`, `runAt`, `runtimeMode`, `pageScopes`, capabilities, download URL, and trust state.
- Add a check mode that fails when the committed catalog differs from the generated projection.
- Do not fetch or rewrite the catalog at runtime; the userscript manager still loads the committed file through the existing header resource URL.

### Required implementation

- [ ] Add required `pageScopes` and `runtimeMode` metadata to every add-on manifest entry.
- [ ] Keep `requiresCore` temporarily only as a compatibility input if necessary. Make `runtimeMode` authoritative, reject contradictory values, and derive legacy `__ADDON_REQUIRES_CORE__` behavior from it until all add-ons consume `__ADDON_RUNTIME_MODE__`.
- [ ] Add `__ADDON_PAGE_SCOPES__` and `__ADDON_RUNTIME_MODE__` to add-on build defines and include both in change-detection hashes.
- [ ] Keep `matches`, `grants`, and `runAt` in the generated header. Do not move them into add-on source modules.
- [ ] Update the canonical runtime object to read injected page scopes/runtime mode and pass only `runtime.pageScopes` during core registration.
- [ ] Validate manifest scopes against the supported vocabulary. Fail on unknown scopes, duplicate scopes, empty strings, or missing scopes for a core-registering runtime.
- [ ] Validate runtime mode values and require at least one F95Zone match for `core-required`; require both F95Zone and non-F95Zone matches for `hybrid`.
- [ ] Add a bounded userscript-match resolver for the patterns used by this repository. It must correctly handle wildcard schemes, exact hosts, `*.` subdomains, and wildcard paths without evaluating arbitrary regular expressions from catalog data.
- [ ] Split known-add-on status into:
  - `matchesCurrentPage`: current URL is covered by manifest/catalog `matches`;
  - `scopeApplies`: core page scope intersects `pageScopes`;
  - `supportsCurrentPage`: both are true for core-using contexts.
- [ ] Keep execution-time core-action authorization based on the registered add-on and shared `scopeApplies` resolver. Do not use catalog `matches` as an authorization substitute after registration.
- [ ] Replace `isFeatureToggleAction()` special-casing with descriptor metadata such as `scopePolicy: "management" | "runtime"`.
- [ ] Mark `addon.access`, `addon.throttle`, `feature.enable`, and `feature.disable` as management actions.
- [ ] Keep `feature.refresh`, storage, IDB, observer, toast, and UI actions runtime-scoped unless a later contract explicitly changes them.
- [ ] Reject unknown runtime registration scopes as `invalid_registration` rather than retaining an impossible registration.
- [ ] Add deterministic trusted-catalog generation/checking from manifest metadata while preserving the catalog's current path and header resource name.
- [ ] Update `addons/README.md` with a decision table covering activation metadata, runtime mode, core scopes, catalog support, and generated headers.

### Required tests

- [ ] Header snapshots prove every existing add-on keeps its intended `@match`, `@grant`, and `@run-at` lines.
- [ ] Masked Direct's header keeps all currently supported F95Zone and external-host matches and `@run-at document-idle`.
- [ ] Ordinary forum page, thread page, Latest page, and `/masked/` page scope snapshots.
- [ ] Masked Direct reports supported on thread and `/masked/`, unsupported on an ordinary F95Zone route, and has no catalog/core decision on external hosts because core is absent there.
- [ ] Wildcard host/path match fixtures cover the existing Buzzheavier, Gofile, Pixeldrain, Datanodes, MediaFire, and Workupload patterns.
- [ ] Unknown registration scopes and invalid runtime modes are rejected.
- [ ] `feature.enable` and `feature.disable` work while an installed add-on is outside its activation match or runtime scope.
- [ ] `storage.get`, `storage.set`, `feature.refresh`, `observer.watch`, and `ui.mount` still return `addon_out_of_scope` when appropriate.
- [ ] Catalog generation is deterministic and manifest/catalog drift fails validation.
- [ ] The existing core header still references `src/services/addons/trusted-catalog.json` through the same `trustedAddonCatalog` resource name.

### Acceptance criteria

- [ ] Removing `download` as a core scope does not remove, narrow, or retime Masked Direct execution on external hosts.
- [ ] No supported add-on registers a scope name the core cannot produce.
- [ ] Catalog/UI page support does not claim a userscript runs on a route absent from its `@match` list.
- [ ] Core action authorization is not inferred from userscript `@match` metadata.
- [ ] The manifest is the authoritative metadata source; the generated userscript header and trusted catalog agree with it.
- [ ] Management controls remain available without weakening runtime action security.

### Scope guardrails

- Do not remove or consolidate Masked Direct host patterns merely because external pages do not have core scopes.
- Do not add external download hosts to core `pageDefinitions`; the core userscript does not run there.
- Do not move `runAt` into source code. It is userscript header metadata and remains manifest-driven.
- Do not make storage or arbitrary UI actions globally callable to hide incorrect metadata.
- Do not implement a permissive matcher that treats malformed or unknown patterns as supported.

---

## BUILD-TOOLS-01 — Move build-only strip plugins under `scripts/` safely

**Priority:** Medium  
**Depends on:** `ADDON-SCOPE-02`  
**Primary files:** `stripCssComments.js`, `stripDebugLogs.js`, `scripts/stripCssComments.js`, `scripts/stripDebugLogs.js`, `build.js`, `addons/build-addon.js`, `package.json`, build/plugin tests, repository documentation

### Agent execution command

> Execute `BUILD-TOOLS-01` only. Relocate the two build plugins without changing their transformation behavior, plugin names, release policy, or generated userscript semantics.

### Objective

Move root-level build implementation modules into the existing `scripts/` tooling boundary and prove both the core and add-on builders still load and apply them safely.

### Required implementation

- [ ] Use `git mv stripCssComments.js scripts/stripCssComments.js` and `git mv stripDebugLogs.js scripts/stripDebugLogs.js` so history is preserved.
- [ ] Keep the existing CommonJS exports unchanged:
  - `stripCssComments`, `stripCssText`;
  - `stripDebugLogs`, `stripStandaloneDebugLogs`.
- [ ] Update every import/require discovered by `rg`, including at minimum:
  - `build.js` to `./scripts/stripCssComments` and `./scripts/stripDebugLogs`;
  - `addons/build-addon.js` to `../scripts/stripDebugLogs`;
  - tests, docs, and any tooling fixtures.
- [ ] Preserve plugin names (`strip-css-comments`, `strip-debug-logs`) and existing regular/release selection rules.
- [ ] Add focused characterization tests before changing paths. Cover CSS comments outside strings, comment-like text inside quoted CSS values, multiline standalone `debugLog(...)`, `void debugLog(...)`, and `await debugLog(...)` statements.
- [ ] Add negative fixtures proving relocation does not broaden stripping to expressions, differently named functions, normal console calls, or string contents.
- [ ] Add or reuse a non-mutating add-on smoke-build mode. It must write to a temporary directory and must not change add-on versions, manifest content, build cache, or tracked `dist/` files.
- [ ] Run the core `build:smoke` path and at least one regular and one release add-on smoke build so both relocated imports are exercised.
- [ ] Update repository maps/documentation that list build-tool locations.
- [ ] Remove the old root files after all references are updated; do not leave forwarding shims unless an external documented consumer requires one.

### Required tests

- [ ] Direct unit tests for both exported transform helpers.
- [ ] Core regular smoke build loads `stripCssComments` from `scripts/`.
- [ ] Core release smoke build exercises both plugins without writing tracked output.
- [ ] Add-on release smoke build loads `stripDebugLogs` from `scripts/`.
- [ ] `rg` finds no references to `./stripCssComments`, `./stripDebugLogs`, or `../stripDebugLogs` that resolve to the former root paths.
- [ ] Before/after fixture output is byte-identical except for nondeterministic build banners explicitly excluded from comparison.

### Acceptance criteria

- [ ] Neither strip plugin remains at repository root.
- [ ] Core and add-on builds resolve the new paths on Windows and POSIX path handling.
- [ ] No validation command bumps `version.json`, add-on versions, or build cache state.
- [ ] Transformation behavior is unchanged; any behavior improvement is deferred to a separate task.

### Scope guardrails

- Do not rename the files or convert module format during this move.
- Do not rewrite the regex/parser logic while relocating it.
- Do not edit generated userscripts by hand.

---

## ADDON-GOLDEN-01 — Repair the Example Add-on before using it as the migration template

**Priority:** Critical  
**Depends on:** `ADDON-SCOPE-02`  
**Primary files:** `addons/example-addon/src/**`, `addons/example-addon/CHANGELOG.md`, `addons/README.md`, `addons/addons.manifest.json`, `package.json`, `eslint.config.mjs`, `scripts/**`, `tests/**`

### Agent execution command

> Execute `ADDON-GOLDEN-01` only. The output must be a tested canonical template; do not migrate another add-on in the same change.

### Objective

Make `example-addon` a genuinely safe golden standard for scope metadata, lifecycle ownership, testability, and folder boundaries.

### Required implementation

- [ ] Change the manifest scope to `pageScopes: ["f95zone"]` because the example userscript matches all F95Zone pages and deliberately exposes site-wide API controls.
- [ ] Remove hard-coded page scopes from `createExampleAddonApp.js`; registration must use `runtime.pageScopes`.
- [ ] Keep `main.js` limited to injected runtime construction, adaptor/app composition, core ping, bootstrap, and fatal-error reporting.
- [ ] Split the oversized app controller by responsibility without creating generic abstractions prematurely. At minimum separate:
  - lifecycle/command handling;
  - state creation and state transitions;
  - API demo action dispatch;
  - long-running bulk import orchestration;
  - UI event binding/render synchronization.
- [ ] Make all listener, timer, observer, dialog, mount, dock, and style ownership explicit and idempotent.
- [ ] Ensure disable can later re-enable the add-on; teardown may permanently unbind only for unregister/page teardown reasons.
- [ ] Ensure an in-flight bulk import is cancelled and cannot update UI after disable/teardown.
- [ ] Keep API wrappers thin and action-specific. Raw action strings must stay under `src/api/**` or the core adaptor.
- [ ] Add a small reusable runtime metadata helper only if it removes identical injected-constant boilerplate from at least two modules in the example itself; otherwise document the pattern and leave extraction to `CORE-BOILERPLATE-01`.
- [ ] Add an add-on structure validator that checks required boundaries (`main.js`, `core/`, `api/`, `app/`, `ui/`) while allowing documented exceptions for genuinely tiny add-ons.
- [ ] Add an add-on lint command covering `addons/*/src/**/*.js` and include it in the normal CI/check sequence. Fix only example/shared violations in this task.
- [ ] Correct the malformed placeholder path examples in `addons/README.md` and document that folder name, manifest ID, entry path, and output path must agree.

### Required tests

- [ ] Bootstrap on a normal F95Zone page does not produce `addon_out_of_scope` for the example panel.
- [ ] Enable/disable/refresh are repeatable.
- [ ] Teardown removes every owned resource and sends exactly one acknowledgment.
- [ ] A late bulk result after cancellation does not reopen or update a dialog.
- [ ] Structure validation passes for the example and fails a fixture with a monolithic/raw-bridge layout.
- [ ] Add-on lint runs independently from core lint.

### Acceptance criteria

- [ ] The example is usable as a copy source without inheriting the current scope bug.
- [ ] `createExampleAddonApp.js` is an orchestration facade rather than the location of every behavior.
- [ ] The README structure and actual example structure match exactly.
- [ ] Subsequent add-on tasks can reference concrete example modules instead of prose-only conventions.

### Scope guardrails

- Preserve the example's role as an API playground.
- Do not turn the example into a shared production framework package.
- Do not remove demonstrations merely to make the file smaller; relocate and test them.

---

## ADDON-IDENTITY-01 — Add safe legacy-ID migration for renamed add-ons

**Priority:** High  
**Depends on:** `ADDON-SCOPE-02`  
**Primary files:** `addons/addons.manifest.json`, `addons/build-addon.js`, `src/services/addons/catalog.js`, `src/services/addons/registry.js`, `src/services/addons/state.js`, `src/services/addons/knownAddons.js`, `src/services/addons/trusted-catalog.json`, `src/services/configMigrationService.js`, `tests/**`

### Agent execution command

> Execute `ADDON-IDENTITY-01` only. Add generic alias migration support and a fixture alias; do not rename Image Repair in this task.

### Objective

Allow an official add-on ID/folder rename without losing enabled state, settings, installation trace, trust, or update visibility and without showing both old and new cards.

### Required implementation

- [ ] Add optional `legacyIds` to manifest metadata and validate each value with the same ID sanitizer.
- [ ] Fail validation when a legacy ID collides with any active ID, another alias, or the current ID.
- [ ] Include legacy IDs in built metadata only if the runtime needs them; otherwise keep migration core-owned.
- [ ] During config migration, atomically merge legacy add-on state into the current ID:
  - current-ID values win when explicitly present;
  - missing current values inherit legacy values;
  - installation timestamps retain the earliest install sighting and latest last-seen time;
  - status messages and panel metadata prefer the current ID;
  - the legacy bucket is removed only after the current bucket is persisted.
- [ ] Resolve trusted-catalog lookups and installed snapshots through the canonical ID.
- [ ] If an old userscript still registers under a legacy ID during the transition, map it to the canonical card but reject simultaneous conflicting runtime registrations deterministically.
- [ ] Record a versioned/idempotent migration marker.
- [ ] Document the release sequence: ship core alias support first or in the same release that publishes the renamed add-on.

### Required tests

- [ ] Legacy-only state migrates.
- [ ] Current and legacy state merge without overwriting explicit current values.
- [ ] Interrupted/failed persistence leaves the legacy state recoverable.
- [ ] Re-running migration is a no-op.
- [ ] Old and new runtime registrations do not create duplicate cards.
- [ ] Trust and download metadata resolve to the canonical ID.

### Acceptance criteria

- [ ] Renaming an add-on does not silently reset it to enabled or erase settings.
- [ ] Users see one canonical add-on entry.
- [ ] Migration is deterministic and reversible from the pre-commit snapshot on failure.

---

## ADDON-HALLOWEEN-01 — Normalize Halloween Theme to the golden add-on structure

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`  
**Primary files:** `addons/halloween-theme-addon/src/**`, `addons/halloween-theme-addon/CHANGELOG.md`, `addons/addons.manifest.json`, `tests/**`

### Agent execution command

> Execute `ADDON-HALLOWEEN-01` only. Preserve the visible Halloween theme behavior while replacing its bridge, scope, and cleanup structure.

### Current defects to address

- Unsupported `global`/`download` registration scopes.
- Direct `<style>` injection despite core-owned style APIs.
- Anonymous command listener cannot be cleanly unbound.
- Logo mutation scans every image and relies only on element datasets for restoration.
- No explicit refresh path or route-aware reapplication.

### Required implementation

- [ ] Set manifest scope to `f95zone` and registration to `runtime.pageScopes`.
- [ ] Add only the capabilities actually used; use `ui.style` for the background CSS.
- [ ] Adopt the golden boundaries: `core/adaptor.js`, thin `api/**`, `app/createHalloweenThemeApp.js`, `ui/` assets/render helpers, small `main.js`.
- [ ] Narrow logo selectors to the actual site logo candidates and store restoration state in app-owned records so teardown works even if datasets are altered.
- [ ] Make apply/remove idempotent and safe across dynamic navigation.
- [ ] Handle `enable`, `disable`, `refresh`, `before-page-change`, and `teardown` explicitly.
- [ ] Unbind all listeners on terminal teardown and acknowledge exactly once.
- [ ] Do not request Notification, storage, observer, or broad `ui` capabilities.

### Required tests

- [ ] Works on ordinary, thread, Latest, and masked F95Zone routes without scope errors.
- [ ] Repeated enable does not duplicate style or mutation records.
- [ ] Disable restores original `src` and `srcset` values.
- [ ] Added/replaced logo after route change is reapplied on refresh.
- [ ] Teardown leaves no command listener or style.

### Acceptance criteria

- [ ] No direct raw core event dispatch remains outside the adaptor/API boundary.
- [ ] No unsupported page scope remains.
- [ ] Resource cleanup follows the golden sequence.

---

## ADDON-LATEST-FILTERS-01 — Restructure Latest Filters without broadening its scope

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`  
**Primary files:** `addons/latest-filters-addon/src/**`, `addons/latest-filters-addon/CHANGELOG.md`, `addons/addons.manifest.json`, `tests/**`

### Agent execution command

> Execute `ADDON-LATEST-FILTERS-01` only. Keep the add-on Latest-only and preserve saved preset compatibility.

### Current defects to address

- Mutable singleton state is exported from `constants.js`.
- Bridge calls, app state, rendering, timers, route handling, and storage orchestration are mixed in a small set of broad modules.
- Panel action metadata says it does not require an active page even though the command itself rejects non-Latest pages.
- Timer/listener ownership is not represented by a single lifecycle object.

### Required implementation

- [ ] Keep `pageScopes: ["latest"]` and the existing Latest-only userscript match.
- [ ] Move mutable state into an app instance; `constants.js` must contain static values only.
- [ ] Adopt `core/`, `api/`, `app/`, and `ui/` boundaries matching the golden example.
- [ ] Separate preset repository/normalization from UI rendering.
- [ ] Keep GM-backed compatibility only behind a storage adapter; do not scatter GM calls through app/UI modules.
- [ ] Make the panel action truthfully require the active page, or remove the redundant manual rejection if the core active-page guard becomes authoritative.
- [ ] Track and cancel mount retries, route listeners, dialog listeners, and pending storage work on disable/teardown.
- [ ] Preserve existing storage keys and migrate only when a schema change is required.

### Required tests

- [ ] Presets and settings load from existing keys.
- [ ] Normal Latest bootstrap, disable, re-enable, refresh, and teardown.
- [ ] Rapid Latest route replacement does not create duplicate buttons or dialogs.
- [ ] Non-Latest metadata remains installed/idle and management toggles remain usable when the script is not registered.
- [ ] Cancelled mount retries cannot recreate UI after disable.

### Acceptance criteria

- [ ] Scope remains intentionally narrow.
- [ ] No mutable app state is exported from constants.
- [ ] `main.js` and the core adaptor contain no feature-specific rendering logic.

---

## ADDON-LIBRARY-02 — Align Library with the golden structure while preserving the merged scope fix

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`  
**Primary files:** `addons/library-addon/src/**`, `addons/library-addon/CHANGELOG.md`, `addons/addons.manifest.json`, `tests/**`

### Agent execution command

> Execute `ADDON-LIBRARY-02` only. Do not redesign Library data behavior; this is a boundary/lifecycle migration with regression coverage.

### Required implementation

- [ ] Preserve `pageScopes: ["f95zone"]` exactly.
- [ ] Replace `coreBridge.js` with the golden `core/adaptor.js` plus thin action APIs.
- [ ] Reduce `main.js` to composition. Move registration, command routing, enabled-state transitions, dock orchestration, and manager orchestration into app modules.
- [ ] Keep existing `library/`, `thread/`, and `ui/` domain folders, but prevent them from invoking raw bridge actions directly.
- [ ] Centralize registration metadata and settings defaults in one app/runtime module.
- [ ] Ensure dock mount/listener, manager dialog, import progress dialog, and IDB work are all cancelled/closed in the documented teardown order.
- [ ] Preserve legacy migration, database names, store names, indexes, storage keys, and import/export formats.
- [ ] Remove unconditional debug output or route it through the shared debug utility so release stripping is reliable.

### Required tests

- [ ] Library controls and settings are available on ordinary, thread, Latest, and masked F95Zone routes.
- [ ] Thread-only buttons appear only on thread pages while the manager remains site-wide.
- [ ] Existing records and legacy migration remain compatible.
- [ ] Disable during import cancels progress and prevents late writes/UI updates.
- [ ] Re-enable restores the manager/dock without duplicate listeners.

### Acceptance criteria

- [ ] The Codex Library scope fix is not regressed.
- [ ] Library domain modules do not know bridge event names or raw action strings.
- [ ] Structural validation and add-on lint pass.

---

## ADDON-MASKED-DIRECT-01 — Split F95 core mode from external-host standalone mode

**Priority:** Critical  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-SCOPE-02`  
**Primary files:** `addons/masked-direct-addon/src/**`, `addons/masked-direct-addon/CHANGELOG.md`, `addons/addons.manifest.json`, generated `src/services/addons/trusted-catalog.json`, `tests/**`

### Agent execution command

> Execute `ADDON-MASKED-DIRECT-01` only. Preserve every existing host match, grant, `document-idle` timing, selector, route-context field, and supported flow; do not add or remove download hosts.

### Current defects to address

- `/masked/` registers with scopes that cannot match the core's `f95zone` state.
- The userscript is hybrid: F95Zone branches require core, while external-host branches intentionally run without core. The old boolean-only metadata and broad entry point obscure this contract.
- If catalog support uses only `pageScopes: ["f95zone"]`, it can incorrectly claim the add-on executes on ordinary F95Zone routes that are absent from its userscript `@match` list.
- Host controllers, storage strategy, route context, command lifecycle, and UI style ownership are composed in a broad main flow.
- Core-backed settings and GM-backed cross-host state are not represented as separate ports.

### Required implementation

- [ ] Consume manifest-injected `runtimeMode: "hybrid"` and `pageScopes: ["f95zone"]`; remove hard-coded `thread`, `download`, and `direct-download` registration scopes.
- [ ] Preserve the manifest's full existing `matches`, grants, and `runAt: "document-idle"`. These remain header/build metadata and are not moved into source modules.
- [ ] Introduce an explicit runtime-context classifier with two modes:
  - `f95-core`: only matched F95Zone thread and `/masked/` routes; requires core, registers once, and may invoke core APIs;
  - `external-standalone`: supported external hosts; never registers with core and never invokes core actions.
- [ ] Ensure an ordinary F95Zone route is neither an F95 add-on activation route nor a supported catalog page, even though the core's active scope includes `f95zone`.
- [ ] Do not pretend external hosts are core `download` scopes.
- [ ] Adopt golden boundaries for F95 mode and a `hosts/` adapter boundary for external mode.
- [ ] Keep route-context handoff in a dedicated repository/port with TTL, request ID, and cleanup tests.
- [ ] Define which settings are global across hosts and keep them in the GM adapter; use core storage only for F95 panel settings when there is a clear synchronization rule.
- [ ] Prevent two sources of truth for enabled/settings state. Document and test the chosen owner.
- [ ] Move every raw timer/listener/observer into a controller-owned teardown collection.
- [ ] Ensure F95 disable stops creation of new outbound flows; define whether an already-open external-host tab completes or checks the persisted disabled flag, and test that decision.
- [ ] Make the generated header notice accurately describe hybrid behavior: core required on F95Zone execution contexts, standalone on supported external hosts.
- [ ] Preserve all existing host selectors and timing values unless a focused fixture demonstrates a defect.

### Required tests

- [ ] Thread and `/masked/` F95 pages register once with `pageScopes: ["f95zone"]` and no scope error.
- [ ] An ordinary F95Zone page is not matched/supported for this add-on and does not wait for registration.
- [ ] External hosts operate with core absent and emit no core ping, register, status, or core-action bridge events.
- [ ] Core absent on a matched F95 route exits safely.
- [ ] Header snapshot preserves every existing F95 and external-host `@match`, every grant, and `@run-at document-idle`.
- [ ] Trusted-catalog snapshot preserves full activation metadata and reports `runtimeMode: "hybrid"` plus core `pageScopes: ["f95zone"]`.
- [ ] Route context expires, rejects mismatched request IDs, and is cleaned after completion.
- [ ] Disable/teardown removes F95 UI styles/listeners and prevents new flows.
- [ ] Each existing host adapter has a focused fixture test for success, timeout, and missing-selector failure.

### Acceptance criteria

- [ ] Removing `download`/`direct-download` core scopes causes no loss of external-host behavior.
- [ ] Core and standalone modes are obvious from entry-point composition.
- [ ] No unsupported scope string remains.
- [ ] The catalog, generated header, and runtime registration describe the same hybrid add-on without conflating their responsibilities.
- [ ] No host controller imports the core adaptor directly.

### Scope guardrails

- Do not narrow the current userscript `@match` list.
- Do not change `runAt` to solve a core scope problem.
- Do not make the core userscript execute on external download hosts.
- Do not use a catalog match as permission to invoke core; registration and core scope authorization still apply.

---

## SITE-REPAIR-01 — Rebrand and restructure Image Repair as F95UE Site Repair

**Priority:** Critical  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-IDENTITY-01`  
**Primary files:** `addons/image-repair-addon/**`, new `addons/site-repair-addon/**`, `addons/addons.manifest.json`, `src/services/addons/trusted-catalog.json`, add-on state/config migration files, root/add-on documentation, `tests/**`

### Agent execution command

> Execute `SITE-REPAIR-01` only. Rebrand, migrate identity/state, and move the existing image repair behavior into the new structure. Do not move Latest Ajax Recovery yet.

### Canonical naming decision

Use the repository's folder-equals-ID convention:

- folder and ID: `site-repair-addon`
- display/userscript name: `F95UE Site Repair`
- output: `addons/site-repair-addon/dist/site-repair-addon.user.js`
- legacy ID: `image-repair-addon`

Do not use a bare `addons/site-repair/` folder while the manifest/build conventions require folder and ID alignment.

### Required implementation

- [ ] Create the new add-on from the updated golden structure.
- [ ] Declare `legacyIds: ["image-repair-addon"]` and use the migration support from `ADDON-IDENTITY-01`.
- [ ] Expand userscript matches to `*://f95zone.to/*` and declare `pageScopes: ["f95zone"]`; individual repair modules decide their page applicability internally.
- [ ] Register public name `F95UE Site Repair` and update descriptions, download metadata, docs, changelog, build scripts, and console helper names.
- [ ] Organize repair modules under explicit boundaries, for example:
  - `app/createSiteRepairApp.js`
  - `repairs/imageAttachments/controller.js`
  - `repairs/imageAttachments/retryQueue.js`
  - `repairs/imageAttachments/state.js`
  - `ui/imageRepairToast.*`
- [ ] Preserve the legacy image-repair enabled state and settings through the ID migration.
- [ ] Replace recursive uncancelled retry timers with a cancellable queue/scheduler owned by the image repair module.
- [ ] Track image error listeners so disable/teardown removes them or invalidates their generation.
- [ ] Remove the unused/dead queue path and unused constants, or make the queue the single actual scheduler.
- [ ] Avoid mutating `img.src` with unbounded cache-buster accumulation; always retry from a stable original URL.
- [ ] Make notification use optional and non-blocking. Do not request permission during bootstrap; request only from a user action or omit native notifications in favor of core toast/UI.
- [ ] Add per-module settings shape now, even with one module, so `SITE-REPAIR-02` can add Latest repair without another storage redesign:
  - `enabled`
  - `repairs.imageAttachments.enabled`
  - reserved `repairs.latestAjax.enabled`
- [ ] Teardown modules in reverse startup order and acknowledge after queues, observers, UI, styles, and listeners are settled.

### Required tests

- [ ] Legacy ID state migrates and only the Site Repair card remains.
- [ ] Existing enabled/disabled preference is preserved.
- [ ] Broken attachment image success, retry exhaustion, disable mid-retry, removed-node retry, and route change.
- [ ] No timer/listener updates metrics or UI after generation invalidation.
- [ ] Site Repair can remain registered on non-thread F95Zone pages while the image module stays idle.

### Acceptance criteria

- [ ] Public branding no longer implies image-only behavior.
- [ ] Existing users do not lose state or see duplicate add-ons.
- [ ] The image repair module is independently startable/stoppable and ready to coexist with additional repairs.

### Scope guardrails

- Do not move Latest Ajax Recovery in this task.
- Do not keep a compatibility userscript under the old ID after migration unless release policy explicitly requires a one-time redirect build.
- Do not add generic arbitrary-script injection to the core bridge.

---

## SITE-REPAIR-02 — Move Latest Ajax Error Recovery from core into Site Repair

**Priority:** Critical  
**Depends on:** `SITE-REPAIR-01`, `TRANSFER-02` only if config import migration is changed in the same branch  
**Primary files:** `src/features/latest-ajax-error-recovery/**`, `src/config/defaults.js`, `src/config/schema.js`, `src/services/configMigrationService.js`, `src/generated/features.generated.js` via generator, `addons/site-repair-addon/src/**`, `addons/addons.manifest.json`, docs, `tests/**`

### Agent execution command

> Execute `SITE-REPAIR-02` only. Move the complete behavior and preference into Site Repair, then remove the core feature. Do not leave two active patches.

### Objective

Make Latest Ajax Recovery an optional Site Repair module while preserving its retry safety, page-context behavior, and the user's existing toggle.

### Required implementation

- [ ] Move pure payload normalization and retry-decision functions into a testable Site Repair module.
- [ ] Move the page-context jQuery patch into a narrowly scoped add-on adapter that injects only bundled static code. Do not expose an arbitrary `eval`/script action through the core bridge.
- [ ] Preserve one-patch semantics, original `$.ajax` restoration, one safe retry, and the 403/429 no-retry rule.
- [ ] Add generation/cancellation checks so a delayed retry cannot run after module disable, route change, or teardown.
- [ ] Activate the module only on Latest routes while the Site Repair registration remains `f95zone`.
- [ ] Migrate `latestSettings.latestAjaxErrorRecovery` into `addons.state.site-repair-addon.settings.repairs.latestAjax.enabled` (or the actual canonical add-on state path) with an idempotent versioned migration.
- [ ] Define precedence when both a newly set Site Repair value and a legacy core value exist: explicit Site Repair value wins.
- [ ] Update config import migration so old exports containing `latestSettings.latestAjaxErrorRecovery` preserve intent after import.
- [ ] Remove the old setting metadata, core default/schema field, feature folder, generated feature entry, README core-feature listing, and any direct imports.
- [ ] Regenerate generated manifests using the documented non-version-bumping generator.
- [ ] Update Site Repair panel metadata to expose independent Image Attachments and Latest Ajax repair toggles.

### Required tests

- [ ] Pure normalization and retry predicate parity with the old feature.
- [ ] Parser error, timeout, status 0, 5xx, 403, and 429 cases.
- [ ] Exactly one retry and no retry after disable.
- [ ] jQuery loaded before bootstrap and loaded later.
- [ ] Duplicate enable does not double-patch; disable restores the original function.
- [ ] Legacy config preference migrates and old exported config imports correctly.
- [ ] Core feature discovery no longer includes Latest Ajax Recovery.
- [ ] Only Site Repair owns the page marker/event after migration.

### Acceptance criteria

- [ ] The main userscript no longer bundles Latest Ajax Recovery.
- [ ] Site Repair supplies identical or safer behavior on Latest pages.
- [ ] No user preference is silently reset.
- [ ] Disabling/uninstalling Site Repair leaves the site's original Ajax implementation intact.

---

## TRANSFER-02 — Finish converting Config Transfer from a feature into a service plus UI adapter

**Priority:** Critical  
**Depends on:** None inside this plan; use the merged configuration schema, persistence, synchronization, and transfer-service foundations as fixed contracts.  
**Primary files:** `src/services/configTransferService.js`, new `src/services/configTransfer/**`, `src/features/config-transfer/**`, new `src/ui/configTransfer/**`, `src/ui/settings/globalSettings.js`, config schema/migration files, `tests/**`

### Agent execution command

> Execute `TRANSFER-02` only. Treat the existing service as partial work. Remove the feature-owned domain dependency and leave the UI as a thin adapter.

### Current defect

`configTransferService` imports `normalizeImportRoot` from `src/features/config-transfer/transferIO.js`, while that feature folder also contains duplicate validation, domain helpers, browser I/O, and dialog error rendering. The dependency direction is inverted.

### Target ownership

- `src/services/configTransfer/**`: format versions, normalization/migration, export assembly, preview/diff, validation orchestration, transactional commit.
- `src/ui/configTransfer/**`: file picker, download Blob/URL handling, dialog/controller, error presentation, reload prompt.
- `src/ui/settings/globalSettings.js`: contributes only the button that opens the UI controller.
- No `src/features/config-transfer/` folder remains.

### Required implementation

- [ ] Move import-root normalization and legacy-format migration into the service layer.
- [ ] Replace duplicated `validation.js` rules with the canonical config schema API. Retain only transfer-document validation not represented by config schema.
- [ ] Split browser file I/O from domain serialization. Service functions accept/return plain objects or strings and must run in Node tests without DOM globals.
- [ ] Give the transfer document an explicit format version and a migration table rather than ad hoc shape detection only.
- [ ] Keep preview and commit separate; commit must revalidate the exact candidate being persisted.
- [ ] Use the shared config commit/application service so local UI, import, and sync apply the same effects and revision rules.
- [ ] Make commit atomic and return structured issues/warnings/changed paths.
- [ ] Move the dialog and inline error element into `src/ui/configTransfer/` and remove state-manager DOM querying from the service.
- [ ] Revoke object URLs and clean temporary inputs/listeners on success, cancel, dialog close, and teardown.
- [ ] Remove `src/features/config-transfer/**` and update all imports/docs.
- [ ] Remove or correct stale documentation and status indexes that describe Config Transfer as fully converted while feature-owned dependencies still remain.

### Required tests

- [ ] Export document contains only schema-exportable keys and is detached from live config.
- [ ] Current format, legacy unwrapped format, malformed root, unsupported future version, and migrated tag shapes.
- [ ] Preview does not mutate live config.
- [ ] Commit failure leaves current and persisted config unchanged.
- [ ] Successful commit applies effects once and does not create a sync loop.
- [ ] UI file cancel removes temporary DOM/listeners.
- [ ] Static dependency test: no service imports from `src/features` or `src/ui`.

### Acceptance criteria

- [ ] Config Transfer is not discovered, toggled, or lifecycle-managed as a feature.
- [ ] Domain service is DOM-free and feature-free.
- [ ] UI remains replaceable without changing import/export semantics.

---

## CORE-AUDIT-01 — Produce a deterministic `/src` size and dependency baseline

**Priority:** High  
**Depends on:** `TRANSFER-02` and `SITE-REPAIR-02` may be pending, but record them as planned removals  
**Primary files:** new `scripts/source-audit.cjs`, `package.json`, `docs/architecture/source-size-baseline.md`, `tests/**`

### Agent execution command

> Execute `CORE-AUDIT-01` only. Add measurement and findings; do not move production modules in the same change.

### Objective

Create a reproducible basis for safe size reduction instead of using raw line count as a refactoring target.

### Required implementation

- [ ] Add a script that reports for authored source only:
  - file count, physical lines, nonblank/noncomment lines, and bytes by top-level area;
  - largest files;
  - import fan-in/fan-out;
  - strongly connected import components/cycles;
  - cross-boundary imports (`core`, `services`, `features`, `ui`, `config`);
  - duplicate basename/similar helper candidates as hints, not automatic refactors.
- [ ] Exclude generated manifests, `dist`, vendored data, test fixtures, and build artifacts from authored-source totals while reporting them separately.
- [ ] Emit stable JSON for CI and a human-readable summary.
- [ ] Capture the merged baseline and annotate known planned changes:
  - removal of core Latest Ajax Recovery;
  - removal of feature-owned Config Transfer;
  - completion of add-on action decomposition.
- [ ] Define architecture direction rules and list current exceptions rather than failing immediately on every historical violation.
- [ ] Add characterization-test requirements to every proposed large-file split.

### Acceptance criteria

- [ ] Repeated runs on unchanged source produce byte-for-byte identical JSON except an explicitly omitted timestamp.
- [ ] The report identifies the current config-transfer dependency inversion and add-on action cycle.
- [ ] Generated code cannot make authored-source metrics look worse or better.
- [ ] No arbitrary “maximum lines per file” rule is introduced.

---

## CORE-ACTIONS-02 — Complete add-on action modularization and remove the legacy cycle

**Priority:** High  
**Depends on:** `CORE-AUDIT-01`, `ADDON-SCOPE-02`  
**Primary files:** `src/services/addons/coreActions.js`, `src/services/addons/actions/**`, `src/services/addonsService.js`, `tests/**`

### Agent execution command

> Execute `CORE-ACTIONS-02` only. Preserve action IDs, result shapes, capability rules, throttling, and authorization timing.

### Current defect

`coreActions.js` imports descriptor registration, while `actions/descriptors.js` imports all implementation functions from `coreActions.js`. The legacy handler table and all action bodies remain in the facade, so the earlier modularization reduced lookup logic but not ownership or file size.

### Required implementation

- [ ] Create action-family modules such as `featureActions`, `storageActions`, `idbActions`, `observerActions`, and `uiActions` under `src/services/addons/actions/`.
- [ ] Co-locate each descriptor with its validator, required capability, scope policy, timeout, redaction rule, and executor where practical.
- [ ] Make `coreActions.js` a small facade that exposes registry invocation/snapshots only.
- [ ] Remove `createLegacyActionHandlers` and all unused legacy paths.
- [ ] Eliminate the circular import; descriptor registration must have one explicit composition root.
- [ ] Preserve execution-time reauthorization before asynchronous completion/commit.
- [ ] Keep shared payload-size and UI-sanitization policies in narrowly named helpers rather than duplicating them.
- [ ] Add a registry completeness assertion so every public action is registered exactly once.

### Required tests

- [ ] Contract snapshots for every action ID, capability alternatives, scope policy, validator result, and timeout.
- [ ] Existing success/failure cases for storage, IDB, observer, UI, and lifecycle actions.
- [ ] Capability/scope revoked while an async action is running.
- [ ] Import graph contains no action-registration cycle.
- [ ] Unsupported action remains deterministic.

### Acceptance criteria

- [ ] `coreActions.js` is a facade, not a second implementation registry.
- [ ] Adding an action requires one action-family registration change, not edits to parallel maps.
- [ ] No behavior change is hidden as “cleanup.”

---

## CORE-FACADE-01 — Decompose `addonsService.js` without changing its public API

**Priority:** High  
**Depends on:** `CORE-AUDIT-01`, `CORE-ACTIONS-02`  
**Primary files:** `src/services/addonsService.js`, `src/services/addons/**`, `tests/**`

### Agent execution command

> Execute `CORE-FACADE-01` only. Keep all existing imports from `addonsService.js` working unless a separately documented deprecation is added.

### Objective

Reduce the add-on service composition root safely by moving policies and workflows to owned modules, not by introducing a generic service locator.

### Required implementation

- [ ] Add characterization tests for current public exports before moving code.
- [ ] Move action limits/throttle calculation into an add-on API policy module.
- [ ] Move page-scope resolution/authorization to the shared scope module from `ADDON-SCOPE-02`.
- [ ] Move registered/unregistered action workflow into an invocation service.
- [ ] Move installation-trace migration/removal into the add-on state repository.
- [ ] Move bridge callback composition into a clearly named bootstrap/composition module.
- [ ] Keep `addonsService.js` as the stable public facade exporting registry, state, catalog, lifecycle, invocation, and initialization entry points.
- [ ] Avoid dependency injection objects with dozens of untyped properties; use small family-specific dependencies or constructors.
- [ ] Ensure disabling the service shuts down the bridge and performs deterministic best-effort cleanup.

### Required tests

- [ ] Public export compatibility.
- [ ] Registered and unregistered enable/disable behavior.
- [ ] Trust/block/scope/capability rejection ordering.
- [ ] Bridge init/shutdown/re-init.
- [ ] Teardown watchdog and hard cleanup.
- [ ] No new import cycle in `src/services/addons/**`.

### Acceptance criteria

- [ ] The facade is materially smaller and reads as composition/delegation.
- [ ] Security decisions remain centralized and testable.
- [ ] No add-on-facing response shape changes.

---

## CORE-BOILERPLATE-01 — Reduce repeated lifecycle/composition code with narrow factories

**Priority:** Medium  
**Depends on:** `CORE-ACTIONS-02`, `CORE-FACADE-01`, completed add-on golden migrations  
**Primary files:** `src/core/**`, `src/services/**`, `src/features/**`, `addons/shared/**`, updated add-ons, `tests/**`

### Agent execution command

> Execute `CORE-BOILERPLATE-01` only after identifying at least three structurally identical call sites. Do not create abstractions from one example.

### Objective

Reduce boilerplate while keeping lifecycle, cancellation, scope, and cleanup behavior explicit enough to audit.

### Candidate reductions to verify

- Add-on runtime metadata construction and guarded bootstrap.
- Add-on command binding/unbinding with exactly-once teardown acknowledgment.
- Feature settings toggle metadata that only calls `feature.sync()`.
- Cancellable timer/retry ownership patterns.
- Repeated service result/issue formatting.

### Required implementation

- [ ] Use the source-audit report plus `rg` to prove each selected pattern has at least three equivalent sites.
- [ ] Add characterization tests before replacing a pattern.
- [ ] Prefer factories that return explicit handles (`start`, `stop`, `dispose`, `signal`, `generation`) over hidden global registration.
- [ ] Keep feature-specific selectors, policies, and state transitions at call sites.
- [ ] Do not merge core feature lifecycle and add-on bridge lifecycle into one abstraction; they have different trust and process boundaries.
- [ ] Measure authored lines/bytes and bundle output before and after. Accept a small source increase only when it removes a more important correctness risk.
- [ ] Update the golden example and docs when an add-on-facing helper becomes canonical.

### Required tests

- [ ] Factory-specific unit tests for idempotency and terminal teardown.
- [ ] At least one migrated core feature and two migrated add-ons per add-on helper.
- [ ] No listener/timer/style/resource leak under repeated enable/disable.
- [ ] No stale callback after generation invalidation.

### Acceptance criteria

- [ ] Boilerplate reduction is demonstrated with before/after metrics.
- [ ] Call sites remain readable without tracing through a generic framework.
- [ ] Factories improve or preserve failure-path observability.

---

## CORE-SIZE-GATE-01 — Add trend-based source and bundle budgets

**Priority:** Medium  
**Depends on:** `CORE-AUDIT-01`, `CORE-ACTIONS-02`, `CORE-FACADE-01`, `CORE-BOILERPLATE-01`, `SITE-REPAIR-02`, `TRANSFER-02`, `BUILD-TOOLS-01`  
**Primary files:** `scripts/source-audit.cjs`, new baseline JSON, `package.json`, CI workflow, build smoke scripts, docs

### Agent execution command

> Execute `CORE-SIZE-GATE-01` only. Add budgets from the accepted post-refactor baseline; do not use the gate to force unrelated code deletion.

### Required implementation

- [ ] Store an reviewed authored-source and bundle baseline.
- [ ] Gate unexpected percentage growth by area and final bundle, with an explicit baseline-update workflow requiring rationale.
- [ ] Use separate budgets for core framework, services, features, UI, config, and generated output.
- [ ] Report the largest contributors and delta, not only pass/fail.
- [ ] Add import-direction/cycle checks from `CORE-AUDIT-01` to CI after current exceptions are resolved or allowlisted with owners.
- [ ] Add `lint:addons`, add-on structure validation, manifest/catalog validation, core build smoke, and selected add-on build smoke to the standard check command.
- [ ] Ensure validation builds do not bump versions or modify generated release artifacts unexpectedly.

### Acceptance criteria

- [ ] A one-byte or one-line legitimate change does not fail due to a brittle absolute cap.
- [ ] A significant unexplained increase identifies the owning area and files.
- [ ] Baseline updates are deliberate and reviewed.
- [ ] Add-on source receives equal lint/structure protection.

---

## TEST-ADDONS-01 — Add the full add-on scope, lifecycle, and migration integration matrix

**Priority:** Critical  
**Depends on:** `ADDON-HALLOWEEN-01`, `ADDON-LATEST-FILTERS-01`, `ADDON-LIBRARY-02`, `ADDON-MASKED-DIRECT-01`, `SITE-REPAIR-02`, `ADDON-SCOPE-02`, `BUILD-TOOLS-01`  
**Primary files:** `tests/**`, test fixtures/helpers, `package.json`

### Agent execution command

> Execute `TEST-ADDONS-01` only. Build deterministic happy-dom/unit fixtures; do not depend on live F95Zone or download hosts.

### Test matrix

For each core-registering add-on, cover:

- normal F95Zone page;
- thread page;
- Latest Updates page;
- `/masked/` page;
- core absent;
- initially enabled and initially disabled;
- enable, disable, refresh, before-page-change, teardown, and re-registration;
- persisted runtime entry present but script not active on the current page.

For Masked Direct, additionally cover each external-host standalone context with no core bridge.

### Required assertions

- [ ] Expected registration scope and `supportsCurrentPage` state.
- [ ] No unexpected `addon_out_of_scope` for valid operations.
- [ ] Management actions work out of runtime scope.
- [ ] Runtime actions remain blocked out of scope.
- [ ] Manifest, generated userscript header, injected runtime metadata, registration, and trusted catalog agree while preserving the distinction between activation matches, runtime mode, and core scopes.
- [ ] Masked Direct retains every external-host match and `document-idle` timing while registering only on matched F95 routes.
- [ ] No duplicate listeners, mounts, dialogs, styles, observers, timers, or registrations after repeated lifecycle transitions.
- [ ] Teardown acknowledgment is exactly once and no late task mutates DOM/state.
- [ ] Legacy Library, Latest Filters, Masked Direct, and Site Repair storage/state remain compatible.
- [ ] Site Repair preference migration and old Image Repair ID migration.
- [ ] Add-on build smoke for every manifest entry without version bump.

### Acceptance criteria

- [ ] The test suite would fail if Example/Halloween reverted to invalid scopes, if Masked Direct used `download` as a core scope, or if removing that scope accidentally removed an external-host `@match`.
- [ ] The test suite would fail if Library lost `f95zone` scope.
- [ ] The test suite would fail if Latest Filters were incorrectly broadened to site-wide runtime behavior.
- [ ] No test reaches the network.
- [ ] Failures identify the add-on, route context, lifecycle transition, and expected policy.

---
