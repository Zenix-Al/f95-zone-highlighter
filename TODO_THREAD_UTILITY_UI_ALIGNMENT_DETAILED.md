# Thread Utility Core UI Alignment TODO

## Objective

Bring the Thread Utility palette and settings dialog into the same visual
language as core Settings, using
`docs/ui/visual-style-reference.md` as the source of truth. Preserve the
existing compact information architecture, interaction behavior, add-on
security boundary, and responsive layout.

This work also replaces literal `>` / `v` disclosure text with a CSS-generated
indicator driven by `aria-expanded`. The controls remain real buttons because
the application owns one-open-section state. `::marker` is intended for list
items and native `<summary>` elements and is therefore not the right primitive
for the current button contract.

## Confirmed problems

- The palette uses a cooler blue/slate surface family (`#1f2329`, `#252a31`,
  `#30353d`, and related borders) instead of the core Settings neutral family.
- Focus rings use unrelated blue `#8ab4f8` instead of the core focus accent.
- Tag semantics do not match core defaults: marked is purple, preferred is
  green, and excluded is muted gray.
- Utility, copy, download, footer, and settings actions each approximate core
  controls separately.
- Description, Installation, and Downloads append literal `>` or `v` text to
  their accessible button label.
- The settings dialog was recently repaired so only its list scrolls; palette
  normalization must not regress that footer boundary.
- The core add-on dialog host currently has cooler inline defaults. This task
  normalizes Thread Utility content only and does not silently broaden into a
  core dialog-host migration.

## Accepted visual contract

- Core Settings CSS is authoritative; screenshots are comparison evidence.
- Main content uses `#191b1e`; cards/recessed groups use `#17191d`; controls use
  `#222` or `#20242a` according to role.
- Strong borders use `#3f4043`, card borders use `#31343a`, and dividers use
  `#2b2e33` unless a control specifically needs `#555`.
- Primary actions use `#893839`, hover `#b94f4f`, active `#6e2b2b`, and white
  text. Neutral actions use `#20242a` and core-compatible borders.
- Focus indication uses `#c15858` and remains visible for keyboard users.
- Preferred tags use the configured/core preferred semantics, whose default is
  purple. Excluded tags use the configured/core excluded semantics, whose
  default is red. Marked tags use the configured/core neutral marked semantics,
  whose default is gray.
- Add-on CSS remains fully scoped and must pass the core sanitizer.
- No core API, storage shape, parser, utility behavior, or release version is
  changed by styling packages.

## Required invariants

1. Palette open, refresh, close, and reopen behavior remains unchanged.
2. Copy-title, copy-link, quick-search, download Open, and Masked Direct
   delegation actions keep their existing identifiers and listeners.
3. Description, Installation, and Downloads remain keyboard-operable buttons
   with accurate `aria-expanded` and `aria-controls` values.
4. Only one content section remains open according to application state.
5. The disclosure indicator is decorative and does not pollute the accessible
   name with `>` or `v`.
6. Preferred, excluded, marked, normal, muted, and overflow tag states remain
   distinguishable without relying only on text color.
7. The settings utility list remains the sole scrolling region; rows never
   paint through its action footer.
8. Desktop and narrow layouts retain usable hit targets without horizontal
   overflow.
9. Sanitized production CSS, not an unscoped test substitute, is used by visual
   tests.
10. Generated distributions and versions remain untouched until an explicit
    release request.

## Wave 1 — Visual baseline and role inventory

### [x] THREAD-UTILITY-STYLE-BASELINE-01

- Extend the separate Playwright suite with a production palette fixture built
  through `renderPalette()` and production CSS after core sanitization.
- Cover normal, preferred, excluded, marked, overflow, missing-rating, status,
  closed-section, and open-section states.
- Capture desktop and narrow screenshots as report attachments.
- Record computed colors for modal, header, footer, controls, text, borders,
  focus, and each tag state.
- Inventory every literal color in `threadUtility.css` by semantic role and map
  it to the canonical core reference or an explicitly retained semantic color.
- Characterize the current literal disclosure labels and accessible names.

Checkpoint: behavior and production CSS remain unchanged. Stop if the fixture
cannot exercise the real renderer or sanitized stylesheet.

## Wave 2 — Palette surfaces and controls

### [x] THREAD-UTILITY-STYLE-PALETTE-01

- Normalize palette, summary, scroll region, footer, status box, content
  dividers, inputs, and borders to the canonical core surface hierarchy.
- Normalize title copy/link buttons, utility buttons, download actions,
  Refresh, and Settings by role rather than applying one color to every button.
- Replace blue focus styling with the core focus accent while retaining visible
  keyboard focus and adequate contrast.
- Keep padding, compact utility density, and responsive column counts unless a
  browser measurement proves a layout defect.
- Avoid introducing a second token system inside the add-on. If local CSS
  custom properties reduce repetition, keep them private, role-named, and
  initialized from the documented values in one root rule.

Checkpoint: Playwright computed colors match the documented role map and all
existing palette interaction tests pass.

## Wave 3 — Tag and prefix semantics

### [x] THREAD-UTILITY-STYLE-TAGS-01

- Correct preferred, excluded, and marked chips to core tag semantics.
- Keep ordinary and muted tags neutral and make the `+N` control look
  interactive without impersonating a semantic tag.
- Decide prefix presentation separately from user-tag state; a thread prefix
  must not accidentally imply that the user preferred or marked a tag.
- Preserve future user/core-provided color priority. Do not hard-code a visual
  mapping in JavaScript when CSS variables can consume the existing core color
  contract.
- Add computed-style assertions for all states and contrast/distinguishability
  checks that do not depend solely on screenshots.

Checkpoint: the default marked tag is neutral gray, preferred is purple,
excluded is red, and status classification tests remain unchanged.

## Wave 4 — Disclosure indicators

### [x] THREAD-UTILITY-STYLE-DISCLOSURE-01

- Remove literal `>` and `v` characters from Description, Installation, and
  Downloads button content.
- Render one CSS `::after` indicator on
  `.thread-utility-content-disclosure`, styled as a compact chevron.
- Drive orientation from `[aria-expanded="true"]`; prefer transform/rotation
  over swapping textual glyphs.
- Respect `prefers-reduced-motion` if a transition is used.
- Verify the accessible button names contain only the section title/count.
- Verify the indicator tracks state immediately after repeated open/close and
  one-section-to-another transitions.

Checkpoint: keyboard and pointer toggles preserve existing state behavior, and
Playwright proves the pseudo-element changes orientation without HTML glyphs.

## Wave 5 — Settings dialog alignment

### [x] THREAD-UTILITY-STYLE-SETTINGS-01

- Normalize the settings window, utility rows, fields, checkboxes, buttons,
  error state, dividers, and action footer against core Settings roles.
- Distinguish Save as primary, destructive Delete as a guarded destructive
  action, and movement/reset/cancel controls as neutral actions.
- Preserve the three-row settings shell introduced by the footer-overlap fix.
- Add desktop, narrow, top-scroll, and bottom-scroll Playwright coverage.
- Assert that list geometry ends above the footer and that footer hit testing
  remains authoritative after all style changes.

Checkpoint: no content paints through the footer, no horizontal scrollbar is
introduced, and the dialog remains usable at 640px and below.

## Wave 6 — Integrated verification and release evidence

### [x] THREAD-UTILITY-STYLE-VERIFY-01

- Run add-on lint, Thread Utility logic/integration tests, CSS sanitizer checks,
  the separate Playwright suite, documentation inventory, and diff checks.
- Exercise palette open/close/reopen, every utility family, tag expansion,
  every content disclosure, settings save/cancel/reset/reorder, and external
  dialog close.
- Review desktop and narrow screenshots beside the core Settings reference.
- Confirm no selectors rely on F95Zone page CSS or leak outside the add-on-owned
  root.
- Record any intentional residual difference, including the core-owned add-on
  dialog host surface, without disguising it as Thread Utility styling.
- Prepare a compact patch-release changelog only when the user requests the
  release; do not bump or build distributions in this package.

Final gate: automated checks pass, Playwright report screenshots show the core
surface hierarchy, user tag meanings are correct, disclosure labels contain no
literal direction glyphs, and browser smoke testing confirms the production
core/add-on composition.
