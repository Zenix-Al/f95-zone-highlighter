# Tags and Safety Services

This file documents `tagsService` and `safetyService` responsibilities, caching, pruning, and page reprocessing contracts.

## `tagsService` responsibilities

- Single source for tag data: search index, configured lists (preferred, excluded, marked), and persistence.
- Provide APIs for:
  - `search(query)` → incremental results with debounce.
  - `addTag(list, tag)` / `removeTag(list, tag)` / `reorder(list, fromIndex, toIndex)`.
  - `pruneObsolete()` to remove tags not present in upstream sources.
- Persist tag lists separately from core settings to allow independent reprocessing.

## `safetyService` responsibilities

- Validate tag combinations and detect invalid or unsafe configurations.
- Provide a safety-state API used by UI: `getSafetyState()` and `onSafetyChange()`.
- Surface warnings and required remediation actions.

## Page reprocessing contract

- Tag mutations must enqueue deterministic reprocessing jobs:
  - Tile reclassification (Latest page) and thread reprocessing must be queued, not run synchronously.
  - Reprocessing jobs should be idempotent and respect current generation/route tokens to avoid applying stale changes.
- UI should show progress or toasts for long-running reprocessing tasks.

## Caching, indexing, and pruning

- Keep a search index in memory and persist a serialized cache for faster startup.
- Pruning should be limited to maintain backward-compatibility; provide a migration path for renamed tags.
- Limit memory usage and expose diagnostic snapshots for feature-health.

## Recommendations and checks

- Add tests for cross-list moves and verify correct toast messages for each destination.
- Ensure `pruneObsolete()` does not remove user-configured tags without explicit confirmation.
- Add telemetry for tag index size and prune/restore operations to guide performance tuning.