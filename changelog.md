# Changelog

### **[v4.15.0 - Add-on Foundation & Modern Settings UI]**

This release focuses on core architecture changes to support add-ons cleanly, plus a modernized settings experience that is now designed around those add-ons.

**Core Changes**

- **Add-on support introduced in core:** Added the base add-on registry/service pipeline so trusted add-ons can be discovered, initialized, controlled, and surfaced through the core UI.
- **Feature migration to add-ons:** Moved major optional feature stacks out of core and into add-ons, including **Image Repair** and **Direct Download** (with related host helpers/handlers), reducing core bloat and improving separation of concerns.
- **Build and release workflow expanded:** Core and add-on build flows are now aligned so release output remains readable while still optimized, and add-ons can be built/released as first-class artifacts.

**UI / UX Changes**

- **Settings UI refreshed for add-ons:** Reworked the settings shell to a more modern layout with sidebar navigation, dedicated Add-ons section, and better panel-level organization.
- **Add-on-aware controls:** Added add-on status badges, page-activity indicators, pinning shortcuts, panel actions, and safer in-UI feedback patterns (toast/confirm) to support extension-style workflows.
- **Library Manager and modal polish:** Improved modal sizing/structure, cleaner control grouping, improved search/filter flows, and clearer detail/edit states for add-on-driven tools.

**Add-ons (Scope Note)**

- This version mainly establishes **add-on initialization and integration hooks** from core; add-on-specific feature expansion will continue in later versions.

### **[v4.14.14 - Tag Update Reliability Patch]**

This is a small bugfix release focused on improving the reliability of tag updates and search results in the settings modal. It addresses issues with the previous implementation where tag updates target elements misbehave because of short sight or site ui changes, and ensures the tag search results container shows/hides correctly based on the search query.

**Bug Fixes**

- **Tag updates:** Prioritize site-provided `latestUpdates.tags`, preserve selected chips when merging, more reliable than previous element-based method and less buggy.
- **Tag Search Results:** Fixed an issue where the tag search results container could fail to show when typing in the search input, making it seem like the search was broken. Now the container will reliably show/hide based on the search query.

### **[v4.14.0 - Direct Download & Overlay Options]**

This release improves direct-download reliability and makes masked-link automation explicit, adds a new Latest Overlay border style, fixes Wide Latest layout issues, and updates the build pipeline to reduce release size while remaining GreasyFork-compliant.

**Changes**

- **Masked Link Skipper & Direct Download UI:** Converted from automatic hijacking to an in-page button beside masked/download links so users can opt-in to automation instead of having the original link replaced silently.
- **Pixeldrain automation:** Switched to a deterministic file-id → direct API download URL flow and improved detection/fallbacks to make Pixeldrain downloads more reliable across page variants.
- **Latest Overlay — Border Style:** Added a `border` style option for the Latest Overlay; users can now choose between the existing `band` (bottom strip) and the new `border` (decorative frame) styles.
- **Wide Latest Styling Fixes:** Fixed layout and spacing regressions in Wide Latest mode so tiles align correctly at wide widths.
- **Build pipeline:** Release builds now apply lightweight, GreasyFork-safe identifier minification to reduce final script size while preserving readability and TOS compliance.
- **Misc:** Small code quality and performance improvements across overlay and direct-download flows.

**Notes**

- The masked-link/button change makes automation explicit and reduces accidental behavior changes on host pages.
- Pixeldrain behaviour has been hardened but page variations still exist — please report any cases that still fail so I can add targeted fixes.

### **[v4.12.0 - Direct Download + Tag UX Polish]**

This release focuses on direct download reliability, smoother tag management, and small UI/UX quality fixes.

**Changes**

- **Datanodes Direct Download Fixed:** Updated the Datanodes flow so direct download works again.
- **Tag Search Input Behavior Improved:** Adjusted tag input/search interactions to be less disruptive during tagging.
- **Tag Drag Container Shift Fixed:** Prevented tag containers from visually shifting while dragging chips.
- **Section Collapse Animation Fixed:** Resolved collapse jitter/shutter so settings sections close more smoothly.
- **UI/UX Polish:** Included additional minor interface and usability improvements.

### **[v4.11.23 - Tag Drag Reliability Patch]**

Whoever in charge needs to get spanked, he let bug pass, kek. This patch addresses a critical issue with tag chip dragging where the drag ghost was being appended to the main document body instead of the shadow root, causing styling inconsistencies and drag failures.

**Bug Fixes**

- **Desktop Drag Reworked:** Switched desktop chip dragging to the same pointer-driven drag pipeline used by touch/pen for more consistent behavior across Preferred/Excluded/Marked lists.
- **Drag Performance Improvements:** Reduced hot-path DOM work and tuned drag highlight updates for smoother response when many chips exist.
- **Drag Ghost Styling Fixed:** Drag ghost now renders inside the shadow root so chip styling (including remove button visuals) stays consistent while dragging.

### **[v4.11.0 - Tag Marking + Dark Color Picker Release]**

It aint much, but it's honest work. This release adds a new "Marked" tag list for visually distinguishing tags you feel neutral about, and a custom dark-themed color picker that fits better with the UI.

**Changes**

- **Draggable Tag Chips Improved:** Overhauled drag-and-drop behavior for tag chips — drag between Preferred, Excluded, and Marked containers now feels immediate and reliable. Touch screen drag support added.
- **Marked Tags Added:** New third tag list alongside Preferred and Excluded. Marked tags get a distinct visual style on both the latest overlay and thread pages. Useful for quickly spotting tags you neither like nor dislike.
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
