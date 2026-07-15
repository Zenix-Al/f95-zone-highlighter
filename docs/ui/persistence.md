# Persistence and Synchronization

- Functional settings are persisted by top-level key from the in-memory config. Renderer updates -> persist -> effects.
- UI-only preferences (active panel, pinned add-ons) are stored separately.
- Tag mutations use `tagsService` (indexing, pruning, reprocessing).
- Add-on settings use add-on storage via the add-on bridge (storage.get/set).
- Core does not apply persisted configuration across tabs. Add-on-owned transports must keep their
  own storage keys and lifecycle boundaries separate from the core repository.
