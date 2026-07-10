# Add-ons Service (`addonsService.js`)

The `addonsService.js` and its sub-modules (located in `src/services/addons/`) form the runtime environment for third-party or optional userscripts ("add-ons") that extend Latest Highlighter. It manages sandboxing, permission gating, inter-script events, and API rate-limiting.

---

## Architecture Overview

Since userscripts run in isolated execution environments (or namespaces), direct function sharing is unsafe and fragile. The F95UE core uses an **Asynchronous Event-Based Message Bridge** to communicate with add-ons.

```text
+------------------+                   +-------------------+
|  F95UE Add-on    |                   |    F95UE Core     |
+--------+---------+                   +---------+---------+
         |                                       |
         | CustomEvent("f95ue:addons-dev-cmd")  |
         |-------------------------------------->|
         | (type: "register")                    |
         |                                       |
         |                                       | Validate manifest &
         |                                       | capabilities
         | CustomEvent("f95ue:addon-command")    |
         |<--------------------------------------|
         | (command: "after-register")           |
         |                                       |
         |                                       |
         |  API Call (Core Action)               |
         |                                       |
         | CustomEvent("f95ue:addons-dev-cmd")  |
         |-------------------------------------->| (Check permissions,
         | (action: "toast.show", replyEvent)    |  throttling, execute)
         |                                       |
         | CustomEvent(replyEvent)               |
         |<--------------------------------------|
         | (payload: { ok: true })               |
```

### The Communication Contract
- **Addon ➔ Core**: Dispatched on `window` using the event name `f95ue:addons-dev-command` (stored as `ADDONS_DEV_COMMAND_EVENT` in `shared.js`).
- **Core ➔ Addon**: Dispatched on `window` using the event name `f95ue:addon-command` (stored as `ADDON_COMMAND_EVENT` in `shared.js`).

---

## Add-on Registration

An add-on registers itself by broadcasting its runtime metadata to the core:

```javascript
window.__F95UE_ADDONS_DEV__.register({
  id: "my-custom-addon",
  name: "My Custom Add-on",
  version: "1.0.0",
  description: "Description of what it does.",
  capabilities: ["toast", "storage"], // Requested permissions
  pageScopes: ["thread", "latest"],   // Pages where this add-on should execute
});
```

### Security & Trust Gating
During registration, `registry.js` checks:
1. **Trust Status**: Checks if the add-on ID is listed in the `trustedIds` config, the trusted catalog (`catalog.js`), or is a built-in add-on.
2. **Untrusted Mode**: If the add-on is untrusted and the user settings block untrusted add-ons (`allowUntrustedAddons` is false), the add-on status is forced to `disabled` and its capabilities are stripped.

---

## Core Actions (API Reference)

Core actions are requested by sending `type: "core-action"` with the specific action name and a payload. Each action is bound to a capability permission. If an add-on attempts to call an action without the proper capability, it is blocked with `permission_denied`.

| Capability | Action String | Description / Payload |
| :--- | :--- | :--- |
| **`toast`** | `toast.show` | Displays a toast in the main UI.<br>`{ message: string, type: 'info'\|'warn'\|'error' }` |
| **`feature`** | `feature.enable`<br>`feature.disable`<br>`feature.refresh` | Controls the active status of the add-on feature. |
| **`storage`** | `storage.get`<br>`storage.set`<br>`storage.getUsage`<br>`config.getTagPrefs` | Scoped key-value storage. Total storage is capped at 64KB total per add-on. |
| **`idb`** | `idb.get`<br>`idb.put`<br>`idb.delete`<br>`idb.bulkPut`<br>`idb.bulkDelete`<br>`idb.query`<br>`idb.count` | Interface to IndexedDB databases. Key-paths and schemas must be supplied in payloads. Payload sizes are capped at 512KB per write. |
| **`observer`**| `observer.watch`<br>`observer.unwatch` | Subscribes/unsubscribes to DOM mutations detected by core. |
| **`ui.style`**| `ui.style.register`<br>`ui.style.unregister` | Registers custom CSS strings. Injected into the core Shadow DOM to bypass boundary limits. Max 64KB. |
| **`ui.mount`**| `ui.mount`<br>`ui.update`<br>`ui.unmount` | Mounts/updates HTML fragments in specific page slots (e.g. `body`, `page.dock`, `latest.filters.after-title`). Max HTML size is 128KB. |
| **`ui.dialog`**| `ui.dialog.open`<br>`ui.dialog.close`<br>`ui.confirm` | Opens/closes modals or triggers confirm dialogs. |
| **`ui.dock`**  | `ui.dock.setButtons`<br>`ui.dock.removeButtons` | Mounts up to 4 custom action buttons to the core dock. |

---

## Rate-Limiting & API Logging

To prevent rogue add-ons from stalling the browser, `bridgeServer.js` enforces request throttling:
- **Core Actions**: Capped at `100` actions per `5` seconds window, and `12` maximum concurrent inflight requests.
- **Status Updates**: Capped at `10` updates per `5` seconds.
- **Exceptions**: Cleanup actions (e.g. `observer.unwatch`, `ui.unmount`) are **unthrottled** to guarantee that teardown can always execute successfully under pressure.

### Warnings & Diagnostics
- If an add-on hits the rate limit, the core replies immediately with `{ ok: false, reason: "rate_limited" }`.
- If concurrent requests exceed limits, it replies with `{ ok: false, reason: "too_many_concurrent_requests" }`.
- Unrecognized UI actions trigger console warnings suggesting migration to newer APIs:
  > `[addonsService] Addon "..." called unrecognized UI action "...". Migrate style injection to ui.style.register.`

---

## How to Add a New API / Core Action

To add a new capability or action to the add-on system:

### 1. Define Capability mapping
Open `src/services/addons/coreActions.js` and add your action name and its required capability to `ACTION_CAPABILITY_ALTERNATIVES`:
```javascript
export const ACTION_CAPABILITY_ALTERNATIVES = Object.freeze({
  // ...
  "myFeature.myAction": ["myCapability"],
});
```

### 2. Implement the Action Handler
Still inside `coreActions.js`, write the handler function:
```javascript
async function actionMyCustomHandler(deps, payload) {
  // Execute logic using core services/dependencies in `deps`
  return { ok: true, value: "Hello from core!" };
}
```

### 3. Register in the Router Map
Add it to the `actionHandlers` map in `invokeRegisteredAddonCoreAction`:
```javascript
const actionHandlers = {
  // ...
  "myFeature.myAction": async (payload) => await actionMyCustomHandler(deps, payload),
};
```

### 4. Provide Add-on side wrappers
Add the helper to `addons/example-addon/src/core/adaptor.js` and expose it through `api/`:
```javascript
// adaptor.js
function invokeMyAction(payload) {
  return invokeCoreAction("myFeature.myAction", payload);
}
```

---

## Potential Optimizations (Hardening Roadmap)

The current core action registry in `coreActions.js` is built as a single monolithic router file with dozens of static imports and a giant nested switch-like map (`actionHandlers`). 

This pattern creates a few problems:
1. **Import bloat**: Modifying or adding actions requires updating one massive handler.
2. **Coupling**: The core actions router directly imports almost all UI handlers, IndexedDB stores, and registries.

### Rework Plan
In the future, we should modularize this architecture:
- Define an **Action Registry** where actions are dynamically registered.
- Split each action namespace (e.g., `idb`, `ui`, `storage`) into separate module files (e.g., `src/services/addons/actions/idbActions.js`).
- Allow the router to load or look up these files dynamically or register them during bootstrapping, making it cleaner to scale the API.
