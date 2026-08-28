# Library update queue verification

This is the release-evidence record for `LIBRARY-UPDATE-QUEUE-VERIFY-01`.

## Automated evidence

- Current and changed results, title/version parsing, malformed HTML,
  authentication pages, challenge pages, timeout retry, retryable failures,
  terminal failures, removed records, and disabled records are covered.
- Manual requests are serialized and paced between retries and records.
  Automatic requests use the same configured checker and the worker also applies
  configured spacing between queue items.
- Every persisted cycle state reopens through a new repository instance.
- A 1,000-record cycle advances through ten local-day allowances without
  rebuilding its snapshot. Mid-cycle allowance changes apply without losing its
  position.
- Ten competing schedulers elect one worker. Queue ownership is checked before
  commit, stale owners cannot settle, and cleanup requires the exact active
  cycle identity.
- Unsupported legacy payload detection is read-only and runs before schema or UI
  writes. The v1.2.2 bridge marker with no remaining legacy payload is accepted.

## Browser evidence

Confirmed during development on 2026-08-28:

- Refreshing during an active update preserves the queue and resumes after the
  previous lease expires.
- The modal identifies the intentional previous-process wait and does not expose
  Pause from a tab that does not own the worker.
- Updated Library search and its schema-v5 help panel passed smoke testing.
- Opening multiple tabs does not start multiple update checks; one lease owner
  performs the work while the other tabs remain idle.
- Refresh interruption preserves the active cycle and resumes from its durable
  queue after the previous process lease expires. The automated ten-day test is
  the multi-allowance counterpart because advancing several real local days is
  not practical for a release smoke run.

## Legacy smoke substitution

No genuine pre-v1 browser dataset remained available for destructive upgrade
testing. This browser case is recorded as unavailable, not as manually passed.
Release confidence instead comes from the bootstrap regression that supplies a
non-empty legacy payload and proves there are no IndexedDB, storage, lifecycle,
or UI writes before `upgrade_required`, plus the repository evidence that v1.2.2
sets `libraryMigrationV1Done` only after removing the legacy payload. Marker-only
bridge and fresh-install states are separately accepted by the detector tests.

No generated distribution or version bump is part of this verification step.
