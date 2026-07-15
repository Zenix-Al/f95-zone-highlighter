# Related Service Contracts

Services the UI depends on:

- `settingsService`: load/validate/migrate/persist configuration
- Core configuration has no cross-tab persistence observer. Add-on transports remain isolated in
  their owning add-on service.
- `tagsService`: tag search, storage, pruning
- `safetyService`: tag/color warnings and invalid-state checks
- `addonsService`: registry, lifecycle, commands, storage
- `stateManager`: stores shadow root and shared runtime state
- `listenerRegistry`: named listener registration and cleanup
- `styleRegistry`: feature-scoped style acquisition/release
- Feature queues: reprocess latest tiles and thread tags
- Userscript storage API: persistence backend
