# Registries and Resource Ownership

The framework uses several registries to track ownership and prevent leaks. Key registries:

- `featureCatalog` — runtime metadata for discovered features.
- `listenerRegistry` — named listeners with ownership and teardown support.
- `styleRegistry` — feature-scoped style acquisition and release.
- `tasksRegistry` / `taskQueue` — scheduled tasks and queue management.
- `observerRegistry` — centralized mutation observer subscriptions.

## Principles

- Namespace IDs by feature/add-on to avoid collisions: e.g., `featureId:listenerName`.
- Treat duplicate registration as a health error in dev mode; warn in production.
- Registries must provide snapshot APIs for diagnostics and leak assertions.

## Ownership contract

- Any resource created by a feature should be registered with the appropriate registry and removed on `disable()`.
- Registries should support assertions in tests that verify no resources remain after disable.

## Recommended APIs

- `acquire(name, owner)` / `release(name, owner)` semantics where possible.
- `listByOwner(owner)` to support feature-health reporting.
- `assertNoLeaks(owner)` for CI/test assertions.

## Example: listenerRegistry usage

```js
import { addListener } from 'src/core/listenerRegistry.js';

export function enable() {
  addListener('feature-x:click', window, 'click', handler);
}

export function disable() {
  removeListener('feature-x:click');
}
```

The registries are critical for graceful reinitialization during route changes and for automated test isolation. Document specific registry contracts in the module docs when necessary.