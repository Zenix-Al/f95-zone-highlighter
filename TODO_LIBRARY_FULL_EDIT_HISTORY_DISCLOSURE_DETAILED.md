# Library Full Edit History Disclosure and Action Contrast

## Goal

Keep the Full Edit dialog compact and readable for records with long update and
activity histories, while ensuring its actionable controls—especially **Played
this version**—visually read as enabled actions rather than disabled gray bars.

## Known constraints

- `Recent updates` and `Recent activity` are independent histories.
- Each history is intentionally capped at 20 entries per thread.
- A record can therefore render up to 40 chronological rows before its editable
  fields and actions, making the Full Edit dialog unnecessarily tall and
  pushing primary actions out of immediate view.
- The current gray treatment of **Played this version** looks disabled despite
  being actionable. Disabled appearance must remain reserved for controls that
  are actually disabled.

## Fixed decisions

- Do not change the 20-entry per-history retention limit, event schema,
  ordering, or import/export behavior.
- Keep updates and activity as separate sections; do not merge their event
  models or imply that acknowledgement and played-version activity are the same
  state.
- Both history sections must be collapsible independently.
- Histories should be collapsed by default when they contain entries, with a
  clear count in the disclosure label, such as `Recent updates (20)`.
- A section with no entries may remain hidden or render a compact empty-state;
  it must not occupy a large blank region.
- Disclosure state is view-only and session-local. It must not write to the
  Library record or change history contents.
- Interactive controls use the established enabled button palette. A gray
  style is permitted only for a semantic secondary action if it retains clear
  enabled affordance, hover/focus feedback, and accessible contrast; it must
  not resemble `:disabled`.

## Desired Full Edit layout

```text
Thread summary cards
Personal fields and actionable controls
Recent updates (N)       [collapsed by default]
Recent activity (N)      [collapsed by default]
```

Expanding one section reveals its bounded list inside the dialog's intended
scroll region. It must not cause page-level scrolling, obscure the action
controls, or make the dialog wider than its host.

## Implementation waves

### Wave 1 — Baseline and semantics [x]

- Locate the Full Edit renderer/controller, history list rendering, and button
  style ownership.
- Add a fixture with 20 update events and 20 activity events, including a
  played-current-version state where **Played this version** is enabled.
- Record the current desktop and narrow-mobile geometry, initial scroll
  position, section order, action state, computed button colors, and focus
  sequence.
- Confirm the actual disabled conditions for acknowledgement and
  played-version actions so the visual change does not mask a real guard.

### Wave 2 — Collapsible histories [x]

- Replace always-expanded history blocks with accessible independent
  disclosures (native `<details>` where compatible with the dialog host, or an
  equivalent button plus controlled region).
- Include the bounded entry count in each summary and preserve newest-first
  ordering when expanded.
- Give the summary a visible expanded/collapsed affordance, keyboard support,
  and an accessible relationship to its controlled list.
- Keep at least the thread summary and relevant action controls visible before
  either history is expanded.
- Preserve disclosure state while the same Full Edit dialog rerenders due to a
  successful action; reset it only when opening a different thread or closing
  the dialog.

### Wave 3 — Button hierarchy and contrast [x]

- Give **Played this version** a clearly enabled visual treatment consistent
  with the Library dialog's primary/secondary action hierarchy.
- Preserve a visibly distinct disabled style only when the control's actual
  `disabled` condition is true.
- Verify hover, focus-visible, keyboard activation, and loading/in-flight
  state do not make an enabled action look inert.
- Do not change acknowledgement/played-version semantics, command IDs, or
  activity writes as part of this visual work.

### Wave 4 — Playwright visual and interaction verification [x]

Use Playwright as required release evidence; unit tests alone are insufficient
for this layout and contrast change.

- Add or extend a stable Full Edit browser fixture with 20 updates and 20
  activity entries.
- Capture desktop and narrow-mobile screenshots for:
  - initial collapsed state;
  - updates expanded;
  - activity expanded;
  - both sections expanded;
  - enabled **Played this version**;
  - genuinely disabled action state.
- Assert no document-level horizontal overflow, no clipped summaries, no
  action covered by history content, and no duplicate disclosure controls
  after dialog refresh/reopen.
- Assert keyboard focus can reach, toggle, and leave each disclosure and can
  activate the enabled Played action.
- Use computed-style assertions or screenshot baselines to prove enabled and
  disabled button states are visually distinguishable in the shipped theme.
- Run the relevant Playwright project(s) locally before release and retain
  screenshots/traces only according to the repository's visual-test policy.

## Acceptance criteria

1. A 20-update + 20-activity record opens compactly with both histories
   collapsed and actions immediately reachable.
2. Each history can be expanded or collapsed independently without changing
   stored data, event order, counts, or the other section's state.
3. Dialog rerenders for the same thread retain disclosure state without
   duplicate listeners or rows.
4. The dialog remains contained in its intended internal scroll area at desktop
   and narrow-mobile widths.
5. **Played this version** is unmistakably enabled when actionable and visibly
   disabled only when its real guard applies.
6. Playwright covers the maximum-history fixture, disclosure interaction,
   enabled/disabled button contrast, and responsive screenshots.
