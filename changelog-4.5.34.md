# Changelog — v4.5.34

## [v4.5.34 - ResourceManager, Feature Interface & Cleanup]

### Changes & Improvements

- **Added `ResourceManager`**: Implemented `src/core/resourceManager.js` to centralize cleanup for listeners, observers, timeouts, injected UI, and other runtime resources.
- **Integrated `ResourceManager` with registries**: `src/core/listenerRegistry.js` and `src/core/observer.js` now register resources automatically to avoid leaks on repeated feature toggles.
- **Feature interface & imports modernized**: Standardized feature entrypoints and re-exported lifecycle methods so UI and core modules call feature APIs consistently.
- **Registered feature resources**: High-risk features were instrumented to register their runtime resources with the manager, including:
  - `latest-overlay` (task queue)
  - `image-repair` (task queue + injected UI)
  - `direct-download` (per-download iframe + timer cleanup via resource ids)
- **Build**: Bumped version and produced new builds (`dist/*user.js` and `dist/*uglified.user.js`).

### Notes

- Follow the `direct-download:<encodedUrl>` naming pattern for per-resource IDs to allow targeted cleanup.
- Consider adding `getFeatureStatus()` and a small health-check API to report feature `running|disabled|failing` states (see TODO).
