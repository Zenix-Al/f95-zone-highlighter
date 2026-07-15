# Metadata-Driven Settings System

The main settings UI is generated from metadata rather than handwritten controls.

## Metadata Shape

A setting metadata item generally describes:

- Configuration path.
- Label.
- Description or tooltip.
- Input type.
- Limits/options.
- Optional pre-change validation.
- Optional post-change effect.
- Toast behavior.
- Section placement.

Special item types can represent structural rows such as headers, separators, or buttons.

## Metadata Factories (`settings/metaFactory.js`)

Provides helpers for creating consistent metadata:

- Toggle settings.
- Color settings.
- Standardized toast labels.

Using factories avoids repeating labels, path handling, and common behavior across setting definitions.

## Render Pipeline (`renderers/renderSetting.js`)

For a normal input setting, the central renderer:

1. Reads the current value from the central config using the metadata path.
2. Creates the input.
3. Creates the label/tooltip.
4. Binds the change handler.
5. Coerces and validates the new value.
6. Optionally calls `beforeChange`.
7. Writes the value into the in-memory config.
8. Persists the affected top-level configuration key.
9. Applies side effects.
10. Shows a toast unless suppressed.

It also supports structural metadata: header, separator, button, and `info`.
`info` rows render text only (with an optional tooltip and CSS class); they do
not read or write configuration, create form inputs, or attach change handlers.

## Input Types (`renderers/createInput.js`)

Supported core input types:

| Type | Description |
|---|---|
| `toggle` | Boolean switch |
| `number` | Numeric input with min/max |
| `color` | Custom dark color picker |
| `select` | Dropdown selection |

Color inputs use the custom dark color picker rather than the browser's native color input. An unsupported type throws an error, making metadata/type mismatches fail visibly.

## Value Coercion (`renderers/coerceSettingValue.js`)

Input coercion includes:

- Boolean conversion for toggles.
- Number conversion and min/max clamping.
- Minimum-version validation.
- Color validation.
- Passthrough for types that do not need special conversion.

This keeps raw DOM values away from the config object.

## Effects (`renderers/applyEffects.js`)

After a setting changes, this helper:

- Executes a custom effect when defined.
- Waits for asynchronous effects.
- Shows a success toast unless metadata suppresses it.

## Section Rendering (`renderers/settingsSection.js`)

Renders an array of metadata items into a section container.

## Re-rendering (`renderers/reRenderSetting.js`)

Clears and rerenders a section or setting group. Used after operations such as resetting colors or refreshing dynamic state.

## Labels (`renderers/createLabel.js`)

Creates a setting label and optionally adds a tooltip/help badge.

## Static Settings Definitions

### `settings/globalSettings.js`

Global settings controls: config-button visibility, config import/export, and feature-health reporting. Some entries are action buttons rather than persisted values.

### `settings/colorSettings.js`

Color section defines configurable color values. Effects update CSS variables, queue tile reprocessing, and queue thread-tag reprocessing.

### `settings/metaRegistry.js`

The registry is the authoritative index for base, feature, and add-on settings
metadata. It resolves immutable snapshots by section, metadata ID, config path,
and owner ID. Metadata IDs and config paths are globally unique so local commit/import effects
have one authoritative descriptor. Dynamic registration returns a cleanup
function that removes its entries when the owner unloads.

Latest and Thread settings are feature-owned and register through
`contributeToSection()`; there are no empty placeholder metadata modules.

## Adding a New Core Setting

1. Choose or create the owning metadata module.
2. Define a stable config path.
3. Select a supported input type.
4. Add coercion rules if the type is new.
5. Define an effect for live page updates.
6. Contribute the metadata to the correct section.
7. Ensure the top-level config key is handled by settings validation/migration.
8. Keep effect metadata local to the commit/import application boundary.
9. Test persistence, reset behavior, and rerendering.

Example:

```javascript
{
  path: "globalSettings.exampleEnabled",
  type: "toggle",
  label: "Enable example behavior",
  description: "Controls the example feature.",
  effect: async ({ value }) => {
    await refreshExampleFeature(value);
  },
}
```

## Adding a New Input Type

A new type normally requires changes to:

- `createInput.js`
- `coerceSettingValue.js`
- Styling
- Keyboard and accessibility behavior
- Renderer tests
- Possibly metadata factories

**Do not** add a metadata type without adding a matching renderer path.
