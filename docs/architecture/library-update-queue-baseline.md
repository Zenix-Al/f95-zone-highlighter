# Library durable update queue baseline

This document records `LIBRARY-UPDATE-QUEUE-BASELINE-01`. It characterizes the
automatic-update implementation before the durable cycle/queue migration. The
package adds tests and evidence only; production behavior is unchanged.

## Current entry points

| Entry point | Current behavior |
| --- | --- |
| Add-on bootstrap/enable/refresh | Starts a one-minute-at-most polling timer. A poll calls the scheduler only when the previous idle summary is due. |
| Scheduled run | Selects due records, bounded by remaining in-memory session count and persisted UTC-day count. |
| Update now | Ignores per-record `nextCheckAt`, but still uses the smaller of session cap and remaining daily cap. |
| Retry failed now | Forces failed-only selection, ignores failure backoff, preserves the ordinary next-run timestamp, and uses a hard maximum of 100 records. |
| Manual selected/row check | Uses automatic-update spacing/timeout/retry settings, but runs outside scheduler leases, summaries, session count, and daily usage. |
| Disable/teardown/pagehide | Calls `scheduler.stop()`, aborts the local signal, clears the timer, and attempts to delete the tab's lease. |

The manager currently has selected-record and row update actions; there is no
separate automatic durable “check all” queue. The auto-update dialog polls its
summary metadata every 500 ms and rewrites one text node.

## Current persistence and selection

The scheduler persists only:

- `auto-update:config`;
- `auto-update:last-run` summary;
- one `auto-update:lease`;
- temporary `auto-update:claim:<threadId>` records;
- `auto-update:daily:<UTC-date>` usage counters.

It does not persist a candidate list, run ID, cursor, queue position, or settled
item set. `sessionCount` exists only in the scheduler closure and resets whenever
the userscript instance is recreated.

Candidate selection loads Library entries ordered by `updatedAt`, filters and
sorts them in memory by `updateCheck.nextCheckAt`, and slices the result to the
remaining budget. The default session cap terminates selection at 25 records;
the characterization test supplies 40 due records and proves only the first 25
are requested and reported.

Successful automatic commits set the record's next check to the run's shared
`nextRunAt`. Failed automatic commits retain the record and apply exponential
failure delay from the configured interval. The record itself is therefore the
only indirect recovery marker: committed records move into the future while
uncommitted records remain due.

## Interruption behavior

The current write sequence for one checked record is:

1. perform and parse the request;
2. commit the Library record;
3. increment in-memory session/daily counts;
4. persist daily usage;
5. delete the per-thread claim;
6. renew the lease;
7. persist the updated run summary.

The baseline tests lock these boundaries:

- cancellation while candidate selection is pending sends no request;
- cancellation while a request is pending prevents a late Library commit;
- a Library commit occurs before daily usage is persisted;
- persisted daily usage survives cancellation before claim/summary settlement.

A cooperative pagehide normally ends with a `paused` summary. A hard process
termination can stop between any two writes. Consequences include:

- termination after request but before record commit repeats that request later;
- termination after record commit but before daily usage can undercount the
  daily budget, although the committed record moves out of the due set;
- termination after daily usage but before summary persistence leaves stale UI
  counters/status;
- an orphaned lease/claim blocks another tab until its expiry and is then
  reclaimable;
- reopening does not resume an exact position. It starts a new selection from
  records that remain due.

When the UTC day changes, a new daily-usage key starts at zero. Unfinished due
records can be selected again, but no durable cycle preserves their original
total/order or cumulative progress. Previously committed records become
eligible again when their own `nextCheckAt` arrives.

## Existing database and core API capability

The Library add-on database is physically
`f95ue-addon:library-addon:library`, currently declared at version 3 with four
stores:

- `records`;
- `updates`;
- `activity`;
- `meta`.

The core add-on IndexedDB service permits at most 16 stores and 32 indexes per
store. It already supports `get`, `put`, `delete`, `bulkPut`, `bulkDelete`,
`query`, and `count`, including compound indexes and keyset query cursors. Two
additional cycle/queue stores therefore fit the existing schema limits and do
not require a new public action.

Important Wave 2 constraint: each public action opens a transaction for one
store. The current facade has no cross-store transaction action. Atomic queue
preparation must consequently use a publish protocol (`preparing` master,
fully write queue, then publish `running`) and recovery cleanup, or justify a
separately reviewed API change. This is not a blocker for the planned protocol.

## Baseline measurements

The deterministic add-on audit, generated into an untracked temporary report,
records the Library add-on before queue production code:

| Measurement | Value |
| --- | ---: |
| Source files | 93 |
| Authored bytes | 317,016 |
| Physical lines | 10,026 |
| Nonblank lines | 9,069 |
| Regular userscript bytes | 327,259 |
| Regular gzip bytes | 67,672 |
| Release userscript bytes | 283,862 |
| Release gzip bytes | 58,225 |
| Auto-update test cases after baseline additions | 17 |
| New queue-baseline characterization cases | 4 |

Future queue packages should report source, regular/release bundle, and gzip
deltas against these values. The temporary audit report is deliberately not a
tracked accepted release baseline.

## Baseline conclusion

The existing core API is sufficient to begin the schema package. The current
scheduler safely blocks many late commits, but it cannot provide exact resume,
stable multi-day ordering, atomic progress accounting, or durable UI progress.
Those gaps justify the cycle/master and queue stores in the detailed TODO.
