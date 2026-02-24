# TODO

## LOC / DRY opportunities (post `--release` review)

- [x] DRY `build.js` dual esbuild runs into one reusable `buildTarget()` + shared base config.
  Files: `build.js`
  Why: The non-minified and uglified builds duplicate most config and post-write logic.

- [x] Remove or wire `HEADER_TEMPLATE_PATH`; currently declared but unused.
  Files: `build.js`, `header.txt`
  Why: Dead constant adds noise; using a real template also reduces hardcoded metadata LOC.

- [x] Use a small target matrix (`[{ minify, tmpOutfile, finalOutfile, header }]`) and `Promise.all`.
  Files: `build.js`
  Why: Replaces repeated promise chains and centralizes output behavior.

- [x] Consolidate repeated object-path helpers (`getByPath`/`setByPath`) into one shared utility.
  Files: `src/core/StateManager.js`, `src/core/featureFactory.js`, `src/ui/renderers/renderSetting.js`
  Why: Same logic appears multiple times in bundled output.

- [x] Add a helper factory for direct-download package toggle metadata.
  Files: `src/ui/settings/threadSettings.js`
  Why: `buzzheavier/gofile/pixeldrain/datanodes` entries repeat identical effect/toast scaffolding.

- [x] Add a generic setting-meta factory for common toggle patterns.
  Files: `src/ui/settings/*.js`
  Why: Many setting objects differ only by label/config/toast text; a factory can reduce boilerplate without changing behavior.

- [x] Replace regex-based debug stripping with compile-time flagging (`define`) + dead-code elimination.
  Files: `build.js`, `src/core/logger.js`
  Why: Keeps release stripping deterministic and can reduce bundled LOC with less string-rewrite risk.
