# Library Add-on Implementation Plan

## Goal

- Build a new optional add-on that lets users quickly save threads to a personal library and manage that library with fast filtering/search.
- Keep the main script lean: thread-level quick actions stay lightweight, while full library management lives in add-on UI.
- Use IndexedDB (via add-on service bridge) for scalable storage and future growth.

## Product Scope (v1)

- Quick Add/Remove button on thread pages.
- Save normalized thread snapshot to library:
  - threadId, title, url, cover image (if available), dev/publisher text, prefix, rating, lastUpdated text/date, status text.
  - tags from main script scraper output (no manual tag definition in addon).
  - user fields: note, custom status, personal score, pinned, createdAt, updatedAt.
- Open dedicated library manager UI (separate page/modal owned by addon).
- Library manager supports:
  - search (title/dev/tags), filter (status/prefix/tags), sort (updated/title/rating).
  - bulk actions (set status, remove, export selected).
  - details/edit panel for note and custom status fields.

## Non-Goals (v1)

- No cloud sync.
- No cross-device sync.
- No collaborative sharing.
- No manual tag taxonomy editor (reuse scraped tags only).

## UX Decision

- Do not force full library manager into main settings modal.
- Use hybrid UX:
  - Main script/addon panel: minimal controls (enable toggle, open manager button, quick stats).
  - Thread page: compact Quick Add/Remove button + status chip.
  - Dedicated manager UI: independent add-on window/surface for heavy operations.
- Rationale:
  - avoids overloading settings modal,
  - enables richer table/grid interactions,
  - easier to iterate independently.

## Architecture (Modular)

### A) Add-on Modules

- addons/library-addon/src/main.js
  - bootstrap, register addon, lifecycle enable/disable/refresh.
- addons/library-addon/src/coreBridge.js
  - invoke core actions, receive commands, status updates.
- addons/library-addon/src/thread/
  - detector.js: detect supported thread pages and extract thread id/url.
  - snapshot.js: build normalized library entry from page + core-exposed metadata.
  - quickActions.js: inject Add/Remove button and bind events.
- addons/library-addon/src/library/
  - service.js: high-level library operations (add/update/remove/find/query).
  - query.js: filter/sort/pagination helpers.
  - exportImport.js: JSON export/import validation.
- addons/library-addon/src/ui/
  - managerLauncher.js: open manager surface.
  - managerApp.js: render manager shell and route tabs.
  - components/: list, toolbar, filter bar, editor drawer, empty state.
  - styles.css.
- addons/library-addon/src/state/
  - preferences.js: ui preferences (view mode, sort, filters).
  - schema.js: runtime validation for library records.
- addons/library-addon/src/constants.js
  - addon id, storage keys, db names, versions, command names.

### B) Core Add-on Service Extensions

- src/services/addonsService.js
  - add capability-gated IndexedDB actions:
    - idb.open (or implicit open)
    - idb.get
    - idb.put
    - idb.delete
    - idb.bulkPut
    - idb.query (indexed scans with limit/offset)
    - idb.count
  - enforce payload validation + size guardrails.
  - enforce per-addon namespace isolation.
- src/services/addons/shared.js
  - add new capability token: idb (or storage.indexeddb).
- src/services/addons/\* (new helper module)
  - idbStore.js: actual IndexedDB wrapper used by addonsService.
  - keep service logic thin; DB details live in helper module.

### C) Data Contracts

- LibraryRecord (versioned)
  - key: threadId (string) or canonical thread url hash.
  - fields:
    - identity: threadId, url, title, canonicalTitle
    - scraped: tags[], prefix, developer, score, coverUrl, lastUpdated
    - user: userStatus, note, userScore, pinned
    - meta: sourcePage, createdAt, updatedAt, schemaVersion
- Index strategy
  - by updatedAt
  - by userStatus
  - by titleNormalized
  - by prefix
  - by tags (multiEntry)

## Integration Points

- Reuse existing add-on registration/runtime model from current addons.
- Reuse existing `feature.enable`, `feature.disable`, `feature.refresh` semantics.
- Reuse existing toast capability for user feedback.
- For tags/prefix/thread metadata, consume data already scraped/exposed by main script where possible.

## Security + Stability

- Capability model:
  - library addon requests: feature, toast, idb, storage (small prefs only).
- Input validation at both edges:
  - addon side schema guard before write,
  - core side payload validation before executing idb action.
- Safety:
  - wrap bootstrap and UI rendering in try/catch,
  - report broken status on fatal init errors,
  - teardown listeners/observers on disable.

## Performance Plan

- IndexedDB for primary dataset (avoid GM key bloat).
- Incremental rendering and virtualized list for large library size.
- Debounced search/filter.
- Batch writes (bulkPut) for import and sync-updates.

## Migration Plan

- If legacy GM storage exists for this addon:
  - one-time migrate on first run into idb,
  - set migration marker,
  - keep rollback-safe behavior (do not delete legacy until successful write/verify).
- Core should remain backward compatible if idb capability is unavailable:
  - fallback to read-only mode with clear warning.

## Testing Plan

- Unit-ish (addon local helpers):
  - record normalization, query filtering, sort, import validation.
- Integration (core bridge):
  - idb action permission checks.
  - namespace isolation between addons.
  - enable/disable lifecycle retains consistency.
- Manual QA scenarios:
  - add/remove from thread button.
  - manager load with 0 / 100 / 1000 records.
  - import/export and malformed file handling.
  - broken add-on path shows correct status and non-crashing core.

## Build + Delivery Tasks

### Phase 1: Core Infrastructure

- [x] Add IndexedDB capability constant and permission handling.
- [x] Implement core idb helper module with strict validation.
- [x] Add new `core-action` idb handlers in addonsService.
- [x] Add telemetry/log hooks for idb failures (dev mode).

### Phase 2: Add-on Skeleton

- [x] Create addons/library-addon scaffold (main, bridge, constants, manifest entry).
- [x] Register add-on panel metadata and status handling.
- [x] Implement safe bootstrap/teardown pattern used by existing addons.

### Phase 3: Thread Quick Add UX

- [x] Implement thread detector and snapshot extraction.
- [x] Add Quick Add/Remove button injection on thread pages.
- [x] Persist record via idb put/delete actions.
- [x] Add toast feedback and optimistic UI updates.

### Phase 4: Library Manager UI

- [x] Implement dedicated manager shell and launcher.
- [x] Build list/table view with search/filter/sort.
- [x] Build details editor (note, user status, score, pin).
- [x] Add bulk actions and empty/loading/error states.

### Phase 5: Import/Export + Polish

- [x] JSON export (full + selected subset).
- [x] JSON import with validation and conflict policy.
- [x] Add migration logic from legacy storage (if found).
- [ ] Final QA pass across thread/latest pages and addon settings.

## Definition of Done (v1)

- Quick Add works reliably on supported thread pages.
- Library manager handles at least 1000 records with acceptable responsiveness.
- Tags are sourced from existing main script scraping (no manual tag mapping UI/code).
- Add-on disable/enable fully tears down and restores UI behavior.
- Core remains stable even if addon fails (broken status visible).

## Open Decisions

- Manager surface format:
  - option A: in-page overlay inside site DOM.
  - option B: separate tab/page rendered by addon.
  - recommended for v1: option A (faster integration), keep router abstraction so option B can be added later.
- Record identity:
  - primary key by threadId preferred,
  - fallback to canonical URL hash if threadId parse fails.

---

# Add-on Service Hardening Roadmap (Core-First Model)

## Why this section exists

- Goal: make addons behave like ticket submitters to core, not mini-apps that directly own DOM/CSS lifecycle.
- Current model is capability-gated, but UI/CSS ownership is still mixed.
- Industry practice for plugin systems: host owns lifecycle, plugin sends intent/state.

## Target architecture

- Core owns:
  - mount/unmount lifecycle,
  - style registry/injection/removal,
  - host containers and dialog surfaces,
  - teardown guarantees on disable/page-change.
- Addon owns:
  - business logic,
  - serialized UI model/state,
  - commands/events.

## This Week (low risk, high return)

- [x] Add lifecycle hooks in core bridge:
  - `addon.before-disable` ✓
  - `addon.before-unregister` ✓
  - `addon.before-page-change` ✓ (emitted in teardownAll; removes addon styles)
  - `addon.after-register` ✓ (emits capabilities + pageScopes to addon)
- [x] Ensure core emits teardown command before forced cleanup.
- [x] Add watchdog timeout for non-responsive addon cleanup, then hard-remove.
- [x] Add core CSS actions:
  - `ui.style.register({ addonId, styleId, cssText })` ✓
  - `ui.style.unregister({ addonId, styleId? })` ✓
- [x] Store style handles per addon in core registry and auto-remove on disable/unregister.
- [x] Add payload budgets for style/storage actions and reject oversized payloads.
- [x] Add compatibility adapter so legacy direct-style addons still work during migration.

## Needs Refactor (medium effort)

- [x] Add core-owned UI mount API:
  - `ui.mount({ addonId, slot, templateId|html, options })`
  - `ui.update({ addonId, mountId, patch|state })`
  - `ui.unmount({ addonId, mountId })`
- [x] Introduce fixed modal host managed by core:
  - open/close, ESC handling, backdrop click, focus trap.
- [x] Add slot hosts managed by core for page dock/panels/floating tools.
- [x] Keep large payloads out of core config storage by rule:
  - bulk data in addon-local GM or IDB,
  - core storage for settings/status only.
- [x] Add per-addon storage quota telemetry.
- [x] Split capability `ui` into:
  - `ui.style`, `ui.mount`, `ui.dialog`, `ui.dock`.

## Future / Optional (advanced)

- [ ] Strict mode:
  - disallow direct addon DOM injection,
  - require UI through core host APIs.
- [ ] Add signed remote catalog verification for third-party addons.
- [ ] Add addon health dashboards:
  - register latency,
  - command failure rates,
  - unhandled error count.
- [ ] Add trace IDs for command/reply pairs to speed debugging.

## Per-Trusted-Addon Migration Checklist

### 1) image-repair-addon

- [x] Move CSS injection to `ui.style.register` / `ui.style.unregister`.
- [x] Ensure observer and command listeners are removed via lifecycle hooks.
- [x] Keep metrics/state in addon-local storage keys (not core global payloads).
- [x] Verify disable on unsupported page keeps status `Installed + Idle` (never `Not Installed`).
- [x] Add regression test: disable/enable while idle does not break next thread-page activation.

### 2) masked-direct-addon

- [x] Move any host-page UI styles to core CSS registry.
- [x] Route transient UI rendering through core slot/mount API.
- [x] Keep host automation logic internal; only submit status/events to core.
- [x] Ensure teardown removes all route hooks, intervals, and listeners on disable.
- [x] Add regression test: page transitions between thread/masked/download leave no UI residue.

### 3) library-addon

- [x] Migrate dock/button rendering to core mount API (core owns DOM).
- [x] Keep library dataset in IDB only; keep core payload minimal (status/settings).
- [x] Register/unregister styles through core CSS registry.
- [x] Ensure manager dialog/surface is mounted/unmounted by core host.
- [x] Add regression test: 1000-record library does not inflate core config payload size.

### 4) latest-filters-addon

- [x] Move modal shell ownership to core dialog host API.
- [x] Keep presets in addon-local storage (already moving away from core payload).
- [x] Register modal/list styles through core CSS registry.
- [x] Ensure backdrop click + ESC close are core-hosted behavior.
- [x] Add regression test: save/apply/update/delete persists across refresh and page reload.

## Cross-Addon Acceptance Criteria

- [x] Disabling any addon leaves zero DOM/style residue.
- [x] Page transitions do not orphan addon UI.
- [x] Core can force-destroy any addon surface without page reload.
- [x] Addons can still implement complex UI using core mount contracts.
- [x] Core config payload size remains stable as addon data grows.
