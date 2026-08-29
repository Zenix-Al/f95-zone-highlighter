# Storage Bootstrap

`CORE-STORAGE-BOOTSTRAP-01` introduces one chronological owner for storage
capability verification and configuration loading. The completed write-gate and
schema packages now use that same readiness decision.

## Ordering

Fast and body bootstrap both request the same in-flight storage attempt. Storage
bootstrap runs before fast/body feature loading and before the add-on console
bridge is initialized. Ten concurrent callers therefore perform one capability
probe and one configuration load.

An unavailable capability rejects the required bootstrap step. A configuration
load with unverified persistence remains available as `degraded-readonly`.
Only the bootstrap snapshot authorizes writes; `settingsService` has no second
readiness flag or load-only compatibility bypass.

## Snapshot

The `storage` diagnostics provider exposes an immutable bounded snapshot:

- state (`idle`, `probing`, `loading`, `ready`, `degraded-readonly`, or
  `unavailable` in this package);
- source and supported schema when verified;
- read, write, and delete method capabilities;
- fallback and upgrade flags;
- bounded manager context, reason, and failed probe step;
- attempt and start/settle timestamps.

No storage key, probe nonce, configuration value, add-on payload, or catalog is
included. Feature health records Storage as running, degraded, or failing and
uses bounded `CONFIG_STORAGE_*` events.

## Retry

Callers in the same active attempt share one Promise. A terminal snapshot is
reused during ordinary startup, while an explicit retry starts a new probe and
clears a previously non-ready cached configuration load. A verified ready
configuration load may be retried explicitly so recovery uses a fresh read.

Legacy upgrade classification remains owned by the later compatibility package.

## Fresh initialization

`CORE-STORAGE-FRESH-INIT-01` classifies an installation as fresh when the
canonical envelope, backup, and recognized historical surface values are
absent. Regenerable catalog caches, Settings UI preferences, Library IndexedDB,
and unrelated add-on/service storage do not become canonical history.

Fresh initialization uses a dedicated initialization lock. The winning tab
writes one canonical envelope at the current schema constant, verifies it,
writes and verifies the current completion marker, and releases ownership. A
competing tab waits for that verified state and loads it; it does not create a
second revision.

No last-known-good backup is duplicated during initialization. The first normal
configuration commit rotates the initialized envelope into the backup using the
existing persistence contract. Catalog caches remain independently recoverable
and are not required for canonical initialization. Recognized historical data
is preserved and requires the proven core v5.1.2 bridge; current source does not
transform it.

The schema constant is now 2, so this same fresh path creates schema 2 without a
parallel initializer.

## Schema 2

`CORE-STORAGE-SCHEMA-2-01` supports one migration from schema 1. The data shape is
unchanged, but the boundary records the chronological bootstrap contract. The
migration preserves the exact schema-1 envelope as backup, writes and strictly
reads back schema 2, and verifies both before reporting a writable state.
Interrupted attempts remain read-only and retryable. Future schema versions are
loaded read-only and never rewritten.

## Unified write gate

`CORE-STORAGE-WRITE-GATE-01` moves core configuration commits, runtime catalog
cache commits, config-transfer commits, and core-owned add-on state behind one
storage-readiness decision. A write requested during `probing`, `loading`,
`initializing`, or `migrating` waits for that attempt to settle. A terminal
non-writable state rejects immediately without issuing a storage write.

Stable failure reasons are:

- `storage_not_ready` when no verified startup decision exists;
- `storage_read_only` after degraded/default/migration-failed recovery;
- `storage_unavailable` after capability or storage-access failure;
- `upgrade_required` for the compatibility guard introduced by a later wave;
- `storage_write_failed` when a ready store rejects an actual commit.

Core settings retain and restore the last persisted value and display the
bounded failure message. Core-mediated add-on storage and lifecycle settings
propagate the same reason instead of collapsing it to `storage_error`. Add-on
data remains in its existing owner bucket; this gate does not move add-on data
into a new persistence format.

Direct settings-service callers that load configuration without application
bootstrap remain `storage_not_ready`. Tests and maintenance callers must run the
same bootstrap path before expecting writes to succeed.

## Feature Health integration

`CORE-STORAGE-HEALTH-INTEGRATION-01` keeps Feature Health as the sole diagnostic
surface for storage. Its report reads the existing Storage provider and shows
only bounded state, source, schema, capabilities, manager, reason, failed step,
attempt, and timestamp fields. An open report refreshes from the shared health
and readiness publications without copying storage state into the UI.

The existing Feature Health action row shows `Retry storage` only while the
terminal state is `unavailable`. Upgrade-required, unsupported-newer, degraded
read-only, and unknown-corrupt states remain non-retryable. Standard core
settings inputs are disabled whenever storage is not ready and restored when it
becomes ready; their short inline notice directs users to Feature Health. No
storage dashboard, reset control, or second diagnostics store is introduced.
