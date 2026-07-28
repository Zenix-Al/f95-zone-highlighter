# Add-on Reinforcement, API Review, Runtime Normalization, and Service Audit Plan

This is a standalone execution plan for **add-on work only**, derived primarily from `TODO_NEXT_DETAILED.md` and updated with these decisions:

- focus on making add-ons structurally consistent, cancellable, testable, and easier to extend;
- review the current bridge usage for evidence-backed new public APIs;
- finish the add-on action/service decomposition;
- diagnose and fix the current trust-gating regression where a trusted add-on can be blocked as untrusted;
- end with a dedicated add-on-service and add-on-build size audit;
- **do not redesign or reinforce the registration handshake yet**.

Prepared against the repository `main` branch inspected on **2026-07-13**.

---

## Scope

### Included

- `addons/**`
- `addons/addons.manifest.json`
- `addons/build-addon.js`
- `addons/shared/**`
- `addons/README.md`
- add-on-specific build and validation scripts
- `src/services/addonsService.js`
- `src/services/addons/**`
- add-on cards, catalog integration, lifecycle commands, action descriptors, action implementations, resource cleanup, and bridge-facing public APIs
- add-on-owned state compatibility and ID aliases
- `src/features/latest-ajax-error-recovery/**` only for its complete move into Site Repair
- add-on integration tests and deterministic host/page fixtures

### Excluded

These belong to the separate core-cleaning plan:

- core metrics removal
- general config schema/persistence cleanup
- generic core source cleanup
- Config Transfer cleanup
- broad core CSS/HTML pruning
- general core size budgets
- unrelated features and services
- moving storage/version constants
- removal of obsolete non-add-on migration keys

### Explicitly deferred: registration-handshake security

Do not add or redesign any registration security handshake in this plan.

The following are out of scope:

- challenge/response registration;
- registration nonces;
- signed registration payloads;
- origin attestation;
- secret tokens shared during registration;
- proof-of-install or proof-of-userscript-manager schemes;
- encrypted event payloads;
- registration-channel replacement;
- handshake protocol-version redesign whose purpose is stronger identity assurance;
- browser-extension/native-messaging integration.

Preserve the current registration transport and response shapes unless a package below requires metadata normalization.

Existing post-registration protections remain required:

- catalog/trust policy;
- enabled/blocked state;
- capability checks;
- page-scope checks;
- payload validation;
- size limits;
- action timeouts;
- execution-time reauthorization;
- resource ownership;
- teardown cleanup.

A future security plan may revisit registration identity after the add-on runtime is structurally stable and measurable.

### Resolved functional blocker: trusted add-on rejected as untrusted

Observed on **2026-07-14** with **F95UE Masked + Direct Download Add-on 0.3.45**:

- the card shows `DISABLED`, `TRUSTED`, and `ACTIVE HERE`;
- the same card says: `Blocked by main settings: enable untrusted add-ons or trust this add-on.`;
- the add-on cannot currently run;
- the root cause was a stale runtime projection: the known-add-on snapshot took
  trust from the catalog but copied `blocked` and the policy message from the
  runtime entry, while the add-on separately consumed the `addon.access`
  decision.

This was an internally contradictory state. `ADDON-TRUST-GATING-01` now uses
one identity-aware access resolver for registration, management projection, and
execution-time authorization. The regression fixture is retained in
`tests/run.cjs`; genuinely untrusted add-ons remain restricted.

---

## How to use this document

1. Execute one work-package ID at a time unless its wave explicitly permits parallel work.
2. Read `AGENTS.md`, `addons/README.md`, relevant architecture documentation, and every named file before editing.
3. Run `rg` for every action ID, capability, event name, scope, manifest field, and add-on ID named by the selected package.
4. Preserve all existing userscript `@match`, `@grant`, and `@run-at` behavior unless a package explicitly changes it.
5. Edit source files only. Do not manually edit built userscripts or generated catalog output.
6. Add or update tests in the same pull request.
7. Do not use an add-on restructure as an excuse to redesign its user-facing behavior.
8. Do not introduce a new public API merely because it is convenient for one module.
9. Put the work-package ID in the pull request title or description.
10. Record intentionally deferred IDs in the pull request.

---

## Global definition of done

A package is complete only when all applicable items pass:

- [ ] Every package-specific acceptance criterion passes.
- [ ] `npm run lint` passes.
- [ ] Add-on lint passes independently.
- [ ] `npm run test` passes.
- [ ] `git diff --check` passes.
- [ ] Manifest and trusted-catalog validation pass.
- [ ] Add-on structure validation passes.
- [ ] Applicable add-on smoke builds pass without version bumps.
- [ ] Generated files are unchanged or regenerated through documented commands.
- [ ] No userscript match, grant, or run timing changes accidentally.
- [ ] No existing storage key, IDB database/store/index, add-on state bucket, or import/export format is lost accidentally.
- [ ] No new listener, timer, observer, style, mount, dialog, queue, or pending operation bypasses lifecycle ownership.
- [ ] Disable remains reversible unless the command is terminal teardown/unregister.
- [ ] No late asynchronous callback mutates UI or state after disable, route invalidation, or teardown.
- [ ] Teardown acknowledgment is emitted exactly once.
- [ ] Public bridge action response shapes remain compatible unless explicitly versioned.
- [ ] Effective trust, displayed trust badge, blocked reason, and enable-control state cannot contradict each other.
- [ ] A trusted add-on is never blocked solely by the untrusted-add-on policy, while genuinely untrusted add-ons remain blocked when policy requires it.
- [ ] Registration-handshake security is unchanged.
- [ ] Before/after source and build-size measurements are attached when a package claims simplification.

---

## Current add-on scope decisions

The core currently exposes these meaningful F95Zone scopes:

- `f95zone`
- `thread`
- `latest`

Do not use these as core scopes:

- `global`
- `download`
- `direct-download`

External download hosts are userscript execution contexts, not core page scopes.

### Target matrix

| Add-on | Userscript activation | Runtime mode | Core scopes | Intent |
| --- | --- | --- | --- | --- |
| Example Add-on | all F95Zone pages | `core-required` | `f95zone` | canonical API playground |
| Halloween Theme | all F95Zone pages | `core-required` | `f95zone` | site-wide theme |
| Latest Filters | Latest Updates only | `core-required` | `latest` | intentionally route-specific |
| Library | all F95Zone pages | `core-required` | `f95zone` | site-wide manager with thread-only subfeatures |
| Masked + Direct | selected F95Zone routes plus external hosts | `hybrid` | `f95zone` on matched F95 routes | core-backed on F95; standalone externally |
| Site Repair | all F95Zone pages | `core-required` | `f95zone` | internally activates individual repair modules by route |

Userscript activation and core action authorization remain separate contracts:

1. `matches`, `grants`, and `runAt` control userscript injection.
2. `runtimeMode` describes whether the execution context expects core.
3. `pageScopes` authorize runtime-scoped core actions after registration.
4. Catalog support combines actual activation-match coverage with current core scope.
5. Management actions can remain usable when the add-on is installed but not active on the current route.

---

## Public API review principles

Potential APIs must be justified by current add-on code, not hypothetical third-party needs.

A new API is eligible only when it satisfies all of these:

- at least two production add-ons need the same semantic operation, or one production add-on has three independent workarounds for it;
- the operation is safer or more stable when core owns it;
- the API removes direct dependence on core DOM structure or internal state;
- the payload and result can be bounded and validated;
- ownership and teardown behavior are explicit;
- capability and scope policy are clear;
- the API does not expose arbitrary code execution;
- the API does not broaden registration trust;
- adding it produces a net reduction in duplicated add-on code or correctness risk;
- it has contract tests and at least two consumers before being declared canonical.

### Candidate APIs to investigate

These are audit candidates, not preapproved commitments.

| Candidate | Problem to verify | Likely capability | Initial policy |
| --- | --- | --- | --- |
| `page.getContext` | repeated URL, route, thread ID, and page-type parsing | `page` | runtime-scoped, read-only |
| `observer.waitFor` | repeated polling/mount retry timers for one selector | `observer` | runtime-scoped, cancellable, bounded timeout |
| `ui.dialog.update` | import/progress dialogs reopened or rebuilt to update content | `ui`, `ui.dialog` | runtime-scoped |
| declarative `ui.mount` actions | global click listeners and composed-path parsing around mounted UI | `ui`, `ui.mount` | runtime-scoped; emits add-on-owned action command |
| `storage.subscribe` / `storage.unsubscribe` | polling or manual refresh for add-on state changes | `storage` | runtime-scoped; own bucket only |
| `addon.getContext` | repeated local assembly of enabled state, active scopes, limits, and protocol info | management/read capability | management policy; no secret or handshake data |
| `ui.progress.open/update/close` | repeated progress-dialog lifecycle across Example, Library, and Site Repair | `ui`, `ui.dialog` | consider only if generic dialog update is insufficient |
| `page.openThread` or navigation helper | repeated URL construction with route metadata | `page` | reject unless current code proves a stable shared need |
| core-backed cancellable task API | repeated long-running operation ownership | `task` | high bar; prefer add-on-local runtime helper first |

Do not add:

- arbitrary script injection;
- arbitrary core function invocation;
- raw shadow-root access;
- unrestricted selectors against core-owned UI;
- unrestricted HTML/CSS bypasses;
- generic `eval`;
- direct access to the core config object;
- action registration by untrusted add-on code;
- APIs whose sole purpose is stronger registration authentication.

---

## Required execution order

### Wave 0 — Baseline, metadata, and trust-gating contract

1. `ADDON-BASELINE-01`
2. `ADDON-SCOPE-02`
3. `ADDON-TRUST-GATING-01`
4. `ADDON-BUILD-TOOLS-01`

### Wave 1 — Canonical runtime and API evidence

1. `ADDON-GOLDEN-01`
2. `ADDON-RUNTIME-CONTRACT-01`
3. `ADDON-API-AUDIT-01`

`ADDON-IDENTITY-01` may run in parallel with `ADDON-RUNTIME-CONTRACT-01` after the scope contract is stable.

### Wave 2 — Evidence-backed API additions

- `ADDON-API-EXTENSIONS-01` after `ADDON-API-AUDIT-01`

Do not block add-on normalization on speculative APIs. Implement only APIs approved by the audit. Add-ons may initially use local helpers and migrate later.

### Wave 3 — Normalize production add-ons

These may run in parallel after the golden/runtime contracts are available:

- `ADDON-HALLOWEEN-01`
- `ADDON-LATEST-FILTERS-01`
- `ADDON-LIBRARY-02`
- `ADDON-MASKED-DIRECT-01`
- `SITE-REPAIR-01` after `ADDON-IDENTITY-01`

### Wave 3 canonical-template rule

Every Wave 3 production add-on package must explicitly use the completed
`addons/example-addon` implementation as its structural, API-wrapper, and lifecycle
reference. Each package must compare its current add-on against that template before
editing and then preserve its own domain behavior while adopting the same boundaries:

- manifest-injected metadata only;
- composition-only `main.js`;
- `core/adaptor.js` for bridge adaptation;
- thin action-specific `api/**` wrappers;
- `app/` state, commands, lifecycle, and domain orchestration;
- `ui/` rendering, styles, and browser event bindings;
- explicit ownership, cancellation, late-commit suppression, reversible disable, and
  exactly-once terminal teardown acknowledgment.

This is a per-add-on normalization rule, not permission to copy Example demos or create
a shared framework. Public action IDs, payloads, response shapes, metadata, storage,
IDB, host behavior, and user-facing flows remain add-on-specific compatibility contracts.

### Wave 4 — Complete Site Repair

- `SITE-REPAIR-02` after `SITE-REPAIR-01`

### Wave 5 — Finish add-on service internals

1. `ADDON-ACTIONS-02`
2. `ADDON-SERVICE-FACADE-01`
3. `ADDON-RUNTIME-KIT-01`

Do not start broad boilerplate extraction before production add-ons reveal repeated stable patterns.

### Wave 6 — Integrated verification

- `TEST-ADDONS-01`

### Wave 7 — Final measurement

- `ADDON-SERVICE-SIZE-AUDIT-01`

The size audit is deliberately last so it measures the accepted add-on architecture rather than the legacy transition state.

---

# Work packages

## ADDON-BASELINE-01 — Record current add-on behavior, source shape, and build sizes

**Priority:** Critical
**Depends on:** None
**Primary files:** `addons/**`, `src/services/addonsService.js`, `src/services/addons/**`, `package.json`, new audit script and baseline report, tests

### Agent execution command

> Execute `ADDON-BASELINE-01` only. Measure current add-on behavior and size without reorganizing production code.

### Objective

Create a reproducible baseline before changing scopes, structures, APIs, or services.

### Required implementation

- [x] Record manifest entries, IDs, versions, entry paths, output paths, matches, grants, run timing, capabilities, and core requirements.
- [x] Record current trusted-catalog projection.
- [x] Record current public action IDs and descriptors.
- [x] Record current exports from `addonsService.js`.
- [x] Record each add-on's:
  - authored source bytes;
  - file count;
  - physical and nonblank lines;
  - regular build bytes;
  - release build bytes;
  - gzip bytes for comparison;
  - largest bundled source contributors through esbuild metafiles.
- [x] Record add-on service totals for:
  - `src/services/addonsService.js`;
  - `src/services/addons/**`;
  - add-on-specific core UI integration.
- [x] Add non-mutating smoke-build support if it does not already exist.
- [x] Build into a temporary directory.
- [x] Do not update versions, build cache, manifest versions, or tracked `dist/`.
- [x] Create behavior snapshots for:
  - registration;
  - enable;
  - disable;
  - refresh;
  - before-page-change;
  - teardown;
  - core absent;
  - out-of-scope action;
  - capability rejection.
- [x] Store a stable JSON baseline without timestamps or absolute machine paths.

### Required tests

- [x] Two unchanged runs produce identical JSON.
- [x] Smoke builds leave the working tree unchanged.
- [x] Every manifest entry produces a size record.
- [x] Every public action appears exactly once in the baseline.
- [x] The audit distinguishes add-on userscript bytes from core add-on-service bytes.

### Acceptance criteria

- [x] Later packages can show real before/after deltas.
- [x] No production behavior changes.
- [x] No arbitrary size limit is introduced yet.

---

## ADDON-SCOPE-02 — Separate userscript activation metadata from core action scopes

**Priority:** Critical  
**Depends on:** `ADDON-BASELINE-01`  
**Primary files:** `addons/addons.manifest.json`, `addons/build-addon.js`, `addons/README.md`, `header.txt`, `src/config/pageDefinitions.js`, `src/services/addonsService.js`, `src/services/addons/knownAddons.js`, `src/services/addons/registry.js`, `src/services/addons/catalog.js`, `src/services/addons/actions/**`, `addons/trusted-catalog.json`, new catalog generator/validator under `scripts/`, tests

### Agent execution command

> Execute `ADDON-SCOPE-02` only. Preserve every existing userscript match, grant, and run timing. Do not restructure individual add-ons beyond consuming injected metadata. Do not change registration-handshake security.

### Objective

Eliminate invalid runtime scopes and metadata drift without conflating userscript activation with core authorization.

### Contract decision

Treat these as separate contracts:

1. **Userscript activation**
   - `matches`
   - `grants`
   - `runAt`

2. **Runtime mode**
   - `core-required`
   - `standalone`
   - `hybrid`

3. **Core runtime scopes**
   - `f95zone`
   - `thread`
   - `latest`

4. **Catalog support**
   - current URL matches userscript activation metadata;
   - current core page scope intersects declared core scopes.

5. **Execution authorization**
   - registered identity;
   - enabled/trusted/blocked status;
   - capability;
   - action scope policy;
   - current scope.

### Required implementation

- [x] Add required `pageScopes` and `runtimeMode` metadata to every manifest entry.
- [x] Keep `requiresCore` only as a temporary compatibility input if necessary.
- [x] Make `runtimeMode` authoritative and reject contradictory fields.
- [x] Inject `__ADDON_PAGE_SCOPES__` and `__ADDON_RUNTIME_MODE__` during builds.
- [x] Include injected metadata in build change hashes.
- [x] Keep matches, grants, and run timing in generated userscript headers.
- [x] Update canonical runtime construction to consume injected metadata.
- [x] Validate scopes against the supported vocabulary.
- [x] Reject duplicate, empty, unknown, and missing scopes where core registration is expected.
- [x] Validate runtime-mode combinations:
  - `core-required` needs an F95Zone activation match;
  - `standalone` must not register;
  - `hybrid` needs both core and standalone activation contexts.
- [x] Add a bounded userscript-match resolver for repository-supported match syntax.
- [x] Split known add-on status into:
  - `matchesCurrentPage`;
  - `scopeApplies`;
  - `supportsCurrentPage`.
- [x] Use one shared scope-intersection resolver for catalog status and execution authorization.
- [x] Keep activation-match checks out of post-registration action authorization.
- [x] Replace hard-coded feature-toggle scope exceptions with descriptor metadata:
  - `scopePolicy: "management"`;
  - `scopePolicy: "runtime"`.
- [x] Mark `addon.access`, `addon.throttle`, `feature.enable`, and `feature.disable` as management operations.
- [x] Keep storage, IDB, observer, toast, refresh, and UI actions runtime-scoped unless explicitly changed later.
- [x] Reject unsupported registration scopes as `invalid_registration`.
- [x] Generate `addons/trusted-catalog.json` deterministically from the manifest.
- [x] Use the `addons/trusted-catalog.json` public resource path with the existing `trustedAddonCatalog` resource name.
- [x] Keep the former `src/services/addons/trusted-catalog.json` file frozen at the last released catalog until the development line is stable; it is not read or regenerated by the current core.
- [x] Add a check mode that fails on manifest/catalog drift.
- [x] Document the metadata decision table in `addons/README.md`.

### Required tests

- [x] Header snapshots preserve every current match, grant, and run timing.
- [x] Scope fixtures cover ordinary F95Zone, thread, Latest, and `/masked/`.
- [x] Unknown scopes and invalid runtime modes are rejected.
- [x] Management actions work outside runtime scope.
- [x] Runtime actions remain blocked outside runtime scope.
- [x] Catalog support never claims activation on a route absent from the match list.
- [x] Manifest/catalog generation is deterministic.
- [x] The core header keeps the same `trustedAddonCatalog` resource name and uses the new `addons/trusted-catalog.json` path.
- [x] Registration event transport, handshake fields, and identity-security behavior remain unchanged.

### Acceptance criteria

- [x] No supported add-on registers an impossible scope.
- [x] Activation metadata is not used as a substitute for action authorization.
- [x] The manifest is authoritative for build and catalog metadata.
- [x] Management controls remain usable without weakening runtime action policy.
- [x] No registration-handshake security change is mixed into the package.

### Scope guardrails

- Do not add external hosts to core page definitions.
- Do not remove or narrow external-host matches.
- Do not change `runAt` to solve a scope problem.
- Do not make arbitrary actions management-scoped.
- Do not add registration nonces, secrets, challenge-response, or identity attestation.

---

## ADDON-TRUST-GATING-01 — Diagnose and fix trusted add-ons blocked as untrusted

**Priority:** Critical
**Depends on:** `ADDON-SCOPE-02`
**Primary files:** `src/services/addonsService.js`, `src/services/addons/catalog.js`, `src/services/addons/knownAddons.js`, `src/services/addons/registry.js`, add-on state repository modules, add-on management card/status UI, trusted-catalog generation/output, main add-on settings, tests

### Agent execution command

> Execute `ADDON-TRUST-GATING-01` only. Reproduce the observed state where an add-on is simultaneously shown as trusted and blocked by the untrusted-add-on policy, then run the same contract matrix against every current manifest add-on. Find and document the root cause before changing behavior. Do not work around the defect by enabling all untrusted add-ons, auto-trusting add-ons, or weakening registration/access checks.

### Objective

Make effective trust, access gating, status badges, blocked reasons, and enable controls derive from one coherent policy result.

### Observed regression fixture

Reproduce this exact case before editing production logic:

- add-on: `masked-direct-addon`;
- displayed name/version: `F95UE Masked + Direct Download Add-on`, `0.3.45`;
- displayed badges: `DISABLED`, `TRUSTED`, `ACTIVE HERE`;
- displayed blocking message: `Blocked by main settings: enable untrusted add-ons or trust this add-on.`;
- actual result: the add-on cannot run;
- known cause: a stale runtime projection combined catalog trust with an old
  blocked status/message; add-ons also initialized before consuming the shared
  `addon.access` decision.

The package must not assume that the catalog, state repository, registry, UI, cache, or runtime identity is at fault until tracing proves it.

### All-add-on coverage boundary

This is an add-on-wide regression, not a Masked + Direct-only fix. The matrix
must include every add-on entry in `addons/addons.manifest.json`, including
`image-repair-addon`, `masked-direct-addon`, `library-addon`, `example-addon`,
`latest-filters-addon`, and `halloween-theme-addon`. For each add-on, use its
canonical manifest ID, current catalog entry, current capabilities, runtime
mode, page scopes, and userscript activation matches. Add-ons added later must
be included automatically by the manifest-driven test rather than silently
omitted from the matrix.

### Required investigation

- [x] Reproduce the issue with a deterministic fixture and, where applicable, both:
  - clean/default add-on state;
  - upgraded or previously persisted add-on state.
- [x] Capture every input used to derive the card and runtime decision:
  - canonical add-on ID and any legacy ID;
  - trusted-catalog match;
  - persisted per-add-on trust override;
  - global allow-untrusted setting;
  - installed/registered identity;
  - enabled state;
  - blocked state and reason;
  - activation match and current scope;
  - cached versus current status snapshot.
- [x] Trace trust independently through:
  - manifest/catalog generation;
  - catalog loading;
  - state normalization;
  - registry/registration;
  - known-add-on projection;
  - management action authorization;
  - UI badge/banner rendering;
  - execution-time reauthorization.
- [x] Check specifically for:
  - canonical-ID or legacy-ID mismatch;
  - stale trusted-catalog data;
  - catalog/state merge-order errors;
  - disabled state being mislabeled as blocked;
  - UI reading trust from a different snapshot than authorization;
  - stale memoized/card state after settings changes;
  - contradictory fallback defaults when catalog data is unavailable;
  - different trust rules at registration and at action execution.
- [x] Record the proven root cause in the pull request and in a regression-test name or fixture comment.
- [x] Do not broaden this package into registration-handshake redesign.
- [x] Repeat the trust/status investigation for every current manifest add-on,
  including clean/default state and persisted disabled/enabled state.
- [x] Trace each core-required or hybrid add-on from ping/wait-for-core through
  registration, `addon.access`, feature/action invocation, status updates, and
  teardown; record any add-on-specific trust or blocked-state source.
- [x] Confirm standalone add-ons do not attempt core registration and are tested
  through their documented standalone path separately.
- [x] Verify every add-on uses the canonical handshake/adaptor and public API
  response shapes; reject direct or stale trust decisions that can bypass the
  shared access result. Do not add new handshake fields or API capabilities.

### Required implementation

- [x] Introduce or consolidate one effective-access resolver that returns explicit, separately named fields such as:
  - `isTrusted`;
  - `trustSource`;
  - `isEnabled`;
  - `isBlocked`;
  - `blockReason`;
  - `canEnable`;
  - `matchesCurrentPage`;
  - `scopeApplies`;
  - `supportsCurrentPage`.
- [x] Make registry authorization, known-add-on/card projection, badges, banners, and enable-control behavior consume the same effective trust/access decision or a stable projection of it.
- [x] Keep disabled state distinct from policy blocking:
  - a trusted but disabled add-on is `disabled`, not `untrusted`;
  - its Enable control remains usable when no other policy blocks it.
- [x] Ensure a trusted-catalog entry or valid user trust override satisfies the untrusted-add-on gate consistently at registration, management-action, and execution-time checks.
- [x] Keep genuinely untrusted add-ons blocked when the global policy disallows them.
- [x] If catalog identity cannot be resolved, surface a specific deterministic diagnostic state rather than simultaneously rendering `TRUSTED` and an untrusted-policy block.
- [x] Define invariants that reject or normalize impossible combinations before they reach UI:
  - `isTrusted === true` cannot pair with `blockReason === "untrusted_disallowed"`;
  - `isBlocked === false` cannot render a blocking banner;
  - `canEnable === true` must correspond to an enable path that passes current management policy.
- [x] Refresh the status projection after:
  - global allow-untrusted changes;
  - per-add-on trust changes;
  - enable/disable changes;
  - catalog load/reload;
  - registration/unregistration;
  - canonical-ID normalization.
- [x] Add bounded diagnostics suitable for tests without exposing secrets or changing handshake payloads.
- [x] Preserve current public response shapes unless an internal-only field can be added without affecting consumers.
- [x] Do not auto-trust official-looking IDs, versions, names, URLs, or runtime registrations.
- [x] Make the shared access result the only source for trust, blocked reason,
  enable state, and granted capabilities for every registered add-on; add-on
  code may react to the result but must not reconstruct it from names, IDs,
  status text, or cached state.
- [x] Keep handshake and API usage contract-correct for every add-on without
  changing event names, transport, identity fields, capabilities, scopes,
  response shapes, or userscript metadata.

### Required tests

- [x] Exact Masked + Direct regression fixture no longer produces the contradictory card.
- [x] Catalog-trusted + global allow-untrusted off + disabled:
  - shows trusted and disabled;
  - does not show an untrusted-policy block;
  - Enable succeeds when all other policy checks pass.
- [x] Catalog-trusted + global allow-untrusted off + enabled remains runnable.
- [x] User-trusted + global allow-untrusted off behaves like trusted.
- [x] Untrusted + global allow-untrusted off remains blocked with the untrusted-specific reason and no trusted badge.
- [x] Untrusted + global allow-untrusted on follows the documented enabled/disabled state.
- [x] A missing or mismatched catalog identity yields one explicit diagnostic state, not conflicting trust indicators.
- [x] Trust/settings changes update the card and authorization decision without requiring a page reload.
- [x] Registration-time and execution-time trust decisions agree.
- [x] Canonical/legacy ID normalization cannot create two different trust decisions for one card/runtime.
- [x] The fix does not change userscript matches, grants, run timing, capabilities, scopes, registration transport, or handshake security.
- [x] A manifest-driven matrix passes for every catalog-trusted add-on with:
  - global allow-untrusted disabled;
  - persisted disabled state;
  - persisted enabled state;
  - registration present and absent;
  - current supported and unsupported pages;
  - card badges, blocked reason, enable control, `addon.access`, and one
    representative permitted API action agreeing.
- [x] The same matrix proves every genuinely untrusted fixture remains blocked
  when global allow-untrusted is disabled and receives no privileged
  capabilities or API access.
- [x] Every core-required/hybrid add-on passes a handshake/API characterization
  test covering ping, registration, access response, status update, enable,
  disable, and teardown; standalone add-ons pass their no-core path.
- [x] A static audit finds no add-on-specific copy of the untrusted gate,
  blocked message, trust resolver, or privileged API authorization.

### Acceptance criteria

- [x] The observed add-on can run when it is effectively trusted and enabled.
- [x] The UI can no longer show `TRUSTED` while claiming the same add-on is blocked for being untrusted.
- [x] Disabled, untrusted-blocked, unsupported, out-of-scope, and identity/catalog-error states remain distinct.
- [x] The actual root cause is documented and locked by a regression test.
- [x] Genuinely untrusted add-ons are not made less restricted.
- [x] Registration-handshake security remains unchanged.
- [x] Every current add-on is covered by the same coherent trust/access and
  handshake/API contract; no add-on can regress to the stale trusted-plus-blocked
  state independently of the shared core fix.

---

## ADDON-BUILD-TOOLS-01 — Make add-on validation and smoke builds safe and deterministic

**Priority:** High  
**Depends on:** `ADDON-SCOPE-02`  
**Primary files:** `addons/build-addon.js`, `addons/addons.manifest.json`, `package.json`, `eslint.config.mjs`, `scripts/**`, add-on build tests, `addons/README.md`

### Agent execution command

> Execute `ADDON-BUILD-TOOLS-01` only. Improve add-on build, lint, structure, and manifest checking without changing generated userscript behavior.

### Objective

Give add-on work the same non-mutating validation quality as core work.

### Required implementation

- [x] Add or complete a non-mutating add-on smoke-build mode.
- [x] Support:
  - one add-on;
  - all add-ons;
  - regular build;
  - release build;
  - temporary output directory;
  - esbuild metafile output.
- [x] Ensure validation does not change:
  - add-on versions;
  - manifest content;
  - build cache;
  - tracked `dist/`;
  - root version.
- [x] Add `lint:addons` covering `addons/*/src/**/*.js` and `addons/shared/**/*.js`.
- [x] Add manifest validation for:
  - unique IDs;
  - folder/ID/entry/output alignment;
  - valid capabilities;
  - valid scopes;
  - valid runtime modes;
  - valid matches/grants/run timing;
  - unique legacy IDs.
- [x] Add deterministic catalog generation/checking.
- [x] Add structure validation with documented tiny-add-on exceptions.
- [x] Characterize release stripping before changing any shared strip-plugin path.
- [x] If build-only strip plugins are moved under `scripts/`, preserve exports, behavior, and plugin names exactly. (No relocation was required.)
- [x] Add package commands for:
  - add-on lint;
  - manifest check;
  - catalog check;
  - structure check;
  - smoke build;
  - full add-on check.
- [x] Update contributor documentation.

### Required tests

- [x] Every manifest entry builds in regular and release smoke mode.
- [x] No validation command changes the working tree.
- [x] Invalid manifest fixtures fail with exact paths.
- [x] Structure validation passes canonical and documented tiny layouts.
- [x] Release stripping behavior is byte-identical before/after path relocation. (The plugin path was retained; the characterization test pins its current output.)
- [x] Windows and POSIX path fixtures pass.

### Acceptance criteria

- [x] Add-on validation is independently runnable.
- [x] CI can verify every add-on without version bumps.
- [x] Build tooling does not become a generic framework unrelated to current add-ons.

---

## ADDON-GOLDEN-01 — Make Example Add-on the canonical runtime template

**Priority:** Critical  
**Depends on:** `ADDON-SCOPE-02`, `ADDON-TRUST-GATING-01`, `ADDON-BUILD-TOOLS-01`
**Primary files:** `addons/example-addon/src/**`, `addons/example-addon/CHANGELOG.md`, `addons/README.md`, manifest, shared helpers, tests

### Agent execution command

> Execute `ADDON-GOLDEN-01` only. Produce a tested copyable template; do not migrate another production add-on in the same change.

### Objective

Make the example a safe reference for metadata, lifecycle, API wrappers, cancellation, resource ownership, and folder boundaries.

### Required implementation

- [x] Use `pageScopes: ["f95zone"]`.
- [x] Use manifest-injected runtime metadata only.
- [x] Keep `main.js` limited to:
  - runtime construction;
  - adaptor/app composition;
  - core availability check;
  - bootstrap;
  - fatal error reporting.
- [x] Separate:
  - lifecycle/command handling;
  - state;
  - API demos;
  - long-running work;
  - UI rendering;
  - UI event binding.
- [x] Keep raw action IDs under `src/api/**` or the adaptor.
- [x] Make listeners, timers, observers, mounts, dialogs, dock buttons, styles, and pending requests explicitly owned.
- [x] Make enable/disable/refresh repeatable.
- [x] Reserve permanent unbinding for terminal teardown/unregister.
- [x] Cancel bulk work and suppress late UI commits after disable/teardown.
- [x] Add deterministic teardown acknowledgment.
- [x] Document canonical folder boundaries:
  - `main.js`;
  - `core/`;
  - `api/`;
  - `app/`;
  - `ui/`;
  - optional domain folders.
- [x] Do not turn the example into a shared framework package.
- [x] Ensure every demonstration still exists after splitting.

### Required tests

- [x] Normal F95Zone bootstrap succeeds without scope errors.
- [x] Repeated enable/disable/refresh works.
- [x] Terminal teardown releases every resource.
- [x] Teardown acknowledgment is exactly once.
- [x] Late bulk results cannot update closed UI.
- [x] Raw action IDs do not appear in app/UI modules.
- [x] Structure and lint checks pass.

### Acceptance criteria

- [x] The example can be copied without inheriting scope or lifecycle defects.
- [x] Its main app module is an orchestration facade.
- [x] Documentation and source layout match.

---

## ADDON-RUNTIME-CONTRACT-01 — Reinforce lifecycle and resource behavior after registration

**Priority:** Critical  
**Depends on:** `ADDON-GOLDEN-01`  
**Primary files:** `addons/shared/**`, example add-on, `src/services/addons/lifecycle.js`, command/teardown modules, tests

### Agent execution command

> Execute `ADDON-RUNTIME-CONTRACT-01` only. Reinforce post-registration lifecycle behavior. Do not change registration authentication or event-channel security.

### Objective

Define one clear lifecycle contract that every core-registering add-on follows after successful registration.

### Runtime states

Use explicit states or equivalent observable semantics:

- `new`
- `starting`
- `enabled`
- `disabling`
- `disabled`
- `refreshing`
- `tearing-down`
- `terminated`
- `failed`

### Command context

Every add-on command handler should receive or derive:

```js
{
  commandId,
  command,
  reason,
  generation,
  routeContext,
  signal,
  terminal,
}
```

The exact public wire format does not need to change if this context can be assembled in the adaptor/app layer.

### Required implementation

- [x] Give each add-on app a monotonically increasing lifecycle generation.
- [x] Abort or invalidate pending work when:
  - disable starts;
  - a newer refresh supersedes an older one;
  - route context changes;
  - terminal teardown starts.
- [x] Prevent stale work from committing UI/state.
- [x] Serialize conflicting lifecycle operations.
- [x] Make duplicate enable/disable/refresh commands idempotent.
- [x] Distinguish reversible disable from terminal teardown.
- [x] Require terminal teardown to:
  1. stop accepting new work;
  2. abort pending operations;
  3. stop feature/domain controllers;
  4. close dialogs and remove mounts/dock/styles;
  5. remove listeners/observers/timers;
  6. unregister or acknowledge as required;
  7. settle exactly once.
- [x] Add a bounded teardown timeout/watchdog in core service behavior.
- [x] Make best-effort hard cleanup owner-specific after timeout.
- [x] Keep expected cancellation separate from failures.
- [x] Add snapshots for active add-on-owned resources and pending operations.
- [x] Add a small shared helper only after proving the pattern in Example plus another fixture.
- [x] Preserve current registration handshake and action response shapes.

### Required tests

- [x] enable → disable → enable leaves the add-on enabled.
- [x] refresh during disable cannot recreate UI.
- [x] route change invalidates old work.
- [x] disable during import/retry cancels late commits.
- [x] repeated teardown acknowledges once.
- [x] teardown timeout triggers deterministic hard cleanup.
- [x] cancellation does not count as normal failure.
- [x] registration transport and identity-security behavior are unchanged.

### Acceptance criteria

- [x] Production add-ons can implement one documented lifecycle.
- [x] Resource leaks are visible and testable.
- [x] Disable remains reversible.
- [x] No handshake hardening is introduced.

---

## ADDON-IDENTITY-01 — Add safe aliases for renamed add-ons

**Priority:** High  
**Depends on:** `ADDON-SCOPE-02`  
**Primary files:** manifest, catalog, add-on state repository, registry, known-add-on status, tests

### Agent execution command

> Execute `ADDON-IDENTITY-01` only. Add generic legacy-ID alias support and a fixture alias. Do not rename Image Repair in this package.

### Objective

Allow an official add-on rename without losing enabled state, settings, installation trace, trust, or update visibility.

### Required implementation

- [x] Add optional `legacyIds` to manifest metadata.
- [x] Validate aliases with the same ID sanitizer.
- [x] Reject collisions with:
  - active IDs;
  - other aliases;
  - folder IDs;
  - catalog IDs.
- [x] Resolve catalog, installed snapshots, and UI cards through the canonical ID.
- [x] Move alias/state normalization into the add-on state repository.
- [x] Do not depend on a generic core config-migration service.
- [x] Atomically merge legacy add-on state:
  - explicit current values win;
  - missing current values inherit;
  - earliest install and latest last-seen timestamps are retained;
  - current status/panel metadata wins;
  - old bucket is removed only after canonical persistence succeeds.
- [x] Make normalization idempotent.
- [x] If old and new userscripts register simultaneously, show one canonical card and reject conflicting active runtime registrations deterministically.
- [x] Keep alias data out of runtime builds unless a current consumer requires it.
- [x] Document release sequencing.

### Required tests

- [x] Legacy-only state normalizes.
- [x] Mixed current/legacy state merges correctly.
- [x] Failed persistence leaves legacy state recoverable.
- [x] Repeated normalization is a no-op.
- [x] Catalog trust/download data resolves to canonical ID.
- [x] Old/new simultaneous runtime registrations do not create duplicate cards.

### Acceptance criteria

- [x] Renaming an add-on does not reset it.
- [x] Users see one canonical add-on entry.
- [x] Alias handling is repository-owned and independent of registration-handshake security.

---

## ADDON-API-AUDIT-01 — Identify real public API gaps from production workarounds

**Priority:** High  
**Depends on:** `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** all production add-on sources, `addons/shared/**`, current action descriptors, `addons/README.md`, new API audit report, tests/fixtures

### Agent execution command

> Execute `ADDON-API-AUDIT-01` only. Inventory and rank API gaps. Do not add public actions in this package.

### Objective

Find places where add-ons duplicate fragile behavior because the current public API is missing a stable primitive.

### Required investigation

For every production add-on, inventory:

- raw action strings;
- direct bridge events;
- global event listeners;
- composed-path click routing;
- DOM polling and mount retry timers;
- URL and page-context parsing;
- thread ID/title/image extraction;
- direct style injection;
- dialog rebuilds used as updates;
- storage polling/manual reload;
- core DOM assumptions;
- raw GM access used only because no core action exists;
- repeated cancellation and teardown scaffolding;
- duplicated payload validators;
- direct access to page-context jQuery or site globals;
- error/result translation wrappers.

### Required output

Create a table for every candidate API containing:

- candidate action ID;
- exact current call sites;
- number of production consumers;
- current workaround;
- failure/leak risks;
- proposed capability;
- scope policy;
- payload/result bounds;
- ownership and cleanup behavior;
- whether it belongs in core API or add-on-local shared runtime;
- estimated source/bundle delta;
- compatibility/versioning requirement;
- decision:
  - implement;
  - use local shared helper;
  - keep current behavior;
  - reject;
  - defer.

### Required decisions

Evaluate at minimum:

- `page.getContext`;
- `observer.waitFor`;
- `ui.dialog.update`;
- declarative actions for `ui.mount`;
- `storage.subscribe` / `storage.unsubscribe`;
- `addon.getContext`;
- generic progress UI;
- add-on-local cancellable retry/task helper.

### Required tests

- [x] The inventory includes every production add-on.
- [x] Every raw action string is accounted for.
- [x] Every proposed public API has at least two consumers or a documented exceptional threshold.
- [x] Rejected APIs include a reason.
- [x] No registration-handshake security item is accepted in this audit.

### Acceptance criteria

- [x] The report distinguishes public API gaps from add-on-local boilerplate.
- [x] No speculative action is added.
- [x] The next package has a bounded approved API list.
- [x] API work is ranked by correctness reduction first and byte reduction second.

---

## ADDON-API-EXTENSIONS-01 — Implement only approved evidence-backed add-on APIs

**Priority:** High  
**Depends on:** `ADDON-API-AUDIT-01`, `ADDON-ACTIONS-02` may be a companion when descriptor ownership is required  
**Primary files:** approved action-family modules, action registry, add-on API wrappers, Example and production consumers, documentation, tests

### Agent execution command

> Execute `ADDON-API-EXTENSIONS-01` only for APIs marked “implement” by `ADDON-API-AUDIT-01`. Do not add other actions opportunistically.

### Objective

Replace repeated fragile workarounds with a small, versioned, bounded public surface.

### Required implementation

For every approved API:

- [x] Define one descriptor containing:
  - action ID;
  - protocol version;
  - capability alternatives;
  - scope policy;
  - payload validator;
  - result validator/redaction;
  - timeout;
  - executor;
  - ownership/cleanup rule.
- [x] Add thin add-on wrappers under `src/api/**`.
- [x] Add at least two real consumers.
- [x] Remove the replaced workarounds.
- [x] Update Example Add-on demonstrations.
- [x] Document success, failure, cancellation, and cleanup semantics.
- [x] Keep payload/result sizes bounded.
- [x] Reauthorize immediately before externally visible async commit.
- [x] Preserve unsupported-action behavior for older core versions.
- [x] Add capability negotiation or graceful fallback in add-ons where mixed versions are supported.
- [x] Do not expose core DOM internals.
- [x] Do not add arbitrary script execution.
- [x] Do not change registration-handshake authentication.

### API-specific minimum rules

#### If `page.getContext` is approved

- read-only;
- return normalized safe fields only;
- no live DOM objects;
- no internal state references;
- document route-generation freshness.

#### If `observer.waitFor` is approved

- one-shot;
- bounded selector policy;
- required timeout;
- cancellable;
- owner-scoped;
- no unbounded result collections.

#### If `ui.dialog.update` is approved

- update add-on-owned dialog only;
- sanitize with the same policy as open;
- preserve dialog identity;
- fail when ownership no longer exists.

#### If declarative mount actions are approved

- add-on declares bounded action IDs;
- core emits add-on-scoped commands;
- no inline JavaScript;
- no arbitrary selector event forwarding;
- unmount removes event routing automatically.

#### If storage subscriptions are approved

- own add-on bucket only;
- bounded event payloads;
- loop prevention;
- explicit unsubscribe and owner cleanup;
- no access to other add-ons or core config.

### Required tests

- [x] Descriptor contract snapshots.
- [x] Capability and scope rejection.
- [x] Timeout/cancellation.
- [x] Owner cleanup.
- [x] Older-core fallback.
- [x] Two production consumers per implemented API.
- [x] Removed workaround no longer exists.
- [x] Registration handshake remains unchanged.

### Acceptance criteria

- [x] The public action list grows only by audited APIs.
- [x] Consumers become simpler or safer.
- [x] No API exists with only a demo consumer.
- [x] Net source/bundle and maintenance impact is recorded.

---

## ADDON-HALLOWEEN-01 — Normalize Halloween Theme

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** `addons/halloween-theme-addon/src/**`, changelog, manifest, tests

### Agent execution command

> Execute `ADDON-HALLOWEEN-01` only. Preserve visible behavior while replacing invalid scope, raw bridge, and cleanup structure.

### Golden-template comparison and normalization boundary

The current add-on is a flat `main.js` plus `constants.js`/`coreBridge.js`: it performs
registration, access checks, raw style/observer actions, DOM style injection, logo
mutation, anonymous command listening, and teardown in one module. Compared with
`example-addon`, it has no `core/adaptor.js`, thin `api/**`, app instance, UI boundary,
owned restoration records, serialized lifecycle, or refresh path.

The implementation must use `addons/example-addon` as the mandatory reference while
preserving Halloween behavior. In addition to the scope fixes below, it must:

- use injected metadata directly from `main.js`;
- move bridge calls behind thin API wrappers and keep `main.js` composition-only;
- place enable/disable/refresh/teardown and restoration state in an app module;
- place markup/style text and browser bindings in `ui/**`;
- own the command listener, core style, logo/srcset restoration records, and any route
  refresh work; disable must be reversible and teardown must acknowledge once;
- prevent stale refresh/apply work from restoring or reapplying the theme after disable.

Required tests must include a structure check against the Example boundaries and a
repository search/assertion proving raw core action invocation is confined to `api/**`
or the adaptor. The package must not copy Example's API playground demonstrations.

### Current defects

- unsupported `global` and `download` scopes;
- direct style injection;
- anonymous command listener;
- broad image scanning;
- restoration relies only on element datasets;
- no explicit route-aware refresh.

### Required implementation

- [x] Use manifest `pageScopes: ["f95zone"]`.
- [x] Register with `runtime.pageScopes`.
- [x] Request only required capabilities.
- [x] Use core-owned style action.
- [x] Adopt canonical boundaries:
  - `core/adaptor.js`;
  - thin `api/**`;
  - `app/createHalloweenThemeApp.js`;
  - `ui/**`;
  - small `main.js`.
- [x] Narrow logo selectors.
- [x] Keep app-owned restoration records.
- [x] Make apply/remove idempotent.
- [x] Handle enable, disable, refresh, before-page-change, and teardown.
- [x] Unbind terminal listeners.
- [x] Acknowledge teardown exactly once.
- [x] Do not request storage, observer, Notification, or broad capabilities unless actual code requires them.
- [x] Complete the Example Add-on structure comparison and adopt its metadata, adaptor, API, app, and UI boundaries without copying its demos.
- [x] Keep all raw core action invocations inside `api/**` or `core/adaptor.js`.
- [x] Track every owned listener, timer, style, restoration record, and pending operation through disable and terminal teardown.

### Required tests

- [x] Ordinary, thread, Latest, and masked routes work.
- [x] Repeated enable creates no duplicate style/records.
- [x] Disable restores original logo values.
- [x] Route refresh reapplies to replaced logo nodes.
- [x] Teardown leaves no listener or style.
- [x] Example-boundary and raw-action searches pass for the normalized source tree.
- [x] Late route/apply work cannot recreate theme UI after disable or teardown.

### Acceptance criteria

- [x] No unsupported scope remains.
- [x] No raw bridge dispatch remains outside adaptor/API.
- [x] Cleanup follows the runtime contract.
- [x] The add-on is structurally copyable from `example-addon` while retaining Halloween-specific behavior.

---

## ADDON-LATEST-FILTERS-01 — Normalize Latest Filters without broadening scope

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** `addons/latest-filters-addon/src/**`, changelog, manifest, tests

### Agent execution command

> Execute `ADDON-LATEST-FILTERS-01` only. Keep Latest-only behavior and preserve saved presets.

### Golden-template comparison and normalization boundary

The current add-on keeps mutable singleton state, runtime metadata fallbacks, storage
helpers, rendering, bridge calls, route listeners, mount retries, dialogs, and command
handling in `main.js`; its preset module is useful domain code but is not an app/API
boundary. It also has direct raw bridge calls in `main.js`, direct GM fallback logic,
untracked retry/debounce work, and browser UI fallback paths.

Use `addons/example-addon` as the mandatory structural and lifecycle reference. The
normalization must additionally:

- make `main.js` metadata/adaptor/app composition and bootstrap only;
- create `core/adaptor.js`, thin `api/**` wrappers, `app/` state/lifecycle/commands,
  and `ui/` render/binding modules;
- keep preset normalization/repository logic as a domain module consumed by the app,
  with storage compatibility behind an API/storage adapter;
- give route listeners, mount retries, debounce timers, dialogs, styles, mounts,
  pending storage, and route generations explicit owners and cancellation;
- ensure disable, refresh, re-enable, and teardown cannot allow stale async work to
  recreate Latest UI or overwrite current preset state.

Add structure and raw-action-boundary tests modeled on Example without changing the
Latest-only public flow or saved formats.

### Required implementation

- [x] Keep `pageScopes: ["latest"]`.
- [x] Keep the existing Latest-only activation match.
- [x] Move mutable singleton state into an app instance.
- [x] Keep constants static.
- [x] Adopt canonical `core/`, `api/`, `app/`, and `ui/` boundaries.
- [x] Separate preset normalization/repository from rendering.
- [x] Keep GM compatibility behind a storage adapter.
- [x] Correct panel active-page metadata.
- [x] Track and cancel:
  - mount retries;
  - route listeners;
  - dialog listeners;
  - pending storage;
  - debounced updates.
- [x] Preserve storage keys and preset formats.
- [x] Use approved APIs from `ADDON-API-EXTENSIONS-01` only where they remove existing workarounds.
- [x] Complete the Example Add-on structure comparison and use injected metadata only.
- [x] Keep all raw core action invocations inside `api/**` or `core/adaptor.js`; app/domain/UI modules consume wrappers.
- [x] Make lifecycle generations invalidate mount, storage, dialog, and route work before any late UI/state commit.

### Required tests

- [x] Existing presets/settings load.
- [x] Latest bootstrap, disable, re-enable, refresh, and teardown.
- [x] Rapid route replacement creates no duplicates.
- [x] Outside Latest, installed/idle status remains accurate and management toggles work.
- [x] Cancelled retries cannot recreate UI.
- [x] Example-boundary and raw-action searches pass for the normalized source tree.
- [x] Repeated lifecycle tests prove no stale mount, dialog, preset, or listener commit.

### Acceptance criteria

- [x] Scope remains intentionally narrow.
- [x] No mutable state is exported from constants.
- [x] Main/adaptor modules contain no rendering logic.
- [x] The resulting layout follows `example-addon` without changing Latest-only behavior or saved formats.

---

## ADDON-LIBRARY-02 — Align Library with the canonical runtime

**Priority:** High  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** `addons/library-addon/src/**`, changelog, manifest, tests

### Agent execution command

> Execute `ADDON-LIBRARY-02` only. Preserve Library data behavior and the merged site-wide scope fix.

### Golden-template comparison and normalization boundary

The current Library add-on already has useful `api/library`, `library`, `thread`, and
`ui` domain folders, but `main.js` still owns runtime state, registration, command
dispatch, dock orchestration, lifecycle, timers, and raw bridge calls. UI application
modules and library clients also receive/use the bridge directly, and runtime metadata
still has fallback construction in `constants.js`.

Use `addons/example-addon` as the mandatory reference for the final shape. In addition
to the Library-specific requirements below, the package must:

- add a bridge-only `core/adaptor.js` and thin action-specific `api/**` wrappers;
- make `main.js` composition-only and move runtime state, commands, lifecycle, and
  manager orchestration into app modules;
- keep Library/thread/domain modules and UI renderers/bindings free of raw core action
  invocation; they consume injected API capabilities instead;
- track imports, progress dialogs, manager dialogs, dock/style resources, listeners,
  timers, IDB work, and pending operations with owner/generation cancellation;
- make disable reversible, suppress late import/UI commits, and make terminal teardown
  release every owner and acknowledge exactly once;
- use manifest-injected metadata without weakening the existing Library storage, IDB,
  legacy-record, or import/export compatibility contracts.

Required tests must include Example-boundary structure checks, raw-action searches for
domain/UI code, and repeated enable/disable/refresh/teardown coverage.

### Required implementation

- [x] Preserve `pageScopes: ["f95zone"]`.
- [x] Replace broad `coreBridge.js` with adaptor plus thin APIs.
- [x] Reduce `main.js` to composition.
- [x] Move registration, command routing, enabled-state transitions, dock orchestration, and manager orchestration into app modules.
- [x] Keep library/thread/UI domain folders.
- [x] Prevent domain modules from invoking raw bridge actions.
- [x] Centralize runtime metadata and settings defaults.
- [x] Cancel/close in order:
  - active import;
  - progress UI;
  - manager dialog;
  - dock resources;
  - IDB operations that support cancellation;
  - listeners and timers.
- [x] Preserve database names, stores, indexes, storage keys, legacy records, and import/export formats.
- [x] Route debug output through shared debug behavior.
- [x] Adopt approved new APIs only when the audit names Library as a consumer.
- [x] Complete the Example Add-on structure comparison and use injected metadata only.
- [x] Keep raw core action invocations inside `api/**` or `core/adaptor.js`; library/thread/domain/UI modules consume wrappers.
- [x] Make app generations and owner cleanup suppress late import, IDB, dialog, dock, and table commits.

### Required tests

- [x] Manager/settings work on ordinary, thread, Latest, and masked routes.
- [x] Thread-only controls stay thread-only.
- [x] Existing records remain compatible.
- [x] Disable during import prevents late writes/UI.
- [x] Re-enable creates no duplicate manager/dock listeners.
- [x] Example-boundary and raw-action searches pass for the normalized source tree.
- [x] Repeated lifecycle and exactly-once teardown tests cover manager, import, dock, style, listener, and timer ownership.

### Acceptance criteria

- [x] Site-wide scope is not regressed.
- [x] Domain modules know no raw bridge event/action strings.
- [x] Structure and lint checks pass.
- [x] The final Library layout follows `example-addon` while preserving all Library domain and persistence behavior.

---

## ADDON-MASKED-DIRECT-01 — Split F95 core mode from external standalone mode

**Priority:** Critical  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-SCOPE-02`, `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** `addons/masked-direct-addon/src/**`, changelog, manifest, generated catalog, tests

### Agent execution command

> Execute `ADDON-MASKED-DIRECT-01` only. Preserve every existing host match, grant, document-idle timing, selector, route-context field, and supported flow.

### Golden-template comparison and normalization boundary

The current hybrid add-on has a large metadata-fallback `main.js` that owns the core
bridge, F95 registration/access, settings, style, commands, teardown, and console
helper. External host controllers are already separated under `hosts/**`, but the F95
mode has no Example-style `core/adaptor.js`, thin `api/**`, app lifecycle boundary, or
UI binding boundary. It also uses shared teardown arrays and many host timers,
listeners, observers, and pending operations that must remain independent but owned.

Use `addons/example-addon` as the mandatory reference for the F95 core mode only:

- make `main.js` injected-metadata composition/bootstrap only;
- add `core/adaptor.js`, thin core API wrappers, F95 `app/` lifecycle/commands/state,
  and `ui/` rendering/binding modules;
- keep `hosts/**`, GM cross-host state, route-context transport, and standalone host
  behavior behind domain adapters that never import or invoke the core adaptor;
- assign explicit owners, generations, abort/cancel paths, and late-commit guards to
  F95 UI, route context, host handoffs, timers, listeners, observers, and pending
  operations; terminal teardown must be idempotent and acknowledge once;
- preserve every existing userscript header field, external flow, selector, timing,
  storage key, request/identity field, and public response shape.

Required tests must prove the Example-boundary structure for F95 mode, no raw core
actions in host/domain/UI modules, no core events on external hosts, and repeated
F95 enable/disable/refresh/teardown without affecting standalone flows.

### Required implementation

- [x] Consume `runtimeMode: "hybrid"` and `pageScopes: ["f95zone"]`.
- [x] Remove hard-coded `thread`, `download`, and `direct-download` registration scopes.
- [x] Preserve all matches, grants, and `document-idle`.
- [x] Add an explicit classifier:
  - `f95-core`;
  - `external-standalone`;
  - unsupported.
- [x] Register only on matched F95Zone thread and `/masked/` routes.
- [x] Never register or invoke core APIs on external hosts.
- [x] Do not claim support on ordinary F95Zone routes absent from activation matches.
- [ ] Adopt canonical boundaries for F95 mode.
- [x] Keep external host logic behind `hosts/**` adapters.
- [x] Keep route-context handoff behind a dedicated port/repository with TTL and request ID.
- [x] Separate GM cross-host state from core-backed F95 settings.
- [x] Define one owner for enabled/settings state.
- [ ] Put every timer/listener/observer under controller teardown.
- [x] Define behavior for an already-open external-host flow after F95-side disable.
- [x] Preserve selectors and timings unless a fixture proves a bug.
- [x] Keep host adapters independent from the core adaptor.
- [ ] Complete the Example Add-on comparison for F95 mode and use injected metadata only.
- [ ] Keep raw F95 core action invocations inside F95 `api/**` or `core/adaptor.js`; host adapters remain core-free.
- [ ] Use generation/owner cancellation for F95 and cross-host handoff work without changing standalone transport behavior.

### Required tests

- [ ] Thread and `/masked/` register once with `f95zone`.
- [ ] Ordinary F95Zone does not activate/register.
- [ ] External hosts emit no core bridge events.
- [ ] Core absent on matched F95 exits safely.
- [x] Header preserves all current metadata.
- [ ] Catalog reports hybrid mode and exact activation coverage.
- [x] Route context expiry/mismatch/cleanup works.
- [ ] Disable prevents new F95 flows.
- [ ] Every existing host adapter has success, timeout, and missing-selector fixtures.
- [ ] Example-boundary and raw-action searches pass for F95 modules while external hosts remain core-free.
- [ ] Repeated F95 lifecycle and exactly-once teardown tests cover styles, listeners, timers, observers, and pending handoffs.

### Acceptance criteria

- [ ] Removing download-like core scopes loses no external behavior.
- [x] Core and standalone modes are obvious.
- [x] No host controller imports the core adaptor.
- [x] Registration-handshake security is unchanged.
- [ ] F95 mode follows `example-addon` boundaries without imposing those boundaries on standalone host adapters.

---

## SITE-REPAIR-01 — Rebrand Image Repair as F95UE Site Repair

**Priority:** Critical  
**Depends on:** `ADDON-GOLDEN-01`, `ADDON-IDENTITY-01`, `ADDON-RUNTIME-CONTRACT-01`  
**Primary files:** existing Image Repair add-on, new Site Repair add-on, manifest, catalog, add-on state repository, docs, tests

### Agent execution command

> Execute `SITE-REPAIR-01` only. Rebrand, normalize identity/state, and move image repair behavior. Do not move Latest Ajax Recovery yet.

### Canonical identity

- ID/folder: `site-repair-addon`
- display name: `F95UE Site Repair`
- output: `addons/site-repair-addon/dist/site-repair-addon.user.js`
- legacy ID: `image-repair-addon`

### Release identity preservation

- Preserve the existing Image Repair userscript's `@namespace` byte-for-byte when
  publishing the rebrand.
- Change the userscript display name (`@name`) and user-facing branding to
  `F95UE Site Repair`; do not create a new GreasyFork script solely because the
  display name changes. The existing listing must remain update-compatible.
- Preserve the existing GreasyFork/update identity fields already used by the
  current userscript. The canonical add-on ID/folder and `legacyIds` are
  catalog, runtime, and state identities; they do not authorize generating a new
  userscript namespace.
- Add a header regression test proving that the pre- and post-rebrand namespace
  values are identical while the display name changes.
- If the current namespace cannot be recovered from source or accepted header
  metadata, stop and report that concrete blocker before changing it.

### Scope guardrail

- Do not generate a new namespace or a second GreasyFork identity for this
  rebrand.

### Golden-template comparison and normalization boundary

The current Image Repair source is a legacy flat `app.js`/`feature.js`/`ui.js` shape
with a `coreBridge.js` re-export, direct raw API calls, direct command-event handling,
anonymous page-ready/retry timers, mutable feature/UI state, and a console global.
The new Site Repair implementation must start from the completed `example-addon`
template rather than reproducing that legacy shape.

The rebrand must therefore create canonical `main.js`, `core/`, `api/`, `app/`, and
`ui/` boundaries with injected metadata, thin API wrappers, an app-owned lifecycle,
explicit resource ownership, cancellation, late-commit suppression, reversible
disable, and exactly-once teardown acknowledgment. Repair modules may remain domain
modules under the app, but must not invoke raw bridge actions or own untracked global
listeners/timers. Preserve the recovered namespace, legacy ID/state alias, repair
behavior, and all header compatibility requirements above.

Required tests must include a structural comparison against `example-addon`, raw-action
boundary checks, repeated lifecycle/teardown tests, and proof that the rebrand does not
inherit the legacy app's cleanup defects.

### Required implementation

- [x] Create the new add-on from canonical structure.
- [x] Declare `legacyIds: ["image-repair-addon"]`.
- [x] Expand activation to all F95Zone pages.
- [x] Use `pageScopes: ["f95zone"]`.
- [x] Let individual repair modules decide route applicability.
- [x] Update public branding, descriptions, catalog/download metadata, docs, changelog, and console helper names.
- [x] Organize repair modules under explicit boundaries.
- [x] Preserve existing enabled state and settings through add-on state alias normalization.
- [x] Replace recursive uncancelled retry timers with a cancellable scheduler.
- [x] Track image error listeners by generation/owner.
- [x] Use stable original URLs for retries.
- [x] Remove dead queue/constants or make the queue canonical.
- [x] Keep native Notification optional and user-triggered, or use core toast/UI.
- [x] Create per-repair settings:
  - `enabled`;
  - `repairs.imageAttachments.enabled`;
  - reserved `repairs.latestAjax.enabled`.
- [x] Teardown modules in reverse startup order.
- [x] Build the new Site Repair source from the Example Add-on structure, not from the legacy Image Repair flat app.
- [x] Keep raw core action invocations inside `api/**` or `core/adaptor.js`; repair domains and UI consume wrappers.
- [x] Give repair modules and shared app lifecycle explicit owner/generation cancellation and late-commit suppression.

### Required tests

- [x] Legacy state appears under one Site Repair card.
- [x] Enabled preference is preserved.
- [x] Image repair success, exhaustion, mid-retry disable, removed node, and route change.
- [x] No stale UI/state after invalidation.
- [x] Site Repair can remain registered while a route-inapplicable repair stays idle.
- [x] Example-boundary, raw-action, repeated-lifecycle, and exactly-once teardown tests pass.

### Acceptance criteria

- [x] Branding supports multiple repair modules.
- [x] Existing users do not lose state.
- [x] Site Repair follows the Golden Add-on structure while preserving the legacy namespace, state alias, and repair behavior.
- [x] Image repair is independently startable/stoppable.

---

## SITE-REPAIR-02 — Move Latest Ajax Recovery from core into Site Repair

**Priority:** Critical  
**Depends on:** `SITE-REPAIR-01`  
**Primary files:** core Latest Ajax Recovery feature, Site Repair source, config/add-on state compatibility boundary, generated feature manifest, docs, tests

### Agent execution command

> Execute `SITE-REPAIR-02` only. Move the complete behavior and remove the core copy. Do not leave two active patches.

### Objective

Make Latest Ajax Recovery an optional Site Repair module while preserving safety and existing user intent where technically possible.

### Required implementation

- [x] Move pure normalization/retry-decision functions into Site Repair.
- [x] Move the jQuery patch into a narrowly scoped bundled adapter.
- [x] Do not expose arbitrary script injection through the bridge.
- [x] Preserve:
  - one patch;
  - original restoration;
  - one safe retry;
  - no retry for 403/429.
- [x] Add generation/cancellation checks.
- [x] Activate only on Latest routes while Site Repair remains `f95zone`.
- [x] Do not add a compatibility importer or generic migration framework for the unreleased core preference.
- [x] Treat the Site Repair value as independent from the obsolete core value.
- [x] Drop the obsolete core field through tolerant sanitization and the next normal config commit.
- [x] Document the intentional preference reset as the compatibility decision.
- [x] Remove old setting metadata, core feature, generated manifest entry, and documentation listing.
- [x] Expose independent Image Attachments and Latest Ajax toggles in Site Repair.

### Required tests

- [x] Parser error, timeout, status 0, 5xx, 403, and 429.
- [x] Exactly one retry.
- [x] No retry after disable/route change.
- [x] jQuery present early and loaded later.
- [x] Duplicate enable does not double-patch.
- [x] Disable restores original Ajax.
- [x] Intentional preference reset and obsolete-key removal behavior are tested.
- [x] Core feature discovery no longer includes the feature.
- [x] Only Site Repair owns the marker/event.

### Acceptance criteria

- [x] Main userscript no longer bundles the repair.
- [x] Site Repair supplies equal or safer behavior.
- [x] No duplicate patch remains.
- [x] Preference compatibility has an explicit tested reset decision.

---

## ADDON-ACTIONS-02 — Complete action modularization

**Priority:** High  
**Depends on:** `ADDON-SCOPE-02`; coordinate with `ADDON-API-EXTENSIONS-01`  
**Primary files:** `src/services/addons/coreActions.js`, `src/services/addons/actions/**`, tests

### Agent execution command

> Execute `ADDON-ACTIONS-02` only. Complete descriptor ownership and remove the legacy action cycle without changing public action behavior.

### Objective

Make each action family independently understandable, testable, and measurable.

### Required implementation

- [ ] Split action families:
  - lifecycle/feature;
  - storage/config reads;
  - IDB;
  - observer;
  - UI/dock/dialog/style/mount;
  - toast;
  - approved new API families.
- [ ] Co-locate where practical:
  - descriptor;
  - payload validator;
  - capability;
  - scope policy;
  - timeout;
  - redaction;
  - executor.
- [ ] Make one explicit action composition root.
- [ ] Make `coreActions.js` a small invocation/snapshot facade.
- [ ] Remove legacy handler maps and temporary wrappers.
- [ ] Eliminate action-registration cycles.
- [ ] Preserve execution-time reauthorization before async commit.
- [ ] Keep payload-size/sanitization policy in narrow shared helpers.
- [ ] Add a completeness assertion:
  - every public action exactly once;
  - no duplicate ID;
  - no unregistered documented action.
- [ ] Keep action snapshots stable for diagnostics and the final size audit.
- [ ] Do not redesign registration handshake.

### Required tests

- [ ] Contract snapshots for every action.
- [ ] Capability/scope/validator/timeout coverage.
- [ ] Revocation during async execution.
- [ ] No action import cycle.
- [ ] Unsupported action response remains deterministic.
- [ ] New APIs, if any, use the same descriptor contract.

### Acceptance criteria

- [ ] `coreActions.js` is only a facade.
- [ ] Adding an action requires one family registration path.
- [ ] No behavior change is hidden as cleanup.

---

## ADDON-SERVICE-FACADE-01 — Decompose `addonsService.js` while preserving its public facade

**Priority:** High  
**Depends on:** `ADDON-ACTIONS-02`  
**Primary files:** `src/services/addonsService.js`, `src/services/addons/**`, tests

### Agent execution command

> Execute `ADDON-SERVICE-FACADE-01` only. Keep existing public imports working unless a documented deprecation is added.

### Objective

Move policies and workflows to owned modules while keeping a small stable facade.

### Required implementation

- [ ] Add characterization tests for all current exports.
- [ ] Move limits/throttle policy into an API policy module.
- [ ] Move page-scope resolution/authorization into the shared scope module.
- [ ] Move action invocation into an invocation service.
- [ ] Move installation trace, aliases, and persisted add-on state into the state repository.
- [ ] Move catalog/status projection into catalog/known-add-on modules.
- [ ] Move bridge callback composition into a bootstrap/composition module.
- [ ] Move lifecycle command/teardown orchestration into a lifecycle service.
- [ ] Keep the facade exporting stable registry, state, catalog, lifecycle, invocation, and initialization APIs.
- [ ] Avoid a generic service locator or one giant dependencies object.
- [ ] Use small family-specific dependency boundaries.
- [ ] Ensure shutdown:
  - stops bridge listeners;
  - stops accepting actions;
  - requests teardown;
  - performs bounded owner cleanup;
  - permits deterministic re-init where supported.
- [ ] Preserve rejection ordering and response shapes.
- [ ] Preserve registration transport/security behavior.

### Required tests

- [ ] Public export compatibility.
- [ ] Registered/unregistered management behavior.
- [ ] Trust/block/scope/capability rejection ordering.
- [ ] Bridge init/shutdown/re-init.
- [ ] Teardown watchdog/hard cleanup.
- [ ] No new import cycle.

### Acceptance criteria

- [ ] `addonsService.js` is materially smaller.
- [ ] The facade reads as composition/delegation.
- [ ] Policy decisions remain centralized.
- [ ] No add-on-facing response shape changes.

---

## ADDON-RUNTIME-KIT-01 — Extract narrow shared add-on helpers after normalization

**Priority:** Medium  
**Depends on:** normalized Example plus at least three production add-ons, `ADDON-SERVICE-FACADE-01`  
**Primary files:** `addons/shared/**`, migrated add-ons, docs, tests

### Agent execution command

> Execute `ADDON-RUNTIME-KIT-01` only for patterns proven equivalent in at least three add-ons. Do not create an add-on framework from one example.

### Objective

Reduce repeated runtime composition and lifecycle boilerplate without hiding domain behavior.

### Candidate patterns

- injected runtime metadata construction;
- guarded core-required bootstrap;
- command binding/unbinding;
- exactly-once teardown acknowledgment;
- generation and AbortController ownership;
- cancellable retries/timers;
- owner cleanup collection;
- normalized action-result errors;
- capability-aware API fallback;
- terminal teardown sequence.

### Required implementation

- [ ] Prove each extracted pattern with at least three equivalent call sites.
- [ ] Add characterization tests first.
- [ ] Prefer explicit handles:
  - `start`;
  - `disable`;
  - `refresh`;
  - `dispose`;
  - `signal`;
  - `generation`;
  - resource snapshot.
- [ ] Keep selectors, policies, state transitions, and domain behavior at call sites.
- [ ] Keep hybrid standalone mode separate from core-required bootstrap helpers.
- [ ] Do not merge core feature lifecycle with add-on lifecycle.
- [ ] Remove replaced duplicate code.
- [ ] Measure source and built output before/after.
- [ ] Update Example and documentation when a helper becomes canonical.
- [ ] Keep raw bridge event names inside the adaptor/runtime kit only.

### Required tests

- [ ] Helper idempotency.
- [ ] Reversible disable and terminal teardown.
- [ ] No stale callback after generation invalidation.
- [ ] No listener/timer/style/mount leak.
- [ ] Hybrid add-on does not invoke core helper on external hosts.
- [ ] At least three real consumers per extracted helper.

### Acceptance criteria

- [ ] Shared code reduces actual duplication.
- [ ] Call sites remain readable.
- [ ] The kit does not become a hidden service locator.
- [ ] Bundle growth is not justified by source-line reduction alone.

---

## TEST-ADDONS-01 — Add the complete add-on integration matrix

**Priority:** Critical  
**Depends on:** all production add-on normalization, Site Repair move, action/service decomposition, accepted API additions  
**Primary files:** `tests/**`, fixtures/helpers, package scripts

### Agent execution command

> Execute `TEST-ADDONS-01` only. Use deterministic DOM/unit fixtures; do not depend on live F95Zone or external hosts.

### Route/runtime matrix

For each core-registering add-on:

- ordinary F95Zone;
- thread;
- Latest;
- `/masked/`;
- core absent;
- initially enabled;
- initially disabled;
- installed but not active on current route;
- enable;
- disable;
- refresh;
- before-page-change;
- teardown;
- re-registration.

For Masked Direct:

- every external-host standalone context;
- no core bridge;
- route-context handoff success/expiry/mismatch;
- disabled-state decision.

### Required assertions

- [ ] Expected activation-match result.
- [ ] Expected runtime mode.
- [ ] Expected registration scope.
- [ ] Expected `supportsCurrentPage`.
- [ ] No unexpected out-of-scope result.
- [ ] Management operations work when runtime actions do not.
- [ ] Runtime actions remain blocked outside scope.
- [ ] Manifest, generated header, runtime metadata, registration, and catalog agree.
- [ ] No duplicate resource after repeated transitions.
- [ ] Teardown acknowledgment exactly once.
- [ ] No late UI/state commit.
- [ ] Legacy add-on state and storage compatibility.
- [ ] Site Repair identity compatibility.
- [ ] Every public action descriptor has success/rejection tests.
- [ ] Every approved new API has old-core fallback tests.
- [ ] Every manifest entry smoke-builds without version changes.
- [ ] Registration-handshake security/transport is unchanged by this plan.

### Acceptance criteria

- [ ] Invalid scopes and activation/scope conflation regressions fail.
- [ ] Library site-wide scope regression fails.
- [ ] Latest Filters accidental broadening fails.
- [ ] Masked Direct external match loss fails.
- [ ] Site Repair duplicate patch fails.
- [ ] No test reaches the network.
- [ ] Failures identify add-on, route, lifecycle transition, and policy.

---

## ADDON-SERVICE-SIZE-AUDIT-01 — Measure the final add-on service and add-on userscript footprint

**Priority:** High  
**Depends on:** every preceding accepted package  
**Primary files:** final add-on audit script, accepted baseline, `src/services/addonsService.js`, `src/services/addons/**`, `addons/shared/**`, all add-ons, build tooling, documentation

### Agent execution command

> Execute `ADDON-SERVICE-SIZE-AUDIT-01` only. Measure and explain the final architecture. Do not combine the audit with another broad refactor.

### Objective

Finish the add-on TODO with a deterministic audit showing what the add-on framework and each add-on cost after reinforcement.

### Required measurements

#### Core add-on service

Measure separately:

- `src/services/addonsService.js`;
- `src/services/addons/actions/**`;
- registry and registration state;
- catalog/known-add-on projection;
- lifecycle/teardown;
- bridge transport;
- UI sanitizer and UI ownership;
- storage/IDB/observer adapters;
- add-on-specific core UI components;
- generated trusted catalog;
- tests excluded from production totals.

Report:

- authored bytes;
- physical and nonblank lines;
- module count;
- largest files;
- dependency fan-in/fan-out;
- cycles;
- duplicate exports/helpers;
- esbuild bundled contribution to the main userscript;
- minified contribution where measurable;
- gzip contribution for comparison;
- action count by family;
- descriptor/validator/executor bytes by family;
- facade bytes;
- registration/transport bytes;
- post-registration policy bytes.

#### Shared add-on runtime

Measure:

- `addons/shared/**`;
- duplicated versus shared runtime code;
- helper usage count;
- bytes added to each built add-on;
- tree-shaking effectiveness;
- helpers imported by only one add-on;
- raw action/event string duplication.

#### Individual add-ons

For every add-on report:

- authored bytes by boundary;
- regular build bytes;
- release build bytes;
- gzip bytes;
- largest bundled modules;
- third-party/vendored contribution if any;
- manifest/header bytes;
- shared runtime contribution;
- UI/CSS contribution;
- storage/IDB/domain contribution;
- before-baseline delta;
- behavior added or removed with the delta.

### Required investigation

- [ ] Identify any remaining action-family duplication.
- [ ] Identify facade exports with no current caller.
- [ ] Identify public APIs with only one consumer.
- [ ] Identify runtime helpers imported by only one add-on.
- [ ] Identify add-ons carrying unused capabilities.
- [ ] Identify catalog fields duplicated at runtime unnecessarily.
- [ ] Identify repeated UI markup/CSS that could be shared without increasing every bundle.
- [ ] Identify common code that should remain duplicated because sharing would increase bundle size or coupling.
- [ ] Identify handshake/registration-security code separately but **do not propose changes in this plan**.
- [ ] Distinguish:
  - core add-on service cost;
  - individual add-on cost;
  - shared build/runtime cost;
  - generated metadata cost.
- [ ] Compare the final result with `ADDON-BASELINE-01`.

### Required output

Create a stable report containing:

1. summary totals;
2. before/after deltas;
3. top ten core add-on-service contributors;
4. top contributors for every add-on;
5. action-family cost table;
6. public API consumer table;
7. shared helper consumer/cost table;
8. dependency/cycle findings;
9. unused or one-consumer candidates;
10. accepted duplication with rationale;
11. prioritized future reductions:
    - safe deletion;
    - consolidation;
    - API removal/deprecation;
    - add-on-local optimization;
    - deferred handshake-security review;
12. recommended optional trend budgets, but do not enable them automatically.

### Required tests

- [ ] Unchanged runs produce byte-identical JSON.
- [ ] Audit excludes tests and tracked build output from authored totals.
- [ ] Every manifest entry appears.
- [ ] Every public action appears once.
- [ ] Every shared helper lists its consumers.
- [ ] Main userscript and each add-on can be smoke-built without mutation.
- [ ] Before/after comparison identifies the owning files for deltas.
- [ ] Registration-handshake security is reported as deferred, not redesigned.

### Acceptance criteria

- [ ] The final cost of add-on support in core is known.
- [ ] The final cost of each add-on is known.
- [ ] The audit distinguishes maintainability refactors from real bundle reductions.
- [ ] Potential API overgrowth is visible through consumer counts.
- [ ] Remaining large modules have named owners and reasons.
- [ ] The document ends with evidence for the next size-reduction decision rather than an arbitrary byte target.
- [ ] No production refactor is hidden inside the measurement package.

---

# Final integrated verification

After every accepted package:

- [ ] `npm run lint`
- [ ] add-on lint
- [ ] `npm run test`
- [ ] manifest validation
- [ ] trusted-catalog check
- [ ] structure validation
- [ ] every add-on regular smoke build
- [ ] every add-on release smoke build
- [ ] no version bump
- [ ] no build-cache change
- [ ] no tracked `dist/` modification
- [ ] `git diff --check`
- [ ] all current matches/grants/run timing preserved unless explicitly changed
- [ ] no unsupported scope remains
- [ ] trusted badge, effective trust, blocked reason, and enable-control behavior agree
- [ ] trusted add-ons are not rejected by the untrusted-add-on gate
- [ ] genuinely untrusted add-ons remain blocked when the main setting disallows them
- [ ] no raw bridge action/event outside adaptors or approved shared runtime
- [ ] no duplicate resources after lifecycle repetition
- [ ] no late async commits after invalidation
- [ ] teardown acknowledgment exactly once
- [ ] management/runtime policy matrix passes
- [ ] hybrid external mode works without core
- [ ] approved APIs have at least two real consumers
- [ ] unapproved candidate APIs were not added
- [ ] registration-handshake security remains deferred and unchanged
- [ ] final add-on-service size audit generated

---

# Expected result

The completed plan should leave:

- manifest-driven activation, runtime mode, scope, and catalog metadata;
- one canonical add-on structure;
- one documented post-registration lifecycle contract;
- one coherent trust/access decision shared by runtime authorization and add-on management UI;
- production add-ons with explicit cancellation and cleanup;
- Masked Direct with clearly separated core and standalone modes;
- Site Repair as the owner of optional site workarounds;
- a descriptor-owned, cycle-free action system;
- a small stable `addonsService.js` facade;
- only evidence-backed public APIs;
- a narrow shared runtime kit with multiple real consumers;
- deterministic add-on lint, structure, manifest, catalog, and build checks;
- comprehensive route/lifecycle integration tests;
- unchanged registration-handshake security;
- a final measured explanation of add-on-service and per-add-on size.
