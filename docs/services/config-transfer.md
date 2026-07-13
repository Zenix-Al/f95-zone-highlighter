# Configuration Transfer Service

`src/services/configTransferService.js` owns configuration export and import documents. It is deliberately independent of the DOM and uses the shared schema, migration, persistence, and config-change application boundaries.

## Export contract

`buildConfigExport()` constructs a document containing:

- `formatVersion` for the transfer-document format;
- `schemaVersion` for the configuration contract;
- `applicationVersion` when supplied by the userscript manager;
- `exportedAt`; and
- `settings`, whose keys are selected from schema metadata marked `exportable`.

Runtime metrics, add-on runtime state, and other non-exportable values are not included.

## Import contract

`previewConfigImport(input)` accepts a JSON string or parsed object. It validates the document shape, supported format/schema versions, exportable roots, and nested values through `CONFIG-01`. Supported legacy raw documents are normalized and migrated on clones. The result reports changed sections, changed paths, warnings, and reload metadata without storage, live-config, DOM, or effect changes.

`commitConfigImport(input)` previews first, then commits the complete candidate through `settingsService.commitConfig()`. The repository persists successfully before the shared config-change application pipeline updates live state. A failed persistence operation therefore leaves the live configuration and canonical envelope unchanged. Page reload is requested by the UI only when changed schema metadata explicitly requires it.

The feature adapter owns file selection, JSON text acquisition, downloads, dialog rendering, and toast/error presentation; it does not own transfer-format or persistence rules.
