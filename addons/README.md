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

## Dock Buttons: Quick Guide

For page dock buttons, permissions are already easy. The most reliable pattern is:

1. For simple button actions, use `ui.dock.setButtons` and listen for `dock-action` commands.
2. For custom HTML, use `ui.mount` with `slot: "page.dock"` and handle clicks via delegated/composed path logic.

Do not access core internals such as `stateManager.get("shadowRoot")` from add-ons.
Core owns shadow DOM details and may change structure without add-on-facing API changes.

### Option A: Simple Dock Buttons (Recommended)

Required capabilities in add-on manifest:

```json
["ui", "feature", "toast"]
```

Example:

```js
await bridge.invokeCoreAction("ui.dock.setButtons", {
	buttons: [
		{ id: "open-library", label: "Library", variant: "secondary" },
		{ id: "toggle-thread", label: "Save to Library", variant: "primary" },
	],
});

window.addEventListener("f95ue:addon-command", (event) => {
	const detail = event?.detail || {};
	if (detail.addonId !== runtime.addonId) return;
	if (detail.command !== "dock-action") return;

	const actionId = String(detail.actionId || "").trim();
	if (actionId === "open-library") {
		openManager();
		return;
	}
	if (actionId === "toggle-thread") {
		void toggleCurrentThreadFromDock();
	}
});
```

To clean up:

```js
await bridge.invokeCoreAction("ui.dock.removeButtons", {});
```

### Option B: Custom Dock Markup with ui.mount

Required capabilities in add-on manifest:

```json
["ui", "ui.mount"]
```

Example:

```js
await bridge.invokeCoreAction("ui.mount", {
	mountId: "library-dock-widget",
	slot: "page.dock",
	html: renderDockMarkup(),
});

const onDockClick = (event) => {
	const path = typeof event.composedPath === "function" ? event.composedPath() : [];
	const actionEl = path.find(
		(node) => node?.nodeType === 1 && typeof node.matches === "function" && node.matches("button[data-action]"),
	);
	if (!actionEl) return;

	const inLibraryDock = path.some(
		(node) => node?.nodeType === 1 && node.getAttribute?.("data-role") === "libraryDock",
	);
	if (!inLibraryDock) return;

	const action = String(actionEl.dataset.action || "").trim();
	if (action === "open-library") openManager();
	if (action === "toggle-thread") void toggleCurrentThreadFromDock();
};

window.addEventListener("click", onDockClick, true);
```

To clean up:

```js
window.removeEventListener("click", onDockClick, true);
await bridge.invokeCoreAction("ui.unmount", { mountId: "library-dock-widget" });
```

### Choosing Between A and B

- Use Option A when you only need up to a few regular dock buttons.
- Use Option B when you need custom layout/markup inside the dock.
- If in doubt, start with Option A.
