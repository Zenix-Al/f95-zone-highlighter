# Core CSS audit

`src/ui/assets/css.css` is injected into the core Shadow DOM. The deterministic audit command is:

```text
npm run audit:css
npm run check:css
```

The generated reports are `docs/architecture/css-audit-baseline.json` and `docs/architecture/css-audit.json`. They use the browser-compatible CSSOM parser from `happy-dom`, retain source lines, and record selector evidence from static templates, runtime class/id creation, state transitions, and tests.

The audit deliberately scans core-owned add-on management UI under `src/ui/components/addons/**` and `src/ui/renderers/addonsRenderer.js`, while excluding production add-on source and generated files. No external F95Zone page selectors were identified in this stylesheet; the CSS is Shadow DOM-scoped. Unresolved selectors remain protected rather than being removed from literal-search absence.

The current cleanup consolidated exact duplicate selector blocks and cascade-equivalent repeated declarations. It did not rename classes, remove dynamic selectors, change add-on styling contracts, alter feature-owned styles, or perform a visual redesign. Representative DOM/style contract checks live in `tests/run.cjs`; browser screenshots remain a follow-up for any future removal candidate.
