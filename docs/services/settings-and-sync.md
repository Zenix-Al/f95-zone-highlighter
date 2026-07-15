# Settings and Persistence

This document describes the contract and lifecycle for configuration loading, validation, and
atomic persistence.

## Config lifecycle

- `settingsService.loadConfig()` reads the migration marker through `storageAdapter`.
- With marker generation `1`, the repository validates the canonical
  `{ schemaVersion, revision, writerId, updatedAt, data }` envelope and reads the separate tag and
  prefix caches.
- With an absent or old marker, it reads only the bounded historical surface-key list, builds a
  detached candidate, persists and verifies the canonical/backup/cache result, then writes the
  marker.
- Current version-1 data is sanitized on a clone and validated before live-config replacement;
  marked fast loads are not rewritten. Unknown fields are dropped from the in-memory candidate
  while valid sibling settings are preserved.
- On success, the repository passes the complete runtime config through `configChangeApplication`
  so local effects have one application boundary.

## Persistence contract

- `src/config/persistence.js` owns the canonical storage keys and schema version `1`.
- `CONFIG_MIGRATIONS` is intentionally empty (`CONFIG_MIGRATION_COUNT === 0`); the active
  `configMigrationService` is only the bounded historical surface-key recovery path.
- `storageAdapter` performs raw storage I/O only. It does not know config defaults, schema,
  migrations, revisions, or effects.
- `settingsService.commitConfig()` reads the latest envelope, increments its revision, stores the
  previous valid envelope as last-known-good, then writes the new envelope before updating live
  config.
- `updateConfig(updater, options)` is the serialized mutation boundary for interactive updates.
  The repository validates, persists, applies the shared config change, and resolves after the
  commit/effects boundary completes.
- Tag and prefix refreshes are cache-only writes to `f95ue:cache:tags` and
  `f95ue:cache:prefixes`; they never rotate the core envelope or backup.
- On persistence failure, live config and the canonical envelope remain unchanged; the result and
  a structured `CONFIG_SAVE_FAILED` health event describe the failure.

## Removed core synchronization

Core no longer observes canonical config writes through `GM_addValueChangeListener` or applies
remote configuration lifecycle changes. The unreleased `globalSettings.enableCrossTabSync` field
is no longer part of defaults or the schema.

Existing version-1 data containing that field is handled by the existing tolerant sanitization and
bounded historical recovery path: the unknown field is dropped from the candidate, valid sibling
settings remain, and a marked fast load performs no storage rewrite. This does not add a schema
version or a migration step.

Add-ons may retain their own manager-specific value listeners and transport keys. In particular,
the masked-direct add-on transport remains add-on-owned; its grants, callbacks, cleanup, and
runtime behavior are not core configuration synchronization.

## Backups and recovery

Keep a `lastKnownGood` snapshot in storage after successful commits and use it for bounded recovery
from corrupt canonical data. Revision and writer metadata remain persistence diagnostics and do not
constitute a core synchronization protocol.

## Checks

Run focused persistence and schema tests together with the normal repository checks. The source
and bundle audit commands are non-version-bumping; they do not rewrite tracked `dist/` artifacts.
