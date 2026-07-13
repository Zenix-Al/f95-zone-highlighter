# Settings and Cross-Tab Synchronization

This document describes the contract and lifecycle for configuration: loading, validation, migration, persistence, and cross-tab synchronization.

## Config lifecycle (contract)

- Load order:
  1. `settingsService.loadConfig()` reads through `storageAdapter`.
  2. The repository validates the canonical `{ schemaVersion, revision, writerId, updatedAt, data }` envelope.
  3. It recovers from `f95ue:config:last-known-good`, or migrates legacy per-section keys into one envelope.
  4. Migrations run on clones and are validated before any write or live-config replacement.
  5. On success, the repository passes the complete config through `configChangeApplication`.

- Migration and validation:
  - Migrations must be idempotent and deterministic.
  - Validate migrated config before swapping into active state.
  - Keep a `schemaVersion` in persisted data to guide migrations.

- Persistence:
  - `storageAdapter` performs raw storage I/O only; it does not know config defaults, schema, migrations, or effects.
  - `settingsService.commitConfig()` reads the latest envelope, increments its revision, stores the previous valid envelope as last-known-good, then writes the new envelope before updating live config.
  - `saveConfigKeys()` is a convenience wrapper that builds a complete candidate and uses the same commit path.
  - On persistence failure, live config and the canonical envelope remain unchanged; the result and a structured `CONFIG_SAVE_FAILED` health event describe the failure.
  - Legacy per-section keys are deleted only after the migrated envelope succeeds. Managers without delete support may retain those keys during the compatibility window; subsequent loads prefer the canonical envelope.

## Cross-tab sync contract (`syncService` + `metaRegistry`)

- Each persisted write includes `{ schemaVersion, revision, writerId, updatedAt }` metadata.
- `syncService` listens only to the canonical envelope and compares `(revision, updatedAt, writerId)` lexicographically. Equal or older tuples are ignored.
- Incoming envelopes use the shared strict schema/envelope validation and are applied with `configChangeApplication` using `origin: "remote-sync"`; the remote path never persists again.
- Schema metadata determines syncable roots: tags and tag lists, colors, overlay/thread/global/latest settings, and add-on settings. There is no second sync key list.
- `metaRegistry` supplies static and dynamically contributed effect handlers. The shared application service deep-diffs paths, orders them deterministically, deduplicates them, and continues if one effect fails.

Key behavior:
- Effect replay must be idempotent and reentrant (avoid double-applying UI changes).
- The registry must list all sections that require side effects; add new keys when introducing effects.
- Loop prevention: when applying a remote update, do not re-persist the same change back to storage.

## Recommendations and checks

- Add tests for migration from every supported `schemaVersion` to the newest.
- Add a `lastKnownGood` snapshot or backup to recover from corrupted migrations.
- Use `validate:manifest` style CI checks to ensure `metaRegistry` lists all synced sections that need effects.
- Make persistence observable in feature-health logs for debugging cross-tab issues.

## Example flow

1. User toggles a setting in UI → renderer coerces value → writes to in-memory config.
2. Persist top-level section with new `rev` metadata.
3. Local effects run.
4. Other tabs receive the canonical storage event → `syncService` verifies the tuple and schema → `configChangeApplication` applies syncable roots and replays mapped effects.

Ensure effect mapping and persistence boundaries are maintained in tandem to avoid stale or missed effects.
