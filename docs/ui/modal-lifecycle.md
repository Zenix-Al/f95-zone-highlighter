# Modal Skeleton and Lifecycle

## Static Skeleton (`assets/ui.html`)

The HTML asset provides the static modal skeleton and its primary navigation. The interface includes panels for:

- General
- Latest
- Thread
- Tags
- Color
- Add-ons

It also provides: desktop and mobile navigation elements, tag-search and tag-list containers, reset controls, add-on overview and detail containers, pinned add-on navigation, and footer/action areas.

The static HTML deliberately leaves dynamic settings and add-on content to JavaScript renderers.

## Modal Component (`components/modal.js`)

The modal component:

- Initializes modal UI before opening.
- Shows and hides the modal.
- Injects `ui.html` into the shadow root.
- Closes when the backdrop is clicked.
- Avoids closing for clicks inside modal content or a color-picker popover.
- Stops keyboard events from leaking to the host page.

The open sequence is asynchronous because initialization may need to load UI preferences, add-on state, and tags.

## Lifecycle Coordination (`settings/modalLifecycle.js`)

This module coordinates one-time setup and recurring refreshes:

- Injecting the static modal skeleton once.
- Binding panel navigation.
- Binding delegated modal actions.
- Binding tag-search behavior.
- Binding add-on panel actions.
- Binding document-level outside-click behavior.
- Loading and rendering tags.
- Rendering static setting sections.
- Refreshing dynamic add-on content.

The lifecycle distinguishes between:
- **One-time binding** — protected by initialization guards.
- **Refreshable rendering** — used when add-ons or metadata change.

## Settings Orchestrator (`settings/index.js`)

This is the settings UI orchestrator. It:

- Imports static settings definitions.
- Imports the add-on service's UI settings contribution.
- Loads persisted UI-only preferences.
- Initializes the add-on registry bridge.
- Ensures the modal skeleton exists.
- Binds lifecycle behavior once.
- Refreshes static and dynamic sections.

**Key detail:** Not all settings metadata lives in `src/ui/settings`. Add-on service settings are contributed from `src/services/addons/settingsUi.js`.

## Panel Navigation (`settings/panelNavigation.js`)

Panel navigation handles:

- Activating the requested navigation item.
- Showing the matching panel.
- Maintaining `aria-current`.
- Preserving scroll position during rerenders.
- Switching between desktop and mobile navigation behavior.
- Responding to viewport changes.

The mobile breakpoint is approximately `760px`.

## UI Preferences (`settingsRuntime/prefs.js`)

UI preferences are intentionally stored separately from functional configuration:

- **Functional configuration** → changes application behavior.
- **UI preferences** → change how the settings interface is presented.

Persisted UI preferences include: the last active settings panel and pinned add-on IDs. The default active panel is General.

## Sections Registry (`settingsRuntime/sectionsRegistry.js`)

The sections registry decouples setting definitions from the modal lifecycle. Static section targets include: global, latest, thread, and color.

Feature modules can call `contributeToSection(sectionName, metadata)` instead of requiring the settings entry point to import every feature-specific setting directly. This is one of the most important extension mechanisms in the UI.
