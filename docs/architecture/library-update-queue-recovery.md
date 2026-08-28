# Library durable update queue recovery

This document records `LIBRARY-UPDATE-QUEUE-RECOVERY-01`.

## Recovery and ownership

- Worker startup reclaims only `processing` rows whose queue claim has expired.
  Reclaimed rows return to `retry` and retain their attempt and day evidence.
- A persisted `running`, `waiting`, or `paused` cycle is resumed before any new
  snapshot can be created. A completed cycle receives its next configured
  scheduling time, so its successor is not created immediately.
- The existing scheduler lease elects one worker across tabs. Slow requests
  renew both the global lease and their queue-row claim.
- Before committing a fetched result, the worker verifies the global lease and
  current queue-row owner. Claim renewal and settlement also reject stale
  owners, preventing an old request from committing after another tab takes over.
- Page teardown aborts late work and leaves the queue claim to expire. A later
  tab reclaims it without rebuilding the snapshot.

## Local-day allowance

The master stores a local `YYYY-MM-DD` key and a durable distinct-record count.
The count resets only when that key changes; pending, retry, processing, and
failed rows are preserved. A row consumes one slot when first claimed for real
network work on that local day. Internal HTTP retries consume no additional
slots, while retrying that row on a later day consumes one slot for the new day.

Removed and newly disabled records settle without consuming network allowance.
At the limit, the master becomes `waiting` until local midnight. The same cycle
then resumes, preserving deterministic queue positions. Coverage runs a
1,000-row cycle at 100 checks per day for ten days and verifies positions 1
through 1,000 are each visited once and in order.
