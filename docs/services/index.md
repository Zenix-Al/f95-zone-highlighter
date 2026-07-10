# Services Overview (`src/services`)

Services are singletons that handle cross-cutting concerns—they sit below features and provide utilities that multiple features might need.

## Key Services

### `settingsService.js`
Handles reading and writing the userscript configuration to/from local storage or `GM_setValue`/`GM_getValue`. It ensures that `src/config.js` is always kept in sync with persisted data.

### `tagsService.js`
Responsible for asynchronous operations related to thread tags. It fetches, parses, and caches tag data so that features (like `latest-overlay`) can quickly look up whether a thread is "Completed", "On Hold", etc.

### [addonsService.js](addonsService.md)
Provides an integration bridge for external userscripts (third-party addons). It exposes an API on the `window` object (or a safe proxy) allowing other scripts to register their own rules or modify Latest Highlighter's behavior safely.

### `safetyService.js`
Validates configuration thresholds and sanitizes data to prevent malicious injections or corrupt state from crashing the script.

### `metricsService.js`
A lightweight tracker for feature performance and usage (usually tied into `featureHealth.js`).

## Usage
Features can import services directly. For example, a feature might call `saveConfigKeys()` from `settingsService.js` when the user clicks a custom UI button.
