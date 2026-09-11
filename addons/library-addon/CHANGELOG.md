# Changelog

## v1.3.2 - Responsive Library UI

- Aligned the Library Manager, Updates Inbox, and Auto Update dialog with the core Settings palette, controls, focus treatment, disabled states, and scrollbar styling.
- Kept the dense desktop Manager table while reflowing the same semantic rows into touch-friendly cards on mobile, with compact filters, reachable actions, stable pagination, and no document-level horizontal overflow down to 320px.
- Rebuilt the Updates Inbox around one bounded list scroller, direct safe thread links, responsive actions, and a footer that never obscures the final entry.
- Reworked Auto Update into a bounded dialog with one internal body scroller, responsive settings and activity sections, and live patches that preserve disclosure state, inputs, focus, and scroll position.
- Improved keyboard and touch access for menus, disclosures, notes, ratings, copy controls, selection, Full Edit stacking, and reduced-motion users.

## v1.3.1 - Import identity hardening

- Validated imported thread IDs and F95Zone thread URLs, rejecting malformed or mismatched identities before database writes.
- Kept malformed legacy rows visible but made their identity-bound links and actions inert instead of rendering unsafe attributes.
- Forwarded selected and filtered export scopes consistently through the manager API.

## v1.3.0 - Durable automatic updates and search fixes

- Replaced capped one-session updates with a durable IndexedDB queue that resumes after refresh, survives daily rollover, coordinates one worker across tabs, and recovers interrupted or retryable work.
- Added configurable checks per day, local scheduling, pause/resume, controlled extra batches, restart confirmation, live progress, bounded diagnostics, and safe legacy metadata/upgrade handling.
- Fixed advanced Library filters under every sort mode, including Title and Rating; added `rating>=4`, `public-rating>=4`, quoted values, `version:`, `prefix:`, `update:`, `check:`, and `has:progress` while retaining `score` as a personal-rating alias.
- Added `backlog` and `paused` status options and replaced the native search title tooltip with a visible hover/focus help panel.
- Improved dock mounting by retrying with a longer delay while waiting for slow core responses, so page controls mount reliably on slow connections.

## v1.2.2 - Update-check and dock reliability

- Improved dock mounting reliability when many tabs initialize at once by retrying until the core confirms the mount.
- Unified live and fetched thread-title parsing so automatic checks use the thread heading and exclude prefix, version, and developer labels.
- Fixed Retry failed now incorrectly moving the next scheduled automatic-update time.
- Limited update and activity history to the newest 20 entries per thread, including imported history, to prevent false detections from bloating the database.

## v1.2.1 - Dialog layout fixes

- Fixed Library Manager horizontal/vertical overflow and removed the unusable blank area exposed by the updated core dialog host.
- Fixed Full Edit and automatic-update settings sizing so each dialog owns its intended scroll area and action layout.

## v1.2.0 - Update inbox and bugfix

- Added a durable Updates inbox with an exact manager count, bounded newest-first pages, per-entry Edit and Acknowledge actions, and bounded Acknowledge all.
- Added one immediate in-memory update-detected toast per page session across manual, automatic, and opportunistic checks.
- Repaired Full Edit acknowledgement and played-version actions so canonical records, drafts, dialog identity, and stale-completion guards remain consistent.

## v1.1.0 - Personal Library and automatic updates

- Added automatic and manual update checks with configurable pacing, retry controls, live progress, and clear current/changed/failed states.
- Added personal ratings, played versions, progress notes, activity history, and per-thread version history to the themed Full Edit dialog.
- Added background thread observation while preserving personal fields, tags, prefixes, and other existing metadata.
- Improved the manager with keyset pagination, compact rows and controls, accurate page totals, and pinned entries ordered first.
- Added personal-status and new-version chips beside saved thread titles, backed by a bounded short-lived record cache.
- Upgraded Library exports with update and activity history while retaining compatibility with older imports.
- Coordinate background checks safely across tabs and prevent stale, duplicate, or interrupted work from committing.
- Fixed large update selections, failed-check retries, logged-out response detection, empty editor dates, and database marker writes.
- Safely upgrade released and development Library data to the new personal-library and pin-ordering schema.

## v1.0.1 - Restore manager reopening

- Fixed the Library dock button failing to reopen the manager after it was closed.
- Keep one lifecycle owner for the manager instead of replacing it and immediately invoking stale dialog cleanup.

## v1.0.0 - Canonical runtime ownership

- Moved registration, lifecycle, dock, manager, and cancellation ownership behind the canonical app/API/adaptor boundaries.
- Preserved the site-wide F95Zone scope and existing Library database, storage, legacy-record, and import/export contracts.
- Prevented disabled or superseded imports and manager work from committing late UI updates.

Note : require core v5.2.0 or above

## v0.3.52 - Improve UI lifecycle

- addon now retry when fail to attach ui.

## v0.3.51 - Improve UI lifecycle

- ui.close now wait core response for successful close.

## v0.3.50 - Import update and maintain codebase

- Updated the import process to use the new core import API which provides better feedback and error handling during import.
- Updated import flow to more robustly handle large imports, now importing is 100x faster and more reliable.
- Refactored the codebase to improve maintainability and readability, including better separation of concerns and more consistent coding style.

Note : core v4.19.18 or above Might be required for the new import API, but the old import method is still supported as a fallback.

## v0.3.44 - Import fix

- Fixed an issue with import function where not all threads were being imported due to throttle core api. Now added a delay ensure the core did not throttle the import process.
- Added an import dialog during importing to provide feedback and prevent user from closing the page during the import process.

## v0.3.36 - Inline Editing Refactor

- Removed the Details Editor panel and moved editing directly into the table.
- Change status in-place from the Status chip dropdown.
- Edit notes inline with auto-save (debounced) to keep things fast.
- Added a compact row actions menu (⋮) with Update (when on the same thread) and Remove.
- Developer chip now supports quick copy.

## v0.3.30 - hotfix

- Fix the get prefix function failed to recognize some prefixes such as Java.

## v0.3.28 - Thread Metadata + Better Table UI

- Fixed thread title parsing so the saved title no longer includes prefix labels (e.g. "RPGM", "Completed").
- Added Prefixes, Version, and Developer columns, rendered as compact chips for easier scanning.
- Tags are now rendered as chips and respect your core tag preferences/colors (preferred / excluded / marked).
- Added a Note column with a short preview + hover to read the full note.
- Added an Update button in the page dock so you can refresh a saved thread from the thread page without opening the manager.

Note : core v4.18.5 or above required for tag color support

## v0.3.10 - Toast and UI Improvements

- using createEl to create ui elements for better consistency and future maintainability.
- centralized toast calls and removal of redundant addon created showToast function in favor of core toast action for better consistency and styling across the UI.

## v0.2.2 - tinyupdate

- use `ui.confirm` from core instead of `window.confirm` for consistent dialog styling and behavior.

Note : core v4.17.0 or above required

## v0.2.1 - Core Add-on API Update

- Migrated dock and quick-action button rendering to core mount API (`ui.mount`); core now owns the DOM lifecycle.
- Migrated all inline style injection to core CSS registry (`ui.style.register` / `ui.style.unregister`).
- Library Manager dialog is now opened and closed via core dialog host; ESC, backdrop click, and focus trap are core-managed.
- Fixed dock button click detection using `event.composedPath()` to cross shadow DOM boundaries reliably.
- Prevented stale disable teardown from destroying a re-enabled add-on (core `cancelTeardown` race fix).
- Library dataset remains exclusively in IndexedDB; no library records are written to core config storage.
- Add-on disable/enable lifecycle no longer unbinds the command listener, keeping the add-on responsive after re-enable without a page reload.

## v0.1.0 - Initial Release

- First public add-on release.
- Adds thread library system with quick save and remove actions.
- Adds dedicated Library Manager modal for browsing and editing entries.
- Supports status, note, score, pinned state, tags, and version metadata.
- Adds import or export JSON flow for backup and migration.
- Supports bulk actions and advanced search filters in manager UI.
- Integrates with core add-on panel and page dock controls.
