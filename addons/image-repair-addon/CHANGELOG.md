# Changelog

## v0.2.1 - Code Quality Improvements and optimizations

- Refactored for dom modification efficiency and better separation of concerns.
- Script wont execute repair unless page is ready state is complete.

## v0.1.1 - Core Add-on API Update

- Migrated CSS injection to core style registry (`ui.style.register` / `ui.style.unregister`).
- Styles are now auto-removed by core on disable or page change; no manual teardown needed.
- Observer and command listeners now fully removed via core lifecycle hooks (`addon.before-disable`, `addon.before-page-change`).
- Disabled state on unsupported pages now correctly reports `Installed + Idle` instead of appearing uninstalled.
- Add-on survives idle disable/enable cycles without breaking next thread-page activation.

## v0.1.0 - Initial Release

- First public add-on release.
- Adds automatic retry flow for broken F95Zone attachment images.
- Includes queue-based retry processing to avoid hammering page performance.
- Adds lightweight progress toast with success/fail counters.
- Registers with core add-on bridge for status, settings, and runtime controls.
- Supports enable or disable from the main F95UE Add-ons UI.
