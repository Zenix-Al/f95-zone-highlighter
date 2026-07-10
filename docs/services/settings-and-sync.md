# Settings and Cross-Tab Synchronization

This document describes the contract and lifecycle for configuration: loading, validation, migration, persistence, and cross-tab synchronization.

## Config lifecycle (contract)

- Load order:
  1. Load `defaults.js` as the source of truth for missing keys.
  2. Read persisted config from userscript storage (fast path).
  3. Merge persisted values over defaults into an ephemeral object.
  4. Run migrations against the ephemeral object; validate results.
  5. On success, replace the active in-memory config atomically.

- Migration and validation:
  - Migrations must be idempotent and deterministic.
  - Validate migrated config before swapping into active state.
  - Keep a `schemaVersion` in persisted data to guide migrations.

- Persistence:
  - Persist top-level sections atomically where possible.
  - On persistence failure, rollback in-memory state to the last-known-good value and surface a clear toast/error.

## Cross-tab sync contract (`syncService` + `metaRegistry`)

- Each persisted write should include revision metadata: `{ rev: string|number, source: string }`.
- `syncService` listens for storage events and applies changes only when the incoming revision is newer.
- `metaRegistry` maps top-level config sections to effect handlers used to replay side effects in other tabs.

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
4. Other tabs receive storage event → `syncService` verifies `rev` → `metaRegistry` applies the mapped effects.

Ensure effect mapping and persistence boundaries are maintained in tandem to avoid stale or missed effects.