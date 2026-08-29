# Config Schema and Persistence

This document describes the configuration schema, current persisted version policy, bounded
historical storage recovery, and recommended practices for safe, testable upgrades.

## Goals

- Provide a single source of schema truth and versioning for configuration.
- Keep persisted configuration at schema version `2` and support exactly one schema-1-to-2 migration.
- Keep historical surface-key detection as a separate read-only compatibility guard.
- Ensure config updates are atomic and recoverable on failure.
- Keep revision metadata available for atomic persistence and recovery.

## Schema basics

- Default values live in `src/config/defaults.js`; they are not the validation contract. Explicit descriptors and metadata live in `src/config/schema.js`.
- The schema exposes `validateConfig`, `validateConfigSection`, `sanitizeConfig`, `mergeWithDefaults`, `getDefaultConfig`, `getExportableConfigKeys`, and `getConfigPathMetadata`. Strict mode rejects unknown or invalid values; tolerant mode reports issues while preserving valid siblings and filling defaults.
- Schema issues contain a path, stable code, expected constraint, and safe received-type summary. Schema validation is pure: storage, migration writes, sync subscriptions, UI effects, and transfer-document parsing remain in their owning services.
- Persisted configuration should store an explicit `schemaVersion` at top-level alongside configuration keys, e.g.: 

```json
{
  "schemaVersion": 2,
  "globalSettings": { ... }
}
```

- Keep schema changes additive when possible. The current release supports only persisted schema 1 to 2. Transfer-document normalization remains separate from persisted-envelope loading.

### Adding a persistent field

1. Add the baseline value to `defaults.js`.
2. Add an explicit descriptor and relevant metadata to `CONFIG_SCHEMA` in `schema.js`; do not rely on inferred default types.
3. Route boundary validation through the shared schema API and add tests for default/schema consistency, strict rejection, tolerant recovery, and metadata derivation.
4. Keep persistence, migration, sync, effects, and import/export format responsibilities in their existing modules.

## Persisted version policy

1. `src/config/persistence.js` owns `CONFIG_STORAGE_KEYS`, `CONFIG_SCHEMA_VERSION`, version checks, and the migration registry.
2. `CONFIG_SCHEMA_VERSION` is `2`; `CONFIG_MIGRATIONS` contains only the identity data migration from schema 1 to 2 and `CONFIG_MIGRATION_COUNT` is `1`.
3. `f95ue:config:migration-version = 1` proves that the retired core v5.1.2 surface-key bridge completed. Current-marker startups do not inspect legacy keys.
4. Schema 1 is the only supported older envelope. Version 0 is unsupported, while versions newer than 2 remain read-only and untouched.
5. Current schema-2 fast loads remain write-free; schema-1 loads rotate the exact old envelope into backup and verify the schema-2 canonical write.

## Load and recovery pattern

1. Read the migration marker.
2. With the current marker, load schema 2 directly or transactionally migrate schema 1 under the migration lock, then read the separate tag/prefix caches.
3. With an absent or old marker, read only the bounded historical key list. Recognized pre-schema data returns `upgrade-required` without mutation; otherwise initialize a fresh schema-2 envelope.
4. For an unsupported or corrupt canonical envelope on the marked fast path, validate the last-known-good envelope and recover it atomically, or load defaults without scanning legacy keys.
5. Explicit commits use the canonical path; tag/prefix refreshes use cache keys and do not rotate the canonical backup.

Notes:
- Storage I/O remains in `storageAdapter`; persistence policy and recovery remain in `settingsService`, while `storageBootstrapService` alone publishes write readiness.

## Validation and test strategy

- Test schema 2, the supported schema-1 migration, future read-only versions, backup recovery,
  interruption boundaries, ownership, and tolerant sibling preservation. The absent/old-marker path is separately
  covered for the bounded historical surface-key recovery service.
- Tests should assert both structural correctness and that no user-visible semantics regress (e.g., a toggle remains true/false where intended).
- Run persistence tests in CI on every PR that modifies defaults or the persistence contract.

## Cross-tab ownership

- Persisted writes carry `{ schemaVersion, revision, writerId, updatedAt }` for atomic commits,
  backup recovery, and diagnostics. Core no longer observes those writes in other tabs or applies
  remote lifecycle effects.
- Add-ons may retain their own manager transport and listeners. Their storage keys, callbacks,
  lifecycle, and cleanup remain add-on-owned and are not part of the core config contract.
- `configChangeApplication` is the shared local commit/import effect boundary; it is not a second
  core synchronization engine.

## Backups and recovery

- Keep a `lastKnownGood` snapshot in storage after successful commits and use it for bounded recovery from corrupt canonical data.

`src/services/configMigrationService.js` now contains only the bounded legacy detector, bridge evidence, completion-marker check, and canonical catalog compaction helper. Historical transforms and cleanup writes are retired. Recognized older layouts fail with `upgrade-required` and remain untouched until core v5.1.2 has been run once.

## Monitoring and observability

- Emit one bounded health event for a sanitized load or recovery outcome, with redacted issue details.

---

This document should be referenced from `docs/config/index.md` and linked from `docs/lifecycle.md`.
