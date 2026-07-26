# Changelog

## v1.1.0 - Filter tools

- Added individual reset controls for included tags, excluded tags, and each visible prefix group.
- Preserve unrelated Latest filters and return changed results to page 1 without reloading the complete document.
- Derive prefix groups from the current page instead of relying on fixed prefix IDs.
- Added Surprise Me to select one to three unique tags, favoring preferred tags while keeping excluded tags possible at lower odds.
- Surprise Me resolves included/excluded conflicts and preserves category, prefix, search, creator, sorting, date, and tag-type filters.
- Reuse one indexed tag lookup across panel repaints instead of rebuilding the complete tag catalog for every preset row.
- Kept reset and Surprise routes compatible with existing Saved Filter records and lifecycle cleanup.
- Adapted from the Reset Filters userscript behavior by Edexal:
  https://sleazyfork.org/en/scripts/588436-reset-filters

## 1.0.0 - Structure reworked

- Adopt the Example Add-on runtime boundaries with instance-owned lifecycle state,
  cancellable mount/route/dialog work, and a storage adapter that preserves the
  existing preset keys and record formats.

Note : require core v5.2.0

## 0.3.16 - small ui change

- Add confirmation before updateing a preset to prevent accidental overwrites.
- Changed how tag rendered instead of just number, now they are rendered as chips and respect the core tag preferences/colors (preferred / excluded / marked) for better visual consistency across the UI.

## 0.3.12 - small ui change

- move script constants to state constants file for better organization and easier access across modules.
- using createEl helper for consistent element creation and styling.

## v0.2.2 - tinyupdate

- use `ui.confirm` from core instead of `window.confirm` for consistent dialog styling and behavior.

Note : core v4.17.0 or above required

## v0.1.0 - Initial Release

- First public add-on release.
- Adds a Saved Filters button on the Latest Updates page (`/sam/latest_alpha/`).
- Supports saving, renaming, deleting, and applying URL-encoded filter presets.
- Includes a searchable preset list panel with active filter tracking.
- Tracks the currently applied preset and reflects it live on hash and history state changes.
- Stores presets in add-on-local `GM.getValue` / `GM.setValue` storage outside core config.
- Registers modal and list styles via core CSS registry (`ui.style.register`).
- Modal open, close, ESC dismiss, and backdrop click managed by core dialog host.
- Registers with core add-on bridge for status, settings, and runtime controls.
- Supports enable or disable from the main F95UE Add-ons UI.
- Thanks to Edexal for the original filter-saver concept:
  https://greasyfork.org/en/scripts/523141-f95-latest-update-saver
