# Library durable update queue worker

This document records `LIBRARY-UPDATE-QUEUE-WORKER-01`. Automatic scheduled
runs now create/resume a durable snapshot and delegate network work to the queue
worker. The scheduler retains its public start/run/stop interface and legacy
failed-only compatibility path until the later compatibility package.

## Per-item transaction order

For each actionable queue row the worker:

1. verifies global lease ownership;
2. re-reads the current Library record and its auto-update eligibility;
3. claims the queue row as `processing` with an expiring owner;
4. publishes the current thread/position in the cycle master;
5. checks one record using configured timeout, retry, jitter, and request pacing;
6. heartbeats the global lease and queue claim during a slow request;
7. re-verifies ownership and eligibility;
8. commits the Library observation/failure;
9. settles the queue row;
10. persists cycle counters and waits the configured spacing before continuing.

The Library commit intentionally precedes queue settlement. A later recovery
package handles the resulting crash window; repeating an idempotent check is
safer than marking work complete before its canonical record commit succeeds.

## Settlement behavior

- Successful checks become `completed` and increment current/changed counters.
- Removed or newly disabled records are settled as completed-but-skipped without
  making a request (or without committing a request that raced the change).
- Access-denied (`http_403`) and explicit missing-thread responses
  (`http_404`, `thread_not_found`, and `entry_not_found`) become terminal
  `failed` rows without holding the cycle open.
- Other failures receive a durable retry delay of five minutes initially,
  capped at one hour, independent of the daily cycle interval. Pending rows
  run before due retries. After three total request attempts, the row becomes
  terminal; the next scheduled cycle can consider the record again.
- On recovery, legacy retry rows with multi-day delays are shortened to the
  bounded policy. Legacy 403 retry rows are settled as failed without another
  request, preserving all previously completed queue rows.
- Internal request retries are included in queue and cycle network-attempt
  evidence.
- A cycle becomes `completed` when no pending, processing, or retry rows remain;
  otherwise it becomes `waiting` for the next retry.
- Completion schedules from the cycle's original slot, not the completion time.
  If a waiting cycle crossed a daily slot, the next snapshot is due immediately;
  its new requests still consume the current day's allowance. The scheduler
  repairs already-completed cycles with the old next-day timestamp on its next poll.

The queue schema includes `[cycleId, status, nextAttemptAt]`, allowing due
retries to be selected by time without an earlier future retry blocking them.

## Scheduler cutover

Production Library composition supplies `queueRuntime` to the scheduler. Normal
scheduled and Update-now runs use snapshot construction plus the durable worker;
the old due-record selector remains only as an explicit compatibility fallback
for callers/tests without queue runtime and for the old failed-only action.
Removal of that fallback belongs to the compatibility wave.

The scheduler mirrors durable cycle counters into the old summary metadata so
the current UI remains functional until its replacement. Completed/waiting
cycles are represented as idle summaries with their next wake, preventing a
completed cycle from being rebuilt every one-minute scheduler poll.

Daily allowance, rollover, stale-claim recovery, and cross-tab ownership are
described in [library-update-queue-recovery.md](library-update-queue-recovery.md).
