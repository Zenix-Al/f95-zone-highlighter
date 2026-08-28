# Library Durable Auto-Update Queue TODO

## Objective

Replace the current capped due-record scan with a persistent, resumable update
cycle. A cycle snapshots every eligible Library record into an IndexedDB queue,
processes a user-configured number of records per day, survives tab/browser
termination, and starts a fresh snapshot only after the previous cycle finishes.

This plan changes scheduled automatic updates only. Manual single-entry checks
remain independent, while bulk/manual-all behavior must be explicitly reconciled
before the old path is retained or redirected into the queue.

## Accepted product decisions

- Remove `Session cap`. It currently terminates a run after an in-memory number
  of checks and provides no durable progress.
- Replace `Daily cap` with the clearer setting `Checks per day`.
- `Checks per day` controls distinct queue records attempted during one local
  scheduling day, not the number successfully completed.
- After the normal daily allowance is exhausted, the user may explicitly grant
  one additional batch at a time. This bonus is durable for the current local
  day, does not change the saved setting, and never restarts the active cycle.
- A failed record counts as attempted for that day because it generated network
  traffic. It does **not** count as completed.
- Retries performed while processing that record do not consume additional
  distinct-record slots, but are bounded by `retryLimit`. Consequently, the
  maximum request attempts are bounded by `checksPerDay * (retryLimit + 1)`.
- An exhausted/transient failure remains in the queue as `retry`; it must not
  disappear during daily rollover.
- An unfinished cycle survives midnight and is resumed. Midnight resets only
  the daily allowance; it never clears the active queue.
- A new cycle is created only after the active cycle reaches a terminal state
  and the next configured scheduling window arrives.
- New Library records added during a cycle wait for the next cycle, producing a
  stable and explainable snapshot.
- Existing cross-tab ownership remains authoritative: only one tab may prepare
  or process the active cycle.

## Required invariants

1. A queue item is never marked `completed` before its Library-record commit
   succeeds.
2. Closing a tab after item N commits must resume at an unfinished item, not
   restart at item 1.
3. A stale `processing` item is recoverable after its owner lease expires.
4. Daily rollover preserves `pending`, `processing`, `retry`, and `failed`
   records from the active cycle.
5. Queue rows from another cycle can never be processed by the active worker.
6. Preparing a cycle must not expose a partially populated queue as runnable.
7. Queue cleanup happens only for a completed/replaced cycle and never as the
   first unguarded step of startup.
8. `Checks per day` is enforced across reloads and competing tabs.
9. Pausing, disabling the add-on, route teardown, and pagehide prevent late
   commits but preserve recoverable queue state.
10. Every retry and terminal failure retains a bounded error code and timestamp.

## Proposed persistence model

Use dedicated object stores in the existing Library database where supported by
the core Library API. The baseline package must verify the schema-extension path
before choosing exact store names or incrementing the database schema version.

### Cycle/master store

One active record plus optionally one bounded last-completed summary:

```js
{
  id: "active",
  cycleId: "library-update-...",
  status: "preparing", // preparing | running | paused | waiting | completed
  scheduledFor: 0,
  createdAt: 0,
  startedAt: 0,
  completedAt: 0,
  updatedAt: 0,
  total: 0,
  attempted: 0,
  completed: 0,
  failed: 0,
  retryPending: 0,
  currentThreadId: "",
  currentPosition: 0,
  dailyKey: "2026-08-28",
  dailyAttempted: 0,
  dailyBonusAllowance: 0,
  checksPerDay: 100,
  nextRunAt: 0
}
```

The cycle snapshots scheduling values needed for deterministic execution. A
later settings change needs an explicit policy: `checksPerDay`, spacing, timeout,
and retry settings should apply on the next worker wake; cycle identity and
ordering must remain unchanged.

### Queue store

```js
{
  id: "<cycleId>:<threadId>",
  cycleId: "library-update-...",
  threadId: "12345",
  position: 1,
  status: "pending", // pending | processing | retry | completed | failed
  attempts: 0,
  attemptedDayKey: "",
  claimedBy: "",
  claimExpiresAt: 0,
  lastAttemptAt: 0,
  nextAttemptAt: 0,
  completedAt: 0,
  lastErrorCode: ""
}
```

Required query shapes:

- next row by `[cycleId, status, position]`;
- retry row by `[cycleId, nextAttemptAt]`;
- deterministic cycle cleanup by `cycleId`;
- status counts without loading the entire queue into memory.

Exact indexes must be proven against the core Library schema API and IndexedDB
key-range support during the schema package.

## Failure and quota policy

- Selecting a previously unattempted item for a real request increments
  `dailyAttempted` once for the current `dailyKey`.
- Immediate retries for that same item increment its `attempts`, but not the
  distinct-record daily counter.
- If retry exhaustion is considered transient, write `status: "retry"` and a
  future `nextAttemptAt`; do not delete the item.
- A retry first attempted on a later day consumes one distinct-record slot for
  that later day. This prevents an old failed population from bypassing the
  current day's traffic setting.
- A confirmed terminal condition such as deleted/inaccessible thread may use
  `status: "failed"`, remain represented in cycle totals, and no longer retry
  automatically. Terminal classifications must be explicit and tested; unknown
  errors default to retryable.
- Retry items must not block later pending items. Select eligible retries and
  pending work fairly while preserving deterministic order.
- UI must distinguish `attempted`, `completed`, `retry pending`, and `terminal
  failed`; a display such as `Today 100/100; cycle 95/1000 completed; 5 retrying`
  is expected.

## Wave 1 — Characterize and lock the existing behavior

### [x] LIBRARY-UPDATE-QUEUE-BASELINE-01

- Trace scheduler startup, scheduled run, Update now, retry-failed, manual-all,
  disable, teardown, and pagehide paths.
- Record the existing Library schema version, available object-store/index API,
  and migration behavior.
- Add characterization tests for interruption before request, during request,
  after record commit, and after daily-usage commit.
- Demonstrate the current lack of a durable cursor and the current 25-record
  session termination.
- Record baseline source/bundle size and existing automatic-update test count.
- Stop and report if the golden/core Library API cannot safely add and query the
  required stores without expanding the public API contract.

Checkpoint: no runtime behavior changes.

## Wave 2 — Persistence schema and repository

### [x] LIBRARY-UPDATE-QUEUE-SCHEMA-01

- Add the cycle/master and queue stores with the minimum proven indexes.
- Implement an atomic cycle-preparation protocol: build under `preparing`, then
  publish `running` only after every queue row is committed.
- Add repository operations for active cycle, item claim/settlement, counts,
  daily rollover, stale-item recovery, and cycle-scoped cleanup.
- Ensure all payloads are normalized and bounded.
- Add schema migration, reopen, rollback/failure, and large-queue tests.

Checkpoint: stores and repository exist, but the old scheduler remains active.

## Wave 3 — Snapshot construction

### [x] LIBRARY-UPDATE-QUEUE-SNAPSHOT-01

- Read all records eligible for automatic checking using bounded database pages.
- Produce deterministic queue positions without retaining the whole Library in
  memory when avoidable.
- Exclude records with automatic checks disabled.
- Keep the snapshot stable when records are added, removed, or disabled during
  construction; define cancellation cleanup for abandoned `preparing` cycles.
- Verify 0, 1, 100, 10,000, and 100,000-record construction behavior outside
  the ordinary CI stress path where appropriate.

Checkpoint: a queue can be prepared and inspected but is not processed.

## Wave 4 — Durable worker

### [x] LIBRARY-UPDATE-QUEUE-WORKER-01

- Replace due-record batch selection with one-at-a-time queue claiming.
- Preserve configured spacing, jitter, timeout, and bounded retries.
- Commit Library changes before settling the queue item.
- Persist master progress after each settled item.
- Renew ownership during long requests/retries so a healthy worker cannot lose
  its lease solely because one record is slow.
- Skip or safely settle queue items whose Library record was removed or whose
  auto-update eligibility was disabled after snapshot creation.
- Continue past retryable failures rather than blocking the queue head.

Checkpoint: a single uninterrupted tab completes a cycle correctly.

## Wave 5 — Recovery, rollover, and ownership

### [x] LIBRARY-UPDATE-QUEUE-RECOVERY-01

- Recover stale `processing` rows after their claim/lease expires.
- Resume an active cycle after pagehide, hard termination, browser restart, and
  stale `running` master state.
- Reset `dailyAttempted` only when the configured local scheduling day changes.
- Preserve the unfinished queue across midnight.
- Enforce one worker across ten simultaneously opened F95 tabs.
- Prevent double commits when ownership changes after a request started.
- Complete an overdue cycle before creating its successor.
- Test the 1,000 records / 100 checks-per-day case through all ten days and prove
  that record 1 is not rechecked before record 1,000 receives its turn.

Checkpoint: interruption and multi-day rotation are deterministic.

## Wave 6 — Settings and UI

### [x] LIBRARY-UPDATE-QUEUE-SETTINGS-01

- Remove `Session cap` from defaults, repository normalization, settings UI,
  tests, documentation, and stored configuration output.
- Rename/migrate `Daily cap` to `Checks per day`, retaining the user's existing
  numeric value where valid.
- Decide and document the supported range and optional `Unlimited` behavior;
  default remains 100 unless baseline evidence recommends otherwise.
- Display durable daily and cycle progress after reload.
- Add Pause, Resume, a state-derived primary update action, and explicit Restart
  cycle behavior.
- Persist a bounded per-day bonus allowance on the cycle master. It resets with
  the local scheduling day, does not alter `Checks per day`, and is increased by
  exactly one configured batch only after the user confirms `Continue another
  batch...`.
- Make the primary update action build or resume the queue and consume today's
  remaining allowance. It must not silently bypass the configured traffic limit.
- Require confirmation before Restart cycle discards unfinished progress.
- Reconcile manual Check all: either route it through a separately identified
  queue cycle or keep it clearly independent with cancellation and spacing.

#### Update modal structure

Replace the current continuously rewritten status sentence and always-visible
configuration form with three stable sections.

1. **Update overview** is open by default and contains:
   - one state badge: `PREPARING`, `RUNNING`, `WAITING`, `PAUSED`, `COMPLETED`,
     or `RECOVERING`;
   - a cycle progress bar and `completed / total` value;
   - today's `attempted / checksPerDay` allowance;
   - separate completed, retry-pending, and terminal-failure counts;
   - next allowance/scheduled wake and last-activity timestamps;
   - while running, the current queue position, thread title/id, and retry
     attempt number.
2. **Cycle details >** is collapsed by default and contains exact timestamps,
   current/changed/retry/terminal/skipped/network-retry totals, cycle ID, and a
   `Copy diagnostics` action.
3. **Update settings >** is collapsed by default and contains enabled state,
   Checks per day, update hour, spacing, timeout, retry limit, and an explicit
   Save settings action.

Primary controls remain visible outside collapsed sections:

- expose one primary update button whose label, enabled state, confirmation,
  and command are derived from the latest durable cycle snapshot:
  - no active cycle or a due cycle not yet started: `Update now`, which builds
    and starts the current day's batch;
  - active cycle with unused daily allowance: `Resume updates`, which continues
    the same queue and consumes only the remaining allowance;
  - daily allowance exhausted with unfinished rows: `Continue another batch...`,
    which confirms, grants one persisted `Checks per day` bonus, and resumes the
    same queue without rebuilding or resetting its position;
  - paused cycle: `Resume updates`, preserving both queue and allowance;
  - running/preparing/recovering cycle: `Updating...`, `Preparing...`, or
    `Recovering...`, disabled while that transition owns the worker;
  - completed cycle before its next scheduled window: `Check again...`, which
    requires confirmation before creating a fresh early cycle;
- when fewer records remain than the available or bonus allowance, process only
  the remaining records;
- `Pause` / `Resume` preserves the durable queue;
- `Restart cycle…` is kept in a secondary/details area and requires confirmation.

#### Stable rendering requirements

- Never replace the complete dialog DOM to refresh progress.
- Update only dedicated status nodes, counters, timestamps, and the progress
  element after a queue-state transition.
- Treat the primary button as a dedicated live status node: update its text,
  disabled state, action identifier, and accessible label immediately when the
  durable state or allowance changes. The user must not close/reopen the modal
  or manager app to receive the next action.
- Do not poll/repaint every second while idle; refresh on repository/worker
  events and on meaningful state changes.
- Never rerender settings controls while the user is editing or has unsaved
  values.
- Preserve text selection, focused input, caret position, section expansion,
  and modal scroll position during progress updates.
- Keep human-readable local timestamps visible and include exact machine values
  in diagnostics where useful.
- `Copy diagnostics` takes one immutable state snapshot and copies a bounded
  plain-text report; users must not need to select a live-changing sentence.
- The diagnostics report includes state, cycle progress, daily allowance,
  completed/current/changed/retry/terminal totals, current item when present,
  next wake, and cycle ID. It must not include private notes or unrelated
  Library-record data.
- Add focused DOM tests proving a progress update does not replace settings
  inputs, collapse open sections, move scroll position, or destroy selection.
- Add state-transition tests proving the same mounted primary button moves
  through Update now, Resume updates, Continue another batch, Updating, and
  Check again behavior without duplicate listeners or modal reconstruction.

Checkpoint: users can understand and control the persistent cycle.

## Wave 7 — Legacy migration retirement and upgrade guard

### [x] LIBRARY-LEGACY-UPGRADE-GUARD-01

- Define the final v1.2.2 Library state as the minimum directly supported bridge
  state for this release. Record the exact schema marker, database version, and
  legacy-storage evidence that distinguish supported from unsupported installs.
- Remove the obsolete v1 legacy-record conversion implementation after proving
  v1.2.2 produces the supported bridge state.
- Keep the lightweight and idempotent `dailyCap` to `checksPerDay` config
  normalization; do not require an intermediate release for this metadata rename.
- Add a small read-only legacy detector. Unsupported old data must fail closed:
  do not initialize an apparently empty replacement Library, write new records,
  mark migration complete, delete old storage, or mutate the unsupported data.
- Surface a bounded `upgrade_required` state explaining that the user's data was
  not modified and that they must install/open v1.2.2 once before returning to
  the current release. Keep the bridge build/version reference permanently
  documented and available.
- Block Library mutations while the guard is active, including automatic checks,
  manual edits/removal, import commits, and background observation. Read-only
  diagnostics and export/recovery access may remain only when proven safe.
- Test fresh installs, current schema, supported v1.2.2 bridge state,
  unsupported v1 storage, unsupported storage beside an empty modern database,
  and reopening after the intermediate bridge completed.

Checkpoint: obsolete migration code is gone and direct jumps cannot overwrite
unsupported Library data.

## Wave 8 — Queue compatibility and cleanup

### [x] LIBRARY-UPDATE-QUEUE-COMPAT-01

- Migrate old summary/daily metadata without losing Library records or creating
  an accidental immediate request burst.
- Retire obsolete due-record/session-count logic only after queue parity tests
  pass.
- Decide whether per-record `nextCheckAt` remains useful for manual/failure
  metadata or can be deprecated in a later release; do not remove it casually.
- Bound completed-cycle summaries and clear only queue rows owned by a known
  terminal cycle.
- Confirm exports/imports and supported Library databases reopen successfully;
  unsupported legacy databases remain owned by the Wave 7 guard.

Checkpoint: no duplicate scheduler or orphaned compatibility path remains.

## Wave 9 — Verification and release evidence

### [x] LIBRARY-UPDATE-QUEUE-VERIFY-01

- Test success, current, changed, retryable failure, terminal failure, timeout,
  malformed HTML, authentication/challenge response, deleted Library record,
  disabled record, and title/version parsing behavior.
- Test close/reopen at every state transition and midnight rollover.
- Test daily allowance changes during a cycle.
- Test leases and exact-once settlement under competing tabs.
- Verify every automatic and manual network path respects spacing.
- Run add-on lint, focused Library tests, full tests, baseline checks, and
  `git diff --check`.
- Perform browser smoke tests with a deliberately interrupted multi-day cycle.
- Perform direct-jump smoke tests proving unsupported v1 data is preserved and
  the v1.2.2 intermediate bridge produces a state accepted by the current build.
- Update Library add-on changelog and documentation only after verification.

Checkpoint: implementation is release-ready; build/version bump remains a
separate explicit release action.

## Explicit non-goals

- No server-side synchronization or Redis dependency.
- No automatic CAPTCHA/challenge bypass.
- No unbounded concurrent requests.
- No daily deletion of unfinished work.
- No generated distribution or version bump during implementation packages
  unless separately requested.
