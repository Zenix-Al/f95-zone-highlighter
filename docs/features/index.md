# Features Overview (`src/features`)

The `features` directory contains all the modular functionalities of the Latest Highlighter userscript. 

## Philosophy

Every visual change, background polling logic, or behavior modification in the userscript is built as a **Feature**. This ensures that functionalities can be easily toggled by the user, fail gracefully without crashing the whole script, and keep the global scope clean.

## Existing Features

The features currently included in the project are:
- `audio`: Controls sound notifications.
- `latest-overlay`: Core functionality. Highlights and color-codes thread tiles on the Latest page based on tags, version, and user preference.
- `wide-latest` & `wideForum`: UI adjustments to expand content width.
- `signature-collapse`: Collapses overly large user signatures to keep threads readable.
- `dismiss-notification`: Enhances notification dismissal workflows.
- `latest-ajax-error-recovery`: Automatically recovers from failed network requests on dynamic pages.

*(See the `src/features` directory for a complete and up-to-date list).*

## How Features Are Registered

Features do not magically run by themselves. They must be imported into `src/core/featureCatalog.js` and exported. The bootstrap sequence reads the catalog and initializes them.

See [Creating Features](creating-features.md) for a guide on how to add a new feature.
