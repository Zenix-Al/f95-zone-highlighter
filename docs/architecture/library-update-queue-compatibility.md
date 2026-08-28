# Library update queue compatibility

This document records `LIBRARY-UPDATE-QUEUE-COMPAT-01`.

## One-time metadata bridge

The durable queue is the only automatic-update engine. On its first owned run,
it reads the old `auto-update:last-run` summary and both possible current-day
counter keys (local and UTC dates). A future `nextRunAt` becomes a bounded
completed master, preventing an immediate request burst. If work is already due,
the highest old daily count is carried into the new cycle before its worker runs.

After the durable master is safely written, the known old keys are removed and
`auto-update:queue-compat-v1` is marked complete. An existing durable master is
always authoritative; legacy metadata can never replace it. The old due-record
selector, session counter, temporary per-thread claims, and fallback runner are
no longer reachable or shipped.

## Retained record metadata

Per-record `updateCheck.nextCheckAt` remains part of the record and import/export
contract. Manual checks and failure reporting still use it as useful diagnostic
and backoff evidence, but automatic queue membership and ordering do not depend
on it. Removing the field is deferred unless a later schema change proves that
manual and compatibility consumers no longer need it.

## Bounded cleanup

There is one cycle master at key `active`, so completed summary state is bounded
to one record. Building a successor first resolves that exact master and removes
only queue rows carrying its cycle ID. Repository cleanup rejects a mismatched or
unknown cycle ID; interrupted preparation and explicit restart use the same
identity check. Library records, update history, activity, and import/export data
are outside this cleanup boundary.
