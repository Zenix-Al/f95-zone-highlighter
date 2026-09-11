# Library UI Alignment and Responsive Rework

This plan reworks the Library Manager, Updates Inbox, and Auto Update dialog
against the canonical core Settings UI while making each view usable on narrow
and touch-oriented screens.

The work must preserve Library records, IndexedDB schemas, update queue
semantics, search syntax, pagination, selection, acknowledgement, import/export,
and scheduler behavior.

## Scope and fixed decisions

- The core add-on dialog remains the viewport owner. All three views continue
  using `scrollMode: "addon"` and expose one intended primary scrolling region.
- Desktop keeps the information-dense manager table.
- Mobile reflows the same semantic table rows into record cards. It does not
  introduce a second renderer or event path.
- Responsive labels come from explicit cell metadata emitted by the renderer;
  CSS must not hardcode positional labels that can drift with column changes.
- UI roles follow `docs/ui/visual-style-reference.md`.
- Existing delegated actions and stable `data-*` hooks remain authoritative.
- Mobile interactions cannot depend solely on hover.
- Library links and selection controls are add-on-owned UI. Their color, focus,
  checked, disabled, and visited states must not depend on F95Zone document CSS.
- Record titles remain visible, recognizable as links, and keyboard/touch
  reachable at every supported width.
- Full Edit, import progress, and confirmation dialogs are compatibility
  consumers, not redesign targets. Their stacking and sizing are still checked.
- No release build or version bump occurs until explicitly requested.

## Completion invariants

1. No document-level horizontal overflow at desktop, tablet, or mobile widths.
2. The core surface and content host do not become scroll owners.
3. Each view has one bounded primary scroller; fixed actions cover no content.
4. Manager rows remain tables on desktop and readable cards on mobile without
   duplicated data or event handlers.
5. Search, filters, selection, bulk operations, row edits, pagination, Inbox
   actions, and update controls remain reachable at 390px.
6. Live Auto Update patches preserve disclosure state, focus, inputs, and scroll.
7. Empty, loading, error, disabled, busy, and populated states remain legible.

## Wave 1 — Rendered baseline and responsive role inventory

### [x] LIBRARY-UI-BASELINE-01

- Add Playwright fixtures using production Manager, Inbox, and Auto Update
  markup/renderers with production scoped CSS.
- Use `docs/references/rendered-library.html` as current Manager browser
  evidence while keeping generated distributions out of the fixture.
- Capture populated and empty desktop, tablet, and 390px screenshots.
- Record computed surfaces, controls, cards, footers, and scrollbar owners.
- Measure document/dialog overflow, inner bounds, footer overlap, toolbar height,
  actionable widths, and representative row heights.
- Inventory hover-only, absolute, sticky, fixed-width, and minimum-width rules.

Checkpoint: the baseline reproduces the wide table, wrapping toolbars, older
Inbox styling, and Auto Update overflow risk without mutating Library data.

## Wave 2 — Shared Library visual foundation

### [x] LIBRARY-UI-FOUNDATION-01

- Normalize all three roots to core surface, card, control, divider, text,
  accent, focus, disabled, warning, and destructive roles.
- Establish shared density without introducing a broad CSS abstraction that
  couples unrelated markup or increases output.
- Normalize `box-sizing`, zeroable flex/grid minimums, focus visibility,
  scrollbar colors, and reduced motion.
- Remove slate/blue surfaces where they do not communicate semantic status.
- Keep every selector root-scoped and sanitizer-compatible.

Checkpoint: all views visually belong to core Settings while retaining their
distinct information hierarchy.

## Wave 3 — Manager desktop structure and density

### [x] LIBRARY-UI-MANAGER-DESKTOP-01

- Organize the header, search/filter toolbar, actions, table, and pagination into
  explicit non-scrolling and scrolling regions.
- Keep search dominant and group status, sort, and page-size consistently.
- Keep common actions visible; retain compact disclosures for secondary bulk,
  import, and export actions without changing action IDs.
- Reduce avoidable space while preserving sticky headings and table density.
- Verify every column against long, missing, and high-chip-count values.

Checkpoint: desktop remains dense, has no host scrollbar, and hides no controls
behind the table.

## Wave 4 — Manager mobile record cards

### [x] LIBRARY-UI-MANAGER-MOBILE-01

- Add stable `data-label`/role metadata to cells and retain one table DOM.
- At the mobile breakpoint, hide the visual header and reflow rows into compact
  cards with a deliberate title, selection, status, rating, update, metadata,
  note, and action reading order.
- Remove the `1040px` mobile minimum and prevent horizontal page/dialog scroll.
- Bound long titles, developers, versions, tags, and notes without making
  critical values hover-only.
- Keep the title link in the card's primary row; never replace, truncate away,
  or hide the only direct route to the thread.
- Give checkboxes an explicit core-aligned `accent-color`, dimensions, focus
  treatment, and disabled state so standalone fixtures match the on-site view.
- Make pagination and page count usable at 390px.
- Treat 320px as a defensive lower bound, not the primary design width.

Checkpoint: every record and action works at 390px without a second renderer,
missing field, or horizontal scrollbar.

## Wave 5 — Manager responsive interactions

### [x] LIBRARY-UI-MANAGER-INTERACTIONS-01

- Make status/row menus, bulk/export disclosures, search help, chip expansion,
  note editing, and copy actions usable by keyboard and touch.
- Prevent transient UI from clipping inside the manager scroller or opening
  outside the mobile viewport.
- Preserve close state through rerenders, pagination, and filtering.
- Verify rating/note edits, cross-page selection, manual update status,
  cancellation, empty results, and errors without layout jumps.
- Confirm Full Edit and confirmation dialogs stack above Manager and return
  focus without changing Manager scroll state.
- At narrow widths, keep search as the full-width primary control. Put status,
  sort, and page size in one compact native `details` filter disclosure with a
  visible active-filter summary; do not hide or duplicate the existing fields.
- Keep the most frequent actions directly reachable and move secondary bulk,
  import, and export commands into one clearly labelled overflow disclosure.
  Do not use icon-only controls where their meaning would be ambiguous.

Checkpoint: no Manager capability requires hover or an off-screen control.

## Wave 6 — Updates Inbox alignment and mobile layout

### [x] LIBRARY-UI-INBOX-01

- Align Inbox surfaces, cards, metadata, controls, status, empty state, and
  footer with core roles.
- Replace sticky negative-margin footer behavior with a fixed grid row outside
  the bounded list.
- Compact desktop entries and reflow mobile actions predictably.
- Render every Inbox title as a direct thread link using the canonical stored
  thread URL/ID, opening in a new tab with safe link attributes so the Inbox
  can remain open. Missing or malformed identities remain inert text.
- Style Inbox title links locally, including visited, hover, and focus-visible
  states; do not inherit the site's anchor color or require site CSS.
- Preserve Load more, Edit, Acknowledge, Acknowledge all, busy state, exact
  count, and live status behavior.
- Verify long values, locale dates, empty/loading states, 25-row pages, and
  editor stacking at desktop and mobile widths.

Checkpoint: only the list scrolls, its final card is reachable, and the footer
never covers entries.

## Wave 7 — Auto Update alignment and mobile layout

### [x] LIBRARY-UI-AUTO-UPDATE-01

- Give Auto Update a bounded grid/flex shell with one scrolling body and an
  action row outside it.
- Rework overview, progress, counters, activity, details, and settings into a
  compact hierarchy.
- Replace literal disclosure direction text with accessible CSS markers while
  preserving native `details` state.
- Keep numeric fields compact on desktop and single-column where needed mobile.
- Preserve all state-derived actions, pause, confirmations, diagnostics,
  restart, save, recovery waiting, and live patch contracts.
- Assert patches do not close disclosures, replace inputs, move focus, reset
  scroll, or require reopening.

Checkpoint: both expanded sections remain usable at 390px and only the intended
body scrolls.

## Wave 8 — Cross-view responsive verification

### [x] LIBRARY-UI-RESPONSIVE-VERIFY-01

- Run Library/add-on lint, full tests, sanitizer checks, deterministic audits,
  inventory, and diff checks.
- Run Playwright at desktop, tablet, 390px, and defensive 320px widths.
- Exercise open/close/reopen, all data states, menus, disclosures, selection,
  pagination, stacking, Inbox actions, and every Auto Update primary state.
- Assert one scroll owner, no overlap or document horizontal overflow, bounded
  transient UI, visible focus, and practical tap targets.
- Review screenshots beside core Settings and record intentional Library density
  differences instead of disguising palette drift.
- Refresh evidence only after production source is final.
- Prepare a compact changelog only when release is requested; do not build or
  bump versions in this package.

Final gate: automated checks and Playwright evidence pass, then browser smoke
testing confirms all three views, Full Edit stacking, and core/add-on scrolling
on desktop and mobile.
