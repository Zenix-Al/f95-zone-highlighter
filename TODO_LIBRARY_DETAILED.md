# Personal Library Development Plan

## Scope decision

Evolve `library-addon` from a saved-thread table into a personal game library.
IndexedDB is the authoritative database. Core remains a bounded transport and
database adapter; Library owns its schema, record semantics, migrations,
history, update detection, import/export, and UI.

This plan preserves:

- add-on ID, userscript matches, grants, run timing, capabilities, and handshake;
- physical database name `f95ue-addon:library-addon:library`;
- the existing `records` store and `threadId` primary key;
- legacy `libraryRecords` import and `libraryMigrationV1Done`;
- existing notes, status, pin, tags, prefixes, timestamps, and imports;
- the current manager table columns and general layout, except that the
  **Thread Rating** column becomes editable **My Rating**;
- reversible disable, cancellation, stale-work suppression, and exactly-once
  terminal teardown.

Do not infer personal activity from thread metadata. A thread version changing
must not overwrite `playing`, `paused`, `completed`, or `dropped`.

Automatic update checking is an accepted Library behavior and defaults on for
every record. Users can disable it per record from Full Edit or in bulk from
the manager. "Background" means bounded work while an enabled F95 tab is alive;
it does not imply a service worker or requests after every F95 tab is closed.

## Fixed design decisions

### Data ownership

Keep three distinct concepts:

1. **Thread facts** — current title, developer, public thread rating, tags,
   prefixes, current version, URL, and observation dates.
2. **Personal state** — personal rating, status, note, pin, last played version,
   progress note, and personal dates.
3. **History events** — observed thread changes and explicit personal activity.

The normalized record shape is version 5:

```js
{
  threadId,
  thread: {
    url,
    title,
    canonicalTitle,
    titleNormalized,
    developer,
    prefixes,
    tags,
    currentVersion,
    threadRating,
    sourcePage,
    observedAt,
    versionObservedAt,
  },
  personal: {
    status,              // saved | backlog | playing | paused | completed | dropped
    rating,              // null or 0..5 in 0.5 increments
    note,
    pinned,
    progressNote,
    lastPlayedVersion,
    addedAt,
    startedAt,
    lastPlayedAt,
    completedAt,
    droppedAt,
    lastActivityAt,
  },
  updateState,           // current | changed | acknowledged | unavailable | unchecked
  lastCheckedAt,
  updateCheck: {
    enabled,             // missing legacy value tolerantly defaults to true
    status,              // pending | checking | current | changed | failed | disabled
    lastAttemptAt,
    lastSuccessAt,
    nextCheckAt,
    consecutiveFailures,
    lastErrorCode,
  },
  lastThreadChangeAt,
  recordModifiedAt,
  schemaVersion: 5,
}
```

Compatibility aliases such as `gameVersion`, `threadRating`, `userStatus`,
`userScore`, `note`, `pinned`, `createdAt`, and `updatedAt` are accepted at
normalization/import boundaries. New domain and UI code consumes the nested
shape. Do not perform a load-time rewrite solely to convert version-3 records.
Any user mutation or authoritative thread update writes canonical version 5.

`personal.rating` replaces `userScore` as the personal rating. The public F95
rating remains `thread.threadRating` and is visible in the full detail/edit
surface, not the main table.

### Main table

Keep the existing row and column structure. Rename the **Thread Rating** header
to **My Rating** and render `personal.rating`.

My Rating is editable inline like Note, using:

```html
<input type="number" min="0" max="5" step="0.5">
```

Blank means unrated (`null`). Clamp and normalize typed, pasted, wheel, and
arrow-adjusted values. Debounce writes, flush on blur/Enter, cancel on Escape,
and suppress late writes after row replacement, dialog close, disable, or
teardown. A failed write restores the last committed value and shows one toast.

Do not add update history, progress, or dates as new table columns in this plan.

### Full edit dialog

Add **Full edit** to each row's three-dot action menu. Use the existing
`ui.dialog.open`, `ui.dialog.update`, and `ui.dialog.close` API with a stable,
Library-owned dialog ID. The payload is comfortably below the current dialog
HTML limit; do not enlarge core limits or create a page-global modal.

Create a dedicated component rather than expanding the manager table renderer:

```text
src/ui/entryEditor/
  editorController.js
  editorRenderer.js
  editorBindings.js
  editorValidation.js
  editor.css
```

The editor includes:

- personal status and rating;
- note and progress note;
- last played version;
- started, last played, completed, and dropped dates;
- current thread version and public thread rating as read-only facts;
- update state and acknowledgement action;
- observed update history;
- personal activity timeline.

Preview/edit state remains local until Save. Save re-reads the record, validates
again, merges only editor-owned personal fields, advances `recordModifiedAt`,
and commits once. Cancel and dialog close commit nothing.

### Version changes and status

When normalized current version changes from one non-empty value to another:

- append one deduplicated update event;
- set `updateState` to `changed`;
- set `lastThreadChangeAt`;
- update `thread.currentVersion` and `thread.versionObservedAt`;
- preserve every personal field and personal status;
- do not change `personal.lastPlayedVersion`;
- do not mark the update acknowledged automatically.

The initial observation does not count as a version change. Empty/unknown
versions do not create false history. Re-observing the same version is
write-free except when another authoritative thread fact changed.

### Progress

Progress is intentionally user-authored:

- status;
- last played version;
- last played date;
- optional progress note.

Do not infer a percentage, chapter, completion, or play session from page
visits. “Played this version” is an explicit action that records an activity
event and updates the personal summary.

### Automatic updates

Implement in increasing-risk stages:

1. opportunistic update when an already-saved thread is visited;
2. bounded manual checks for selected records;
3. default-on automatic checks only after the manual checker is accepted.

Do not fetch hundreds of threads at startup. Never retry 403/429
automatically. Automatic checks must be rate limited, cancellable, session
bounded, and disabled when Library is disabled.

The user has explicitly accepted automatic checking, replacing the earlier
opt-in decision. Missing `updateCheck.enabled` on existing records defaults to
`true` without a load-time rewrite. Keep global scheduling controls in Library
settings and per-record enable/status state in the record.

Adapt the proven parts of `addons/reference/F95 Helper.user.js`:

- request only the thread HTML with authenticated same-origin credentials;
- parse the starter-post `Version:` field first, then title brackets, then a
  bounded body-text fallback;
- normalize equivalent version formatting before comparison;
- use a timeout, one owned active request, cancellation, sequential pacing,
  and jitter.

Do not copy its global singleton state, direct GM storage, DOM-coupled loop, or
unbounded whole-watchlist mutation. Use a narrow injected request adapter,
pure parser fixtures, the accepted version-history application service, and
explicit scheduler ownership. Prefer same-origin `fetch`; add no core network
API or userscript grant unless fixtures prove that authenticated fetch cannot
work in supported managers.

Cross-tab scheduling uses the existing Library IndexedDB `meta` store as a TTL
lease registry. Do not add GM value-change listeners, synchronization grants,
`navigator.locks`, or a second coordination transport. Each tab has a random
owner ID and must claim the scheduler lease with a new generation, then
immediately re-read it. Only the owner/generation that remains stored may
continue. Renew the lease with a heartbeat and treat expiry as the liveness
signal; tabs do not need to detect whether another tab still exists.

Each active thread check also has a bounded `meta` claim containing thread ID,
owner ID, generation, claim time, and expiry. Before fetching and again before
committing, re-read both scheduler and thread claims and verify owner,
generation, expiry, enabled state, and cancellation state. A stale response
must not mutate the record or append history. Disable, teardown, and `pagehide`
perform best-effort release, while TTL expiry recovers from crashes or abrupt
tab closure.

Initial scheduler defaults, subject to the manual-check measurements, are:

- recheck interval: 24 hours, configurable from 6 to 720 hours;
- request spacing: random 8–12 seconds, configurable with a 5-second minimum;
- request timeout: 30 seconds, configurable from 10 to 30 seconds;
- maximum retries: 2, configurable from 0 to 5;
- retry backoff: bounded exponential delay with jitter;
- one active request, 25 records per tab session, and 100 records per day.

These are safety limits, not promises to finish the complete library in one
session. Due records continue in later eligible sessions.

## IndexedDB schema and migration

Use database version 3 with all stores declared in one schema:

```text
records
  keyPath: threadId
  existing indexes retained
  new indexes: updateState, personal.status, personal.rating,
               personal.lastPlayedAt, lastThreadChangeAt, recordModifiedAt

updates
  keyPath: id
  indexes: threadId, observedAt, version, [threadId, observedAt]

activity
  keyPath: id
  indexes: threadId, occurredAt, type, [threadId, occurredAt]

meta
  keyPath: key
```

Before opening version 2, extend the core IDB adapter to accept one bounded
`stores` schema array and create every store/index in the same
`onupgradeneeded` transaction. The adapter must:

- validate names, key paths, index definitions, and version;
- close cached lower-version connections before upgrade;
- install `db.onversionchange = () => db.close()`;
- deduplicate concurrent opens;
- reject conflicting schemas deterministically;
- expose no arbitrary callback or script execution;
- keep existing single-store payloads compatible;
- test blocked upgrades without deleting the database.

Do not attempt to create different new stores through separate version-2
opens. Do not delete/recreate `records` to change its shape.

The database upgrade is structural only. Existing version-3 records remain
readable through tolerant normalization. Write a `meta` marker only after all
four stores and required indexes are verified. If verification fails, retain
all source records and leave the marker incomplete. Re-running initialization
must be idempotent.

Export format version 2 includes canonical records, updates, and activity.
Version-1/legacy imports remain supported and produce records with empty
history stores. Import preview validates every section before writes. Commit
must be cancellation-aware and report partial/rollback failure explicitly;
never claim a complete import if one store failed.

## Global definition of done

Every package must:

- preserve IDB names, existing records, storage keys, public action IDs, and
  response shapes unless the package explicitly versions an import document;
- add deterministic unit and integration tests without live F95Zone/network;
- preserve exact personal fields during thread refresh;
- prevent stale async work from writing after disable, route invalidation,
  dialog close, or teardown;
- keep raw core action strings inside API adapters;
- keep manager/editor DOM code out of repositories and record models;
- build regular and release add-ons into temporary output only;
- not bump versions or modify tracked `dist/`;
- run `npm run lint`, `npm run lint:addons -- --quiet`, `npm test`,
  add-on manifest/catalog/structure checks, regular/release Library smoke
  builds, deterministic audit checks, and `git diff --check`;
- update only checkboxes verified by passing tests.

## Required execution order

1. `LIBRARY-PERSONAL-BASELINE-01`
2. `LIBRARY-IDB-SCHEMA-02`
3. `LIBRARY-RECORD-MODEL-04`
4. `LIBRARY-RATING-UI-01`
5. `LIBRARY-ENTRY-EDITOR-01`
5a. `LIBRARY-MANAGER-KEYSET-FOLLOWUP-01` (completed follow-up)
6. `LIBRARY-VERSION-HISTORY-01`
7. `LIBRARY-ACTIVITY-01`
8. `LIBRARY-OPPORTUNISTIC-UPDATE-01`
9. `LIBRARY-IMPORT-EXPORT-02`
10. `LIBRARY-MANUAL-UPDATE-CHECK-01`
11. `LIBRARY-AUTO-UPDATE-01` (after manual checker fixtures and costs are accepted)

---

## LIBRARY-PERSONAL-BASELINE-01 — Characterize current database and behavior

### Requirements

- [x] Record the physical database/store/index schema and current record shape.
- [x] Add fixtures for empty, legacy, version-3, malformed, and large records.
- [x] Snapshot table headings, row actions, sort/filter behavior, note editing,
      manager reopen, import/export, and thread update behavior.
- [x] Measure record counts and serialized sizes at 10, 1,000, and 10,000
      records without mutating production data.
- [x] Record current regular/release/gzip sizes and top contributors.

### Acceptance criteria

- [x] Two baseline runs are byte-identical and contain no timestamp or absolute path.
- [x] The tests demonstrate that `threadRating` is currently displayed while
      `userScore` is separate and mostly unused.
- [x] No production behavior or database is changed.

---

## LIBRARY-IDB-SCHEMA-02 — Safe declarative multi-store upgrades

### Requirements

- [x] Add bounded multi-store schema support to the existing core IDB adapter.
- [x] Preserve all existing single-store calls and action response shapes.
- [x] Declare Library database version 3 and all stores/indexes together.
- [x] Add schema verification and an idempotent `meta` completion marker.
- [x] Handle cached connections, `versionchange`, concurrent opens, blocked
      upgrades, failed upgrades, and repeated initialization.
- [x] Do not eagerly rewrite version-3 records.

### Required tests

- [x] Version-1 `records` data survives the version-2 upgrade byte-for-byte.
- [x] All stores and indexes exist after one upgrade transaction.
- [x] Opening `updates` first or `activity` first cannot produce an incomplete schema.
- [x] Failed/blocked upgrade preserves version-1 data and does not set completion.
- [x] Concurrent initialization has one winner and deterministic callers.
- [x] Existing add-ons using single-store payloads remain compatible.

### Acceptance criteria

- [x] No delete/recreate fallback exists.
- [x] No arbitrary transaction callback is exposed through the public API.
- [x] Library startup verifies schema before repository use.

---

## LIBRARY-RECORD-MODEL-04 — Separate thread facts and personal state

### Requirements

- [x] Implement canonical version-5 normalization and exact validation paths.
- [x] Tolerantly map version-3 fields into `thread` and `personal`.
- [x] Map `userScore` to `personal.rating`; keep `threadRating` as a thread fact.
- [x] Introduce explicit personal and observation dates.
- [x] Replace ambiguous domain uses of `updatedAt` with `recordModifiedAt`,
      while preserving `updatedAt` as an accepted compatibility input.
- [x] Preserve unknown valid sibling data only where the import contract permits it.
- [x] Keep reads write-free; canonicalize on the next actual mutation.

### Required tests

- [x] Every valid version-3 fixture retains title, rating, status, note, pin,
      tags, prefixes, version, and dates.
- [x] Invalid personal rating/date/status values recover without dropping valid siblings.
- [x] Thread refresh cannot mutate any `personal` field.
- [x] Personal edits cannot mutate any `thread` field.
- [x] Re-normalization is deterministic and idempotent.

---

## LIBRARY-RATING-UI-01 — Editable personal rating in the existing table

### Requirements

- [x] Rename the table heading from Thread Rating to My Rating.
- [x] Render `personal.rating`, not public `thread.threadRating`.
- [x] Add the bounded number input with arrow controls, blank/null support,
      debounce, blur/Enter commit, and Escape cancel.
- [x] Add draft/timer ownership parallel to Note without sharing mutable drafts.
- [x] Revalidate and re-read at commit time.
- [x] Preserve current table columns, row height behavior, pagination, sorting,
      selection, and row menu.

### Required tests

- [x] Arrow, typed, pasted, blank, out-of-range, and half-step values normalize correctly.
- [x] Rapid edits serialize and the latest accepted value wins.
- [x] Row reload, manager close, disable, and teardown cancel stale rating writes.
- [x] Failed writes restore the committed value and do not alter thread rating.
- [x] Sorting/searching by rating uses personal rating.

---

## LIBRARY-ENTRY-EDITOR-01 — Full edit from the three-dot menu

### Requirements

- [x] Add a Full edit action without removing Update or Remove.
- [x] Build the dedicated editor component and use the core dialog API.
- [x] Load one fresh record when opening; do not trust the table row snapshot.
- [x] Keep draft state local until Save.
- [x] Validate personal status, rating, dates, last played version, and notes.
- [x] Show thread version/public rating read-only.
- [x] Save one merged personal patch after re-reading the record.
- [x] Own dialog listeners, pending load/save, and close notifications.

### Required tests

- [x] Open, close, reopen, Save, Cancel, external close, disable, and teardown.
- [x] Cancel and close are write-free.
- [x] Concurrent thread refresh plus personal Save preserves both owners' changes.
- [x] Stale loads/saves cannot update a replacement dialog.
- [x] Dialog payload remains below the accepted UI limit.

---

## LIBRARY-MANAGER-KEYSET-FOLLOWUP-01 — Compact controls and cursor paging

### Requirements

- [x] Consolidate bulk actions and import/export controls into one compact row.
- [x] Move loading feedback beside Export and keep table geometry stable.
- [x] Add opt-in keyset pagination to `idb.query` without changing legacy array responses.
- [x] Use cursor history for deterministic Previous/Next navigation and reset it after query changes.
- [x] Bound filtered scans and preserve all, filtered, and selected export behavior.
- [x] Keep Title and My Rating sorting on the compatibility path; do not add a hidden database migration.

### Acceptance criteria

- [x] Default Updated pagination reads bounded cursor pages instead of the complete Library.
- [x] Equal index values resume using index key plus primary key without duplicates.
- [x] Search, status, sort, and page-size changes reset cursor state.
- [x] Focused pagination tests and the complete test suite pass.

---

## LIBRARY-VERSION-HISTORY-01 — Observe and store meaningful thread changes

### Requirements

- [x] Add update-event model, repository, deterministic IDs, and deduplication.
- [x] Compare normalized snapshots through one pure diff function.
- [x] On a real version change, set `updateState: "changed"`.
- [x] Never overwrite personal status or last played version.
- [x] Ignore initial, empty, equivalent, and repeated versions.
- [x] Record other meaningful thread changes without falsely marking a version update.
- [x] Add acknowledge-current-update behavior.

### Required tests

- [x] `0.7 -> 0.8` creates exactly one event and marks changed.
- [x] Repeating `0.8` creates no event/write.
- [x] Empty and formatting-equivalent versions create no false event.
- [x] `personal.status: playing` remains playing after every thread update.
- [x] Event queries are ordered and bounded by thread ID.

---

## LIBRARY-ACTIVITY-01 — Personal activity and played-version history

### Requirements

- [x] Add activity-event model and repository.
- [x] Add explicit Played this version, status-change, rating-change, and
      progress-note actions.
- [x] Derive/update personal summary fields in the same application command.
- [x] Record dates only from explicit user actions.
- [x] Display activity in the full editor/detail dialog.
- [x] Bound timeline queries; do not load all activity into the main table.

### Required tests

- [x] Playing 0.7 then observing 0.8 reports current 0.8 / last played 0.7.
- [x] Duplicate button submission is idempotent by command ID.
- [x] Status transitions set relevant dates without erasing historical events.
- [x] Disable/teardown cancels late event and summary commits.

---

## LIBRARY-OPPORTUNISTIC-UPDATE-01 — Update saved records on thread visits

### Requirements

- [x] When a saved thread is visited, compare its live snapshot after page readiness.
- [x] Commit through the version-history application service.
- [x] Make unchanged visits write-free.
- [x] Cancel on route generation change, disable, and teardown.
- [x] Surface changed/current state in the manager and full editor.
- [x] Do not fetch any background page in this package.

### Acceptance criteria

- [x] Visiting an unsaved thread creates no record.
- [x] Visiting a saved changed thread creates one update.
- [x] Rapid route changes cannot commit the stale thread.

---

## LIBRARY-IMPORT-EXPORT-02 — Versioned personal-library documents

### Requirements

- [x] Add export document version 2 for records, updates, and activity.
- [x] Continue accepting arrays, legacy records, and version-1 documents.
- [x] Preview validates and counts all sections before mutation.
- [x] Preserve deterministic conflict rules per store.
- [x] Make cancellation and partial failure explicit.
- [x] Do not import derived summaries that conflict with newer activity/history
      without a documented reconciliation rule.

### Required tests

- [x] Version-1 imports produce canonical records with empty histories.
- [x] Version-2 round trips personal rating, dates, updates, and activity.
- [x] Invalid history cannot partially mutate records during preview.
- [x] Existing import throttling and payload bounds remain effective.

---

## LIBRARY-MANUAL-UPDATE-CHECK-01 — Bounded selected-thread checks

### Requirements

- [x] Add Check for updates for selected records and one row.
- [x] Add a Library-owned same-origin HTML request adapter using authenticated
      credentials, AbortSignal, a bounded response size, and a 30-second timeout.
- [x] Port the reference parser priority: starter-post `Version:` field,
      title brackets, then bounded body-text fallback.
- [x] Parse fixtures for active, completed, on-hold, abandoned, renamed,
      missing-version, malformed, login-page, challenge-page, and redirected
      threads without depending on live F95Zone.
- [x] Run through one shared checker with configurable request spacing,
      jitter, timeout, retry limit, cancellation, and maximum-record bounds.
- [x] Preview detected changes before commit.
- [x] Classify authentication/challenge responses separately from missing versions.
- [x] Treat 403/429 as terminal, retry only timeout/network/5xx failures up to
      the configured maximum, and show bounded results.
- [x] Never run while disabled or after teardown.
- [x] Persist attempt/success/failure metadata without changing personal activity.

### Acceptance criteria

- [x] No more than one background request is active by default.
- [x] Unchanged checks create no thread-fact or history writes beyond the
      required check-metadata update.
- [x] Closing progress UI cancels pending checks and prevents late commits.
- [x] Parser precedence and every error classification are deterministic.
- [x] Existing userscript matches, grants, and core API remain unchanged unless
      authenticated same-origin fetch is proven incompatible by a fixture.

---

## LIBRARY-AUTO-UPDATE-01 — Default-on bounded scheduled checks

This package starts only after the manual checker is accepted and measured.

### Entry gate

- [x] Manual checks have stable parsing fixtures and observed request costs.
- [x] A safe default interval and per-session/day request budget are documented.
- [x] The user explicitly accepts automatic network checking.

### Requirements

- [x] Default per-record automatic checking to enabled; a missing legacy field
      means enabled and causes no load-time rewrite.
- [x] Add per-record Auto update controls to Full Edit.
- [x] Add bulk Enable auto update and Disable auto update actions.
- [x] Add an Auto update button immediately right of Bulk actions.
- [x] Its panel shows running/idle/paused state, next scheduled run, checked,
      current, changed, failed, skipped, and retry counts from the last run.
- [x] The panel provides Retry failed now and bounded settings for check interval,
      request spacing, request timeout, maximum retries, session cap, and daily cap.
- [x] Persist global scheduler configuration and last-run summary in `meta`;
      persist per-record scheduling/result state on each record.
- [x] Check stale records only, with session/day caps and jitter.
- [x] Reuse the manual checker pipeline exactly.
- [x] Use the IndexedDB `meta` store for the scheduler TTL lease and per-thread
      claims; use write-then-read owner/generation verification after every claim.
- [x] Renew the scheduler heartbeat while active and allow takeover only after
      expiry plus bounded jitter.
- [x] Revalidate scheduler and thread claims before every request and commit so
      stale or closed tabs cannot append history or update records.
- [x] Add no GM value listener/grant, `navigator.locks`, or other cross-tab transport.
- [x] Never retry 403/429, authentication challenges, or disabled records.
- [x] Abort active requests and release the lease on disable, teardown, route
      invalidation where applicable, or ownership loss.
- [x] Do not show success toasts or steal focus for scheduled runs; surface
      summaries only in the manager panel and row state.
- [x] Add semantic Updated-cell state: green for a successful current check,
      yellow for pending/never checked, and red for the latest failed check.
- [x] Keep the date-only cell text and full timestamp tooltip; add an accessible
      text/title explanation so color is not the sole status signal.

### Acceptance criteria

- [x] Startup never launches an unbounded scan.
- [x] Multiple tabs cannot duplicate the same scheduled batch.
- [x] Simultaneous expired-lease claims produce one verified winner; all losers
      cancel before issuing a request.
- [x] Abrupt tab closure recovers after TTL without leaving a record permanently
      in checking state.
- [x] Failed runs leave records and histories internally consistent.
- [x] Every record is eligible by default, while bulk/full-edit disable survives
      reload and excludes that record from scheduling.
- [x] Retry failed now selects only eligible failed records and obeys all caps.
- [x] Scheduled checks remain silent unless the user opens the manager.
- [x] Fake-clock tests cover due ordering, jitter bounds, backoff, retry limits,
      lease expiry/takeover, disable/re-enable, and teardown cancellation.
