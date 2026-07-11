# Add-on UI Subsystem

The add-on UI is the largest dynamic part of `src/ui`. It manages: installed and discoverable add-ons, status and trust presentation, enable/disable actions, pinning and reordering, commands, add-on settings, logs or installation traces, and multiple UI host locations.

## Rendering Entry Point (`renderers/addonsRenderer.js`)

The renderer builds:

- Add-on overview cards.
- Dynamic add-on detail panels.
- Pinned add-on navigation.
- Refresh behavior when the registry changes.

Unlike static settings sections, add-on content is derived from runtime registry state.

## Settings Controller (`components/addons/settingsController.js`)

The main add-on UI controller. It:

- Normalizes registry metadata.
- Tracks known and pinned add-ons.
- Subscribes to registry updates.
- Handles delegated actions.
- Opens detail views.
- Enables or disables add-ons.
- Pins, unpins, and reorders items.
- Deletes installation traces.
- Navigates back from detail views.
- Dispatches add-on commands.
- Invokes add-on settings actions.
- Refreshes UI after state changes.

## Add-on Cards and Metadata

### `addonCard.js`
Builds overview cards with: name, descriptive metadata, active/inactive state, trust state, blocked state, service-disabled state, pinned state, status badges, and available actions.

### `badge.js`
Creates reusable badge elements.

### `statusMeta.js`
Maps add-on lifecycle states: installed, disabled, not installed, running, failing.

### `addonScopes.js`
Formats requested scopes/permissions and handles missing scope metadata.

## Add-on Dialogs and Panels

### `addonDialog.js`
Provides add-on-focused dialogs with multiple size presets (`sm`, default, `lg`, `xl`, and full), focus placement, focus trapping, and dialog semantics/ARIA behavior.

### `addonPanelActions.js`
Builds action controls for add-on detail panels: Back, enable/disable, commands, and status feedback through toasts.

### `addonPanelSettings.js`
Loads add-on settings through core actions and renders controls. Supports number and toggle types. Reads through `storage.get` via the add-on bridge, then delegates updates to the settings controller.

### `settingPath.js`
Handles or normalizes paths for nested add-on settings.

## Add-on UI Hosts and Mounts

### `addonUiHosts.js`
Defines host surfaces for add-on-contributed UI: dialog, settings panel, floating UI, and page dock.

Supported mount locations:
- after the Latest filters title
- page dock
- page panel
- floating page surface

Mounts are restricted to those fixed slots. Arbitrary body and selector-based
targets are intentionally not supported.

### `addonMount.js`
Creates and inserts add-on HTML mounts according to host and position rules.

### `addonDockGroup.js`
Builds groups of add-on controls for the page dock.

### `addonStyle.js`
Creates style elements for add-on-contributed styles.

### `actionButton.js`
Creates action buttons carrying data attributes used by delegated handlers.

### `components/addons/index.js`
Barrel/public export surface for add-on UI components.

## Service Integration

The UI communicates with the add-on service for: registry and known-add-on lists, lifecycle state, catalog data, enable/disable operations, core actions, storage, commands, UI-host integration, installation traces, security/trust restrictions, and throttling/limits.

**Design principle:** The add-on UI should not independently duplicate service policy. Trust, throttling, and lifecycle decisions belong in the service layer.

## Adding an Add-on Mount Location

1. Define the host/slot semantics in `addonUiHosts.js`.
2. Implement safe insertion in `addonMount.js`.
3. Define cleanup and ownership.
4. Ensure styling works across Shadow DOM/document boundaries.
5. Confirm trust and sanitization at the service boundary.
6. Test collisions, missing targets, repeated mounts, and unmounting.

## Trust Boundary

Add-on HTML and CSS are untrusted input, including input from catalog-listed and
trusted add-ons. The service sanitizes HTML once before every mount, update,
dialog, and deferred mount assignment. It rejects executable elements,
event-handler attributes, unsafe URL schemes, `srcdoc`, SVG, and MathML.

Page-host CSS is scoped by the service to the add-on-owned mount or dialog root.
Global selectors and risky CSS constructs are rejected; styles are removed with
the owning add-on during teardown.

Add-on UI helpers can mount add-on-provided HTML and styles. This is not by itself evidence of a vulnerability — sanitization or trust enforcement may occur in the add-on service/UI-host boundary.

**Verify:**
- Whether untrusted add-ons can provide raw HTML.
- Where markup is sanitized.
- Which APIs are exposed to mounted content.
- Whether event handlers or scripts can cross the boundary.
- Cleanup when an add-on is disabled or removed.

The security contract should be documented near both the service and UI-host implementations.
