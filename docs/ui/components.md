# General-Purpose UI Components (`src/ui/components`)

## Configuration Button and Page Dock (`components/configButton.js`)

The config button creates a page dock with:

- A primary area for the settings button.
- An add-on slot for add-on-contributed controls.

The settings button opens the modal. When configuration visibility is disabled, the dock can collapse automatically after approximately 2.4 seconds.

The module exports a helper for ensuring the add-on dock slot exists, allowing add-on UI to share the dock without duplicating host setup.

**Architectural significance:** The dock is a cross-boundary element — it is initiated by `src/ui`, can contain add-on UI, exists alongside host-page content, and its visibility depends on stored global settings. Changes to the dock should be tested with both core and add-on controls present.

## Dark Color Picker (`components/darkColorPicker.js`)

The custom color picker:

- Supports HSL and hexadecimal editing.
- Uses a single active picker instance.
- Provides Apply and Cancel actions.
- Commits when clicking outside under defined conditions.
- Cancels with Escape.
- Exposes dialog-oriented ARIA attributes.
- Integrates with the listener-registration utilities.

Only one picker should be active at a time.

## Dialogs (`components/dialog.js`)

Provides reusable dialogs for:

- Confirmation.
- Text input/prompt.
- Reordering.
- Settings content.

The add-on dialog variant (`components/addons/addonDialog.js`) has stronger focus-management behavior, while these general dialogs provide the common modal interaction primitives used by settings actions.

Settings dialogs may provide an `onClose` callback for cleanup owned by an action controller, such as cancelling a pending file picker.

## Delegated Listeners (`components/listeners.js`)

Contains delegated handlers for modal actions: close, reset, and outside-click behavior for tag search. Delegation reduces the need to bind a listener to every dynamic button.

## Settings Actions (`components/settingsActions.js`)

Implements settings actions that require more than a simple metadata effect.

The color reset action uses a double-confirmation pattern:
- The user must trigger reset twice within approximately three seconds.
- Configuration is saved.
- Color styles are updated.
- Tile and thread processing are queued.
- The color settings section is rerendered.

## Toasts (`components/toast.js`)

The toast system supports:

- A bounded visible queue, with up to four toasts.
- Default dismissal timing.
- Multiple message types (`info`, `warn`, `error`).
- Use inside the Shadow DOM.
- Fallback to the document when necessary.
- Queueing when the toast container is not yet available.

This component is shared by settings, tag actions, and add-on actions.

## Feature-Health Diagnostics (`components/featureHealth/index.js`)

The health-report feature aggregates information from: core feature status, runtime errors, installed add-on status, and add-on health information.

It can:

- Render a report inside the settings interface.
- Copy the report to the clipboard.
- Use a fallback copy mechanism when the modern clipboard API is unavailable.

This is primarily a support and diagnostics surface. Maintainers should review it whenever new features, error stores, or add-on states are introduced.
