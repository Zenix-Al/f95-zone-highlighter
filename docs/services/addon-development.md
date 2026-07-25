# Add-on Development Guide (`addon-development.md`)

This guide explains how to design, structure, and write an external F95UE Add-on. It serves as a detailed reference for the APIs exposed by the Core message bridge and is designed to supplement the high-level outline in [addons/README.md](../../addons/README.md).

The manifest ID is the canonical runtime identity. For an identity migration, declare sanitized
`legacyIds` in the manifest. The catalog and core state repository resolve those aliases to the
canonical ID before building installed snapshots or UI cards. Canonical state fields win conflicts;
the earliest valid install sighting and latest valid last sighting are retained, and the state/meta
move is one revisioned commit. Keep the alias-aware core/catalog release ahead of the renamed
userscript, verify old and new runtimes produce one canonical card, then remove the alias in a later
release. This does not change the bridge handshake, transport, headers, or public action response
shapes.

Site Repair is the concrete release example: `site-repair-addon` declares
`image-repair-addon` as a legacy ID while explicitly retaining the old userscript
namespace and GreasyFork download identity. Publish the alias-aware core/catalog
before replacing the old userscript, then publish the renamed userscript to the
existing listing.

Site Repair also owns Latest Ajax Recovery. The unreleased core preference is not
imported: `latestSettings.latestAjaxErrorRecovery` is now an unsupported field,
is dropped from live configuration by tolerant sanitization, and disappears from
the canonical envelope on the next normal config commit. Site Repair uses its own
independent default. Do not release a core copy of the patch at the same time as
the add-on patch.

---

## Recommended Add-on Structure

Follow the canonical `example-addon`. The folders describe ownership, not mandatory ceremony; a tiny add-on may combine small modules while preserving the same dependency direction.

```text
addons/<your-addon-id>/
|-- CHANGELOG.md
|-- src/
|   |-- main.js                    Runtime metadata and bootstrap only
|   |-- constants.js               Stable IDs, keys, limits, and database names
|   |-- core/
|   |   `-- adaptor.js             Event transport adaptation
|   |-- api/                       Thin wrappers containing raw core action IDs
|   |   |-- bridge.js
|   |   |-- storage.js
|   |   |-- idb.js
|   |   `-- ui/
|   |-- app/
|   |   |-- create<AddonName>App.js Instance composition
|   |   |-- lifecycle.js            Lifecycle construction
|   |   |-- commands.js             Incoming command routing
|   |   |-- registration.js         Registration/status descriptors
|   |   |-- settings.js             Defaults, normalization, and settings UI descriptors
|   |   |-- uiController.js         Core-hosted UI resource ownership
|   |   `-- actions/
|   |       |-- index.js             Action-family composition
|   |       `-- <family>.js          Focused application handlers
|   |-- domain/
|   |   |-- state.js                 Add-on-owned runtime state
|   |   |-- <domain>.js              Records and pure transformations
|   |   `-- <workflow>/controller.js Optional substantial workflow
|   `-- ui/                           Markup, CSS, renderers, and DOM bindings
`-- dist/                             Generated output; never edit manually
```

Ownership rules:

- `main.js` creates runtime metadata, the core adaptor, and one app instance.
- `core/` knows how messages move; it does not know domain behavior.
- `api/` owns raw action strings and thin payload wrappers.
- `app/` wires one running instance and coordinates lifecycle owners.
- `app/actions/` groups application handlers by capability or behavior family.
- `domain/` owns records, state shapes, transformations, and substantial workflows; it never invokes raw bridge actions directly.
- `ui/` renders markup and owns browser event bindings; application resource orchestration remains in `app/uiController.js`.

See `example-addon/src/app/actions/`, `example-addon/src/domain/`, and `example-addon/src/app/uiController.js` for the complete reference.

For a hybrid add-on, use Masked Direct as the complementary reference:
`app/contexts/` owns F95 and external-page lifecycle controllers,
`domain/directDownload/` owns cross-host detection and routing, `hosts/` owns host
adapters, `ports/` owns repository contracts, and `infrastructure/` owns direct GM
compatibility. Hybrid standalone execution must remain independent from the
core-required bootstrap and emit no bridge traffic on external hosts.

---
## Composition and Bootstrap (`main.js`)

The entry point of an add-on resolves metadata injected by the builder (`__ADDON_ID__`, etc.) and boots the app only if the Core is detected on the page.

```javascript
import { createCoreAdaptor } from "./core/adaptor.js";
import { waitForCorePing } from "./api/bridge.js";
import { createAddonApp } from "./app/createAddonApp.js";

const runtime = {
  addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "my-addon",
  addonName: typeof __ADDON_NAME__ === "string" ? __ADDON_NAME__ : "My Add-on",
  addonVersion: typeof __ADDON_VERSION__ === "string" ? __ADDON_VERSION__ : "1.0.0",
  addonDescription: typeof __ADDON_DESCRIPTION__ === "string" ? __ADDON_DESCRIPTION__ : "Description...",
  capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
  requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
};

const core = createCoreAdaptor(runtime.addonId);
const app = createAddonApp({ core, runtime });

async function bootstrap() {
  const ping = await waitForCorePing(core);
  if (!ping.ok && runtime.requiresCore) {
    console.info(`[${runtime.addonId}] F95UE core not detected; add-on skipped.`);
    return;
  }

  try {
    await app.bootstrap();
  } catch (error) {
    console.error(`[${runtime.addonId}] bootstrap failed:`, error);
    core.updateStatus("broken", `Failed to initialize: ${error.message}`);
  }
}

void bootstrap();
```

---

## API Client Reference

All API calls from an add-on to the Core are channeled through the `core.invokeCoreAction(actionString, payload)` method (implemented in `core/adaptor.js`).

Here is the exact signature and usage for the modules in `src/api/`:

### 1. Bridge & Lifecycle (`bridge.js`)
Handles initial handshaking, registration, and status reporting.

#### `waitForCorePing(core, timeoutMs)`
- **Arguments**: `core` (Adaptor instance), `timeoutMs` (number, optional, defaults to 1500)
- **Returns**: `Promise<{ ok: boolean, apiVersion: string }>`
- **Usage**:
  ```javascript
  const ping = await waitForCorePing(core);
  ```

#### `registerAddonRuntime(core, addonManifest)`
- **Arguments**: `core` (Adaptor), `addonManifest` (object)
- **Returns**: `void`
- **Usage**:
  ```javascript
  registerAddonRuntime(core, {
    id: runtime.addonId,
    name: runtime.addonName,
    version: runtime.addonVersion,
    status: "installed",
    capabilities: runtime.capabilities,
    pageScopes: ["thread", "latest"],
  });
  ```

#### `updateAddonRuntimeStatus(core, status, statusMessage)`
- **Arguments**: `status` ("installed" | "disabled" | "broken"), `statusMessage` (string, optional)
- **Usage**:
  ```javascript
  updateAddonRuntimeStatus(core, "broken", "Failed to connect to database");
  ```

### Core-rendered add-on settings

Settings controls are registration metadata, not a separate rendering action. Put
defaults, normalization, loading, and the descriptors in `app/settings.js`; let
`app/registration.js` include them in the runtime descriptor:

```javascript
registerAddonRuntime(core, {
  // Normal identity, scope, and capability fields...
  panelSettingsTitle: "My Add-on Settings",
  panelSettingsDescription: "Changes are stored under this add-on's namespace.",
  panelSettingsStorageKey: "settings",
  panelSettingsDefaults: {
    enabled: true,
    retryLimit: 3,
  },
  panelSettings: [
    { path: "enabled", text: "Enable behavior", type: "toggle" },
    {
      path: "retryLimit",
      text: "Retry limit",
      type: "number",
      min: 0,
      max: 10,
      step: 1,
    },
  ],
});
```

Core reads and writes `panelSettingsStorageKey` through the add-on's namespaced
storage actions, renders the controls in the add-on card, and requests
`feature.refresh` after a successful write. The add-on must reload, normalize, and
apply those values during refresh. Current controls are `toggle` and bounded
`number`. See `example-addon/src/app/settings.js` and `registration.js`.

---

### 2. Feature Control (`feature.js`)
Exposes toggle states of the add-on feature.

#### `enableFeature(core)` / `disableFeature(core)` / `refreshFeature(core)`
- **Usage**:
  ```javascript
  await enableFeature(core); // Request core to set state to active
  ```

---

### 3. Toast notifications (`toast.js`)
Allows the add-on to show notifications.

#### `showCoreToast(core, message, type)`
- **Arguments**: `message` (string), `type` ("info" | "warn" | "error", default "info")
- **Usage**:
  ```javascript
  await showCoreToast(core, "Data imported successfully!", "info");
  ```

---

### 4. Scoped Storage (`storage.js`)
Persists small JSON settings, namespaced to the add-on's ID (64KB total storage limit).

#### `getStoredValue(core, key, defaultValue)`
- **Returns**: `Promise<{ ok: boolean, value: any }>`
- **Usage**:
  ```javascript
  const res = await getStoredValue(core, "user-theme", "light");
  const currentTheme = res.value;
  ```

#### `setStoredValue(core, key, value)`
- **Returns**: `Promise<{ ok: boolean }>`
- **Usage**:
  ```javascript
  await setStoredValue(core, "user-theme", "dark");
  ```

#### `getStorageUsage(core)`
- **Returns**: `Promise<{ ok: boolean, value: { valueCount: number, estimatedBytes: number, valueLimitBytes: number, totalLimitBytes: number } }>`

#### `getTagPrefs(core)`
- **Returns**: `Promise<{ ok: boolean, value: { tags: Array, preferredTags: Array, excludedTags: Array, markedTags: Array, color: Object } }>`
- **Usage**: Used to fetch the parent userscript's tag definitions and preferences.
  ```javascript
  const res = await getTagPrefs(core);
  ```

---

### 5. Structured Data & IndexedDB (`idb.js`)
For bulk storage. **Important**: Every IDB query payload must supply the schema structure (`dbName`, `storeName`, `keyPath`, and optional `indexes`).

```javascript
const idbSchema = {
  dbName: "my-custom-addon-db",
  storeName: "records",
  keyPath: "id",
  indexes: [{ name: "updatedAt", keyPath: "updatedAt" }]
};
```

#### `putRecord(core, { ...schema, value })`
- **Usage**:
  ```javascript
  const res = await putRecord(core, { ...idbSchema, value: { id: "rec_1", val: 42, updatedAt: Date.now() } });
  // res.value will return the key written
  ```

#### `getRecord(core, { ...schema, key })`
- **Usage**:
  ```javascript
  const res = await getRecord(core, { ...idbSchema, key: "rec_1" });
  ```

#### `deleteRecord(core, { ...schema, key })`
- **Usage**:
  ```javascript
  await deleteRecord(core, { ...idbSchema, key: "rec_1" });
  ```

#### `bulkPutRecords(core, { ...schema, entries: Array })`
- **Usage**: Bulk writing (limited to `maxBulkItems` from `addon.throttle`).
  ```javascript
  await bulkPutRecords(core, { ...idbSchema, entries: [{ id: "1" }, { id: "2" }] });
  ```

#### `queryRecords(core, { ...schema, indexName, range, direction, limit, offset })`
- **Usage**: Query records, supporting indexes and bounds.
  ```javascript
  const res = await queryRecords(core, { ...idbSchema, limit: 10 });
  ```

---

### 6. DOM Mutation Observer (`observer.js`)
Add-ons watch DOM mutations using a centralized subscription to keep performance overhead low.

#### `watchObserver(core, observerId, options)`
- **Arguments**: `observerId` (string, unique to add-on), `options` (object, e.g. `{ selector: ".tile" }` to filter callback triggers)
- **Usage**:
  ```javascript
  await watchObserver(core, "thread-watcher", { selector: ".structItem-title a" });
  ```
  After watching, bind a command handler (see bridge bindings below) to listen for the `"observer.nodes"` command.

#### `unwatchObserver(core, observerId)`
- **Usage**:
  ```javascript
  await unwatchObserver(core, "thread-watcher");
  ```

---

### 7. UI Mounts, Dialogs, Styles & Dock (`ui/`)

#### `registerStyle(core, styleId, cssText)` / `unregisterStyle(core, styleId)`
- **Usage**: Injects a CSS stylesheet into the isolated Shadow DOM structure.
  ```javascript
  await registerStyle(core, "custom-styles", exampleCssText);
  ```

#### `mountUi(core, { mountId, html, slot, position })`
- **Arguments**: `slot` ("body" | "page.dock" | "page.panel" | "page.floating" | "selector:<css-selector>")
- **Usage**:
  ```javascript
  await mountUi(core, {
    mountId: "my-widget",
    html: "<div class='widget'>Widget</div>",
    slot: "page.dock",
    position: "append",
  });
  ```

#### `openDialog(core, { dialogId, title, html, size, closeOnEsc, closeOnBackdrop })`
- **Usage**: Opens a modal Dialog within the core Shadow DOM.
  ```javascript
  await openDialog(core, {
     dialogId: "import-dialog",
     title: "Bulk Import",
     html: "<div>Import records...</div>",
     size: "lg"
  });
  ```

#### `setDockButtons(core, buttonsArray)`
- **Usage**: Adds standard buttons to the F95UE core dock (Max 4 buttons).
  ```javascript
  await setDockButtons(core, [
    { id: "action-sync", label: "Sync Now", variant: "primary" },
    { id: "action-config", label: "Settings", variant: "secondary" }
  ]);
  ```

---

## Event Handlers (Listening for Core Commands)

To receive commands from the Core (such as click triggers on dock buttons, lifecycle triggers, or observer matches), bind a handler in `main.js` or `app/`:

```javascript
import { bindRuntimeCommands } from "../api/bridge.js";

// Inside bootstrap/initialization:
const unbind = bindRuntimeCommands(core, (detail) => {
  const { command } = detail;
  
  if (command === "teardown") {
    // Release resources, cancel timers, then notify core
    unbind();
    notifyTeardownComplete(core, "teardown-processed");
  } 
  else if (command === "dock-action" && detail.actionId === "action-sync") {
    triggerSyncRoutine();
  } 
  else if (command === "observer.nodes") {
    // Process matching mutated nodes sent by core
    const nodes = detail.nodes || [];
    processMutatedElements(nodes);
  }
});
```

### Sanitization and Mount Safety

Add-ons may request UI mounts that inject HTML into the core UI. The add-on service enforces ownership and sanitization rules, but authors should minimize risk:

- Prefer creating DOM using `document.createElement` and `textContent` rather than raw HTML strings.
- If HTML strings are required, keep markup minimal and avoid `<script>` or inline event handlers. Prefer core-provided mount helpers that accept sanitized templates.
- Always unregister mounts and styles during teardown; the core may forcibly unmount on disable but add-ons must attempt graceful cleanup first.

The `addonsService` sanitizes and validates mount requests; do not rely on implicit sanitization â€” validate your own payloads before sending them to the bridge.

---

## Validation & Cleanup Best Practices

Every add-on is required to support robust cleanup to prevent freezing users' browsers:
1. **Always clean up UI before Styles**: Unmount widgets and close open dialogs *before* unregistering the CSS style sheet.
2. **Handle Teardown command**: If Core issues `command === "teardown"`, you must cancel all running operations, unwatch observers, remove event listeners, unmount UI, and dispatch `notifyTeardownComplete(core)`.
3. **Throttling compliance**: For large IndexedDB tasks, query `getCoreThrottle()` and paginate writes using `suggestedMinIntervalMs`.
