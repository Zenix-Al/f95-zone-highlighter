# Core Framework Overview (`src/core`)

The `core` directory contains the foundational building blocks of the Latest Highlighter userscript. It provides generic infrastructure that all features rely on to operate efficiently, securely, and without conflict.

## Key Modules

- **[featureFactory](featureFactory.md)**: The lifecycle manager for features. Provides `createFeature` and `createStyledFeature`.
- **[observer](observer.md)**: A unified `MutationObserver` wrapper.
- **[stateManager](stateManager.md)**: Global and local state management with a subscription mechanism.
- **[taskQueue](taskQueue.md)**: Schedule potentially heavy tasks sequentially with a delay.
- **[pageBridge](pageBridge.md)**: Safely bridges the userscript to the host page's `window` context.
- **[resourceManager & teardown](teardown.md)**: Ensures robust cleanup of event listeners and timeouts when a feature disables or the page unloads.

**Note on `featureHealth.js`**: This core module runs silently in the background, intercepting errors and timeouts from the feature lifecycle, reporting them to the console and metrics to ensure developers know when a feature is failing.

All new features should utilize these core modules instead of native DOM alternatives (e.g. `MutationObserver` or `addEventListener` on `window`) without proper tracking, to ensure proper garbage collection and avoid memory leaks.
