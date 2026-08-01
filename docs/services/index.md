# Services Overview (`src/services`)

Services are singletons that handle cross-cutting concerns—they sit below features and provide utilities that multiple features might need.

## Key Services

<!-- GENERATED:SERVICE-INVENTORY:START -->
- `addonsService.js` — `src/services/addonsService.js`
- `configChangeApplication.js` — `src/services/configChangeApplication.js`
- `configMigrationService.js` — `src/services/configMigrationService.js`
- `configTransfer/index.js` — `src/services/configTransfer/index.js`
- `notificationService.js` — `src/services/notificationService.js`
- `prefixService.js` — `src/services/prefixService.js`
- `safetyService.js` — `src/services/safetyService.js`
- `settingsService.js` — `src/services/settingsService.js`
- `storageAdapter.js` — `src/services/storageAdapter.js`
- `tagsService.js` — `src/services/tagsService.js`
<!-- GENERATED:SERVICE-INVENTORY:END -->

### `settingsService.js`
Owns configuration repository orchestration: canonical and backup reads/writes, strict commit
validation, tolerant load recovery, revisions, migration readiness, and the live-config commit
boundary for `src/config/state.js`. Core configuration synchronization is intentionally not
provided; add-ons own any cross-tab transport they require.

### `storageAdapter.js`
Provides raw storage I/O only. It does not know config defaults, schema validation, migration
orchestration, revisions, or effects.

### `configChangeApplication.js`
Applies committed and imported config changes through one shared metadata-driven effect pipeline.

### [configTransfer/index.js](config-transfer.md)
Owns the configuration transfer document format, schema-backed import validation, supported legacy-format normalization, read-only preview, and transactional import commits. Browser file selection, downloads, dialog rendering, and user-facing messages live in `src/ui/configTransfer/`.

### `configMigrationService.js`
Contains only the evidence-backed surface-key recovery list, transformations, source precedence,
and cache/core planning for migration generation 1. It is temporary compatibility code for released
surface-key installations; storage I/O and the transaction remain in `settingsService.js`. This is
not a schema migration step or a general future migration framework.

### `tagsService.js`
Responsible for asynchronous operations related to thread tags. Its private
Latest-catalog bridge reads tags and prefixes together through one bounded
page-world request when direct sandbox access is unavailable, then normalizes
and persists each catalog independently. A missing or malformed catalog does
not prevent the other valid catalog from updating.

### `prefixService.js`
Normalizes and persists the prefix catalog supplied by `tagsService.js`. It no
longer owns a second page bridge or independently reads `window.latestUpdates`.

### [addonsService.js](addonsService.md)
Provides an integration bridge for external userscripts (third-party addons). It exposes an API on the `window` object (or a safe proxy) allowing other scripts to register their own rules or modify Latest Highlighter's behavior safely.

### [Latest Overlay capture](fastCapture.md)
Private Latest Overlay infrastructure that captures the first bounded Latest XHR/fetch response before normal feature enable.

### `safetyService.js`
Validates configuration thresholds and sanitizes data to prevent malicious injections or corrupt state from crashing the script.

## Usage
Features and UI use the repository and shared application boundaries rather than writing storage
directly. Config Transfer follows the same split: its service is DOM-free, while
`src/ui/configTransfer/` handles file selection, dialogs, downloads, and presentation.
