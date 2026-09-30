# Configuration Transfer Service

`src/services/configTransfer/` owns configuration export and import documents. It is deliberately independent of the DOM and uses the shared schema, persistence, and config-change application boundaries.

## Export contract

`buildConfigExport()` constructs a document containing:

- `formatVersion` for the transfer-document format;
- `schemaVersion` for the configuration contract;
- `applicationVersion` when supplied by the userscript manager;
- `exportedAt`; and
- `settings`, whose keys are selected from schema metadata marked `exportable`.

Runtime-only state, add-on runtime state, and other non-exportable values are not included.

## Import contract

`previewConfigImport(input)` accepts a JSON string or parsed object. It validates the document shape, supported format/schema versions, exportable roots, and nested values through `CONFIG-01`. The one supported legacy transfer format is normalized on a clone; this is transfer-document compatibility, not persisted-storage migration. The result reports changed sections, changed paths, warnings, and reload metadata without storage, live-config, DOM, or effect changes.

`commitConfigImport(input)` previews first, then applies changed sections through `settingsService.updateConfig()`. The repository persists successfully before the shared config-change application pipeline updates live state. A failed persistence operation leaves the live configuration and canonical envelope unchanged. The UI reloads the page after every successful file import so settings and tag-dependent views initialize from the committed state; failed or cancelled imports do not reload. The preview's `reloadRequired` metadata remains available to service callers.

Imported tag catalogs are written to the separate tag cache before the canonical envelope is committed; a failed commit attempts to restore the previous cache and reports any rollback failure. Reload reads that cache, so an import must not report success while leaving it stale. If the Latest catalog is unavailable, tag-list cleanup keeps existing preferred, excluded, and marked IDs instead of treating an empty catalog as proof they are invalid.

`src/ui/configTransfer/` owns file selection, JSON text acquisition, downloads, dialog rendering, and toast/error presentation; it does not own transfer-format or persistence rules.
