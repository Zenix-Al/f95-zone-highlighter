# Shadow DOM and Styling

## Why the UI Uses Shadow DOM

The settings UI is isolated from the host site's CSS through a Shadow DOM. This protects the modal and controls from most page-level selector collisions.

The isolation is intentionally incomplete because certain features need document-level integration:

- The page dock exists in the page environment.
- Some add-on mount targets are outside the settings modal.
- Document-level styles may be needed for integrations that cannot live inside the shadow tree.
- CSS custom properties can bridge theme values across boundaries.

This split is important when debugging layout, z-index, event propagation, focus, or theme issues.

## Bootstrap Flow

`src/ui/index.js` is the UI entry point. During initialization:

1. Confirms the current page is F95Zone.
2. Creates a host element (`div#latest-highlighter-host`) on `document.body`.
3. Attaches an **open Shadow DOM** and stores the root in `stateManager` under `"shadowRoot"`.
4. Injects Shadow DOM and document-level CSS.
5. Adds the configuration dock/button.
6. Applies configured color variables.
7. Updates config-button visibility.
8. Enables/disables cross-tab synchronization.

## Accessing the Shadow Root

```javascript
import { getShadowRoot } from "../../ui/getShadowRoot.js";

const root = getShadowRoot();
if (root) {
  root.appendChild(myCustomElement);
}
```

> **Prerequisite:** UI components that call `getShadowRoot()` assume that `initShadowDOM()` has already completed. Components should be initialized through the normal UI lifecycle.

## CSS Architecture

### `helpers/cssInjector.js`

Loads two stylesheets:
- `assets/css.css` → injected into the **Shadow DOM** scope.
- `assets/document.css` → injected into the **document** scope.

Style acquisition is delegated to the shared style registry, which provides feature-scoped ownership and reference counting.

### `assets/css.css`

The main UI stylesheet covering: modal layout, navigation, settings rows, toggles and form controls, color picker, tag lists and drag states, add-on cards and panels, dock behavior, toast notifications, and responsive/mobile layout.

### `assets/document.css`

Injected outside the Shadow DOM. **Maintenance note:** Keep this file narrowly scoped. Document-level selectors have a larger collision surface than Shadow DOM styles and should use distinctive prefixes or IDs.

### `helpers/updateColorStyle.js`

Converts stored color configuration into active CSS variables/styles. Color-setting effects call it so that UI or page colors update without a full reload.

## Shadow/Document Split Rules

Core settings UI lives in Shadow DOM, while document CSS and some add-on mounts live outside it.

**Risks to be aware of:**
- z-index conflicts between shadow and document layers.
- Theme inconsistency across boundaries.
- Focus leakage between shadow and document.
- Selector collisions from document-level CSS.
- Confusing event propagation paths.

**When modifying UI:** Document which host each component belongs to, where CSS variables originate, and which layer owns cleanup.
