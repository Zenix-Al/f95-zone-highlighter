# Config Schema and Migrations

This document describes the configuration schema, migration contract, and recommended practices for safe, testable upgrades.

## Goals

- Provide a single source of schema truth and versioning for configuration.
- Make migrations deterministic, idempotent, and testable.
- Ensure config updates are atomic and recoverable on failure.
- Support cross-tab synchronization with revision metadata.

## Schema basics

- Default values live in `src/config/defaults.js`; they are not the validation contract. Explicit descriptors and metadata live in `src/config/schema.js`.
- The schema exposes `validateConfig`, `validateConfigSection`, `sanitizeConfig`, `mergeWithDefaults`, `getDefaultConfig`, `getExportableConfigKeys`, `getSyncedConfigPaths`, and `getConfigPathMetadata`. Strict mode rejects unknown or invalid values, tolerant mode reports issues while preserving valid siblings and filling defaults, and migration mode accepts only documented legacy input shapes.
- Schema issues contain a path, stable code, expected constraint, and safe received-type summary. Schema validation is pure: storage, migration writes, sync subscriptions, UI effects, and transfer-document parsing remain in their owning services.
- Persisted configuration should store an explicit `schemaVersion` at top-level alongside configuration keys, e.g.: 

```json
{
  "schemaVersion": 3,
  "globalSettings": { ... }
}
```

- Keep schema changes additive when possible. If removal is required, provide a migration that transforms old keys into the new shape.

### Adding a persistent field

1. Add the baseline value to `defaults.js`.
2. Add an explicit descriptor and relevant metadata to `CONFIG_SCHEMA` in `schema.js`; do not rely on inferred default types.
3. Route boundary validation through the shared schema API and add tests for default/schema consistency, strict rejection, tolerant recovery, and metadata derivation.
4. Keep persistence, migration, sync, effects, and import/export format responsibilities in their existing modules.

## Migration contract

Migrations should follow a strict contract so they are safe to run in build/CI, in production, and when replayed during cross-tab sync.

1. Idempotent: running the same migration multiple times must yield the same result.
2. Deterministic: no random data or timestamp-dependent branching.
3. Small, composable steps: provide a migration per `schemaVersion` increment.
4. Validate output: after migration, validate the resulting config against expectations before swapping into active state.
5. Atomic replace: perform migrations in a temporary object and replace the active config only after all migrations succeed.
6. Logging and rollback: on failure, log the reason, preserve the previous persisted snapshot (keep lastKnownGood), and do not replace active config.

## Migration implementation pattern (example)

1. Load defaults.
2. Read persisted config.
3. Build `working = { ...defaults, ...persisted }` (merge as appropriate).
4. For each migration `M_n` where `n` > `persisted.schemaVersion` and `n <= currentSchemaVersion`, run `working = M_n(working)`.
5. Validate `working`.
6. Persist `working` atomically with new `schemaVersion` and revision metadata.

Notes:
- Prefer explicit top-level section writes where the storage backend requires it (e.g., `storage.set('latestSettings', value)`) but ensure the migration step can persist a snapshot backup if atomic multi-key writes are not available.

## Validation and test strategy

- Maintain a test suite with fixtures for every supported input `schemaVersion` and an expectation for the target version.
- Tests should assert both structural correctness and that no user-visible semantics regress (e.g., a toggle remains true/false where intended).
- Run migration tests in CI on every PR that modifies defaults or migration code.

## Cross-tab synchronization implications

- Persisted writes carry `{ schemaVersion, revision, writerId, updatedAt }`; sync compares that tuple deterministically.
- When applying a remote change with `syncService`, do not re-run migrations that are already applied — migrations should only run when the local persisted `schemaVersion` is less than the code `currentSchemaVersion`.
- When a migration changes persisted keys that trigger effects, ensure `metaRegistry` covers those sections so other tabs can replay effects deterministically.

## Backups and recovery

- Keep a `lastKnownGood` snapshot in storage after successful migrations; allow a manual restore path.
- Optionally keep the last N snapshots for recovery from accidental destructive migrations.

## Practical checklist for adding a migration

- [ ] Add a migration function file under `src/config/migrations/` named `migrate-v<N>.js` exporting `migrate(workingConfig)`.
- [ ] Add tests under `tests/migrations/` for input fixture(s) and expected output.
- [ ] Update `src/config/index.js` (or migration runner) to include the new migration in the ordered list.
- [ ] Verify `npm test` passes locally and in CI.
- [ ] Run `npm run validate:manifest` (or other repo checks) if the migration touches features or sync metadata.

## Example migration snippet

```js
// src/config/migrations/migrate-v3.js
module.exports.migrate = function migrateV3(working) {
  // idempotent transform
  if (!working) working = {};
  if (working.schemaVersion >= 3) return working;
  const copy = JSON.parse(JSON.stringify(working));
  // move old key to new structure
  if (copy.oldFeatureFlag !== undefined) {
    copy.newFeature = { enabled: !!copy.oldFeatureFlag };
    delete copy.oldFeatureFlag;
  }
  copy.schemaVersion = 3;
  return copy;
};
```

## Monitoring and observability

- Emit a health event when migrations run, including duration and any errors.
- Surface migration failure info in the feature-health report with redaction of sensitive values.

---

This document should be referenced from `docs/config/index.md` and linked from `docs/lifecycle.md`.
