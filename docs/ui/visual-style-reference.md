# Core UI Visual Style Reference

This is the visual source of truth for new core UI and add-on UI. It is derived
from the core Settings surfaces in `src/ui/assets/css.css`; screenshots are useful
for comparison, but CSS is authoritative.

The goal is visual continuity, not forcing every component into identical
markup. Reuse this hierarchy before introducing another dark gray or border.

## Canonical palette

| Role | Value | Typical use |
| --- | --- | --- |
| Modal surface | `#191b1e` | Main modal and dialog background |
| Sidebar surface | `#141619` | Navigation/sidebar background |
| Recessed surface | `#17191d` | Cards and empty states |
| Control surface | `#222` | Inputs, textareas, and selects |
| Raised control | `#20242a` | Secondary buttons and neutral badges |
| Raised row | `#26292e` | Reorder rows or similarly elevated items |
| Strong border | `#3f4043` | Modal panels and important boundaries |
| Control border | `#555` | Form controls |
| Subtle border | `#31343a` | Cards and internal grouping |
| Divider | `#2b2e33` | Sidebar and section separators |
| Primary text | `#f0f2f6` | Titles and prominent labels |
| Normal text | `#c5c9d0` | Navigation and ordinary UI copy |
| Secondary text | `#b0b3b8` | Supporting labels and subdued controls |
| Muted text | `#8f959e` | Group labels and low-priority metadata |
| Accent | `#893839` | Primary actions and selected states |
| Accent hover | `#b94f4f` | Primary-action hover |
| Accent active | `#6e2b2b` | Primary-action pressed state |
| Focus accent | `#c15858` | Focus borders and checkbox accent |
| Backdrop | `rgba(0, 0, 0, 0.6)` | Core modal backdrop |

Near-equivalent text colors already used by specialized core components may
remain, but new UI should start with the roles above instead of inventing a new
palette.

## Surface hierarchy

Use surfaces in this order:

1. Backdrop: darkens the page and owns pointer blocking.
2. Modal: `#191b1e` with a `#3f4043` border and 10px radius.
3. Sidebar: `#141619`, separated by `#2b2e33`.
4. Cards/groups: `#17191d` with `#31343a` borders.
5. Inputs: `#222` with `#555` borders.
6. Secondary actions: `#20242a` with a restrained gray border.

Avoid placing a lighter blue/slate full-size surface inside a core modal. It
makes an add-on appear detached from Settings even when spacing and typography
are otherwise correct.

## Controls and interaction

- Primary actions use `#893839`, white text, and `#b94f4f` on hover.
- Neutral actions use `#20242a`; they may become accent-colored on hover.
- Inputs use `#222` and `#555`, with `#c15858` for focus.
- Checkboxes and radios use `accent-color: #c15858`.
- Disabled controls retain their role colors at reduced opacity and must not
  acquire hover styling.
- Focus must remain visibly distinct; color alignment is not permission to
  remove focus indication.

Semantic success, warning, error, running, and disabled colors should reuse the
existing add-on badge/status rules in `src/ui/assets/css.css`. They communicate
state and are not substitutes for ordinary surface colors.

## Add-on dialogs

Add-on dialogs are rendered through a core-owned host but their content CSS may
live in the page document. Shadow DOM boundaries therefore prevent add-ons from
assuming that core selectors or inherited colors will reach their content.

An add-on should explicitly style its content using this reference, while
keeping every selector scoped to its core-owned add-on root. It should not copy
page/XenForo colors or depend on accidental inheritance.

The default marked-tag color is `#4a4f55` with white text. The separate
`--neutral-color` fallback used by document styling is `#37383a`; do not confuse
that fallback with the persisted marked-tag default.

The current host implementation in `src/ui/components/addons/addonDialog.js`
uses `#1f2329` with a `#454b55` border. Those values explain the cooler,
blue/slate appearance visible in Library dialogs. They are current implementation
defaults, not the canonical palette for new UI. Use the Settings values above
when designing or normalizing add-on content.

## Review checklist

- Compare the UI beside core Settings, not in isolation.
- Verify modal, sidebar, card, input, divider, and action roles separately.
- Check hover, active, focus, disabled, and semantic states.
- Check the actual host boundary: Shadow DOM, add-on dialog, or page mount.
- Keep scrolling and z-index ownership independent from color styling.
- If a new color is necessary, document its semantic role instead of adding an
  unexplained near-duplicate gray.
