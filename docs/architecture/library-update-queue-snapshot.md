# Library update queue snapshot construction

This document records `LIBRARY-UPDATE-QUEUE-SNAPSHOT-01`. The package can build
and inspect a durable queue, but the old scheduler remains the only active
update worker.

## Construction flow

The Library service exposes `autoUpdateQueue.buildSnapshot()`. Construction:

1. refuses to replace a running, waiting, or paused cycle;
2. discards an abandoned `preparing` or terminal `completed` cycle by cycle ID;
3. publishes a fresh `preparing` master;
4. scans `records` through bounded keyset pages on `recordModifiedAt`;
5. applies the construction-time `modifiedAtCutoff` to exclude later writes;
6. normalizes each page and queues only records whose automatic check is not
   disabled;
7. writes only thread IDs in deterministic page order and contiguous positions;
8. verifies the final row count and publishes the cycle as `running`.

The default page size is 200 and the hard maximum is 500, matching the core
query and bulk limits. Neither all Library records nor all queue rows are held
in memory. At most one record page and its eligible queue batch are retained.

## Stable-snapshot semantics

The cutoff prevents records added or modified after construction starts from
joining the cycle. A record already queued remains in the stable cycle even if
it is disabled later. A record disabled or removed before its page is read is
excluded and can be reconsidered by the next cycle. The worker package must
still re-read eligibility before making a request, because snapshots record
intent rather than overriding later user choices.

This is a deliberate bounded-scan snapshot rather than a long-lived IndexedDB
transaction. Holding one transaction across API calls and thousands of rows is
not supported by the add-on API and would be fragile in a userscript lifecycle.

## Cancellation and failure

Cancellation is checked before and after every read and before publication.
Query, write, cursor, or publication failure invokes cycle-scoped cleanup. The
result reports both the original reason and whether cleanup succeeded. A
healthy active cycle is never silently replaced.

## Verification

Automated tests cover zero, one, mixed eligibility, deterministic ordering,
concurrent additions/config changes, cancellation, write failure, active-cycle
protection, and 10,000 records. The optional out-of-pipeline stress fixture was
also executed with 100,000 records and completed with 100,000 contiguous queue
positions.
