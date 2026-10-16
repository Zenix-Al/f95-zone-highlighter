# Library durable update queue recovery

This document records `LIBRARY-UPDATE-QUEUE-RECOVERY-01`.

## Recovery and ownership

- Worker startup reclaims only `processing` rows whose queue claim has expired.
  Reclaimed rows return to `retry` and retain their attempt and day evidence.
- A persisted `running`, `waiting`, or `paused` cycle is resumed before any new
  snapshot can be created. A completed cycle retains its next scheduling slot;
  an already overdue successor may start immediately, but inherits the remaining
  daily allowance rather than receiving a fresh budget.
- The existing scheduler lease elects one worker across tabs. Slow requests
  renew both the global lease and their queue-row claim.
- Before committing a fetched result, the worker verifies the global lease and
  current queue-row owner. Claim renewal and settlement also reject stale
  owners, preventing an old request from committing after another tab takes over.
- Page teardown aborts late work and leaves the queue claim to expire. A later
  tab reclaims it without rebuilding the snapshot.

## Local-day allowance

The master mirrors a local `YYYY-MM-DD` key and daily usage from an independent
`daily-allowance-v1` row in `update-cycles`. The ledger survives deletion of the
`active` cycle. It and the master are written together using one existing
IndexedDB bulk-put transaction, without a schema upgrade. Ordinary same-day
writes cannot decrease usage or bonus allowance, including stale master writes.
The worker may explicitly refund at most one slot for a site-blocked check.
Only advancing the local day resets usage and bonus; pending, retry, processing,
and failed queue rows are preserved. A row consumes one slot when first claimed
for real network work on that local day. Internal HTTP retries consume no extra
slots, while retrying that row on a later day consumes a slot for the new day.
Rows in a fresh cycle consume allowance again; they do not receive a new budget.

Before discarding a pre-fix master, the repository checkpoints its available
daily counters into the independent ledger. Read/write failure aborts replacement
instead of dropping accounting. Historical usage already erased by the old bug
cannot be reconstructed. Reload older open tabs after installing the fix: an
already-running older userscript does not understand the new ledger.

The existing scheduler lease remains the worker-ownership mechanism; the atomic
checkpoint is not a new cross-tab lock or UI synchronization service.

Removed and newly disabled records settle without consuming network allowance.
At the limit, the master becomes `waiting` until local midnight. The same cycle
then resumes, preserving deterministic queue positions. Coverage runs a
1,000-row cycle at 100 checks per day for ten days and verifies positions 1
through 1,000 are each visited once and in order.
