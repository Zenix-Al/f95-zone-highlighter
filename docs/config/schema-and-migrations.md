# Config Schema and Persistence

This document describes the configuration schema, current persisted version policy, bounded
historical storage recovery, and recommended practices for safe, testable upgrades.

## Goals

- Provide a single source of schema truth and versioning for configuration.
- Keep persisted configuration at schema version `1`; unsupported older versions recover from backup or defaults.
- Keep schema migration steps at zero; historical surface-key recovery is a separate bounded compatibility service.
- Ensure config updates are atomic and recoverable on failure.
- Keep revision metadata available for atomic persistence and recovery.

## Schema basics

- Default values live in `src/config/defaults.js`; they are not the validation contract. Explicit descriptors and metadata live in `src/config/schema.js`.
- The schema exposes `validateConfig`, `validateConfigSection`, `sanitizeConfig`, `mergeWithDefaults`, `getDefaultConfig`, `getExportableConfigKeys`, and `getConfigPathMetadata`. Strict mode rejects unknown or invalid values; tolerant mode reports issues while preserving valid siblings and filling defaults.
- Schema issues contain a path, stable code, expected constraint, and safe received-type summary. Schema validation is pure: storage, migration writes, sync subscriptions, UI effects, and transfer-document parsing remain in their owning services.
- Persisted configuration should store an explicit `schemaVersion` at top-level alongside configuration keys, e.g.: 

```json
{
  "schemaVersion": 1,
  "globalSettings": { ... }
}
```

- Keep schema changes additive when possible. The current release has one evidence-backed, marker-gated migration for the historical surface-key layout; transfer-document normalization remains separate from persisted-envelope loading.

### Adding a persistent field

1. Add the baseline value to `defaults.js`.
2. Add an explicit descriptor and relevant metadata to `CONFIG_SCHEMA` in `schema.js`; do not rely on inferred default types.
3. Route boundary validation through the shared schema API and add tests for default/schema consistency, strict rejection, tolerant recovery, and metadata derivation.
4. Keep persistence, migration, sync, effects, and import/export format responsibilities in their existing modules.

## Persisted version policy

1. `src/config/persistence.js` owns `CONFIG_STORAGE_KEYS`, `CONFIG_SCHEMA_VERSION`, version checks, and the migration registry.
2. `CONFIG_SCHEMA_VERSION` remains `1`; `CONFIG_MIGRATIONS` remains an immutable empty schema-step registry and `CONFIG_MIGRATION_COUNT` remains `0`.
3. `f95ue:config:migration-version = 1` gates the one-time surface-key recovery. Current-marker startups do not inspect legacy keys or execute transforms.
4. Version `0` and other mismatches are unsupported persisted envelopes; the settings repository uses last-known-good recovery or the bounded historical source path when the marker is absent.
5. Tolerant sanitization preserves valid siblings and does not rewrite the canonical envelope during a marked fast load.

## Load and recovery pattern

1. Read the migration marker.
2. With the current marker, read the canonical version-1 envelope and the separate tag/prefix caches; sanitize clones and apply through the shared config-change boundary.
3. With an absent or old marker, read only the bounded historical key list, build a detached candidate, validate caches separately, persist and verify the canonical/backup/cache result, then set the marker.
4. For an unsupported or corrupt canonical envelope on the marked fast path, validate the last-known-good envelope and recover it atomically, or load defaults without scanning legacy keys.
5. Explicit commits use the canonical path; tag/prefix refreshes use cache keys and do not rotate the canonical backup.

Notes:
- Storage I/O remains in `storageAdapter`; persistence policy and recovery remain in `settingsService`.

## Validation and test strategy

- Test the current version, unsupported versions, backup recovery, tolerant sibling preservation,
  and zero schema-migration calls on the marked fast path. The absent/old-marker path is separately
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

`src/services/configMigrationService.js` is intentionally temporary compatibility code for released surface-key storage. Remove it, the marker/cleanup path, and its fixtures only after those installations can no longer require recovery or after an explicit compatibility-breaking release decision. It must not grow into a speculative migration framework.

## Monitoring and observability

- Emit one bounded health event for a sanitized load or recovery outcome, with redacted issue details.

---

This document should be referenced from `docs/config/index.md` and linked from `docs/lifecycle.md`.
