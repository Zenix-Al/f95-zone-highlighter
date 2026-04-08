# Changelog

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
