# File-by-File Responsibility Index

Use this as a quick lookup for ownership and responsibilities in `src/ui`.

Root:
- `index.js` — bootstraps Shadow DOM, CSS, dock/button, colors, visibility, and sync.
- `getShadowRoot.js` — exposes stored shadow root.

Assets:
- `assets/ui.html` — modal skeleton
- `assets/css.css` — shadow DOM styles
- `assets/document.css` — document-level integration styles

Helpers:
- `helpers/cssInjector.js` — style injection
- `helpers/updateColorStyle.js` — apply color variables

Core components: see `components/*` and `components/addons/*` for add-on UI items.

Renderers: `renderers/*` handle metadata→DOM→persistence→effect pipeline.

Settings: `settings/*` house static metadata and the modal lifecycle orchestration.