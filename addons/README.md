# F95UE Add-on Development

F95UE add-ons are separate userscripts that register with the core userscript and request capability-gated services through an event bridge.

Use [`example-addon`](example-addon/) as the canonical implementation. It deliberately exercises every current add-on-facing action and is the best starting point for a new add-on.

## Design Rules

- Keep optional or specialized features outside the core script.
- Treat the core bridge as the public boundary; never import core internals into an add-on.
- Request only the capabilities the add-on uses.
- Keep all persisted data, IndexedDB databases, mounts, styles, dialogs, and observers add-on-scoped.
- Implement enable, disable, refresh, and teardown as repeatable lifecycle operations.
- Edit `src/`, never generated files under `dist/`.

## Canonical Project Structure

The recommended structure mirrors `addons/example-addon`:

```text
addons/<addon-id>/
|-- CHANGELOG.md
|-- src/
|   |-- main.js                  Bootstrap and runtime composition
|   |-- constants.js             IDs, keys, limits, and static definitions
|   |-- core/
|   |   `-- adaptor.js           Event bridge implementation
|   |-- api/
|   |   |-- bridge.js            Registration and lifecycle wrappers
|   |   |-- meta.js              Access and throttle wrappers
|   |   |-- feature.js
|   |   |-- storage.js
|   |   |-- idb.js
|   |   |-- observer.js
|   |   |-- toast.js
|   |   `-- ui/
|   |       |-- dialog.js
|   |       |-- dock.js
|   |       |-- mount.js
|   |       `-- style.js
|   |-- app/
|   |   `-- create<AddonName>App.js
|   `-- ui/
|       |-- *.html
|       |-- *.css
|       `-- renderers and view helpers
`-- dist/
    `-- <addon-id>.user.js        Generated userscript
```

Small add-ons may combine modules, but keep these boundaries clear:

- `core/` knows how messages move.
- `api/` contains thin, action-specific wrappers.
- `app/` owns state and behavior.
- `ui/` renders markup and styles.
- `main.js` composes the runtime and starts it.

Reusable code shared by multiple add-ons belongs in `addons/shared/`.

Add-ons do not need their own `package.json` or metadata file. Build metadata is centralized in `addons/addons.manifest.json`.

## Register an Add-on

Add an entry to `addons/addons.manifest.json`:

```json
{
  "id": "my-addon",
  "name": "F95UE My Add-on",
  "description": "A short userscript description.",
  "version": "0.1.0",
  "author": "Your Name",
  "entry": "addons/my-addon/src/main.js",
  "outfile": "addons/my-addon/dist/my-addon.user.js",
  "matches": ["*://f95zone.to/*"],
  "grants": ["none"],
  "runAt": "document-idle",
  "requiresCore": true,
  "runtimeMode": "core-required",
  "pageScopes": ["f95zone"],
  "downloadUrl": "https://example.invalid/my-addon",
  "capabilities": ["toast", "feature", "storage"]
}
```

The manifest is authoritative for add-on activation and core metadata. `pageScopes` may
contain only `f95zone`, `thread`, or `latest`; `runtimeMode` is one of
`core-required`, `standalone`, or `hybrid`. `requiresCore` remains a compatibility field
and must agree with the runtime mode. Userscript `matches`, `grants`, and `runAt` remain
independent injection metadata and are never used as action authorization.

### Stable identities and legacy aliases

The manifest `id` is the canonical add-on identity and remains the folder, output filename, catalog
key, state key, and UI-card key. A shipped identity that must be retired may declare optional
`legacyIds`, for example `"legacyIds": ["old-example-addon"]`. Each alias must be a sanitized,
unique ID; it must not collide with an active manifest ID, an add-on folder, or a catalog ID, and an
alias may belong to only one canonical add-on. Do not use an alias to rename Image Repair in the
identity package.

Core resolves aliases before reading or committing add-on state. When both identities exist,
canonical fields win conflicts; `installedSeenAt` keeps the earliest valid value and `lastSeenAt`
keeps the latest. State and installed metadata are moved in one revisioned config commit. Failed
commits leave the old alias data intact for retry, while a repeated successful normalization is a
no-op. Catalog entries, installed snapshots, management cards, and runtime registrations expose
one canonical card. A canonical runtime supersedes an old-alias runtime; competing aliases do not
create a second card. Alias resolution does not alter registration transport, handshake identity,
userscript headers, or action response shapes.

Release sequencing for a real rename is: publish the alias-aware core/catalog and state repository
first; publish the userscript with its canonical ID while allowing the old runtime to register;
verify one canonical card and successful state normalization; only then remove the alias in a later
release. The alias is metadata only and is not injected into add-on bundles.

The builder injects these constants into the bundle:

- `__ADDON_ID__`
- `__ADDON_NAME__`
- `__ADDON_VERSION__`
- `__ADDON_DESCRIPTION__`
- `__ADDON_CAPABILITIES__`
- `__ADDON_REQUIRES_CORE__`
- `__ADDON_PAGE_SCOPES__`
- `__ADDON_RUNTIME_MODE__`
- `__ADDON_MATCHES__`

It also generates the userscript header, including matches, grants, version, author, namespace, and core requirement notice.

## Bootstrap Pattern

The entry point should remain small:

```js
import { createAddonApp } from "./app/createAddonApp.js";
import { createCoreAdaptor } from "./core/adaptor.js";
import { waitForCorePing } from "./api/bridge.js";

const runtime = {
  addonId: __ADDON_ID__,
  addonName: __ADDON_NAME__,
  addonVersion: __ADDON_VERSION__,
  addonDescription: __ADDON_DESCRIPTION__,
  capabilities: Array.isArray(__ADDON_CAPABILITIES__)
    ? __ADDON_CAPABILITIES__
    : [],
  requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  pageScopes: Array.isArray(__ADDON_PAGE_SCOPES__) ? __ADDON_PAGE_SCOPES__ : [],
  runtimeMode: __ADDON_RUNTIME_MODE__,
  matches: Array.isArray(__ADDON_MATCHES__) ? __ADDON_MATCHES__ : [],
};

const core = createCoreAdaptor(runtime.addonId);
const app = createAddonApp({ core, runtime });

async function bootstrap() {
  const ping = await waitForCorePing(core);
  if (!ping.ok && runtime.runtimeMode === "core-required") return;
  await app.bootstrap();
}

void bootstrap();
```

Ping before registration. A core-required add-on should exit quietly when F95UE is unavailable.

## Bridge Contract

Add-ons send `CustomEvent("f95ue:addons-dev-command")` commands to core. Core sends `CustomEvent("f95ue:addon-command")` commands back to the registered add-on.

### Add-on to Core

- `ping` — detect core and obtain the API version.
- `register` — publish runtime metadata, capabilities, panel actions, settings, and page scopes.
- `unregister` — remove the runtime registration.
- `update-status` — update installed/disabled/error state.
- `core-action` — invoke a permission-checked service and receive a reply event.
- `teardown-complete` — acknowledge cleanup requested by core.

### Core to Add-on

- `enable` / `disable` — apply the desired feature state.
- `refresh` — re-read or re-render current state.
- `dock-action` — handle a button created by `ui.dock.setButtons`.
- `panel-action` — handle a registered settings-panel action.
- `dialog-closed` — synchronize state after Escape, backdrop, replacement, or API close.
- `observer.nodes` — receive matching DOM nodes from an observer subscription.
- `teardown` — release all resources and acknowledge completion.
- `before-disable`, `before-unregister`, `before-page-change`, and `after-register` — lifecycle notifications.

Always filter incoming events by `detail.addonId`.

## Capabilities and Core Actions

`ui` is accepted as a broad alternative for the specific `ui.*` capabilities. Prefer the narrow capability in new add-ons when practical.

| Capability          | Actions                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `toast`             | `toast.show`                                                                                  |
| `feature`           | `feature.enable`, `feature.disable`, `feature.refresh`                                        |
| `storage`           | `storage.get`, `storage.set`, `storage.getUsage`, `config.getTagPrefs`                        |
| `idb`               | `idb.get`, `idb.put`, `idb.delete`, `idb.bulkPut`, `idb.bulkDelete`, `idb.query`, `idb.count` |
| `page`              | `page.getContext` — bounded, read-only route/page context (`hostname`, `pathname`, `pageType`, `threadId`, and route generation); no DOM objects are returned. |
| `observer`          | `observer.watch`, `observer.unwatch`, `observer.waitFor`                                      |
| `ui.style` or `ui`  | `ui.style.register`, `ui.style.unregister`                                                    |
| `ui.mount` or `ui`  | `ui.mount`, `ui.update`, `ui.unmount`                                                         |
| `ui.dialog` or `ui` | `ui.dialog.open`, `ui.dialog.close`, `ui.dialog.update`, `ui.confirm`                         |
| `ui.dock` or `ui`   | `ui.dock.setButtons`, `ui.dock.removeButtons`                                                 |

Two read-only meta actions are available after registration:

- `addon.access` returns trust, block, and granted-capability state.
- `addon.throttle` returns live rate, concurrency, IDB payload, storage, and UI payload limits.

Use `addon.throttle` before imports or other sustained workloads. Do not hard-code the current limits.

## API Modules

Keep raw action strings in thin wrappers instead of scattering them through application code:

```js
export function getStoredValue(core, key, defaultValue = null) {
  return core.invokeCoreAction("storage.get", {
    key: String(key || ""),
    defaultValue,
  });
}

export function setStoredValue(core, key, value) {
  return core.invokeCoreAction("storage.set", {
    key: String(key || ""),
    value,
  });
}
```

This makes permissions visible, payloads consistent, and API changes easy to locate.

The approved additive APIs have bounded contracts and protocol version `1`:

- `page.getContext` is read-only and returns normalized, size-limited page metadata. It
  does not expose core state, DOM nodes, or arbitrary page execution.
- `observer.waitFor` accepts one simple tag/class/id selector, a required timeout from
  100 to 4,000 ms, and an add-on-owned `observerId`. It is one-shot and cancellable by
  `observer.unwatch`; core removes the callback on match, timeout, cancellation, or
  add-on teardown.
- `ui.dialog.update` updates only a dialog already owned by the calling add-on. Content
  is sanitized and size-limited while the dialog and content identity remain stable;
  missing or foreign dialogs return a structured failure.

These APIs are additive. Add-ons that receive `unsupported_action` from an older core
use their local bounded fallback and keep the original user flow. The core action bridge,
registration handshake, response envelope, and existing public action IDs are unchanged.

## Registration Metadata

A runtime registration should provide at least `id`, `name`, `version`, `description`, `status`, and `capabilities`. It may also provide:

- `statusMessage`
- `panelTitle` and `panelBody`
- `panelActions`
- `panelSettingsTitle`, `panelSettingsDescription`, and `panelSettingsStorageKey`
- `panelSettingsDefaults` and `panelSettings`
- `pageScopes`
- `runtimeMode` and `matches`

Example:

```js
core.registerAddon({
  id: runtime.addonId,
  name: runtime.addonName,
  version: runtime.addonVersion,
  description: runtime.addonDescription,
  status: "installed",
  statusMessage: "Ready.",
  capabilities: runtime.capabilities,
  pageScopes: runtime.pageScopes,
  runtimeMode: runtime.runtimeMode,
  matches: runtime.matches,
  panelActions: [{ id: "open-panel", label: "Open", variant: "primary" }],
});
```

## Storage and IndexedDB

### Small State

Use `storage.get` and `storage.set` for settings and small JSON-compatible values. Storage is namespaced by add-on ID and persisted through core.

### Records and Imports

Use the IDB actions for collections and larger structured data. Every request should consistently provide the same database/store schema:

```js
const payload = {
  dbName: "my-data",
  storeName: "records",
  keyPath: "id",
  indexes: [{ name: "updatedAt", keyPath: "updatedAt" }],
};
```

For bulk work:

1. Read `addon.throttle`.
2. Respect `maxPayloadBytes` and `maxBulkItems`.
3. Pace requests using `suggestedMinIntervalMs`.
4. Retry only transient failures such as `rate_limited`, `too_many_concurrent_requests`, or timeouts.
5. Expose progress and cancellation for long operations.

The Example Add-on contains a complete throttle-aware bulk workflow. The Library Add-on contains a production import workflow with preview, conflict handling, retries, and fallback writes.

## UI Services

### Styles

```js
await core.invokeCoreAction("ui.style.register", {
  styleId: "my-addon-style",
  cssText,
});
```

Styles are resources, not themes that core can reconstruct. If a visible dialog or mount depends on a style, close/unmount the UI before unregistering that style.

### Mounts

```js
await core.invokeCoreAction("ui.mount", {
  mountId: "my-widget",
  slot: "body",
  html: renderWidget(),
});
```

Supported host forms include `body`, `page.dock`, `page.panel`, `page.floating`, `latest.filters.after-title`, and `selector:<css-selector>`. A mount can later be changed with `ui.update` and removed with `ui.unmount`.

The page dock is inside core's shadow tree. Add-on styles registered in `document.head` cannot cross that shadow boundary. Use the core dock classes for custom dock markup, or prefer `ui.dock.setButtons` for ordinary buttons.

### Dialogs

Register required styles first, then open the dialog. Track `dialog-closed` because a dialog may close through Escape, its backdrop, replacement, teardown, or an explicit API request.

```js
const result = await core.invokeCoreAction("ui.dialog.open", {
  dialogId: "my-dialog",
  title: "My Dialog",
  html: renderDialog(),
  size: "lg",
  closeOnEsc: true,
  closeOnBackdrop: true,
});
```

Available size hints are `sm`, default, `lg`, `xl`, and `full`.

## Dock Buttons

For up to four normal buttons, use the core-owned dock API:

```js
await core.invokeCoreAction("ui.dock.setButtons", {
  buttons: [
    { id: "open-panel", label: "Open Panel", variant: "primary" },
    { id: "refresh", label: "Refresh", variant: "secondary" },
  ],
});
```

Handle the resulting command:

```js
if (detail.command === "dock-action" && detail.actionId === "open-panel") {
  void openPanel();
}
```

Use `ui.mount` with `slot: "page.dock"` only when custom markup is genuinely needed. Because events cross a shadow boundary, use a capture listener and `event.composedPath()` for delegated click handling. See `example-addon/src/ui/dock.html` and its app event binding for the working pattern.

## Lifecycle and Cleanup

A safe disable/teardown sequence is:

1. Stop ongoing work and request cancellation.
2. Unwatch observers.
3. Close dialogs and wait for the result.
4. Remove dock buttons.
5. Unmount custom UI.
6. Unregister styles last.
7. Remove add-on-owned event listeners.
8. Send `teardown-complete` when core requested teardown.

Cleanup actions are designed to remain available during teardown pressure, but the add-on should still await results and keep its local state synchronized.

Core also applies a teardown watchdog and hard-cleans owned observers and UI when an add-on fails to acknowledge teardown.

### Runtime contract after registration

Core-connected add-ons use the shared `addons/shared/runtimeLifecycle.js` contract
after registration. The observable states are `new`, `starting`, `enabled`,
`disabling`, `disabled`, `refreshing`, `tearing-down`, `terminated`, and `failed`.
Lifecycle operations are serialized; duplicate enable, disable, and refresh requests
are idempotent, while terminal teardown is a one-shot operation.

Each command handler receives or derives a context containing `commandId`, `command`,
`reason`, `generation`, `routeContext`, `signal`, and `terminal`. Disable, superseding
refresh, route invalidation, and teardown abort the owned signal or advance the
generation. A callback must check `signal.aborted` or `isCurrent()` before committing
state or UI. Expected cancellation is reported separately from ordinary failures.

The runtime helper exposes `getSnapshot()`, `getResourceSnapshot()`, and
`getPendingOperationSnapshot()`. Resource entries are owner-scoped and must be
released on reversible disable or terminal teardown. Teardown stops new work, aborts
pending work, releases feature resources, and acknowledges `teardown-complete` once;
core applies a bounded owner-specific watchdog cleanup when that acknowledgment is
missed.

## Observer Rules

Each observer subscription needs a stable `observerId`. Core filters out DOM owned by the same add-on to prevent self-triggered render loops. Keep callbacks lightweight and unwatch subscriptions when they are no longer needed.

```js
await core.invokeCoreAction("observer.watch", {
  observerId: "my-observer",
});

await core.invokeCoreAction("observer.unwatch", {
  observerId: "my-observer",
});

const wait = await core.invokeCoreAction("observer.waitFor", {
  observerId: "initial-content",
  selector: ".content-block",
  timeoutMs: 3000,
});
```

## Build Commands

Run commands from the repository root:

```bash
# Every changed add-on
npm run build:addons
npm run build:addons:release

# One add-on
node addons/build-addon.js example-addon
node addons/build-addon.js example-addon --release

# Force regeneration
node addons/build-addon.js example-addon --force
```

Validate and regenerate the trusted catalog from the manifest with:

```powershell
npm run check:addons:catalog
npm run generate:addons:catalog
```

The generator is deterministic and preserves the core header resource name and path
(`trustedAddonCatalog` → `src/services/addons/trusted-catalog.json`). Catalog support is
the intersection of userscript activation-match coverage and the current core page
scope. It does not replace execution authorization: trust, enabled/blocked state,
capabilities, and the action's `management` or `runtime` scope policy are checked
separately. A `standalone` add-on does not register with core; a `hybrid` add-on uses
core only on its F95Zone activation routes.

The builder:

- bundles JavaScript, imported HTML, and imported CSS with esbuild;
- generates userscript metadata from the manifest;
- bumps only add-ons selected for a changed build;
- uses a patch bump by default and accepts `--minor` or `--major`;
- tracks regular and release hashes separately in `addons/.build-cache.json`;
- strips debug logging in release mode and beautifies the release artifact;
- skips unchanged targets unless `--force` is supplied.

Because a successful changed build updates manifest versions, review `addons/addons.manifest.json` with the generated artifact.

Every core-required or hybrid add-on uses the shared `addons/shared/coreBridge.js`
contract. Bootstrap must complete the core ping, register the add-on, and consume
`addon.access` before starting privileged API work or feature behavior. Trust,
blocked state, granted capabilities, and enablement come from core; add-on code
must not reconstruct the untrusted policy or its blocked message. The bridge
keeps the existing event names, handshake fields, action response shapes, and
teardown acknowledgment behavior unchanged.

### Example Add-on template boundaries

The Example Add-on is the copyable runtime template. Its `main.js` only constructs
manifest-injected runtime metadata, creates the bridge and app, waits for core, starts
bootstrap, and reports fatal bootstrap failures. Within `src/`:

- `core/` owns bridge adaptation;
- `api/` owns thin action-specific wrappers and raw action IDs;
- `app/state.js` owns runtime state and stable storage/IDB payload definitions;
- `app/lifecycle.js` serializes enable, disable, refresh, and terminal teardown;
- `app/commands.js` owns core command dispatch and teardown routing;
- `app/createExampleAddonApp.js` composes app behavior and delegates rendering/UI to `ui/`;
- `ui/` owns markup, CSS, dialog views, render helpers, and DOM event bindings;
- optional domain modules such as bulk-work controllers belong under `app/` or a named domain folder.

Every listener, timeout, observer test node, mount, dock button, dialog, style, and pending
bulk operation is add-on-owned. Disable cancels owned asynchronous work and releases reversible
resources; terminal teardown removes command/UI listeners and sends `teardown-complete` once.

## Non-mutating baseline and smoke build

`ADDON-BASELINE-01` uses a separate audit path so measurement does not invoke the production
builder. It writes regular and release bundles only under a temporary directory, uses a
deterministic header without the normal build timestamp, and records manifest/catalog metadata,
action descriptors, lifecycle snapshots, source shape, gzip sizes, and esbuild contributors.

```bash
npm run audit:addons
npm run check:addons:baseline
npm run build:addons:smoke
npm run audit:addons:api
npm run check:addons:api
```

These commands do not update add-on versions, `.build-cache.json`, `addons.manifest.json`, or
tracked `dist/`. The baseline separates add-on userscript bundles from the core add-on-service and
UI integration footprint. The trusted-add-on contradiction recorded by the baseline was resolved
by `ADDON-TRUST-GATING-01`; the shared access resolver now keeps trust, blocked state, status text,
and execution authorization consistent.

`ADDON-API-AUDIT-01` writes `docs/architecture/addon-api-audit.json` and the readable
`docs/architecture/addon-api-audit.md`. It inventories all manifest add-ons, raw action call sites,
bridge events, listeners, polling, URL parsing, DOM assumptions, direct GM access, and cancellation
scaffolding. It is source-only and does not add actions, change the handshake, or build release
artifacts. Use `npm run check:addons:api` to verify the report is deterministic and current.

## Independent add-on validation

The repository-specific build-tools check validates the manifest, catalog, source layout, and
both esbuild modes without invoking the production versioning/cache path:

```powershell
npm run lint:addons
npm run check:addons:manifest
npm run check:addons:catalog
npm run check:addons:structure
npm run build:addons:smoke
npm run check:addons
```

`build:addons:smoke` builds every manifest entry in regular and release mode. The mode-specific
commands are `npm run build:addons:smoke:regular` and
`npm run build:addons:smoke:release`. A single add-on can be selected with, for example:

```powershell
node scripts/addon-build-tools.cjs --addon example-addon --release
```

Smoke output and one esbuild metafile per add-on/mode are written to a temporary directory by
default. `--outdir <path>` is available for inspection, but CI should use the default. Smoke
headers contain no build timestamp, and the command rejects changes to versions, manifest,
cache, tracked `dist/`, or root version state.

Manifest validation reports indexed paths such as `addons[0].entry` and checks unique IDs and
legacy IDs, folder/ID/entry/output alignment, capabilities, scopes, runtime modes, matches,
grants, and run timing. Structure validation requires `src/main.js` and the matching `dist/`
output path. Tiny add-ons may keep all behavior in `src/main.js` and omit `api/`, `app/`,
`core/`, `ui/`, or `constants.js`; canonical multi-module add-ons may use those folders.

Release stripping remains owned by the existing root `stripDebugLogs.js` esbuild plugin. The
build-tools package characterizes that plugin and consumes it without relocating or changing
its name or behavior.

## Validation Checklist

Before publishing an add-on:

- Install the current core userscript and the generated add-on artifact.
- Test core-missing behavior.
- Test enable, disable, refresh, reload, and page navigation.
- Open and close every dialog through its button, Escape, and backdrop.
- Verify observers do not react to the add-on's own UI.
- Verify mounted UI is removed and styles are unregistered on teardown.
- Test rejected permissions and transient throttle failures.
- Test empty/default storage and existing persisted state.
- Run `npm run lint` and `npm test` for core-facing changes.
- Update the add-on `CHANGELOG.md` for user-visible changes.

## Reference Implementations

- [`example-addon`](example-addon/) — complete API and lifecycle playground; use this as the structural template.
- [`library-addon`](library-addon/) — production IDB, import/export, dialog, mount, and settings example.
- [`latest-filters-addon`](latest-filters-addon/) — page-slot mounting and focused feature UI.
- [`image-repair-addon`](image-repair-addon/) — observer-based page enhancement.

The Example Add-on intentionally includes actions that can remove its own styles, mounts, dialogs, dock buttons, and test data. That makes it useful for API regression testing, but it should be presented as a developer tool rather than a normal end-user feature.
