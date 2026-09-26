# Library State and Thread Context Baseline

Wave 1 records the pre-change state for the Library consistency work. It is a
source-only baseline; no records, IndexedDB schema, or generated userscripts
are changed by this wave.

## Status write-path inventory

| Surface | Current caller | Persistence path | Activity event |
| --- | --- | --- | --- |
| Manager inline status | `ui/manager/handlers/statusHandlers.js` | `applyPersonalActivity` | Yes |
| Manager bulk status | `ui/manager/handlers/bulkHandlers.js` | `bulkUpdateStatus` then `applyPersonalActivity` | Yes |
| Full Edit | `ui/entryEditor/editorController.js` | `applyPersonalActivity` | Yes |
| Direct service patch | `library/service.js` `patchEntry` | `putEntry(mergePersonalState(...))` | No |
| Thread-page dock refresh | `app/dockController.js` | `patchEntry` with thread facts only | Not applicable |

Other personal writes are deliberately non-status edits: Manager note and pin
actions use `patchEntry`; Manager rating and the editor's Mark Played action
use `applyPersonalActivity`. `observeThreadFacts` owns thread-fact changes.

The known mismatch is therefore limited to the public service escape hatch:
`patchEntry({ status })` can change `personal.status` without creating the
`status-change` event and timestamp behavior that Full Edit and Manager status
controls use. Wave 2 closes that bypass; Wave 3 then routes and refreshes all
status surfaces through the resulting canonical command.

## Title-chip baseline

`getThreadTitleChips` currently renders chips only for `playing`, `completed`,
and `dropped`. Saved, backlog, and paused records have no status chip. The
function also renders `new-version` when the normalized current and played
versions differ, and `updates-off` when automatic checks are disabled.

There is no distinct unacknowledged-update title indicator. Consequently the
four acknowledgement/play combinations cannot currently be expressed without
overloading `new-version`; Wave 5 will give them separate selectors and UI
roles.

## Manager ordering baseline

Manager row rendering accepts a `liveThreadId` state value for row decoration,
but it does not use it to alter presentation order. Query ordering is based on
the selected sort with pinned rank, pagination, and filters; a saved current
thread can therefore appear on a later page. Wave 6 will introduce a transient
first-page presentation priority without changing persisted ordering, filters,
or exports.
