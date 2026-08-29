# Creating a Core Feature

Core features are generated, page-scoped lifecycle descriptors. Do not attach
feature work directly to `window.onload`, manually register it in the loader,
or edit the generated manifest.

## 1. Create the feature module

Create `src/features/<feature>/index.js`. Larger features may keep DOM or domain
logic in neighboring modules, and CSS-backed features may include `style.css`.

Export a const whose name ends in `Feature`:

```js
import { createStyledFeature } from "../../core/createStyledFeature.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";
import featureCss from "./style.css";

function enableExample() {
  document.documentElement.classList.add("example-enabled");
}

function disableExample() {
  document.documentElement.classList.remove("example-enabled");
}

export const exampleFeature = createStyledFeature("Example", {
  configPath: "latestSettings.example",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  bootstrapMode: "waitForBody",
  styleCss: featureCss,
  enable: enableExample,
  disable: disableExample,
  settingsUi: {
    id: "example",
    sectionId: "latest",
    metaMaps: [{
      exampleToggle: createToggleSetting({
        text: "Example feature",
        tooltip: "Enable the example on Latest Updates.",
        config: "latestSettings.example",
        custom: () => exampleFeature.sync(),
        toast: createEnabledDisabledToast("Example feature"),
      }),
    }],
  },
});
```

Use `createFeature()` when no feature-owned CSS is needed. Use
`createStyledFeature()` to let the style registry acquire and release CSS with
the lifecycle.

## 2. Declare configuration and scope

- Add persisted defaults to `src/config/defaults.js`.
- Add validation and transfer metadata to `src/config/schema.js`.
- Use an existing key from `src/config/pageDefinitions.js` in `pageScopes`.
- Add a page definition only when the repository does not already describe the
  route. Runtime page-state paths are derived from those definitions.
- Use `fast` bootstrap only for work that must begin before body readiness;
  ordinary DOM features should use `waitForBody`.

Settings sections currently owned by core are `global`, `latest`, `thread`, and
`color`. Feature toggles should use `createToggleSetting()` so lifecycle and
toast callbacks are placed under the required `effects` metadata.

## 3. Own and reverse resources

Every resource created by `enable()` must be absent after `disable()`:

- use `src/core/listenerRegistry.js` for event listeners;
- use `src/core/observer.js` instead of constructing `MutationObserver`;
- use `src/core/resourceManager.js` for other owned cleanup;
- use task/frame-budget utilities for substantial collections or repeated work;
- honor lifecycle cancellation for asynchronous work before committing results.

Feature CSS belongs in the feature style registry. Core settings and dialogs
use Shadow DOM, while page features and add-on mounts may live in different DOM
roots; choose selectors for the actual owner rather than assuming one root.

## 4. Generate the manifest

The generator discovers `*Feature` exports under `src/features/*/index.js`:

```bash
node -e "require('./scripts/featureManifest.cjs').generateFeatureManifest({ rootDir: process.cwd() })"
```

Do not manually import the feature into `src/loader.js`, call
`registerFeature()`, or edit `src/generated/features.generated.js`.

## 5. Verify

Add focused tests for configuration, scope, lifecycle, route changes, cleanup,
and any substantial processing behavior. Then run:

```bash
npm run lint
npm test
git diff --check
```

Do not run a release build merely to validate source. Use the manifest command
above or the non-version-bumping smoke/audit commands documented in the root
README and `AGENTS.md`.
