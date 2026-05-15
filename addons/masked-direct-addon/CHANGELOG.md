# Changelog

## v0.3.7 - confiureablee auto close

- remove unecessary toast call when this addon failing.
- add configureable auto close timing and increase the default auto close tab to 3500ms to avoid tab cosed too fast.

## v0.2.9 - more host support + bugfixes

- Added support for mediafire.com direct-download flow.
- Fix datanodes.to always gets triggered because of my mistake
- other code improvement for development and future maintenance

No core update required.

## v0.2.1 - Core Add-on API Update + Gofile Fix

- Migrated all host-page UI styles to core CSS registry (`ui.style.register` / `ui.style.unregister`).
- Transient download-flow UI is now routed through core slot and mount API; core owns DOM placement.
- Teardown now fully removes all route hooks, intervals, and observers on disable; no UI residue left on page transitions.
- Fixed Gofile automation: updated flow to work again with current Gofile page structure.
- Restored masked-link and direct-download flows across all supported host pages after API migration.

## v0.1.6 - Buzzheavier Automation Restored

- Restored Buzzheavier direct-download automation.
- Adds host-side handler that clicks native Download button directly.
- Adds failure warning paths for missing button, bad endpoint, and unavailable file.
- Adds root and wildcard Buzzheavier userscript matches.
- Keeps tab auto-close behavior when download is successfully triggered.

## v0.1.0 - Initial Release

- First public add-on release.
- Combines masked-link resolver and direct-download routing in one add-on.
- Includes host flows for Gofile, Pixeldrain, and Datanodes.
- Adds page-aware automation gate and direct-download safety messaging.
- Adds settings for host package toggles in Add-ons panel.
