## Audit Execution Status

Generated feature discovery is already implemented through `scripts/featureManifest.cjs` and `src/generated/features.generated.js`; manual feature registration is not an outstanding task. Baseline verified on 2026-07-10: lint, tests, manifest drift check, and `git diff --check` pass. Remaining work packages are tracked in `TODO_DETAILED.md` and should be completed in dependency order.

## Framework Hardening
- [ ] Move `src/core/dom.js` to `src/utils/dom.js` (or `src/ui/helpers/`).
- [ ] Decouple and clean up "fast capture" logic from the core framework.
- [ ] Move `src/core/tasksRegistry.js` to a more appropriate folder and document it.
- [ ] Revisit storage mechanism and import/export:
  - [ ] Revisit `settingsService.js` and `syncService.js` storage and sync interactions.
  - [ ] Refactor the `config-transfer` feature (`src/features/config-transfer`) into a proper service.
  - [ ] Decide on creating a schema/object to determine the data types of default configurations for clean imports.
- [ ] Optimize the Core Actions API creation inside `addonsService` (e.g., modularize `coreActions.js` into distinct registerable action files rather than maintaining a giant static mapping table).
- [ ] Review UI setting ownership: Clarify ownership of `latestSettings.js` and `threadSettings.js` (currently empty) vs dynamic contributions.
- [ ] Verify `metaRegistry`: Ensure live effects for cross-tab changes work correctly for sections other than Color and Thread.
- [ ] UI Metadata renderer: explicitly add support for the `info` metadata type in generic input renderers.
- [ ] Tag search outside-click handler: Refactor to prevent duplicate bindings/duplicate work.
- [ ] Add-on UI host trust boundary: Verify the security model where add-ons can mount HTML and style to multiple hosts.

## Audit Action Items (from `audit.md`)

### Critical — Correctness and lifecycle
- [ ] Replace stale manual feature registration docs with generated-manifest workflow.
- [ ] Add generated-manifest validation (duplicate keys/ids, invalid bootstrap modes, invalid page scopes).
- [ ] Define feature lifecycle cancellation semantics and enforce them in code/tests.
- [ ] Pass an `AbortSignal` or generation token into async lifecycle operations.
- [ ] Define and test global teardown contract (BFCache behavior, reinitialization semantics).
- [ ] Add integration tests: enable → route change → disable → re-enable; include `pagehide`/`pageshow` cases.
- [ ] Make configuration import/migration atomic and add rollback/recovery behavior.

### High — Resource ownership and scheduling
- [ ] Namespace listener/observer/style/resource/task IDs by owner (feature/add-on).
- [ ] Treat registry ID collisions as health errors in dev/test modes.
- [ ] Expose registry snapshots for diagnostics and leak assertions.
- [ ] Assert that disabling a feature releases all owned resources (listeners, observers, styles, timers, mounts).
- [ ] Add task queue cancellation for currently running async tasks and add backpressure configuration.
- [ ] Add task timeout and idle/drain APIs for deterministic testing and teardown.
- [ ] Define duplicate task key policy (drop-old/drop-new/replace-pending) and test it.

### High — Routing and bootstrap
- [ ] Introduce a shared route-transition generation across loaders, observers, and queues.
- [ ] Ensure stale async route work cannot apply DOM/state changes after navigation.
- [ ] Classify bootstrap steps (required/optional/recoverable) and document them.
- [ ] Expose degraded startup state via `featureHealth` and test failure modes.
- [ ] Test rapid consecutive history/URL changes and repeated applicability transitions.

### High — Sync and persistence
- [ ] Add revision/version metadata to persisted settings updates.
- [ ] Define cross-tab conflict resolution and stale-write rejection rules.
- [ ] Test synchronization loop prevention and effect replay for all synced config sections.
- [ ] Centralize configuration schema validation and make migrations idempotent.
- [ ] Add corrupted-storage recovery and optional last-known-good backup.

### High — Add-on security
- [ ] Write an explicit add-on threat model covering trusted/untrusted/disabled/blocked states.
- [ ] Validate bridge request payloads with action-specific schemas.
- [ ] Add protocol version, request ID, timeout, and duplicate-response protection.
- [ ] Document and test HTML/style mount sanitization and cleanup ownership.
- [ ] Verify scope enforcement at action execution time, not only on registration.
- [ ] Redact sensitive data from add-on errors, logs, and bridge responses.

### Medium — Observability and resilience
- [ ] Standardize framework error codes and structured health events.
- [ ] Add correlation IDs for bootstrap, route transition, and add-on requests.
- [ ] Add registry and queue state to feature-health reports.
- [ ] Deduplicate repeated errors and cap log volume.
- [ ] Add selector-failure diagnostics and fallback policy.
- [ ] Add fast-capture payload validation, size limits, TTL, and memory limits.

### Testing and automation
- [x] Add CI checks: lint, tests, `git diff --check`, and generated-manifest drift.
- [x] Add a Markdown link checker and documentation path checker.
- [x] Add a script comparing documented features/services with source inventory.
- [ ] Add DOM integration tests for routing, lifecycle, teardown, registries, and add-on bridge behavior.
- [ ] Add failure-path tests and a build-script smoke test to catch stale package scripts.
