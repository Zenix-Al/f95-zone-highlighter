# Extension Guide

Adding core settings:

1. Choose owning metadata module.
2. Define stable `config` path.
3. Select supported input type.
4. Add coercion rules if needed.
5. Define effect for live updates.
6. Contribute metadata to correct section via `contributeToSection()`.
7. Test persistence and rerendering.

Adding a new input type requires updates to `createInput.js`, `coerceSettingValue.js`, styling, keyboard/accessibility, and tests.

Adding an add-on mount:

1. Define host in `addonUiHosts.js`.
2. Implement insertion in `addonMount.js`.
3. Define cleanup and ownership.
4. Test cross-boundary styling and unmount behavior.