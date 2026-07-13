# Configuration Overview (`src/config`)

The `config` directory is responsible for the baseline settings, state schemas, and static definitions (like CSS selectors or route definitions) that the rest of the application relies on.

## Key Files

### `defaults.js`
Contains persisted baseline values for the userscript. Defaults are values only; constraints, validation rules, and persistence/export/sync metadata belong in `schema.js`. If you add a new toggleable feature, you **must** add its default state here and add the matching schema descriptor.

### `schema.js`
The pure configuration contract. It defines explicit types, ranges, enums, nested object policies, legacy migration input, and path metadata. Use its validation APIs rather than adding datatype checks in storage, settings, sync, or transfer code.

To add a persistent field:

1. Add its default value to `defaults.js`.
2. Add an explicit descriptor to `CONFIG_SCHEMA` in `schema.js`, including constraints and `exportable`/`syncable`/`sensitive`/`reloadRequired` metadata as applicable.
3. Use the schema API at every boundary and add tests for the default, strict validation, tolerant sanitization, and metadata.

Keep storage I/O, migrations, sync transport, UI effects, and import/export document parsing outside this module.

### `state.js`
Defines the initial structure of the global state (used by `StateManager.js`). This includes properties like `isLatest`, `currentRoute`, and active theme details.

### `pageDefinitions.js` & `selectors.js`
Stores static mappings of URL routes to page types and CSS selectors used across the application. Keeping selectors in a central file makes it easier to update them if the target website updates its DOM structure.

## Relationship with `pageDetection.js`
The `src/core/pageDetection.js` module actively uses `pageDefinitions.js` and `state.js` to determine what page the user is currently viewing. It then updates the `StateManager` accordingly, which triggers features to enable or disable themselves based on their `pageScopes`.
