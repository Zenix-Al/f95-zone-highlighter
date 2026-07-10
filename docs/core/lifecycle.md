# Feature Lifecycle and Bootstrap

This document explains feature lifecycle stages, cancellation semantics, teardown, and recommended patterns for long-running tasks.

## Lifecycle stages

1. Registration (build time)
   - Features are discovered via the generated manifest and registered in the runtime catalog.
2. Fast bootstrap
   - Minimal initialization that can run before `document.body` is ready. Use for interception/early hooks.
3. Body bootstrap
   - Full initialization once the body is available. Features that manipulate page DOM should prefer this.
4. Enable
   - The framework calls the feature's `enable()` method. This should register listeners and queue tasks.
5. Running
   - Feature may react to observers, tasks, or commands.
6. Disable
   - The framework calls `disable()`; the feature must clean up resources.
7. Teardown / Global shutdown
   - Global lifecycle for pagehide/unload or BFCache transitions.

## Cancellation and generation tokens

- Route changes and rapid navigations are treated as generation transitions.
- Long-running async operations must accept an `AbortSignal` or check a generation token so that stale results are ignored.
- Pattern:

```js
async function enableFeature({ signal }) {
  const controller = new AbortController();
  signal.addEventListener('abort', () => controller.abort());
  await doAsyncWork({ signal: controller.signal });
}
```

## Ownership and cleanup

- Use `listenerRegistry` and `styleRegistry` helpers where available; they provide ownership and automated cleanup.
- On `disable()`, release all listeners, observers, timers, style registrations, mounted nodes, and queued tasks.
- Test disable path by invoking enable → disable → re-enable in unit/integration tests.

## Timeouts and health reporting

- Features should use short, testable timeouts for critical initialization steps and report failures to `featureHealth`.
- Avoid silent failures; prefer explicit error messages and a disabled state when initialization fails irrecoverably.

## Testing guidance

- Add integration tests that exercise: enable → route change → disable → enable.
- Test BFCache/pagehide behavior where possible using `pageshow`/`pagehide` simulated events.

This file complements `docs/architecture.md` and the migration/config contracts.