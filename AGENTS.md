# Codex Repository Guide

This file is the root instruction entry point for Codex and other agents that support
`AGENTS.md`. Keep investigations targeted: this repository contains large generated
userscripts that are rarely useful to read.

## Start Here

1. Read this file once.
2. Search `docs/README.md` and the relevant document under `docs/` before opening source.
3. Use `rg` to locate the exact symbol, then read only the surrounding source.
4. Treat `.rules.md` and `docs/agent.md` as additional guidance. If they disagree with
   this file or the current source, this file and the current source win.

Do not inventory or read the entire repository for orientation. Do not reopen files
whose relevant contents are already in the conversation.

## Repository Map

- `src/main.js`: bootstrap orchestration.
- `src/loader.js`: loads generated features by boot mode and page scope.
- `src/features/<feature>/`: core feature implementations.
- `src/generated/features.generated.js`: generated feature manifest; never hand-edit it.
- `src/config/defaults.js`: persisted configuration defaults.
- `src/config/schema.js`: validation, defaults coverage, and export/sync metadata.
- `src/config/persistence.js`: schema version 1, storage keys, and the empty schema-migration registry.
- `src/config/state.js`: config object and runtime state manager.
- `src/config/pageDefinitions.js`: declarative page detection rules and runtime page flags.
- `src/core/`: lifecycle, page bridge, observer, task, listener, and teardown primitives.
- `src/services/`: cross-feature services and persistence.
- `src/ui/`: core UI and Shadow DOM code.
- `addons/<addon>/src/`: add-on source; follow `addons/example-addon/` as the reference layout.
- `dist/` and `addons/*/dist/`: generated artifacts; do not edit or inspect unless the
  task specifically concerns generated output.

## Editing Rules

- Preserve unrelated user changes. The worktree may already be dirty.
- Use the existing framework instead of adding a second lifecycle mechanism.
- Do not create a raw `MutationObserver`; use `src/core/observer.js`.
- Features must use `createFeature` or `createStyledFeature` and provide cleanup through
  `disable` for resources they own.
- Use the listener/resource registries where applicable. Any direct global listener,
  timer, page patch, or injected element must be reversible during feature disable.
- Use `createStyledFeature`/the style registry for core feature CSS. Remember that core
  UI uses Shadow DOM while add-on mounts and dialogs may live in the page document.
- Use the task queue/frame-budget utilities for large DOM collections or repeated work.
- Edit source rather than bundled userscripts.

## Adding A Feature

1. Create `src/features/<name>/index.js`.
2. Export a const whose name ends in `Feature` and whose value comes from
   `createFeature(...)` or `createStyledFeature(...)`.
3. Set `configPath`, `pageScopes`, boot mode, lifecycle methods, and optional
   feature-owned `settingsUi` metadata.
4. Add persisted defaults to `src/config/defaults.js` when needed.
5. Add or change routes only in `src/config/pageDefinitions.js`; page state paths are
   derived from its keys.
6. Add persistent fields to `src/config/defaults.js` and `src/config/schema.js`, then cover
   strict validation, tolerant sanitization, and metadata in tests. Config Transfer consumes
   that shared schema through `src/services/configTransfer/`; browser file and dialog behavior
   belongs in `src/ui/configTransfer/`.

Do not manually import a new feature into `src/loader.js` or register it in
`src/core/featureCatalog.js`. `scripts/featureManifest.cjs` discovers `*Feature` exports.

Regenerate only the manifest, without bumping the userscript version, with:

```powershell
node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"
```

## Validation And Builds

Run checks proportional to the change, normally:

```powershell
npm run lint
npm test
git diff --check
```

For core-only size evidence, use the non-version-bumping audit and smoke commands:

```powershell
npm run audit:core
npm run check:core
npm run build:core:smoke
npm run audit:css
npm run check:css
```

These commands write audit reports or temporary smoke outputs; they do not run the release
build, bump `version.json`, or update tracked `dist/` files.

- Add focused tests for page matching, feature discovery/scope, config migration, or other
  behavior changed by the task.
- Do not run `npm run build` merely to validate source: it regenerates distributions and
  bumps `version.json`.
- Build only when the user asks for generated artifacts or a release/version bump.
- Add-on builds and versions are independent; build only the add-on in scope.

Core cleanup and persistence work covers `src/config/**`, `src/core/**`, non-add-on services and
features, core UI, and their tests/docs. Add-on runtime, catalog, bridge, trust, and add-on UI
work belongs to the separate add-on plan; do not treat it as a prerequisite for core cleanup.

## Debugging Boundaries

- Userscript sandbox code and page-context code are different execution worlds. Use the
  page bridge for page-owned globals such as the site's jQuery or minified scripts.
- Route behavior can resemble an SPA. Check route detection, feature applicability, and
  teardown/re-enable behavior together.
- For Latest-page failures, distinguish failures in F95's `latest.min.js` from failures in
  core or an add-on before changing code.
- Never assume `responseJSON` exists on a failed request.

## Keep Responses Efficient

Report the outcome, important files changed, and validation results. Avoid dumping large
diffs, generated code, command logs, or architecture explanations the user did not ask for.
