# Project Guide for Gemini Code Assist

This document provides an overview of the "Latest Highlighter" userscript to help you understand its structure, features, and development patterns.

## 1. Project Overview

- **Name:** Latest Highlighter
- **Type:** Userscript
- **Target Site:** f95zone (inferred from `isF95Zone` state)
- **Core Purpose:** To enhance the user experience on f95zone by highlighting content based on user-defined tags, managing version information, and adding quality-of-life features like direct download links and UI improvements.

## 2. Core Features

- **Tag-Based Highlighting:** Users can define "preferred" and "excluded" tags. Threads and content tiles are highlighted with distinct colors and styles based on these tags.
- **Version Highlighting:** Differentiates between "full" or "final" game versions and other updates.
- **Content Overlays:** Adds colored overlays to content tiles to quickly show their status (e.g., Completed, On Hold, Preferred Tag). These are configurable.
- **Direct Download Links:** For supported file hosts (e.g., `gofile.io`), the script attempts to find and display direct download links within threads, bypassing intermediate pages.
- **UI/Settings Modal:** Injects a modal into the page for users to configure all script settings, including tags, colors, and feature toggles.
- **Page-Specific Enhancements:**
  - **Thread View:**
    - Highlights thread titles based on tags.
    - Applies shadow effects to posts by preferred/excluded users.
    - Collapses user signatures.
    - Retries loading failed images.
    - Skips "masked" ad links.
  - **Latest View:**
    - Auto-refreshes the "latest updates" page.
    - Sends web notifications for new content (requires auto-refresh).
    - Offers layout adjustments (wide mode, dense grid).
- **Cross-Tab Sync (Experimental):** Keeps settings synchronized across multiple open tabs.

## 3. Configuration (`config.js`)

`src/config.js` is the central hub for all configuration, default values, and constants.

### `config` Object

This is the main user configuration object that is saved to and loaded from persistent storage (likely `GM_storage`). It aggregates all user-defined settings.

- `preferredTags`, `excludedTags`: Lists of strings for content matching.
- `color`: User-customized color palette.
- `overlaySettings`: User preferences for which overlays to show.
- `threadSettings`: Settings specific to thread pages.
- `latestSettings`: Settings specific to the "latest updates" page.
- `globalSettings`: Script-wide settings (e.g., UI visibility).

### Default Settings

The script uses several `default...` objects to initialize a user's configuration for the first time.

- `defaultColors`: The default color scheme for all UI elements and overlays.
- `defaultOverlaySettings`: Default visibility for each type of overlay.
- `defaultThreadSetting`, `defaultLatestSettings`, `defaultGlobalSettings`: Default values for all feature toggles and settings.

**When adding a new setting, you must add a corresponding default value to the appropriate object.**

### Constants & Enums

- **`STATUS`**: A frozen object acting as an enum for internal status representation (`PREFERRED`, `EXCLUDED`, `NEUTRAL`, etc.). **Always use this enum instead of raw strings** to avoid typos and ensure consistency.
- **`supportedHosts` & `supportedDirectDownload`**: These arrays define the logic for the direct download feature. To add support for a new host, it must be added to these structures with the correct parameters (`id`, `host`, `btn` selector, etc.).
- **`crossTabKeys`**: An object where keys represent the settings categories from the `config` object that should be synchronized across tabs.

## 4. State Management (`state` object)

The `state` object in `config.js` is a global, in-memory store for the script's current runtime state.

- It is used to track UI rendering status (e.g., `modalInjected`, `colorRendered`) to prevent duplicate work.
- It identifies the current page context (`isThread`, `isLatest`, `isF95Zone`).
- It manages asynchronous operations with flags like `isProcessingTiles` to prevent race conditions.
- **Important:** This is **not** persistent storage; it resets on every page load. Persistent settings are stored in the `config` object.

## 5. How to Contribute

### Adding a New Setting (Example)

1.  **Define Default:** Add the new setting and its default value to the relevant `default...` object in `src/config.js`. For a new thread-specific feature, add it to `defaultThreadSetting`.
    ```javascript
    // in src/config.js
    export const defaultThreadSetting = {
      // ... existing settings
      myNewFeature: false,
    };
    ```
2.  **Update UI:** Modify the UI rendering code (not provided, but likely in a `ui.js` or similar file) to add a new input (e.g., checkbox) to the settings modal. This input should read from and write to `config.threadSettings.myNewFeature`.
3.  **Implement Logic:** In the main script logic, access the setting via the `config` object (e.g., `if (config.threadSettings.myNewFeature) { ... }`) to control the new feature's behavior.
4.  **Cross-Tab Sync (Optional):** If the setting is part of a category that should be synced (like `threadSettings`), ensure its parent key is in the `crossTabKeys` object. No extra work is needed if the category is already there.

### Supporting a New Download Host

1.  Add the host's domain to the `supportedHosts` array.
2.  Add a new object to the `typeDownload` array specifying its download mechanism (`iframe` or `normal`).
3.  Add a detailed configuration object to the `supportedDirectDownload` array. This requires inspecting the host's download page to find the correct selectors (`btn`) and URL patterns (`directDownloadLink`).

## 6. Styling (CSS Architecture)

The project uses a split CSS architecture to isolate its own UI from the styles that modify the host website. All style files are located in `src/ui/assets/`.

### `css.css` (UI Styles)

- **Purpose:** Contains all CSS rules for the userscript's own interface (the settings modal, configuration button, toasts, etc.).
- **Injection:** These styles are injected directly into the **Shadow DOM**.
- **Scoping:** Because they are in the Shadow DOM, these styles **cannot** affect any part of the main website. They are fully encapsulated.

### `web.css` (Web Page Styles)

- **Purpose:** Contains all CSS rules intended to modify the appearance of the host website (e.g., highlighting thread titles, changing page layout, adding overlays to game tiles).
- **Injection:** These styles are injected into the `<head>` of the main **document**.
- **Scoping:** These are global styles and will affect any element on the page that matches their selectors.

**When adding new styles, decide their purpose:**

- If it styles the settings modal or another script-owned UI element, add it to `src/ui/assets/css.css`.
- If it styles a part of the f95zone website, add it to `src/ui/assets/web.css`.

### Directory Structure Philosophy

- **`src/features/`**: Modules that directly add, remove, or change elements and behavior on the page for a distinct user-facing purpose (e.g., collapsing signatures, adding a dense grid layout, enabling wide mode). These are the "what" the script does.
- **`src/services/`**: Modules that provide shared logic, data fetching/management, or complex background processing that features can use (e.g., fetching all tags, processing tiles based on tags, saving settings). These are the "how" things get done behind the scenes.
- **`src/ui/`**: Modules strictly for creating and managing the script's own interface, primarily the settings modal and its components.
- **`src/core/`**: Foundational, reusable helper functions that are not specific to any feature (e.g., `logger`, `dom` utilities).

---

## 7. Feature Development Workflow

When adding a new feature, follow this established pattern to ensure consistency and maintainability.

1.  **Create a Feature Module (`src/features/`)**
    - All feature logic should be encapsulated within its own file in the `src/features/` directory (e.g., `src/features/myNewFeature.js`).
    - This module **must** export functions to manage its state:
      - `initMyNewFeature()`: Contains the logic to **activate** the feature (e.g., add event listeners, inject DOM elements).
      - `disableMyNewFeature()`: Contains the logic to completely **deactivate and clean up** the feature (e.g., remove event listeners, remove DOM elements). This is crucial for toggling features without a page refresh.
      - `toggleMyNewFeature(isEnabled)`: A wrapper function that calls `init...()` or `disable...()` based on the boolean `isEnabled` argument.

2.  **Add a Configuration Setting (`src/config.js`)**
    - Add a new property to the appropriate `default...` settings object (e.g., `myNewFeatureEnabled: false` in `defaultThreadSetting`). This provides the default value for new users and ensures the config structure is consistent.

3.  **Integrate into the UI (`src/ui/`)**
    - Add a control (e.g., a checkbox) to the settings modal.
    - This control should read its initial state from the `config` object (e.g., `config.threadSettings.myNewFeatureEnabled`).
    - When the user interacts with the control, it should update the `config` object and call the feature's `toggle...()` function to apply the change immediately.

4.  **Initial Load (`src/loader.js`)**
    - In `loadFeatures()`, add a call to your feature's initialization logic. This should be guarded by both the appropriate page check (`if (state.isThread)`) and the feature's config flag (`if (config.threadSettings.myNewFeatureEnabled)`). This ensures the feature is activated on page load if the user has it enabled.

5.  **Heavy Features ("Task Registry")**
    - For features that are resource-intensive or involve ongoing monitoring (e.g., using `MutationObserver`), they are considered "heavy features".
    - While there isn't a formal "task registry" file, the pattern is to manage these tasks carefully. Ensure the `disable...()` function properly disconnects observers or stops intervals to prevent memory leaks and performance degradation when the feature is turned off.

## 6. Feature Development Workflow

When adding a new feature, follow this established pattern to ensure consistency and maintainability.

1.  **Create a Feature Module (`src/features/`)**
    - All feature logic should be encapsulated within its own file in the `src/features/` directory (e.g., `src/features/myNewFeature.js`).
    - This module **must** export functions to manage its state:
      - `initMyNewFeature()`: Contains the logic to **activate** the feature (e.g., add event listeners, inject DOM elements).
      - `disableMyNewFeature()`: Contains the logic to completely **deactivate and clean up** the feature (e.g., remove event listeners, remove DOM elements). This is crucial for toggling features without a page refresh.
      - `toggleMyNewFeature(isEnabled)`: A wrapper function that calls `init...()` or `disable...()` based on the boolean `isEnabled` argument.

2.  **Add a Configuration Setting (`src/config.js`)**
    - Add a new property to the appropriate `default...` settings object (e.g., `myNewFeatureEnabled: false` in `defaultThreadSetting`). This provides the default value for new users and ensures the config structure is consistent.

3.  **Integrate into the UI (`src/ui/`)**
    - Add a control (e.g., a checkbox) to the settings modal.
    - This control should read its initial state from the `config` object (e.g., `config.threadSettings.myNewFeatureEnabled`).
    - When the user interacts with the control, it should update the `config` object and call the feature's `toggle...()` function to apply the change immediately.

4.  **Initial Load (`src/loader.js`)**
    - In `loadFeatures()`, add a call to your feature's initialization logic. This should be guarded by both the appropriate page check (`if (state.isThread)`) and the feature's config flag (`if (config.threadSettings.myNewFeatureEnabled)`). This ensures the feature is activated on page load if the user has it enabled.

5.  **Heavy Features ("Task Registry")**
    - For features that are resource-intensive or involve ongoing monitoring (e.g., using `MutationObserver`), they are considered "heavy features".
    - While there isn't a formal "task registry" file, the pattern is to manage these tasks carefully. Ensure the `disable...()` function properly disconnects observers or stops intervals to prevent memory leaks and performance degradation when the feature is turned off.

## 8. Housekeeping & Documentation

- **`GEMINI.md` (This file):** This is your primary guide. Feel free to update it with any new architectural patterns, conventions, or important notes as the project evolves. Keeping this file current is key to our efficiency.
- **`CHANGELOG.md`:** Please update the changelog with a summary of significant changes (new features, refactors, major bug fixes) after each major task is completed. This helps track the project's progress.
