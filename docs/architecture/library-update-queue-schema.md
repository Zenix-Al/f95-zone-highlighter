# Library durable update queue schema

This document records `LIBRARY-UPDATE-QUEUE-SCHEMA-01`. The package adds
persistence and repository primitives only; the released due-record scheduler
remains the active worker until later packages replace it.

## Database version 4

The Library add-on database now declares six stores. The existing `records`,
`updates`, `activity`, and `meta` stores are preserved, while version 4 adds:

- `update-cycles`, keyed by `id`, with `cycleId`, `status`, and `updatedAt`
  indexes;
- `update-queue`, keyed by `id`, with `cycleId`,
  `[cycleId, status, position]`, `[cycleId, nextAttemptAt]`, and
  `[cycleId, status, nextAttemptAt]` indexes.

The complete declaration remains below the core limits of 16 stores and 32
indexes per store. Opening a released version-3 database upgrades in place;
existing stores and records are not deleted or rewritten. Schema verification
checks every new store/index before writing `schema-v4-complete`.

## Publication protocol

The core API intentionally exposes one-store transactions rather than an add-on
controlled cross-store callback. Cycle preparation therefore uses a recoverable
publication protocol:

1. validate and normalize the complete input;
2. write the active master with `status: "preparing"`;
3. write queue rows in bounded batches (default 200, hard maximum 500);
4. count rows through the cycle index;
5. publish the master as `running` only when the count equals `total`.

A failed queue batch leaves the master in `preparing`. It cannot be consumed as
a runnable cycle. The repository can verify it again or delete only that
cycle's rows and active master. Startup recovery policy is deferred to the
recovery package; the persistence primitives are available now.

## Repository contract

`autoUpdateQueueRepository.js` is transport-agnostic and consumes generic store
methods from the canonical Library API client. Domain code does not call core
actions directly.

The repository provides:

- normalized cycle and queue-item reads/writes;
- bounded bulk queue writes and cycle-scoped deletion;
- keyset queue pages and status counts;
- complete-preparation verification and publication;
- daily-allowance rollover without queue deletion;
- pending/retry item claim and settlement shapes;
- stale `processing` recovery after claim expiry;
- reopen-safe active-cycle reads.

Identifiers, statuses, timestamps, counters, attempts, owner strings, and error
codes are bounded before persistence. Duplicate or absent thread IDs reject a
preparation before its master is written.

## Verification evidence

Focused tests cover:

- complete version-4 store/index declaration and in-place schema creation;
- normalization and bounds;
- `preparing` then `running` publication order;
- partial batch failure remaining recoverable;
- cycle-scoped discard;
- repository recreation/reopen;
- daily rollover, claim, settlement, stale recovery, and status counts;
- a 10,000-row queue written in 50 batches of 200.

The old scheduler is deliberately not connected to these stores in this wave.
