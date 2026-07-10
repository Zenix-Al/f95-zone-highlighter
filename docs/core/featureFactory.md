# Feature Factory (`featureFactory.js`)

The `featureFactory` is the heart of the mini-framework, dictating the lifecycle of every feature.

## What is it?
Instead of writing a feature as a standalone script, features are instantiated via `createFeature()` or `createStyledFeature()`. This wraps the feature in a standard interface.

- **`createFeature`**: Used for standard features with JavaScript logic.
- **`createStyledFeature`**: Used when a feature also needs to inject custom CSS styles. It ensures the CSS is injected into the isolated Shadow DOM safely, and it removes the styles when the feature is disabled.

## Standard Interface
When you create a feature, it returns an object with methods like:
- `enable()`: Activates the feature. If an operation is in progress, it queues the request. It also checks if the feature is applicable to the current page.
- `disable()`: Deactivates the feature and ensures clean teardown.
- `toggle(shouldEnable, force)`: Helper to switch states.
- `isEnabled()`: Checks if the feature should be active based on configuration.
- `isApplicable()`: Checks if the feature is meant to run on the current page scope.

## Feature Options
When calling `createFeature(name, options)`, the options object expects:
- `id`: (String) Unique identifier for the feature.
- `configPath`: (String) Path in the config tree to determine if enabled.
- `enable`: (Function) The logic to run when activating.
- `disable`: (Function) The cleanup logic to run when deactivating.
- `isApplicable`: (Function) Returns boolean determining if the feature can run on the current page.
- `bootstrapMode`: (String) When to start (`waitForBody` or `fast`).
- `pageScopes`: (Array) List of valid route scopes.

## Error Handling
The factory wraps lifecycle transitions in `try/catch` and enforces an `OP_TIMEOUT` (15000ms). If a feature fails to start, it is reported to the `featureHealth` subsystem and will not crash the rest of the script. Features can also use `reportError(err, phase)` to report runtime errors that occur outside the standard lifecycle.
