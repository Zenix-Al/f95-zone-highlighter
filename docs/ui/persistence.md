# Persistence and Synchronization

- Functional settings are persisted by top-level key from the in-memory config. Renderer updates -> persist -> effects.
- UI-only preferences (active panel, pinned add-ons) are stored separately.
- Tag mutations use `tagsService` (indexing, pruning, reprocessing).
- Add-on settings use add-on storage via the add-on bridge (storage.get/set).
- Cross-tab sync uses `metaRegistry` to map persisted sections to effects; keep registry coverage aligned with persisted keys.