# Library Full Edit history and action baseline

Wave 1 of `TODO_LIBRARY_FULL_EDIT_HISTORY_DISCLOSURE_DETAILED.md` records the
current Full Edit behavior before disclosure or button styling changes. The
browser fixture contains 20 update events and 20 activity events for one
thread. Its current version is `v0.9.9`, its last played version is `v0.9.8`,
and its update state is `changed`, so both history actions are available.

## Ownership and current order

- `src/ui/entryEditor/editorRenderer.js` renders both history lists and the
  Acknowledge and Played buttons.
- `src/ui/entryEditor/editorController.js` loads each history with a 20-event
  limit and rerenders the dialog after a successful action.
- `src/ui/entryEditor/editorBindings.js` handles button clicks. It temporarily
  disables Played during its async request.
- `src/ui/entryEditor/editor.css` owns the Full Edit surface, fields, and
  Cancel/Save styles. It has no rule for Acknowledge or Played; they inherit
  the host/browser button appearance.

Current reading and DOM order: thread title and facts, Acknowledge, all recent
updates, Played, all recent activity, personal fields, validation message,
Cancel, Save. Neither history is collapsible. Keyboard focus starts at
Acknowledge, then Played, Status, Rating, Last played version, and the date
fields. Chromium's segmented date inputs consume several Tab presses each.

## Measured Chromium geometry

The Playwright fixture uses the production renderer and stylesheet in a core
dialog shell. Values are pixels at initial `scrollTop: 0`. The editor is its
own vertical scroller; the document has no horizontal overflow in these runs.

| Viewport | Visible editor height | Editor scroll height | Updates list height | Activity list height | Fields start Y | Save start Y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1280 × 800 | 678 | 1579 | 296 | 296 | 881 | 1554 |
| 390 × 844 | 722 | 1983 | 296 | 296 | 999 | 1962 |
| 320 × 720 | 598 | 2565 | 576 | 576 | 1581 | 2544 |

Both histories wrap much more at 320 px, increasing the distance to the
editable fields and Save button. At all three sizes, the dialog opens at the
top and Save begins below the visible editor region.

## Button semantics and computed colors

The renderer emits Acknowledge only when `hasUnacknowledgedUpdate(record)` is
true, which currently means `record.updateState === "changed"`. It emits
Played only when `hasUnplayedCurrentVersion(record)` is true: both normalized
versions exist and differ. An equal version, including a leading-`v`
formatting difference, or a missing version removes Played from the markup.
The Played click handler sets `disabled = true` while its async action is in
flight and restores it if that action fails while the button remains mounted.
Acknowledge currently has no matching in-flight disable in its click handler.

In the baseline fixture both actions have `disabled === false` yet both
compute to gray `rgb(107, 107, 107)` backgrounds with white text and borders.
Cancel computes to `rgb(36, 39, 44)` with a `rgb(76, 80, 88)` border; Save
uses `rgb(137, 56, 57)` with a `rgb(164, 71, 72)` border. The gray action
appearance is therefore unrelated to an actual disabled state.

## Reproduction

Run `npx playwright test tests/visual/library-full-edit-baseline.visual.cjs`.
Each of the three tests attaches a geometry/style JSON report and screenshot
to the Playwright HTML report. The fixture lives in
`tests/fixtures/libraryFullEditMaxHistory.cjs`; future visual tests can reuse
the same maximum-history record and events.
