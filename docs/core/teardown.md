# Teardown & Resource Management

A critical principle of the Latest Highlighter framework is that **every feature must clean up after itself** when it is disabled or when the page navigates away. Memory leaks in an SPA (Single Page Application) forum will quickly degrade performance.

## `resourceManager.js`
The Resource Manager tracks disposables (functions that need to run to clean something up). 
When you register a callback with the `observer.js`, it automatically registers a cleanup function here.

## `teardown.js`
The Teardown module is the global trigger. When `pagehide` occurs, or when the userscript needs to completely reset, `teardownAll()` is called.

### How Features Handle Teardown
1. **`disable()` Method**: Every feature has a `disable()` method defined in `featureFactory.js`. When a feature is turned off, this method is invoked.
2. **`listenerRegistry.js`**: If your feature uses `addListener()`, it tracks the listener. During teardown or disablement, you simply unregister your namespace, and all associated event listeners are instantly removed.

By centralizing teardown, the core framework guarantees that a disabled feature leaves zero footprint on the page.
