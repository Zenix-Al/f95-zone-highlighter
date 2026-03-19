# Changelog

### **[v4.11.0 - Tag Marking + Dark Color Picker Release]**

**Changes**

- **Draggable Tag Chips Improved:** Overhauled drag-and-drop behavior for tag chips — drag between Preferred, Excluded, and Marked containers now feels immediate and reliable. Touch screen drag support added.
- **Marked Tags Added:** New third tag list alongside Preferred and Excluded. Marked tags get a distinct visual style on both the latest overlay and thread pages — useful for quickly spotting tags you neither like nor dislike.
- **Dark Color Picker:** Replaced the browser-native color picker (which always renders with a white background) with a custom in-panel one that follows the UI theme. Includes hue/saturation/lightness sliders, hex input, and Apply/Cancel.
- **Removed stale HR separators:** Cleaned up leftover `<hr>` dividers that were made redundant by the bordered accordion sections.
- Other code improvements.

### **[v4.10.0 - Modal UI + Overlay Stability Release]**

This release focuses on modal usability, page-scope correctness, direct-download reliability, and latest overlay behavior/performance.

**Major Changes & Improvements**

- **Modal Section UI Updated:** Improved modal section behavior and presentation for a cleaner settings flow.
- **Datanodes Direct Download Fixed:** Updated Datanodes support so the direct-download path works again on the new flow.
- **Feature Page Gating Fixed:** Fixed features being triggered on pages where they should not run.
- **Feature Health Diagnostics Improved:** Improved error capture/reporting so runtime feature failures are surfaced more reliably in Feature Health.
- **Latest Overlay Updated:** Overlay color band now uses a compact CSS-only height (18%) for better readability and lower overhead.
- **Latest Overlay Hover Tag Highlighting Added:** Hover-created tags are now highlighted using your preferred/excluded tag rules.
- **Latest Overlay Optimized:** Additional cleanup and processing optimizations for faster, lighter overlay behavior.

### **[v4.9.0 - Config Transfer + Reinforcement Release]**

This release is focused on configuration portability, direct-download resilience, and core safety hardening.

**Major Changes & Improvements**

- **Import/Export Config Added:** Added dedicated JSON export/import tools in Global Settings (open modal flow), with file download export and strict import validation.
- **Import Validation Reinforced:** Added schema validation for tags, color/overlay/global/thread/latest sections, including `latestOverlayColorOrder` integrity checks.
- **Direct Download Trigger Hardening:** Replaced legacy boolean processing flag with timed trigger object (`active`, `startedAt`, `expiresAt`, `requestId`) and legacy migration support.
- **Direct Download Circuit Breaker:** Added per-host failure tracking and auto-disable after repeated failures, plus UI notice and dismiss flow for affected hosts.

**Security & Reliability Hardening**

- Removed `unsafeWindow` dependency and grant; Gofile now uses a safer page-bridge approach.
- Migrated auto-retry probing away from `GM_xmlhttpRequest` to native `fetch` + timeout, and removed the extra grant.
- Added selector fallback matrix + shared selector query helper for brittle host markup (Buzzheavier/Datanodes/Masked page).
- Added optional MutationObserver profiling/gating instrumentation, disabled by default, for real-cost measurement before optimization changes.
- Reinforced state/settings paths and persistence behavior (`setByPath` guard behavior, `saveConfigKeys` fail isolation via `Promise.allSettled`).

**UX & Polish**

- Added release/regular build metadata in script header comments.
- Improved config transfer error visibility inside dialog while still surfacing toast feedback.
- Mobile modal hint/help behavior adjusted to avoid overlap issues on small screens.

### **[v4.8.20 - Settings UX + Build Pipeline Cleanup]**

Not a feature changes, just adding more freedom in config and stability.

**Improvements**

- **Settings Metadata Refactor:** Refactored settings metadata creation with shared factories to reduce repeated toggle boilerplate.
- **Consolidated Helpers:** Consolidated object-path helpers into `src/utils/objectPath.js` and reused it across state/features/UI renderers.
- **Build Pipeline Overhaul:** Refactored `build.js` into a shared target pipeline (regular + uglified always built), with a wired `header.txt` template and centralized post-processing.
- **Settings UI Streamlined:** Moved Latest Overlay and Thread Overlay settings into dedicated modals to significantly reduce visual clutter in the main configuration menu.

**Bug Fixes & Minor Tweaks**

- Added a quick-copy button to the Feature Health section to easily export status data for debugging.
- Restored release debug-log stripping behavior for GreasyFork release builds.

## [v4.8.0 - Direct Download + Wide Latest Fixes]

- Fixed a bug where Wide Latest could still appear capped around 14xx width.
- Improved Masked Link Skipper and Direct Download so they hand off links more reliably.
- Added more Direct Download host support.

## [v4.7.1 - Framework Hardening Pass]

### Major Changes & Improvements

- **Feature-Scoped CSS System**: Added a new style registry and moved feature styles into feature-owned CSS files. Styles now mount/unmount with feature lifecycle, making tracking and teardown cleaner.
- **Latest Overlay Stability + Performance**: Overlay processing now applies patches in frame-budgeted chunks with generation guards, improving responsiveness on large tile sets while keeping stable cancellation behavior.
- **Observer/Teardown Infrastructure Upgrade**: Added observer pre-filters and a global teardown path that cleans listeners, observers, resources, and injected styles on navigation/unload.

### Bug Fixes & Minor Tweaks

- Fixed runtime state key drift by normalizing message-handler state keys and adding unknown-path protection in `StateManager`.
- Replaced blocking dialog flows (`prompt`/`confirm`/`alert`) with non-blocking UI behavior (custom prompt + toast-based confirmations/errors).
- Normalized color CSS variable handling and added a central key-to-variable mapping for reliable updates.
- Added typed settings coercion/validation so numeric and color settings are saved consistently.
- Added a focused regression test harness (`npm run test`) and removed dead/dormant modules.

## [v4.7.0 - Latest Overlay & Tag UX Update]

### Major Changes & Improvements

- **Latest Overlay Logic Reworked**: Updated the latest overlay pipeline to process tiles first and apply updates in a single batched pass, removing wave-style card painting and making rendering feel instant.
- **Latest Overlay Feature Refresh**: Reorganized overlay internals for cleaner behavior and more stable updates during page activity.
- **Draggable Tag Priority**: Preferred and Excluded tag chips are now draggable so you can reorder tag priority directly from the settings UI.

### Bug Fixes & Minor Tweaks

- Fixed a bug where Preferred/Excluded overlay colors could still render incorrectly when only one of those toggles was enabled.

## [v4.4.0 - Architectural Refactor]

### Major Changes & Improvements

- **Complete Code Refactor**: The entire script has been rewritten with a modern, modular structure. This makes it faster, more stable, and easier to maintain.
- **Isolated UI (Shadow DOM)**: The script's UI (settings modal, buttons) is now completely isolated from the main website, preventing style conflicts and significantly improving performance.

### Bug Fixes & Minor Tweaks

- Resolved layout bugs where input fields in the modal would overflow or get cut off.
- Improved the settings modal with a persistent, custom-styled scrollbar to prevent layout shifts.
