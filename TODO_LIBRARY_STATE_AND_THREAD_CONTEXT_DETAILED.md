# Library State Consistency and Thread Context

This plan makes Library status, activity history, version-play state, title
chips, and Manager ordering agree across every UI entry point.

The work is source-first under `addons/library-addon/src/`. Generated add-on
userscripts are rebuilt only when explicitly requested.

## Scope and fixed decisions

- `record.personal.status` is the canonical current Library status.
- Activity events are historical audit entries. They do not independently
  determine the current status.
- Every user-initiated status change uses one activity-aware service command,
  regardless of whether it comes from Manager inline controls, Full Edit, bulk
  actions, or a thread-page control.
- `record.updateState === "changed"` means a detected update has not been
  acknowledged. It is independent of whether that version has been played.
- A current version is unplayed when normalized `thread.currentVersion` and
  `personal.lastPlayedVersion` differ. Acknowledge does not mark it played.
- Marking the current version played updates `lastPlayedVersion`,
  `lastPlayedAt`, and activity history. It does not implicitly acknowledge an
  update unless that behavior is separately approved later.
- Saving a thread initially creates status `saved`. Its title status chip is
  rendered immediately from the persisted record returned by the service.
- When Manager is opened from a saved thread page, that current thread receives
  temporary view priority above pinned records. This priority is not persisted
  and does not alter pin state or the selected sort.
- No IndexedDB version bump or record-schema migration is currently required.
  The existing `records` and `activity` stores contain the required fields and
  indexes. Revisit this only if implementation introduces a new persisted field
  or index.

## Completion invariants

1. All status controls read and write the same `personal.status` value.
2. A real status transition creates exactly one `status-change` event.
3. Repeating the same command is idempotent and does not duplicate history.
4. Status changes and Full Edit cannot leave current state and history in
   contradictory states after a failed or cancelled write.
5. Every supported status has a title chip immediately after save or change.
6. Unacknowledged-update and unplayed-version indicators can appear together,
   disappear independently, and retain distinct actions.
7. Current-thread Manager priority affects presentation only.
8. Existing exports, imports, records, update history, and activity history
   remain compatible.

## Wave 1 — Baseline and write-path inventory

### [x] LIBRARY-STATE-BASELINE-01

- Add focused tests that reproduce status changes through Manager inline
  status, Full Edit, bulk status, and any thread-page/main-app status control.
- Inventory every caller of `patchEntry`, `applyPersonalActivity`, and direct
  personal-record writes.
- Record the current mismatch: `patchEntry` can mutate personal state without
  creating the activity event produced by Full Edit.
- Capture title-chip behavior for all six statuses and for saved/unsaved
  transitions on a live thread page.
- Capture the four update/play combinations: acknowledged+played,
  unacknowledged+played, acknowledged+unplayed, and
  unacknowledged+unplayed.
- Add Manager ordering coverage for current thread, pinned entries, selected
  sort, pagination, filtering, and an absent/unsaved current thread.

Checkpoint: tests fail for the known inconsistencies without modifying stored
data or generated bundles.

## Wave 2 — Canonical personal-state command

### [x] LIBRARY-STATE-COMMAND-01

- Introduce one clearly named service operation for user-initiated personal
  status changes, implemented through the existing activity transaction flow.
- Require or generate a bounded command identity appropriate to each caller so
  retries remain idempotent.
- Validate status before writing and return the canonical persisted record.
- Preserve automatic transition timestamps: first `playing` sets `startedAt`,
  `completed` sets `completedAt`, and `dropped` sets `droppedAt` under the
  existing rules.
- Keep `patchEntry` for thread facts and non-event metadata. Prevent it from
  silently bypassing history when a status-bearing patch is supplied.
- Verify event rollback/cancellation behavior when event or record persistence
  fails.

Checkpoint: one service path owns status transitions and produces at most one
matching history event.

## Wave 3 — Route every status UI through the command

### [x] LIBRARY-STATE-CALLERS-01

- Route Manager inline status, Full Edit, bulk status, and thread-page/main-app
  status controls through the canonical operation.
- Give each interaction a stable command-ID strategy that distinguishes
  separate user actions while tolerating retries.
- Refresh each affected view from the returned/persisted canonical record.
- Ensure open Manager, Full Edit, dock, and title chips cannot retain stale
  status after a successful mutation.
- Keep note, pin, rating, progress, and thread-fact behavior unchanged unless a
  baseline test proves the same consistency issue applies to that field.

Checkpoint: changing `playing` from any UI produces the same record state,
timestamps, activity entry, and visible chips.

## Wave 4 — Complete and immediate thread-title status chips

### [x] LIBRARY-STATE-TITLE-CHIPS-01

- Render a status chip for `saved`, `backlog`, `playing`, `paused`,
  `completed`, and `dropped` using the canonical record value.
- Add intentional color roles for statuses that currently have no title-chip
  treatment, with readable fallback styling independent of site CSS.
- After initial save, render from the persisted result so `Saved` appears
  without navigation or a delayed unrelated refresh.
- After status changes, removal, import refresh, and route changes, update or
  remove chips without duplicates.
- Preserve the existing add-on-owned title container and teardown behavior.

Checkpoint: the thread title always reflects whether the record is saved and
its current personal status during the same page session.

## Wave 5 — Separate acknowledgement from played-version state

### [x] LIBRARY-STATE-VERSION-SEMANTICS-01

- Centralize selectors for `hasUnacknowledgedUpdate` and
  `hasUnplayedCurrentVersion` so Manager, Inbox, Full Edit, and title chips use
  identical normalized comparisons.
- Give the two states distinct labels, visual roles, accessible descriptions,
  and actions.
- Keep Acknowledge limited to `updateState`; it must not modify
  `lastPlayedVersion` or `lastPlayedAt`.
- Keep Mark Played limited to personal play metadata and its activity event; it
  must not modify `updateState`.
- Define behavior when either version is missing without reporting a false new
  version.
- Test version formatting equivalence such as a leading `v` through the
  existing normalization utility.

Checkpoint: acknowledgement and play state can be changed independently and
all surfaces display the same result.

## Wave 6 — Current-thread priority in Manager

### [x] LIBRARY-STATE-CURRENT-THREAD-01

- Pass the live thread ID into Manager as transient view context.
- If that ID exists in the current result set, display it first, ahead of
  pinned entries, while preserving the relative order of every other row.
- Do not write a rank, pin, timestamp, or schema field for this behavior.
- Define pagination behavior explicitly: locate/inject the current saved record
  on the first Manager page without duplicating it on its naturally sorted
  page.
- Respect active filters: do not surface the current record when it fails an
  explicit search or status filter.
- Keep selection, cursors, counts, next/previous navigation, and exports based
  on record identity rather than display position.

Checkpoint: opening Manager from a matching saved thread makes that row easiest
to reach without corrupting sorting, pagination, or persistence.

## Wave 7 — Compatibility and verification

### [ ] LIBRARY-STATE-VERIFY-01

- Add regression coverage for service commands, activity idempotency, all
  status callers, title chips, version-state selectors, and current-thread
  ordering.
- Verify old records without activity history still use `personal.status` and
  require no backfill.
- Verify import/export preserves canonical state and existing history document
  version compatibility.
- Run Library/add-on lint and focused tests, then the full suite and
  `git diff --check`.
- Run the add-on smoke build without a version bump. Run a release build only
  when explicitly requested.
- Perform browser smoke checks on a saved thread and in Manager at desktop and
  mobile widths.

Checkpoint: source and built smoke output agree, no database migration is
triggered, and all completion invariants pass.

## Parking lot for returning thoughts

Add ideas here before assigning them to a wave. Items in this section are not
approved behavior and must not silently expand implementation scope.

- [ ] Clarify whether changing status to `playing` should optionally mark the
  current version played in one combined user action. The fixed default above
  keeps those actions independent.
- [ ] Decide whether rating and progress-note changes should always produce the
  activity event types already declared by the model.
- [ ] Consider whether users need a repair/report tool for historical status
  changes made through the old direct-patch path. Do not fabricate past event
  timestamps automatically.
- [ ] Capture any additional remembered Library workflow or terminology before
  implementation begins.
