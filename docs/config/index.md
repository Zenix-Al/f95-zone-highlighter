# Configuration Overview (`src/config`)

The `config` directory is responsible for the baseline settings, state schemas, and static definitions (like CSS selectors or route definitions) that the rest of the application relies on.

## Key Files

### `defaults.js`
Contains the default configurations for the userscript. When the script boots up, it merges the user's saved settings (from local storage) with these defaults. If you add a new toggleable feature, you **must** add its default state here.

### `state.js`
Defines the initial structure of the global state (used by `StateManager.js`). This includes properties like `isLatest`, `currentRoute`, and active theme details.

### `pageDefinitions.js` & `selectors.js`
Stores static mappings of URL routes to page types and CSS selectors used across the application. Keeping selectors in a central file makes it easier to update them if the target website updates its DOM structure.

## Relationship with `pageDetection.js`
The `src/core/pageDetection.js` module actively uses `pageDefinitions.js` and `state.js` to determine what page the user is currently viewing. It then updates the `StateManager` accordingly, which triggers features to enable or disable themselves based on their `pageScopes`.
