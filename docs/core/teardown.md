# Teardown & Resource Management

A critical principle of the Latest Highlighter framework is that **every feature must clean up after itself** when it is disabled or when the page navigates away. Memory leaks in an SPA (Single Page Application) forum will quickly degrade performance.

This document explains the registries and patterns features must use to ensure deterministic cleanup, BFCache-friendly behavior, and testable teardown.

## Key modules

- `resourceManager.js`: Tracks disposable callbacks (functions executed during teardown).
- `listenerRegistry.js`: Centralized listener tracking with `addListener`/`removeListener` helpers.
- `styleRegistry.js`: Tracks registered styles and supports scoped `acquire`/`release` semantics.
- `teardown.js`: Global coordinator that invokes `teardownAll()` on `pagehide` or when the runtime requests a full reset.

The coordinator exposes the runtime states `new`, `starting`, `running`, `suspended`,
`stopping`, and `stopped`. A completed teardown retains its summary, so repeated calls
are inert; starting a new runtime clears that retained result and permits registration
again.

## Recommended teardown ordering

1. Cancel or mark long-running async work as stale (AbortController / generation token).
2. Stop mutation observers and DOM watchers registered via `observer.js`.
3. Unbind event listeners registered via `listenerRegistry`.
4. Unmount UI components and trigger any teardown hooks on mounted widgets.
5. Close dialogs and overlays.
6. Unregister CSS styles from `styleRegistry`.
7. Finalize/persist minimal state, close DB transactions, and clear timers.
8. Mark feature state as `disabled` in `featureCatalog` and assert no resources remain.

This ordering ensures that interactive items are removed before styles are stripped, and that unmounting happens while the DOM is still present.

## BFCache and `pagehide`/`pageshow`

- Use `pagehide` instead of `unload` for teardown because `pagehide` will fire for BFCache navigations and provides `event.persisted`.
- On `pagehide`, prefer lightweight persistence (if needed) and detach resources. On `pageshow`, reinitialize only if the page was restored from BFCache (`event.persisted`).
- Avoid expensive sync operations during `pagehide` that could block the transition. Prefer to persist only minimal state required to resume.
- A persisted `pagehide` aborts the active route context and cancels pending queue work,
  then pauses queues while preserving stable DOM and styles. A persisted `pageshow`
  requests a forced route generation, re-detects the page, resumes queues, refreshes
  add-on security policy, and reconciles all features.
- A non-persisted `pagehide` aborts active bootstrap controllers, bounds feature disable
  waits, disposes queues, shuts down the add-on bridge, restores route patches, and
  clears owner registries. The returned summary contains completed stages, disabled
  features, and safe failure records.

Example:

```js
function createFeatureLifecycle(featureId, featureImpl) {
	const controller = new AbortController();

	async function enable() {
		controller.signal; // passed to async operations
		await featureImpl.enable({ signal: controller.signal });
	}

	function disable() {
		controller.abort(); // cancel in-flight work
		featureImpl.disable(); // synchronous cleanup
	}

	function onPageHide(e) {
		// If persisted (BFCache) we still remove live resources; pageshow will re-enable if needed
		disable();
	}

	window.addEventListener('pagehide', onPageHide);
	return { enable, disable };
}
```

## Testing teardown

- Add integration tests that run `enable()` → perform DOM operations → `disable()` and assert registries report zero resources for that owner.
- Use `assertNoLeaks(owner)` where available in test utilities.

## Add-on responsibilities

- Add-ons must unregister mounts and styles before disabling. The core may forcibly unmount, but graceful cleanup avoids visual glitches.
- Remove any bridge event listeners and finalize cross-frame channels.

## CI checks

- Consider adding assertions in CI that run sample features and assert `resourceManager`/`listenerRegistry` snapshots are empty after disable.

## Common errors

- Not clearing timers created with `setInterval`/`setTimeout`.
- Leaving DOM nodes mounted without removing them on disable.
- Opening long-lived DB cursors or transactions without proper finalization.

This file complements `docs/core/lifecycle.md` and `docs/core/registries.md`.
