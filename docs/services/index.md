# Services Overview (`src/services`)

Services are singletons that handle cross-cutting concerns—they sit below features and provide utilities that multiple features might need.

## Key Services

<!-- GENERATED:SERVICE-INVENTORY:START -->
- `addonsService.js` — `src/services/addonsService.js`
- `configChangeApplication.js` — `src/services/configChangeApplication.js`
- `configMigrationService.js` — `src/services/configMigrationService.js`
- `configTransferService.js` — `src/services/configTransferService.js`
- `metricsService.js` — `src/services/metricsService.js`
- `notificationService.js` — `src/services/notificationService.js`
- `prefixService.js` — `src/services/prefixService.js`
- `safetyService.js` — `src/services/safetyService.js`
- `settingsService.js` — `src/services/settingsService.js`
- `storageAdapter.js` — `src/services/storageAdapter.js`
- `syncService.js` — `src/services/syncService.js`
- `tagsService.js` — `src/services/tagsService.js`
<!-- GENERATED:SERVICE-INVENTORY:END -->

### `settingsService.js`
Handles reading and writing the userscript configuration to/from local storage or `GM_setValue`/`GM_getValue`. It ensures that `src/config.js` is always kept in sync with persisted data.

### `tagsService.js`
Responsible for asynchronous operations related to thread tags. It fetches, parses, and caches tag data so that features (like `latest-overlay`) can quickly look up whether a thread is "Completed", "On Hold", etc.

### [addonsService.js](addonsService.md)
Provides an integration bridge for external userscripts (third-party addons). It exposes an API on the `window` object (or a safe proxy) allowing other scripts to register their own rules or modify Latest Highlighter's behavior safely.

### [fastCapture](fastCapture.md)
Intercepts and caches XHR/Fetch network responses early in the page load lifecycle before features are fully enabled, reducing redundant network requests.

### `safetyService.js`
Validates configuration thresholds and sanitizes data to prevent malicious injections or corrupt state from crashing the script.

### `metricsService.js`
A lightweight tracker for feature performance and usage (usually tied into `featureHealth.js`).

## Usage
Features can import services directly. For example, a feature might call `saveConfigKeys()` from `settingsService.js` when the user clicks a custom UI button.
