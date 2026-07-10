# Creating a New Feature

Adding a new feature to the Latest Highlighter userscript is straightforward thanks to the core framework. Do **not** write standalone functions that attach directly to `window.onload`.

## Step-by-Step Guide

### 1. Create the Feature Directory
Create a new folder in `src/features/` (e.g., `src/features/my-new-feature`).
Inside, create an `index.js` file, and optionally a `style.css` if it modifies the UI.

### 2. Define the Feature Logic
Define your `enable` and `disable` functions.

```javascript
// src/features/my-new-feature/handler.js
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";

export function enableMyFeature() {
    addObserverCallback("my-feature-id", (mutations) => {
        // Do something when the DOM changes
    });
}

export function disableMyFeature() {
    // Teardown is usually handled automatically, 
    // but you can do manual cleanup here.
}
```

### 3. Register with `createFeature` or `createStyledFeature`
In `index.js`, use the factory to wrap your logic. Use `createStyledFeature` if you have CSS.

```javascript
// src/features/my-new-feature/index.js
import { createStyledFeature } from "../../core/createStyledFeature.js";
import { enableMyFeature, disableMyFeature } from "./handler.js";
import featureCss from "./style.css";

export const myFeature = createStyledFeature("My Cool Feature", {
    id: "my-unique-feature",
    configPath: "mySettings.featureToggle", // Path in the config tree
    pageScopes: ["isLatest"], // Only run on specific pages (check stateManager)
    isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
    bootstrapMode: "waitForBody", // When to init
    styleCss: featureCss,
    enable: enableMyFeature,
    disable: disableMyFeature,
    settingsUi: { // Optional: automatically binds this feature to the settings dialog
        id: "my-feature-settings",
        sectionId: "general",
        metaMaps: [
            // Standard settings UI definition
        ]
    }
});
```

### 4. Feature discovery and manifest generation

Do not manually import or register features in `src/core/featureCatalog.js`. Features are discovered automatically by the manifest generator.

Correct workflow:

1. Export your feature from the feature module using a `*Feature` export name (for example `export const myFeature = createFeature(...)`).
2. Run the manifest generator (`scripts/featureManifest.cjs`) during build or CI; it discovers `*Feature` exports and produces a generated features manifest.
3. The generated manifest is imported by the loader at runtime, and the feature catalog stores the runtime registrations.

This avoids brittle manual edits and reduces merge conflicts. See `scripts/featureManifest.cjs` for the discovery rules and naming conventions.

### 5. Define Default Config
If your feature uses a `configPath`, ensure that configuration is defined in `src/config/defaults.js`.

---

## Important Rules for AI Agents
1. **Never use `MutationObserver` directly.** Always use `addObserverCallback` from `src/core/observer.js`.
2. **Never inject `<style>` tags manually.** Always use `createStyledFeature` and pass `styleCss`, which safely injects styles into the custom Shadow DOM.
3. **Always handle cleanup.** If your feature attaches event listeners outside of `listenerRegistry.js`, ensure they are removed in the `disable` function.
