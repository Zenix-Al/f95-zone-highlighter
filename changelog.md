# Changelog

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
