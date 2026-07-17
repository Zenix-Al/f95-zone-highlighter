# Add-ons Service (`addonsService.js`)

The `addonsService.js` and its sub-modules (located in `src/services/addons/`) form the runtime environment for third-party or optional userscripts ("add-ons") that extend Latest Highlighter. It manages sandboxing, permission gating, inter-script events, and API rate-limiting.

`src/services/addonsService.js` is the stable public facade. Internal ownership is split as follows:

- `apiPolicy.js` owns payload limits, service-disable policy, and throttle normalization.
- `scope.js` owns page-scope matching and runtime availability decisions.
- `invocation.js` owns rejection ordering and action invocation.
- `actionRuntime.js` provides bounded dependencies per action family; there is no shared mega-container.
- `state.js` owns aliases, persisted state, installed metadata, and atomic installation-trace removal.
- `catalog.js` and `knownAddons.js` own trusted-catalog and card/status projection.
- `bootstrap.js` composes bridge callbacks without mutable dependency configuration.
- `lifecycle.js` owns the teardown primitive, while `runtimeLifecycle.js` owns service shutdown and owner cleanup.

Consumers should continue importing from `addonsService.js`; these internal modules are ownership
boundaries rather than a new add-on-facing API.

### Trusted catalog delivery

The current core does not embed a trusted catalog and has no catalog `@resource` fallback.
`scripts/addon-catalog.cjs` derives a SHA-256 identifier from the canonical manifest projection,
writes `src/generated/trusted-addon-catalog.meta.json`, and writes the corresponding immutable
`trusted-addon-catalog.<hash-prefix>.json`. On startup, `catalog.js` first restores the last
validated envelope from GM key `f95ue:addons:trusted-catalog-cache`. At most once every six hours
it checks the metadata URL through jsDelivr; unchanged identifiers update only `checkedAt`, while
changed identifiers fetch and hash-validate the named catalog before atomically replacing the
cached identifier, catalog, `checkedAt`, and `updatedAt`. Failed checks retain a valid stale cache
and are throttled by the same check interval.

`src/generated/trusted-addon-aliases.json` is bundled only for synchronous ID canonicalization;
it is not a trusted-entry fallback. `src/services/addons/trusted-catalog.json` remains generated
only because legacy released cores still request that public URL. The current core never reads it.
Delete that legacy publication path later only after those releases no longer need support.

---

## Architecture Overview

Since userscripts run in isolated execution environments (or namespaces), direct function sharing is unsafe and fragile. The F95UE core uses an **Asynchronous Event-Based Message Bridge** to communicate with add-ons.

```text
+------------------+                   +-------------------+
|  F95UE Add-on    |                   |    F95UE Core     |
+--------+---------+                   +---------+---------+
         |                                       |
         | CustomEvent("f95ue:addons-dev-command")  |
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
         | CustomEvent("f95ue:addons-dev-command")  |
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
Registration, the known-add-on projection, and execution authorization all consume
the pure `src/services/addons/access.js` resolver. It checks the normalized identity,
trusted catalog entry, persisted user trust override, global untrusted policy,
enabled state, activation match, and current page scope independently. A catalog
entry is trusted only when its normalized ID matches the registered ID and its
`trusted` field is true; an official-looking name, version, or ID never grants trust.

The resolver exposes `isTrusted`, `trustSource`, `isEnabled`, `isBlocked`,
`blockReason`, `availabilityReason`, `canEnable`, `matchesCurrentPage`,
`scopeApplies`, and `supportsCurrentPage`. Disabled is a lifecycle state, not an
untrusted-policy block. Likewise, an activation or page-scope mismatch is an idle
runtime availability state, not a security block. Runtime actions still reject
those mismatches, while management enable/disable persists the desired state
without dispatching lifecycle commands to a runtime that is absent on the page.
Missing catalog identity is reported as `identityStatus: "unresolved"`;
an explicitly mismatched catalog identity is `identityStatus: "mismatch"` with
`blockReason: "identity_error"`. This prevents a trusted badge and an
untrusted-policy banner from being produced by different snapshots.

The regression fixture for `masked-direct-addon` (`0.3.45`) had a stale runtime
projection with `trusted: true`, `blocked: true`, `status: "disabled"`, and the
message `Blocked by main settings: enable untrusted add-ons or trust this add-on.`
while the catalog identified the same add-on as trusted and active on the current
thread. The root cause was that `knownAddons.js` derived trust from catalog
presence but copied blocked state and status text from the runtime entry, while
the add-on independently treated the `addon.access` response as its own block
state. The shared resolver now normalizes that stale combination to trusted,
disabled, unblocked, and keeps the Enable management path available.

When a setting changes, `refreshAddonSecurityPolicies()` reapplies the resolver to
registered entries and registry subscribers refresh the card projection. Catalog
metadata can be checked immediately with
`refreshAddonSecurityPolicies({ reloadCatalog: true })`; registration and each
execution authorization still revalidate the current decision. The registration
transport, handshake fields, capabilities, scopes, and public `addon.access`
response shape remain unchanged.

When `Allow untrusted add-ons` is enabled, an untrusted identity remains visibly
untrusted but is not blocked. Its requested capabilities are restored by the
current policy projection, including after the setting changes, so settings and
other authorized actions do not retain a stale `addon_untrusted` decision.

All current core-connected add-ons share the browser-side bridge contract in
`addons/shared/coreBridge.js`. Each bootstraps by pinging core, registering,
checking `addon.access`, and only then starting privileged actions or feature
behavior. This prevents an add-on-specific cached trust or blocked state from
overriding the core decision.

---

## Core Actions (API Reference)

Core actions are requested by sending `type: "core-action"` with the specific action name and a payload. Each action is bound to a capability permission. If an add-on attempts to call an action without the proper capability, it is blocked with `permission_denied`.

| Capability | Action String | Description / Payload |
| :--- | :--- | :--- |
| **`toast`** | `toast.show` | Displays a toast in the main UI.<br>`{ message: string, type: 'info'\|'warn'\|'error' }` |
| **`feature`** | `feature.enable`<br>`feature.disable`<br>`feature.refresh` | Controls the active status of the add-on feature. |
| **`storage`** | `storage.get`<br>`storage.set`<br>`storage.getUsage`<br>`config.getTagPrefs` | Scoped key-value storage. Total storage is capped at 64KB total per add-on. |
| **`idb`** | `idb.get`<br>`idb.put`<br>`idb.delete`<br>`idb.bulkPut`<br>`idb.bulkDelete`<br>`idb.query`<br>`idb.count` | Interface to IndexedDB databases. Key-paths and schemas must be supplied in payloads. Payload sizes are capped at 512KB per write. |
| **`page`** | `page.getContext` | Returns bounded, read-only route/page metadata; it never returns DOM objects or core state. |
| **`observer`**| `observer.watch`<br>`observer.unwatch`<br>`observer.waitFor` | Subscribes/unsubscribes to core-owned DOM observation, or waits once for a bounded simple selector. |
| **`ui.style`**| `ui.style.register`<br>`ui.style.unregister` | Registers custom CSS strings. Injected into the core Shadow DOM to bypass boundary limits. Max 64KB. |
| **`ui.mount`**| `ui.mount`<br>`ui.update`<br>`ui.unmount` | Mounts/updates HTML fragments in specific page slots (e.g. `body`, `page.dock`, `latest.filters.after-title`). Max HTML size is 128KB. |
| **`ui.dialog`**| `ui.dialog.open`<br>`ui.dialog.close`<br>`ui.dialog.update`<br>`ui.confirm` | Opens/closes modals, updates an already add-on-owned dialog, or triggers confirm dialogs. |
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

### 1. Register one action descriptor
Add the descriptor to its cohesive family under
`src/services/addons/actions/families/`. The family co-locates the public ID,
capabilities, payload validator, timeout, audit category, policy, redaction, and
execution handler. `actions/composition.js` is the only registration root:
```javascript
defineAction({
  id: "myFeature.myAction",
  protocolVersion: 1,
  requiredCapabilities: ["myCapability"],
  validatePayload: (payload) => payload && typeof payload === "object",
  timeoutMs: 5000,
  auditCategory: "myFeature",
  execute: ({ addonId, payload, deps }) => myHandler(addonId, payload, deps),
});
```

### 2. Implement the Action Handler
Place the handler beside its descriptor in the matching family. The central
invocation pipeline validates payloads, applies the timeout, reauthorizes at
execution, and returns only the descriptor's declared response shape.
```javascript
async function myHandler(addonId, payload, deps) {
  // Execute logic using core services/dependencies in `deps`
  return { ok: true, value: "Hello from core!" };
}
```

### 3. Provide Add-on side wrappers
Add the helper to `addons/example-addon/src/core/adaptor.js` and expose it through `api/`:
```javascript
// adaptor.js
function invokeMyAction(payload) {
  return invokeCoreAction("myFeature.myAction", payload);
}
```

---

## Action Registry

`src/services/addons/actions/registry.js` exposes a read-only action snapshot for
diagnostics and compatibility tests. The snapshot contains only an action ID,
protocol version, required capabilities, timeout, and audit category—never a
handler or dependencies. Duplicate IDs fail immediately during registration.
