# Changelog

## v1.0.3 - Fix image repair

- Fix attachment error events bypassing the configured retry interval and triggering retries immediately.
- Coalesce repeated image errors into one bounded scheduled retry instead of starting overlapping attempts.
- Stop tracking repaired or normally loaded images and report repair activity only while retries are active.
- Clarify that the image retry interval is the minimum delay before each retry attempt.

## v1.0.1 - Background Latest recovery

- Start the Latest error-payload shield at document start so background-tab aborts cannot crash the site's error handler before core registration completes.
- Recover eligible Latest failures through the site's own Retry control so its private request and card-rendering flow remains authoritative.
- Request the bounded page-context capability required to activate Latest recovery on `/sam/latest_alpha/`.
- Show a core toast when Latest Ajax recovery performs its bounded retry.
- Add a core-panel setting to hide both repair toasts and the active image-repair status indicator.

## v1.0.0 - Rebrand as F95UE Site Repair

- Preserve the Image Repair userscript namespace and GreasyFork listing identity.
- Canonicalize runtime/state identity to `site-repair-addon` with `image-repair-addon` as a legacy ID.
- Move Latest Ajax Recovery from core into an independently controlled, Latest-only repair with one bounded retry and reversible jQuery restoration.
- Start the add-on repair from its own default instead of importing the unreleased core preference.
- Make image repair retry limit and retry interval configurable from the core add-on panel.

Note : require v5.2.0 core
