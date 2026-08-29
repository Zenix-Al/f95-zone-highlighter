# Configuration Overview (`src/config`)

The `config` directory is responsible for the baseline settings, state schemas, and static definitions (like CSS selectors or route definitions) that the rest of the application relies on.

## Key Files

### `defaults.js`
Contains persisted baseline values for the userscript. Defaults are values only; constraints, validation rules, and persistence/export metadata belong in `schema.js`. If you add a new toggleable feature, you **must** add its default state here and add the matching schema descriptor.

### `schema.js`
The pure configuration contract. It defines explicit types, ranges, enums, nested object policies, and path metadata. Persisted version policy and storage keys live in `persistence.js`; transfer-document normalization remains in the transfer service. Use the schema validation APIs rather than adding datatype checks in storage, settings, sync, or transfer code.

To add a persistent field:

1. Add its default value to `defaults.js`.
2. Add an explicit descriptor to `CONFIG_SCHEMA` in `schema.js`, including constraints and `exportable`/`sensitive`/`reloadRequired` metadata as applicable.
3. Use the schema API at every boundary and add tests for the default, strict validation, tolerant sanitization, and metadata.

Keep storage I/O, migrations, cross-tab transport, UI effects, and import/export document parsing outside this module.

### `persistence.js`
The narrow persisted-envelope contract. It owns `CONFIG_STORAGE_KEYS`, `CONFIG_SCHEMA_VERSION` (`2`),
the single immutable schema-1-to-2 migration, and pure version checks. The migration records the
new storage-bootstrap boundary without changing the configuration data shape. Storage I/O and
transaction ownership remain in the settings service.

The separate `src/services/configMigrationService.js` remains responsible for marker-gated recovery
of the released historical surface-key layout; it is not part of the schema-step registry.

Tolerant storage sanitization preserves valid known siblings and reports bounded issues. A current
schema-2 load is write-free; a supported schema-1 envelope is sanitized and transactionally migrated.

### Transfer ownership

`src/services/configTransfer/` owns export-document construction, format/schema validation and
normalization, preview, and transactional commit coordination. `src/ui/configTransfer/` owns file
selection, downloads, dialogs, and user-facing presentation. Do not add transfer validation or
browser I/O under `src/features/`.

### `state.js`
Defines the initial structure of the global state (used by `StateManager.js`). This includes properties like `isLatest`, `currentRoute`, and active theme details.

### `pageDefinitions.js` & `selectors.js`
Stores static mappings of URL routes to page types and CSS selectors used across the application. Keeping selectors in a central file makes it easier to update them if the target website updates its DOM structure.

### [Storage migration and recovery](storage-migration-recovery.md)
Records the historical surface-key incident, canonical/cache ownership, marker semantics, and the retired migration boundary.

### [ScriptCat storage baseline](storage-scriptcat-baseline.md)
Records the fresh-install structural difference, narrowed transaction failure window, and bounded diagnostic step names without retaining user configuration values.

### [Storage bootstrap](storage-bootstrap.md)
Documents the shared capability/load sequence, immutable health snapshot, bootstrap ordering, and explicit retry boundary.

### [Legacy upgrade guard](storage-legacy-upgrade-guard.md)
Records the proven core v5.1.2 bridge boundary and the current release's read-only handling of recognized pre-schema storage.

### [Interaction regression recovery](interaction-regression.md)
Records the serialized config-update contract, tag-edit rendering/effect ownership, deterministic overlay lifecycle, and measured storage activity.

## Relationship with `pageDetection.js`
The `src/core/pageDetection.js` module actively uses `pageDefinitions.js` and `state.js` to determine what page the user is currently viewing. It then updates the `StateManager` accordingly, which triggers features to enable or disable themselves based on their `pageScopes`.
