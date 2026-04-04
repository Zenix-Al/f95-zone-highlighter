# Add-ons Workspace

This workspace builds optional add-on userscripts that integrate with F95UE core.

## Goals

- Keep main script lean.
- Ship heavy/optional features as separate userscripts.
- Allow add-ons to use core functionality through a permission-checked bridge.

## Structure

- `addons/addons.manifest.json`: add-on build manifest.
- `addons/build-addon.js`: add-on userscript builder.
- `addons/<addon-id>/src/main.js`: add-on source.
- `addons/<addon-id>/dist/*.user.js`: build output.

## Build Commands

```bash
npm run build:addons
npm run build:addons:release
npm run build:addon:image-repair
```

## Runtime Contract

Add-ons send commands via `window.dispatchEvent(new CustomEvent("f95ue:addons-dev-command", ...))`.

Core currently supports:

- `ping` (detect if core bridge is available)
- `register`
- `unregister`
- `update-status`
- `core-action` (permission-checked)

Example capability currently implemented:

- `toast` -> allows `core-action: "toast.show"`

## Core Requirement

Add-ons in this workspace can mark `requiresCore: true` in manifest. These add-ons exit early if core is not detected.
