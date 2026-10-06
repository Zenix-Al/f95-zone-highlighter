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

- `src/config/persistence.js` owns the canonical storage keys and schema version `2`.
- `CONFIG_MIGRATIONS` contains the bounded version-1-to-2 migration; the active
  `configMigrationService` also detects historical surface-key storage and the proven v5.1.2 bridge boundary.
- `storageAdapter` performs raw storage I/O only. It does not know config defaults, schema,
  migrations, revisions, or effects.
- `settingsService.commitConfig()` reads the latest envelope, increments its revision, stores the
  previous valid envelope as last-known-good, then writes the new envelope before updating live
  config.
- `configWriteLock` holds one exclusive Web Lock around startup recovery/migration and every
  complete runtime config read/modify/write sequence. All updated HTTPS tabs on the same origin
  therefore serialize writes to the shared GM keys. HTTP is no longer a matched core page;
  if Web Locks are unavailable, config loads read-only and writes fail closed.
- A whole-section `saveConfigKeys()` candidate or direct `commitConfig()` candidate prepared in
  a stale tab is rejected rather than overwriting a newer revision. Cache-only tag/prefix writes
  also compare the current cache with the tab's last loaded value while holding the lock.
- Updater-based saves refresh changed tag/prefix caches under that lock even when the canonical
  revision is unchanged, so another tab's cache-only save is included in the updater draft.
- `updateConfig(updater, options)` is the serialized mutation boundary for interactive updates.
  The repository clones canonical settings while retaining the unchanged runtime tag/prefix
  cache references, validates with empty catalog placeholders, persists, applies the shared
  config change, and resolves after the commit/effects boundary completes. If an updater replaces
  a catalog reference, complete strict validation remains the fallback.
- Tag and prefix refreshes are cache-only writes to `f95ue:cache:tags` and
  `f95ue:cache:prefixes`; they never rotate the core envelope or backup.
- Runtime result and rollback snapshots retain catalog references instead of cloning catalog
  items. Catalog replacement remains atomic and owned by the cache-only write path.
- On persistence failure, live config and the canonical envelope remain unchanged; the result and
  a structured `CONFIG_SAVE_FAILED` health event describe the failure.

## Removed core synchronization

Core no longer observes canonical config writes through `GM_addValueChangeListener` or applies
remote configuration lifecycle changes. The unreleased `globalSettings.enableCrossTabSync` field
is no longer part of defaults or the schema.

The write lock does not live-sync open Settings panels. A stale tab refreshes on an updater-based
save, or receives a stale-candidate error for whole-section writes. The guarantee applies after
all writing tabs have loaded this HTTPS-only build; an older userscript still writing without the
lock cannot participate in the protocol. Validate Web Locks availability in each supported
userscript manager before release.

Existing version-1 data containing that field is handled by the existing tolerant sanitization and
bounded historical recovery path: the unknown field is dropped from the candidate, valid sibling
settings remain, and a marked fast load performs no storage rewrite. This does not add a schema
version or a migration step.

Add-ons may retain their own manager-specific value listeners and transport keys. In particular,
the masked-direct add-on transport remains add-on-owned; its grants, callbacks, cleanup, and
runtime behavior are not core configuration synchronization.

## Backups and recovery

Keep a `lastKnownGood` snapshot in storage after successful commits and use it for bounded recovery
from corrupt canonical data. Startup recovery writes hold the same lock as ordinary saves. Revision
and writer metadata are used for stale-candidate detection, not live UI synchronization.

## Checks

Run focused persistence and schema tests together with the normal repository checks. The source
and bundle audit commands are non-version-bumping; they do not rewrite tracked `dist/` artifacts.
