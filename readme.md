# F95Zone Ultimate Enhancer

All-in-one userscript for F95Zone with a lean core and official add-on support.

- Install: https://greasyfork.org/en/scripts/546518-f95zone-ultimate-enhancer
- Built output: `dist/f95zone-ultimate-enhancer.user.js`

## What The Core Script Does

### Global features

- Notification dismissal
- Shadow DOM config UI (isolated styling)
- Tag management (search, preferred/excluded/marked lists, drag reorder)
- Color customization
- Optional cross-tab settings sync
- Feature health diagnostics

### Latest Updates page features

- Auto-refresh sync
- Web notifications sync
- Latest Ajax Recovery (invalid response guard + one safe retry)
- Wide Latest page
- Dense Latest Grid
- Latest overlay (status/tag/version)
- Intelligent overlay scoring
- Hover tag coloring from preferred/excluded rules
- Overlay color order editor

### Thread page features

- Wide thread
- Collapsible signatures
- Thread overlay

### Official add-ons

Specialized features are handled by optional add-ons:

- **Image Repair Add-on** - retries broken attachment images.
- **Library Add-on** - saves threads to a personal library with notes, ratings, status tracking, search, pinning, and import/export.
- **Masked + Direct Download Add-on** - resolves masked links and automates supported download hosts.

Direct download support is handled by the Masked + Direct Download Add-on for Buzzheavier, Gofile, Pixeldrain, Datanodes, MediaFire, and Workupload.

## Framework Architecture

### Startup flow

1. `src/main.js`
2. Load persisted config (`loadData`)
3. Detect page type from `src/config/pageDefinitions.js`
4. Init UI (F95 pages)
5. Load generated, page-scoped feature set (`src/loader.js`)

### Core framework primitives

- `src/core/featureFactory.js`
  - Standardized feature lifecycle: `enable`, `disable`, `toggle`, `isEnabled`
  - Operation serialization and timeout protection
- `src/core/styleRegistry.js`
  - Feature-scoped CSS with ref-counting (`acquireStyle` / `removeStyle`)
- `src/core/observer.js`
  - Shared `MutationObserver` with per-feature callback filters
- `src/core/listenerRegistry.js`
  - Named listener registration/cleanup
- `src/core/resourceManager.js`
  - Generic cleanup registry for non-listener/non-observer resources
- `src/core/teardown.js`
  - Global pagehide/beforeunload cleanup
- `src/core/StateManager.js`
  - Runtime state container with optional unknown-path warnings
- `src/core/pageDetection.js`
  - Generic page rule evaluation from config-defined page definitions
- `src/core/featureCatalog.js`
  - Feature registration and bootstrap-mode buckets
- `src/core/featureScope.js`
  - Page-scope gating for feature execution
- `scripts/featureManifest.cjs`
  - Build-time discovery of `*Feature` exports in `src/features/*/index.js`

### Configuration model

- Persistent user config: `config` in `src/config/state.js`
- Default config values: `src/config/defaults.js`
- Page definitions: `src/config/pageDefinitions.js`
- Runtime state (non-persistent): state manager in `src/config/state.js`
- Persistence API: `src/services/settingsService.js`
- Public config barrel: `src/config.js`

### UI/settings system

- Settings metadata lives in `src/ui/settings/*.js`
- Generic renderer reads metadata and binds config writes:
  - `src/ui/renderers/renderSetting.js`
  - `src/ui/renderers/applyEffects.js`
- Modal bootstrap: `src/ui/settings/index.js`

## Repo Map

- `src/main.js`: app bootstrap
- `src/loader.js`: generated feature loading by bootstrap mode and page scope
- `src/generated/features.generated.js`: generated feature manifest; do not edit by hand
- `src/features/*`: individual features
- `src/config/*`: default config, runtime state, page definitions, selectors, timings
- `src/core/*`: framework internals
- `src/services/*`: persistence, sync, safety, metrics, tags
- `src/ui/*`: modal UI, settings renderers, components, CSS
- `build.js`: bundle + userscript header generation + version bump
- `tests/run.cjs`: lightweight Node test suite

## Development Setup

### Requirements

- Node.js (LTS)
- npm
- A userscript manager (Tampermonkey/Violentmonkey)

### Install

```bash
npm install
```

### Commands

```bash
npm run build
npm run build:release
npm run build:addons
npm run build:addons:release
npm run lint
npm run lint:fix
npm run test
```

### Build behavior

- `npm run build` bundles `src/main.js` with esbuild.
- Before bundling, it regenerates `src/generated/features.generated.js` from feature exports.
- Generates:
  - `dist/f95zone-ultimate-enhancer.user.js`
  - `dist/f95zone-ultimate-enhancer.uglified.user.js`
- Auto-bumps version from `version.json`.
  - Default bump: patch
  - Optional: `npm run build -- --minor` or `npm run build -- --major`

### Add-on build behavior

- `npm run build:addons` builds add-ons in regular mode.
- `npm run build:addons:release` builds add-ons in release mode (minified output).
- Add-on builds now use change detection and skip unchanged add-ons automatically.
- Add-on versioning is independent from the main script and stored in `addons/version.json`.
- Add-on build cache is stored in `addons/.build-cache.json`.

Optional add-on build flags:

```bash
# bump level (default: patch)
npm run build:addons -- --minor
npm run build:addons:release -- --major

# force rebuild even if unchanged
npm run build:addons -- --force

# build one add-on by id
node addons/build-addon.js library-addon
node addons/build-addon.js library-addon --release
```

## Add-on System

Add-ons are declared in `addons/addons.manifest.json` and built by `addons/build-addon.js`.

Each add-on manifest entry defines:

- `id`, `name`, `description`, `author`
- `entry`, `outfile`
- `matches`, `grants`, `runAt`
- `requiresCore`
- `capabilities`

Capability-gated core actions are exposed through the add-on bridge (for example: `toast`, `storage`, `idb`, `ui`).

## Library Add-on Guide

### What it does

- Saves thread snapshots into personal IndexedDB-backed records.
- Adds page dock controls on thread pages (`Save/Remove`, `Open Library`).
- Provides a dedicated Library Manager modal for bulk operations.

### Library Manager features

- Search, status filter, sort, paging, multi-select.
- Bulk actions: set status, remove selected, clear selection.
- Import/export with preview confirmation before import.
- In-modal toasts and confirmation dialog (non-blocking, no native alert/confirm).
- Details Editor with editable note/status/score/pin and read-only identity fields.
- Thread-aware refresh: `Update from This Thread` appears only when active row matches the current thread page.
- Version tracking column (`Version`) and user rating column (`Rating`) in the table.

### Advanced search tokens (Library Manager)

You can mix plain text with tokens:

- `tag:ntr`
- `status:playing`
- `score>=8` (also supports `>`, `<`, `<=`, `=`)
- `pinned` / `unpinned`
- `has:note` / `has:no-note`
- `id:12345`

## Versioning Policy

This repo follows semantic versioning for the main script.

- Use **patch** for bug fixes and internal improvements with no behavior breaks.
- Use **minor** for backward-compatible new features and UX additions.
- Use **major** only for breaking changes (config schema breaks, removed behavior users rely on, incompatible public add-on/runtime contracts).

Generated manifests, refactors, and additive settings/features usually stay in **patch** or **minor** territory unless they break saved config, generated artifacts, or public add-on/runtime contracts.

## How To Add A New Feature

Use this checklist for consistency with the current framework.

1. Create feature folder

- Example: `src/features/my-feature/`
- Typical files:
  - `index.js` (feature wrapper)
  - `handler.js` (core logic)
  - `style.css` (optional, feature-only CSS)

2. Export a `*Feature` const from `index.js`

- The build script discovers exported const names ending in `Feature`.
- Do not manually import the feature in `src/loader.js`.
- Generated imports land in `src/generated/features.generated.js`.

```js
import { createFeature } from "../../core/featureFactory.js";
import { enableMyFeature, disableMyFeature } from "./handler.js";

export const myFeature = createFeature("My Feature", {
  configPath: "latestSettings.myFeature",
  pageScopes: ["isLatest"],
  enable: enableMyFeature,
  disable: disableMyFeature,
});
```

For CSS-backed features, prefer `createStyledFeature`:

```js
import { createStyledFeature } from "../../core/createStyledFeature.js";
import styleText from "./style.css";
import { enableMyFeature, disableMyFeature } from "./handler.js";

export const myStyledFeature = createStyledFeature("My Styled Feature", {
  configPath: "threadSettings.myStyledFeature",
  pageScopes: ["isThread"],
  styleCss: styleText,
  enable: enableMyFeature,
  disable: disableMyFeature,
});
```

3. Implement logic with registries

- Use `addListener` / `removeListener` for event handlers.
- Use `addObserverCallback` / `removeObserverCallback` for mutations.
- Register custom cleanup in `resourceManager` when needed.

4. Add config defaults when needed

- Add persistent defaults in `src/config/defaults.js`:
  - `latestSettings` for Latest page features
  - `threadSettings` for thread page features
  - `globalSettings` for global features
- `settingsService` merges saved config with defaults automatically.
- If config import/export should accept the key, update `src/features/config-transfer/validation.js`.

5. Add page definitions when needed

- Add new runtime page flags in `src/config/pageDefinitions.js`.
- Runtime state paths are created automatically from the keys in that object.
- Features reference those keys through `pageScopes`.

```js
export const pageDefinitions = {
  isMyPage: {
    hostIncludes: ["f95zone.to"],
    pathStartsWith: ["/my/path"],
  },
};
```

6. Add setting UI metadata

- Preferred: contribute settings from the feature itself through `settingsUi`.
- Set `sectionId` to `latest`, `thread`, `global`, etc.
- Use `createToggleSetting` and call `feature.sync()` in custom effects.

```js
settingsUi: {
  id: "my-feature",
  sectionId: "latest",
  metaMaps: [
    {
      myFeature: createToggleSetting({
        text: "My feature",
        tooltip: "What this feature does",
        config: "latestSettings.myFeature",
        custom: () => myFeature.sync(),
        toast: createEnabledDisabledToast("My feature"),
      }),
    },
  ],
}
```

Base settings that are not owned by a feature can still live in `src/ui/settings/*.js`.

7. Handle persistence/sync needs

- If config shape changes, ensure `loadData` merge/sanitize still works.
- For cross-tab synced sections, keep `crossTabKeys` aligned.
- If a setting is exportable/importable, update config-transfer validation.

8. Validate

- Run:
  - `npm run lint`
  - `npm run test`
- Avoid `npm run build` unless you want to bump `version.json`.
- To refresh the generated feature manifest without a version bump:

```bash
node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"
```

- Verify enable/disable behavior and cleanup on navigation/reload.

## Implementation Rules Used In This Project

- Keep feature CSS isolated and loaded through style registry.
- Do not attach raw listeners/observers without registry wrappers.
- Ensure every feature can cleanly disable and re-enable.
- Prefer process-first/apply-later patterns for heavy DOM work.
- Guard long-running async flows with generation/state checks.

## Notes For Contributors

- Edit source in `src/`, never in `dist/`.
- `dist/` files are generated artifacts.
- Keep changelog updates in `changelog.md` when shipping user-visible changes.
