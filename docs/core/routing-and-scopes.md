# Routing and Feature Scopes

This document explains how the system detects pages, evaluates feature applicability, and handles route transitions.

## Page detection

- `pageDefinitions.js` contains declarative rules to detect page types (e.g., `isLatest`, `isThread`).
- Detection runs during body bootstrap and on history/URL changes.

## Feature scopes

- Features declare `pageScopes` (array of scope names) and `isApplicable` predicate to fine-tune applicability.
- The loader filters features by:
  1. `pageScopes` matching the detected page set
  2. `isApplicable({ stateManager, config })` returning true

## Route transitions

- The framework emits route transition events and increments a generation token.
- Features should check the generation token or accept an `AbortSignal` for async work to avoid applying stale changes.
- Route identity includes origin, path, query, and hash because each can change the
  active XenForo view. Repeated notifications for the identical normalized URL do
  not create a generation. Synchronous A → B → C history changes create distinct
  generations but coalesce reconciliation so only C is dispatched.
- `routeState` is the only generation owner. Loaders, lifecycle operations, task
  queues, selector diagnostics, and fast capture consume its route context.

## Handling SPA-like navigations

- For single-page-app behavior, use the route observer rather than `load`/`DOMContentLoaded` events.
- On transitions, the framework disables features that no longer match and enables newly applicable ones.

## Testing

- Simulate history changes in integration tests and verify features enable/disable behavior and that no leaked listeners remain.

This complements `docs/architecture.md` and `docs/core/lifecycle.md`.
