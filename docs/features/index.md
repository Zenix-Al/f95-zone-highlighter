# Features Overview (`src/features`)

The `features` directory contains all the modular functionalities of the Latest Highlighter userscript. 

## Philosophy

Every visual change, background polling logic, or behavior modification in the userscript is built as a **Feature**. This ensures that functionalities can be easily toggled by the user, fail gracefully without crashing the whole script, and keep the global scope clean.

## Existing Features (synchronized from generated manifest)

The canonical list of features is produced by the manifest generator and kept in `src/generated/features.generated.js`.

Current features (automatically discovered):

<!-- GENERATED:FEATURE-INVENTORY:START -->
- `dismissNotificationFeature` — `src/features/dismiss-notification/index.js`
- `latestAjaxErrorRecoveryFeature` — `src/features/latest-ajax-error-recovery/index.js`
- `latestControlFeature` — `src/features/latest-control/index.js`
- `latestOverlayFeature` — `src/features/latest-overlay/index.js`
- `signatureCollapseFeature` — `src/features/signature-collapse/index.js`
- `threadOverlayFeature` — `src/features/thread-overlay/index.js`
- `wideLatestPageFeature` — `src/features/wide-latest/index.js`
- `denseLatestGridFeature` — `src/features/wide-latest/index.js`
- `wideForumFeature` — `src/features/wideForum/index.js`
<!-- GENERATED:FEATURE-INVENTORY:END -->

- `dismissNotificationFeature` — dismissal improvements and UI hooks.
- `latestAjaxErrorRecoveryFeature` — automatic recovery for Latest page network failures.
- `latestControlFeature` — controls and utilities for Latest behavior.
- `latestOverlayFeature` — core Latest highlighting and overlay logic.
- `signatureCollapseFeature` — collapse and manage large signatures.
- `threadOverlayFeature` — thread-specific overlay and highlighting.
- `wideLatestPageFeature` — layout adjustments for wide Latest pages.
- `denseLatestGridFeature` — alternative dense grid for Latest.
- `wideForumFeature` — layout adjustments for forum pages.

For an up-to-date list, run the manifest generator or inspect `src/generated/features.generated.js`.

## How Features Are Registered

Features are discovered and registered via a generated manifest. Do not manually import features into `src/core/featureCatalog.js`.

Workflow:

- Export your feature as a `*Feature` export from the feature module (e.g. `export const myFeature = createFeature(...)`).
- The repository's manifest generator (`scripts/featureManifest.cjs`) discovers `*Feature` exports and builds a generated manifest used by the loader.
- The loader reads the generated manifest and the runtime `featureCatalog` contains the registrations used during bootstrap.

See [Creating Features](creating-features.md) and the manifest script for details.
