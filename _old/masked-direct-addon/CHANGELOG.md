# Changelog

## v0.3.40 - Treat Workupload start page as handoff success

- Stop requiring detector confirmation on Workupload `/start/*` pages, because the host starts downloads through native browser behavior that the fetch/XHR detector cannot observe.
- Delay Workupload `/start/*` success reporting slightly so the page has time to trigger its automatic download.

## v0.3.39 - Improve Datanodes reliability and parallel direct-download handling

- Share host DOM helpers across direct-download hosts.
- Add parallel direct-download handling for Datanodes and other hosts that support multiple download buttons on the same page, so when multiple process download buttons are clicked, the add-on will handle them in parallel.

## v0.3.29 - Add Workupload support

- Add Workupload direct-download routing for `workupload.com/file/*` pages.
- Preserve add-on automation markers when moving from Workupload file pages to `/start/*`.
- Leave Workupload start pages open and warn the user when the download cannot be confirmed before timeout.

## v0.3.26 - Park Vik1ngFile host research

- Remove Vik1ngFile from active host metadata, userscript matches, settings, and public supported-host docs.
- Keep the Vik1ngFile host source parked for future research, because the current host flow is gated by Cloudflare human verification and should not be advertised as supported automation.

## v0.3.23 - Centralize supported host metadata

- Add a supported-host metadata registry for canonical host matching, setting defaults, and settings UI rows.
- Move direct-download host handler wiring into a host handler registry.
- Stop hardcoding supported host branches in main settings, download-page detection, and direct-download routing.

## v0.3.22 - Share host DOM helpers

- Move repeated host text and element-state helpers into `src/hosts/shared/dom.js`.
- Reuse the shared helpers in Datanodes and Vik1ngFile host handlers.

## v0.3.21 - Adopt Vik1ngFile host support

- Add `vik1ngfile.site/f/*` direct-download automation behind its own host toggle.
- Add extra MediaFire fallback selectors from the reference downloader script.
- Keep MediaFire folder-page UI out of the add-on because folder picking is separate from masked/direct host automation.

## v0.3.20 - Fix direct download and part ways with core for toast

- Add Buzzheavier short-domain support for `bzzhr.to`.
- Rework direct-download notifications. It now uses this add-on own GM storage event bus and only asks core for local toast display on F95 pages.
- Send direct-download success/failure toasts back to the originating F95 tab instead of relying on download host pages to update core status.
- Reinforce Datanodes flow again. The main problem was the first step silently failing when the target element was not there yet; now it waits for page readiness and target buttons more carefully before continuing.

## v0.3.14 - Fix download detector

- Download detector now wont close tab when its not triggered by this addon.

## v0.3.12 - Fix delay config and improve download handling

- add download detector to close the tab after download is triggered.
- fix the delay config for auto close, now it should work as expected.
- fix datanodes steps to trigger download more reliably.

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
