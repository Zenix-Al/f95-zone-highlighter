
### New Features

* **Auto Refresh setting**
  * Toggle to enable/disable automatic refresh of "Latest" section.
* **Web Notifications setting**
  * Toggle for enabling browser notifications.
  * Dependency check: requires **Auto Refresh** enabled.
* **Toast notifications**
  * Added lightweight toast messages for user feedback (e.g., config saved, action blocked).

### Code Overhaul
* **Instant save**
  * Removed explicit "Save" button.
  * All settings now save automatically on change.
* **Refactored rendering logic**
  * Migrated to *full JS render* approach.
* **Data structure reorganization**
  * Simplified and standardized `config.latestSettings` or `config.threadSettings` for easier state management.

### Frontend Improvements

* **HTML cleanup**
  * Removed redundant DOM elements → leaner structure.
* **CSS cleanup**
  * Introduced **CSS variables** for consistent theming.
  * Reduced inline styles, migrated to scoped CSS.
### General Improvements
* Unified rendering flow → reduces UI desync issues.
* More dev-friendly codebase (cleaner structure, easier to extend/debug).
