# UI Framework Overview (`src/ui`)

The UI system in Latest Highlighter is designed to isolate the userscript's visual elements and styles from the host website (XenForo). It accomplishes this through a dedicated Shadow DOM architecture.

---

## The Shadow DOM Sandbox

To prevent XenForo’s global stylesheets from distorting our UI (and vice versa), the script mounts all visual components inside a single isolated Shadow DOM.

### 1. Initialization
During the body bootstrap phase, `initUiPhaseIfApplicable()` is triggered. If the current site is detected as F95Zone:
- It creates a shadow host element (`div#latest-highlighter-host`) on `document.body`.
- It attaches an open shadow root to this host and stores it in the global `stateManager` under the key `"shadowRoot"`.
- It injects global CSS assets and the configuration button.

### 2. Accessing the Shadow Root
Any feature or component that needs to mount elements must do so within this sandbox. To retrieve the root, import and invoke:
```javascript
import { getShadowRoot } from "../../ui/getShadowRoot.js";

const root = getShadowRoot();
if (root) {
  root.appendChild(myCustomElement);
}
```

---

## CSS Injection
Styles are loaded via `injectCSS()` inside `ui/helpers/cssInjector.js`. 
- For core styles, custom CSS sheets are injected directly into the Shadow DOM root.
- For features configured via `createStyledFeature()`, the CSS is managed automatically by `styleRegistry.js` which registers and unregisters styles inside the shadow root dynamically as features toggle.

---

## Dynamic Settings System (`src/ui/settings`)

The userscript provides a tabbed configuration panel dynamically generated from settings metadata.

### 1. Panel Layouts
The settings panel is broken down into separate files corresponding to tabs in the UI:
- `globalSettings.js`: Core userscript behaviors (e.g. debug logging, add-ons service toggles).
- `tagsSettings.js`: Management of preferred, excluded, and marked tags.
- `colorSettings.js`: Accent styling, overlay border widths, and highlights.
- `panelNavigation.js`: Controls tab selection, renders panels, and handles user switching.

### 2. Settings Metadata (`metaFactory.js` & `metaRegistry.js`)
Config fields are defined declaratively using metadata schemas (rather than manually coded inputs).
- **`createToggleSetting(options)`**: Declares a boolean toggle switch mapped directly to a config path.
- **`createNumberSetting(options)`**: Renders number inputs with specified min/max boundaries.
- **`createButtonSetting(options)`**: Renders a button that fires custom effect callbacks.

---

## Additional UI docs

Focused documentation for subsystems has been split into smaller files. See:

- [Purpose and Scope](purpose.md)
- [High-Level Architecture](architecture.md)
- [Directory Map](directory-map.md)
- [Shadow DOM and Styling](shadow-dom.md)
- [Modal & Lifecycle](modal-lifecycle.md)
- [Settings Renderer](settings-renderer.md)
- [Components](components.md)
- [Tag Management](tag-management.md)
- [Add-on UI](addon-ui.md)
- [Related Services](services.md)
- [Persistence & Sync](persistence.md)
- [Event & Listener Lifecycle](event-lifecycle.md)
- [Extension Guide](extension-guide.md)
- [Priority Review Notes](priority-review.md)
- [Test Matrix](test-matrix.md)
- [File Responsibility Index](responsibility-index.md)
- [Maintenance Checklist](maintenance-checklist.md)
- [Known Limitations](limitations.md)
- [Summary](summary.md)

If a file you expect is missing, tell me which section to expand and I will generate it.
