# Architecture Overview

The Latest Highlighter project is structured as a mini-framework designed to handle the complexities of a userscript running on dynamic forums (like XenForo). It provides structured lifecycles, robust error handling, and performance optimization (DOM batching, debouncing) out-of-the-box.

## High-Level Boot Process

The entry point of the script is `src/main.js`. It coordinates a multi-stage boot sequence using the pipeline from `src/core/bootstrap.js`.

### 1. Fast Bootstrap (`runFastBootstrap`)
This phase runs immediately before the document body is fully loaded or parsed.
- **Config Loading**: Triggers `ensureConfigLoaded()` immediately.
- **Global Hooks**: Registers teardown hooks for `pagehide` and refresh hooks for `pageshow`.
- **Error Listeners**: Initializes global `error` and `unhandledrejection` capture via `initGlobalErrorListeners()`.
- **Route Observation**: Starts monitoring URL/history changes (`initRouteObserver`).
- **Addon Bridge**: Exposes the console bridge for external addons.

### 2. Body Bootstrap (`runBodyBootstrap`)
This phase runs once `waitForBodyReady()` completes.
- **Page Detection**: Identifies which part of the site the user is on (e.g., forum list, thread, latest posts) via `detectPage()`.
- **UI Phase Initialization**: Sets up the UI environment via `initUiPhaseIfApplicable()`.
- **Feature Loading**: Triggers `loadBodyBootstrapFeatures()`, which iterates over features registered in the catalog and enables those whose `bootstrapMode` is `waitForBody` and are applicable to the current page/configuration.

### Bootstrap step policy

Every bootstrap step declares an ID, timeout, and classification. Required steps
(route state, page detection, validated configuration, and teardown hooks) stop their
pipeline on failure because later steps depend on their output. Optional diagnostics,
UI conveniences, toast flushing, and the add-on console bridge may be unavailable
without invalidating core state. Route observation and feature loading are recoverable:
their explicit fallback preserves a usable core while diagnostics report degraded
startup. A fallback never changes a failed primary operation into a healthy result.

### Feature discovery & generated manifest

Features are discovered at build time from `*Feature` exports in `src/features/*/index.js` rather than by manual imports. Refresh the generated `src/generated/features.generated.js` file without a version bump with `node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"`. The generated file is consumed by the loader and must not be edited manually.

- Do not rely on manual edits to `src/core/featureCatalog.js` — the loader uses the generated manifest during bootstrap to create the runtime catalog.
- The manifest step should be run during build/CI so the generated file is always in sync with source.

This design reduces merge conflicts and keeps feature registration deterministic.

### Manifest-aware bootstrap

At bootstrap time the loader reads the generated manifest. The effective feature catalog used by the bootstrap phases is the runtime registration derived from that manifest (filtered by page scopes, config, and bootstrap mode).

The loader sequence is roughly:

1. Read generated manifest
2. Normalize and validate entries (IDs, bootstrapMode, pageScopes)
3. Populate runtime `featureCatalog`
4. Execute fast/bootstrap phases and enable applicable features

If manifest validation fails (duplicate IDs, invalid bootstrapMode), bootstrap should surface a clear error and fail early in CI/build.

## Component Interactions

1. **Features (`src/features`)**:
   Features are the actual functionalities visible to the user (e.g., `latest-overlay`, `thread-overlay`). They are wrapped using `createFeature()` or `createStyledFeature()` from the core. Features define their own `enable()` and `disable()` logic, which the core framework schedules, executes, and monitors for failures or timeouts.

2. **Core (`src/core`)**:
   The core provides the scaffolding for features:
   - `featureFactory.js`: Wraps features in a standard interface, handles timeouts, and reports health.
   - `observer.js`: Provides a centralized `MutationObserver` to watch for DOM changes, allowing features to query/react to elements efficiently.
   - `taskQueue.js`: Handles scheduling of tasks (DOM reads/writes) using a frame budget to prevent layout thrashing and freezing the UI.
   - `listenerRegistry.js` & `teardown.js`: Ensure event listeners are tracked and properly removed when features are disabled or the page unloads.

   ### Route transitions and cancellation

   The framework treats route/URL changes as discrete transition generations. Long-running asynchronous work spawned by features should receive either an `AbortSignal` or a transition-generation token so that:

   - stale work cannot apply DOM or state changes after navigation;
   - the framework can cancel or ignore results from previous generations;
   - integration tests can assert deterministic teardown and re-enable behavior.

   Feature authors should accept an `AbortSignal` or check a provided generation token in any async effect to support safe cancellation.

3. **Services (`src/services`)**:
   Services handle cross-cutting concerns:
   - `settingsService.js`: Owns storage I/O orchestration, validation, revisions, recovery, and live-config commits.
   - `configChangeApplication.js`: Applies config changes and effects through the shared pipeline.
   - `configTransfer/`: DOM-free transfer documents, preview, validation, and transactional import.
   - `configMigrationService.js`: Bounded, marker-gated recovery of the historical surface-key layout.
   - `tagsService.js`: Handles asynchronous fetching and caching of tags.
   - `addonsService.js`: Allows third-party scripts to interface with Latest Highlighter.

4. **UI (`src/ui`)**:
   Handles rendering using a custom Shadow DOM implementation (`getShadowRoot.js`) to isolate styles from the main site. Features typically append their UI components into this shadow root.

## State and Configuration
- **Config**: Defined in `src/config/defaults.js` and loaded dynamically.
- **State**: The `stateManager.js` handles global state (e.g., current route, detected page type) and notifies subscribers when state changes.

### Config and ownership contracts

Config loading happens very early (fast bootstrap) but some features require the full config to be validated before they run. The contract is:

- `ensureConfigLoaded()` must complete before features that depend on validated/persisted config are enabled.
- The persisted envelope remains schema version `1`; `src/config/persistence.js` exposes zero schema migration steps. The separate migration service only handles the released historical surface-key layout and is marker-gated.
- Tolerant sanitization preserves valid siblings, reports bounded issues, and does not rewrite storage during load.
- Config Transfer keeps document construction and normalization in its service and browser file/dialog behavior in its UI adapter.
- Features that can run without full config should opt into `fastBootstrap` to improve perceived startup time.

Core cleanup does not include add-on runtime, catalog, bridge, trust, or add-on UI work. Those paths
have their own ownership and release plan.

For reproducible core size checks without a version bump, run `npm run audit:core`,
`npm run check:core`, and `npm run build:core:smoke`; CSS evidence uses `npm run audit:css` and
`npm run check:css`.

Documenting which features require validated config helps avoid race conditions during bootstrap and
keeps add-on transport ownership separate from core persistence.
