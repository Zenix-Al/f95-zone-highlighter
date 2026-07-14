# Config Schema and Migrations

This document describes the configuration schema, current persisted version policy, and recommended practices for safe, testable upgrades.

## Goals

- Provide a single source of schema truth and versioning for configuration.
- Keep persisted configuration at schema version `1`; unsupported older versions recover from backup or defaults.
- Ensure config updates are atomic and recoverable on failure.
- Support cross-tab synchronization with revision metadata.

## Schema basics

- Default values live in `src/config/defaults.js`; they are not the validation contract. Explicit descriptors and metadata live in `src/config/schema.js`.
- The schema exposes `validateConfig`, `validateConfigSection`, `sanitizeConfig`, `mergeWithDefaults`, `getDefaultConfig`, `getExportableConfigKeys`, `getSyncedConfigPaths`, and `getConfigPathMetadata`. Strict mode rejects unknown or invalid values; tolerant mode reports issues while preserving valid siblings and filling defaults.
- Schema issues contain a path, stable code, expected constraint, and safe received-type summary. Schema validation is pure: storage, migration writes, sync subscriptions, UI effects, and transfer-document parsing remain in their owning services.
- Persisted configuration should store an explicit `schemaVersion` at top-level alongside configuration keys, e.g.: 

```json
{
  "schemaVersion": 1,
  "globalSettings": { ... }
}
```

- Keep schema changes additive when possible. Persisted storage currently has zero migration steps; transfer-document normalization remains separate from persisted-envelope loading.

### Adding a persistent field

1. Add the baseline value to `defaults.js`.
2. Add an explicit descriptor and relevant metadata to `CONFIG_SCHEMA` in `schema.js`; do not rely on inferred default types.
3. Route boundary validation through the shared schema API and add tests for default/schema consistency, strict rejection, tolerant recovery, and metadata derivation.
4. Keep persistence, migration, sync, effects, and import/export format responsibilities in their existing modules.

## Persisted version policy

1. `CONFIG_SCHEMA_VERSION` remains `1` in `src/config/persistence.js`.
2. `CONFIG_MIGRATIONS` is an immutable empty registry and `CONFIG_MIGRATION_COUNT` is `0`.
3. Version `0` and other mismatches are unsupported persisted envelopes; the settings repository uses last-known-good recovery or defaults.
4. Tolerant sanitization preserves valid siblings and does not rewrite the canonical envelope.

## Load and recovery pattern

1. Load defaults.
2. Read the canonical version-1 envelope.
3. Sanitize current-version data on a clone and apply the result through the shared config-change boundary.
4. For an unsupported version, validate the last-known-good envelope and recover it atomically, or load defaults.
5. Persist only explicit commits or backup recovery; sanitized canonical loads do not write storage.

Notes:
- Storage I/O remains in `storageAdapter`; persistence policy and recovery remain in `settingsService`.

## Validation and test strategy

- Test the current version, unsupported versions, backup recovery, tolerant sibling preservation, and zero migration calls.
- Tests should assert both structural correctness and that no user-visible semantics regress (e.g., a toggle remains true/false where intended).
- Run persistence tests in CI on every PR that modifies defaults or the persistence contract.

## Cross-tab synchronization implications

- Persisted writes carry `{ schemaVersion, revision, writerId, updatedAt }`; sync compares that tuple deterministically.
- When applying a remote change with `syncService`, validate the version-1 envelope and use the shared config-change application pipeline; the sync path does not migrate or persist the remote change.
- When a persisted field changes, ensure `metaRegistry` covers its section so other tabs can replay effects deterministically.

## Backups and recovery

- Keep a `lastKnownGood` snapshot in storage after successful commits and use it for bounded recovery from corrupt canonical data.

There is no persisted migration runner or migration directory in the current contract. Future schema changes require an explicitly scoped design decision; this package does not add a generic migration framework.

## Monitoring and observability

- Emit one bounded health event for a sanitized load or recovery outcome, with redacted issue details.

---

This document should be referenced from `docs/config/index.md` and linked from `docs/lifecycle.md`.
