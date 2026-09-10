# Library UI Responsive Baseline

This is the pre-rework browser baseline for the Library Manager, Updates Inbox,
and Auto Update dialog. The fixtures in
`tests/visual/library-ui-baseline.visual.cjs` bundle the production renderers,
load the production scoped CSS, and simulate the core dialog sizes used by each
view. They do not import generated userscripts or mutate Library data.

## Evidence contract

Playwright captures populated and empty states at 1280x800, 768x900, and
390x844. Each capture has a PNG and a JSON attachment containing viewport,
surface, content, primary scroller, footer, representative row/card, and action
geometry. `docs/references/rendered-library.html` remains the browser-captured
Manager reference; it is checked for availability but is not treated as source.

## Current responsive findings

| View | Current primary scroll behavior | Baseline issue retained for later waves |
| --- | --- | --- |
| Manager | The table wrapper owns table scrolling inside a bounded Manager window. | The table keeps a 1040px minimum at tablet/mobile widths, so the narrow view is a horizontally scrolled desktop table. Toolbar/actions wrap without a mobile hierarchy. |
| Updates Inbox | The list owns its internal vertical scroll, while the core surface uses its default overflow behavior. | Slate cards and controls predate the core palette. The sticky footer uses negative root-padding margins and needs an explicit non-overlapping grid row. |
| Auto Update | The core surface is the only bounding/scrolling mechanism. | The add-on root has no height bound or internal body scroller. With both disclosures open, content can make the core surface the scroll owner; under an add-on-owned hidden host it would clip. |

## CSS role inventory

- Manager has one responsive rule at 980px, a 1040px table minimum, fixed
  control minimums, sticky table headings, absolute bulk/export/status/row
  menus, and hover/focus tooltips. Copy controls become visible on hover/focus.
- Inbox has a 720px breakpoint, an internally overflowing list, and a sticky
  footer. Its cards and neutral controls use the older slate palette.
- Auto Update has a 620px two-column-to-one-column breakpoint. It has no
  `max-height`, `min-height: 0`, or overflow-owned body; native details include
  literal `>` direction text.

These are observations, not target behavior. Waves 2-7 replace the visual and
responsive contracts while preserving production actions and render paths.
