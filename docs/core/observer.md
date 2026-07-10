# Observer (`observer.js`)

The `observer.js` module provides a single, unified `MutationObserver` for the entire userscript. 

## Why?
Instantiating multiple `MutationObserver`s on the document body is terrible for performance. Instead, we run one observer and allow features to register callbacks.

## Profiling and Limits
The observer is highly profiled. It tracks `tickDuration` and `callbackDuration`. Slow callbacks (`> 8ms`) or slow ticks (`> 16ms`) will trigger warnings if profiling is enabled (`OBSERVER_PROFILE_FLAG`).

## How to use
Features should not instantiate `MutationObserver` directly. Instead:

```javascript
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";

// Inside feature's enable():
addObserverCallback("my-unique-feature-id", (mutationsList, observer) => {
    // Check mutations
}, {
    filter: (mutationsList, observer) => {
        // Return true if callback should run, false otherwise.
        // Doing light checks here is better for performance.
        return true;
    }
});

// Inside feature's disable():
// Actually, resourceManager automatically handles observer cleanup if registered properly,
// but you can call it manually.
removeObserverCallback("my-unique-feature-id");
```

## Features of Observer
- **Automatic teardown**: Registering a callback automatically registers it with `resourceManager`.
- **Filtering**: Callbacks can supply a `filter` function which runs first. If `filter` returns `false`, the main callback is skipped. This prevents unnecessary processing.
- **Profiling**: Logs slow observer ticks and tracks callbacks, preventing hidden performance drains.
