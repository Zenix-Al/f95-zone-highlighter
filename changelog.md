### **[v3.1.0 – Minor]**

#### **Added**

- **Image Retry** (Thread Option)
  - Automatically retries failed-to-load images on thread pages.
  - Designed for users experiencing CDN issues with F95Zone attachments.
  - Notification appear if notification allowed
  - Notification appear when all images have finished retrying
  - Notification appear when failed images exceed a defined threshold, suggesting a page refresh may be needed.

#### **Metrics**

- Introduced `metrics` for now it used for tracking Image Retry:
  - `Succeeded` – number of images successfully retried.
  - `Failed` – number of images that failed to load.
  - `AvgCache` – average time (ms) to retry images.

#### **Other**

- Build system now supports automatic version bumping (patch, minor, major).

### **[v3.0.0 – Major]**

### New Features

- **Auto Refresh setting**
  - Toggle to enable/disable automatic refresh of "Latest" section.
- **Web Notifications setting**
  - Toggle for enabling browser notifications.
  - Dependency check: requires **Auto Refresh** enabled.
- **Toast notifications**
  - Added lightweight toast messages for user feedback (e.g., config saved, action blocked).

### Code Overhaul

- **Instant save**
  - Removed explicit "Save" button.
  - All settings now save automatically on change.
- **Refactored rendering logic**
  - Migrated to _full JS render_ approach.
- **Data structure reorganization**
  - Simplified and standardized `config.latestSettings` or `config.threadSettings` for easier state management.

### Frontend Improvements

- **HTML cleanup**
  - Removed redundant DOM elements → leaner structure.
- **CSS cleanup**
  - Introduced **CSS variables** for consistent theming.
  - Reduced inline styles, migrated to scoped CSS.

### General Improvements

- Unified rendering flow → reduces UI desync issues.
- More dev-friendly codebase (cleaner structure, easier to extend/debug).
