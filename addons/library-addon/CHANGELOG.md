# Changelog

## v1.1.0 - Personal Library and automatic updates

- Added default-on, bounded automatic update checks with per-record and bulk controls, configurable pacing/budgets, silent manager summaries, semantic row states, and retry-failed-now.
- Coordinate automatic checks across tabs through verified IndexedDB TTL leases and per-thread claims, with session/day caps, exponential failure backoff, and cancellation before stale requests can commit.
- Added bounded manual update checks for selected entries and individual rows, with authenticated same-origin HTML requests, deterministic version parsing, background commits, cancellation, retry classification, and persisted check results.
- Keep update checks sequential by default, cap response and batch sizes, preserve personal activity, and never retry authentication/challenge responses or HTTP 403/429.
- Fixed large selections stopping at the core concurrency limit, explicit failed retries respecting stale backoff/session limits, and update progress not refreshing while requests were active.
- Preserve tags, prefixes, and other existing thread metadata when update responses provide only title, version, status, and URL.
- Added a Library-themed Auto Update dialog through the core dialog API, live per-record progress, and background manual checks that continue when the manager is closed.
- Detect F95Zone's confirmed logged-out response messages without rejecting authenticated pages that contain ordinary login links or modal markup.
- Versioned Library exports as document version 2 with canonical records, update history, and personal activity while retaining array and version-1 import compatibility.
- Validate every imported section before writing, preserve existing immutable history on ID collisions, reject record summaries older than their imported history, and report cancellation or partial multi-store commits explicitly.
- Added cancellable opportunistic observation for already-saved thread visits, with unchanged visits remaining write-free and stale routes unable to commit.
- Surface changed/current update state in the manager and Full Edit without fetching any background page.
- Added explicit played-version, status, rating, and progress-note activity events with bounded personal timelines in Full Edit.
- Derive personal activity dates only from user actions, deduplicate repeated command IDs, and cancel or roll back stale event/summary commits.
- Added deterministic per-thread update history, real version-change detection, update acknowledgement, and recent history in Full Edit.
- Preserve personal status and last-played version during thread observations, ignore empty/equivalent versions, and roll back new history events if the record commit fails.
- Added bounded keyset pagination for the default Updated sort so the manager no longer reads the complete Library for each page.
- Detect incomplete indexes from legacy records and retain working compatibility pagination without rewriting stored data.
- Restored exact page totals where available, compacted table rows, showed date-only update values with full timestamps on hover, and corrected the Bulk actions menu direction.
- Preserved deterministic Previous navigation and reset pagination when search, filters, sorting, or page size changes.
- Consolidated bulk actions and import/export controls into one compact toolbar and moved loading feedback there with a stable spinner.
- Added the themed Full Edit dialog, editable personal ratings, and the version-5 personal-library record model.
- Made pinned records visibly identifiable and consistently ordered above unpinned records, with a safe one-time database/index backfill for released and development data.
- Fixed empty editor dates rendering as 1970 and fixed Library database schema-marker writes against inline-key stores.
- Kept Title and My Rating sorting on the compatibility path until a future database version can index every record without omitting unrated entries.

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
