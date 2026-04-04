# F95Zone Ultimate Enhancer

All-in-one userscript for F95Zone with a modular feature framework.

- Install: https://greasyfork.org/en/scripts/546518-f95zone-ultimate-enhancer
- Built output: `dist/f95zone-ultimate-enhancer.user.js`

## What The Script Does

### Global features

- Notification dismiss (close F95 notices with an `x` button)
- Shadow DOM config UI (isolated styling)
- Tag management (search, preferred/excluded lists, drag reorder)
- Color customization
- Optional cross-tab settings sync
- Feature health diagnostic

### Latest Updates page features

- Auto refresh sync
- Web notifications sync
- Wide Latest Page (remove width cap)
- Dense Latest Grid
- Latest page overlay (status/tag/version)
- Overlay color order editor

### Thread page features

- Skip Masked Link
- Direct Download Links (works with masked-link resolution)
- Wide thread
- Image Retry
- Collapsible signatures
- Thread overlay

### Direct download support

- Automated host flows: `buzzheavier.com`, `gofile.io`, `pixeldrain.com`, `datanodes.to`
- Destination retry handling: `trashbytes.net`

## Framework Architecture

### Startup flow

1. `src/main.js`
2. Load persisted config (`loadData`)
3. Detect page type (`detectPage`)
4. Init UI (F95 pages)
5. Load page-scoped feature set (`src/loader.js`)

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

### Configuration model

- Persistent user config: `config` in `src/config.js`
- Runtime state (non-persistent): state manager in `src/config.js`
- Persistence API: `src/services/settingsService.js`

### UI/settings system

- Settings metadata lives in `src/ui/settings/*.js`
- Generic renderer reads metadata and binds config writes:
  - `src/ui/renderers/renderSetting.js`
  - `src/ui/renderers/applyEffects.js`
- Modal bootstrap: `src/ui/settings/index.js`

## Repo Map

- `src/main.js`: app bootstrap
- `src/loader.js`: feature loading by page context
- `src/features/*`: individual features
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

Given the current changes (new add-on features and builder improvements without breaking existing user config/runtime contracts), the main script should stay on **v4** and continue with **minor/patch** bumps.

## How To Add A New Feature

Use this checklist for consistency with the current framework.

1. Create feature folder

- Example: `src/features/my-feature/`
- Typical files:
  - `index.js` (feature wrapper)
  - `handler.js` (core logic)
  - `style.css` (optional, feature-only CSS)

2. Implement logic with registries

- Use `addListener` / `removeListener` for event handlers.
- Use `addObserverCallback` / `removeObserverCallback` for mutations.
- Register custom cleanup in `resourceManager` when needed.

3. Wrap with `createFeature`

- In `index.js`, expose a feature object.
- Use `configPath` for toggle-driven features.

```js
import { createFeature } from "../../core/featureFactory.js";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";
import styleText from "./style.css";
import { enableMyFeature, disableMyFeature } from "./handler.js";

const STYLE_ID = "feature-my-feature";

export const myFeature = createFeature("My Feature", {
  configPath: "threadSettings.myFeature",
  enable: () => {
    acquireStyle(STYLE_ID, styleText, "document");
    enableMyFeature();
  },
  disable: () => {
    disableMyFeature();
    removeStyle(STYLE_ID);
  },
});
```

4. Add config defaults

- Add setting key in `src/config.js` under the right section:
  - `threadSettings`, `latestSettings`, `globalSettings`, etc.

5. Add setting UI metadata

- Add a metadata entry in one of:
  - `src/ui/settings/threadSettings.js`
  - `src/ui/settings/latestSettings.js`
  - `src/ui/settings/globalSettings.js`
  - `src/ui/settings/overlaySettings.js`
  - `src/ui/settings/colorSettings.js`
- Use `effects.custom` to run your feature toggle/reprocess logic.

6. Wire feature into loader

- Import in `src/loader.js`.
- Add feature into the correct map:
  - `latestPageFeaturesMap`
  - `threadPageFeaturesMap`
  - `globalFeaturesMap`

7. Handle persistence/sync needs

- If config shape changes, ensure `loadData` merge/sanitize still works.
- For cross-tab synced sections, keep `metaRegistry` and `crossTabKeys` aligned.

8. Validate

- Run:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
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
