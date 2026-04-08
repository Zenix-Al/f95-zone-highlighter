# Changelog

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
