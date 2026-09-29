# TODO — Shared icons for core and add-ons

Status: planning only; no UI migration or icon-family selection approved yet.

## Fixed requirements

- No emojis. Use consistent SVG icons from one selected family.
- Define reusable icon constants with individual exports/imports. Importing one
  icon must not bundle the entire collection.
- Share source assets at build time between core and add-ons; do not couple an
  add-on's own UI rendering to core boot timing.
- Preserve meaningful text and accessible names. Icon-only controls require an
  explicit accessible label; tooltips are supplementary, not the only label.
- No remote fonts, CDN assets, runtime downloads, or reliance on site icon CSS.
- Do not edit distributions or bump versions during implementation verification.

## Wave 1 — Inventory and placement decisions

- [ ] Audit existing symbols, emojis, icon classes, buttons, badges, and navigation
  labels in core and add-on source, excluding generated userscripts.
- [ ] Cover Settings/navigation, dialogs, tag controls, dock buttons, Latest
  overlays, Library Manager/Inbox/Full Edit, and other add-on UI separately.
- [ ] Record each candidate's source location, current text, intended meaning,
  proposed icon, and one decision: keep text / icon beside text / icon-only.
- [ ] Let the user add candidates and approve the migration list before edits.
- [ ] Keep status distinctions (Saved, Playing, Completed, acknowledgement versus
  played-version state) understandable without learning an icon vocabulary.
- [ ] Avoid adding icons to every field label just for decoration.
- [ ] Identify labels rewritten dynamically so refreshes cannot erase icons.

### User-editable candidate worksheet

These are suggestions, not approved replacements. Add rows while reviewing UI.

| Surface / source location | Current text or symbol | Proposed icon meaning | Treatment | Approved |
| --- | --- | --- | --- | --- |
| Settings dock | Current settings symbol | Settings | Icon-only with label | No |
| Dialogs / search | Close / clear / X | Close or clear | Icon-only with label | No |
| Reorder controls | Up / down symbols | Move up / down | Icon-only with label | No |
| Refresh controls | Refresh | Refresh | Icon beside text initially | No |
| Library actions | Edit / remove | Edit / delete | Review per surface | No |
| Library actions | Played this version | Played-version action | Keep text; optional icon | No |
| Library state chips | Saved / Playing / etc. | Library state | Keep text; optional icon | No |
| Latest provider marker | Library status text | Library membership | Icon beside text | No |
| Import / export | Import / export | Data transfer direction | Icon beside text | No |
| Pin controls | Pin / unpin | Pin state | Review per surface | No |

## Wave 2 — Icon source and licensing

No manual Google image search is necessary. Browse a maintained icon catalog by
meaning and select individual SVGs from its official source.

- [ ] Choose one family and visual style with the user (outline/filled, weight,
  common viewBox and sizing). Do not mix families casually.
- [ ] Compare [Lucide](https://lucide.dev/) (tree-shakable icons; ISC licensing,
  inspect upstream license for selected assets) and
  [Google Material Symbols](https://developers.google.com/fonts/docs/material_symbols)
  (individual SVG downloads; Apache-2.0).
- [ ] Save the selected upstream version/commit, icon names, source links, and
  required license/copyright notices, including inherited notices where relevant.
- [ ] Decide selected vendored SVG definitions versus a pinned package with
  explicit imports after inspecting existing bundlers. Either must be offline
  at runtime and demonstrably exclude unused icons.
- [ ] Provide a small preview sheet for approval at actual UI sizes.
- [ ] Prefer an established icon for common actions. Custom drawing is a last
  resort for meanings absent from the selected catalog, not a prerequisite.

## Wave 3 — Shared source and safe rendering

- [ ] Inspect core/add-on bundling boundaries and choose a neutral shared module
  location; helpers must not import core state, services, or lifecycle code.
- [ ] Export individual immutable definitions; avoid an eagerly referenced
  all-icons object, wildcard imports, and runtime scans of the whole collection.
- [ ] Provide DOM rendering for core/page/Shadow DOM and an add-on-safe rendering
  route. Inspect the bridge sanitizer first: arbitrary SVG is currently blocked.
- [ ] Do not globally allow arbitrary SVG merely to support icons. Evaluate
  trusted icon placeholders expanded by core or tightly validated static SVG;
  document the chosen security boundary and backward compatibility.
- [ ] Keep external URLs, scripts, event attributes, foreignObject, and arbitrary
  markup out of icon payloads. Render only reviewed local definitions.
- [ ] Use currentColor, consistent dimensions, decorative aria-hidden icons,
  and no extra focus stops. Keep parent button accessible names unchanged.
- [ ] Add minimal styles via existing style/lifecycle ownership for each root.
- [ ] If providers choose marker icons, use optional bounded allowlisted IDs;
  unknown/missing IDs fall back to text. Keep the renderer provider-agnostic.
- [ ] A finite marker-icon allowlist may bundle its supported subset in core;
  this is separate from importing an entire external collection. Record that
  explicit subset and its cost.
- [ ] Document imports and usage for future add-on authors.

## Wave 4 — Approved migrations

- [ ] Replace approved existing symbols first, then common action buttons.
- [ ] Apply approved icon-plus-text treatments, including the Library marker.
- [ ] Migrate other add-ons independently; do not assume all need the same icons.
- [ ] Preserve selectors, event delegation, keyboard behavior, disabled states,
  confirmation flows, and data semantics.
- [ ] Ensure re-render/update/teardown paths neither lose nor duplicate icons.
- [ ] Update the worksheet with final source locations and remaining candidates.

## Wave 5 — Verification and handoff

- [ ] Unit-test rendering, escaping/validation, unknown icon fallbacks, and
  sanitizer safety; keep malicious SVG blocked.
- [ ] Bundle a single-icon fixture and assert unrelated icon definitions are
  absent. Verify core and add-on bundles separately without release builds.
- [ ] Use Playwright for page DOM, core Shadow DOM, and add-on dialogs: narrow
  screens, dark surfaces, focus, disabled state, accessible names, and clicks
  directly on icon children.
- [ ] Verify Latest score-on/off positioning, long labels, and multiple providers.
- [ ] Capture and inspect screenshots at actual icon sizes, not just enlarged
  asset previews. Test with network blocked/site fonts unavailable.
- [ ] Run proportional lint/tests and git diff --check; report existing failures
  separately. Measure bundle impact and preserve notices in shipped artifacts.
- [ ] Record completion and any user-deferred placements. Build only on request.

## Completion criteria

Approved placements work consistently across core and add-ons; no emojis or
runtime icon dependencies are introduced; unused collection assets stay out of
bundles; accessibility, sanitizer boundaries, and licensing are verified.
