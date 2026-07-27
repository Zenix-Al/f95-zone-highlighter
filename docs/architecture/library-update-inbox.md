# Library update inbox

The Library database remains the only durable source for update notifications.
An entry is unacknowledged exactly while its normalized record has
`updateState: "changed"`. No unread field, notification store, schema version,
or cross-tab notification transport is added.

The manager displays an exact count through the existing `updateState` index.
Inbox rows are read in bounded newest-first keyset pages through the existing
`recordModifiedAt` index; IndexedDB cursor primary keys provide deterministic
thread-ID tie-breaking. The UI caps a single page at 25 rows and a single
acknowledge-all operation at 200 current records.

Acknowledgement always re-reads the canonical record and serializes work by
thread ID. It changes only `updateState` and `recordModifiedAt`. Concurrently
removed or already acknowledged records are skipped, while failed records stay
changed and therefore remain retryable.

Update-detected toasts use one in-memory latch created with each userscript
instance. Manual, automatic, and opportunistic observations all pass through
the same thread-fact commit path. The latch fires immediately after the first
successful transition from a non-changed record to `changed`, never writes to
storage, and is not reset by route changes or dialog activity.
