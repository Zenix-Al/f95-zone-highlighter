# Common Add-on Development Mistakes

Use `addons/example-addon/` as the executable reference and
`addons/shared/runtimeKit.js` as the browser-side bridge adaptor. An add-on is
not registered by exposing its app object to core; it sends a plain runtime
descriptor, receives lifecycle commands, and invokes capability-gated actions.

## Registering the wrong object

`core.registerAddon()` accepts the plain descriptor produced by
`app/registration.js`. Do not send the application controller, lifecycle,
adaptor, manifest wrapper, or a factory function.

The descriptor must contain the generated runtime identity and policy fields:

```js
core.registerAddon({
  id: runtime.addonId,
  name: runtime.addonName,
  version: runtime.addonVersion,
  description: runtime.addonDescription,
  status: "installed",
  capabilities: runtime.capabilities,
  requiresCore: runtime.requiresCore,
  pageScopes: runtime.pageScopes,
  runtimeMode: runtime.runtimeMode,
  matches: runtime.matches,
});
```

Keep functions, DOM nodes, class instances, errors, and cyclic data out of this
payload. Registration metadata crosses an event boundary and is validated as
data, not treated as executable code.

## Registering repeatedly

Register once during bootstrap. Use `core.updateStatus()` after enable, disable,
or failure. Re-registering the full descriptor on every transition can overwrite
the core's current projection with stale local state and creates unnecessary
registry refreshes.

Re-registration is appropriate only for a genuinely replaced runtime instance,
such as a userscript reinjection. It is not a normal status mechanism.

## Disabling immediately after registration

Local defaults do not own persisted enable state. The correct sequence is:

1. ping core;
2. bind the core-command listener;
3. register once;
4. request `addon.access`;
5. remain idle if core reports blocked or `enabled: false`;
6. otherwise enable the local lifecycle.

Do not call `feature.disable` merely because the local app starts in a disabled
or not-yet-enabled state. `feature.disable` asks core to persist a user-facing
disable decision. It is a management action, not initialization or cleanup.

When core reports persisted disabled state, keep the command listener alive so
the user can enable the add-on later from core settings.

## Binding commands too late

Bind `f95ue:addon-command` through the shared bridge before registering. Core
may issue lifecycle or teardown commands immediately after registration. Bind
once, retain the returned unbind callback, and release it during terminal
teardown—not during an ordinary reversible disable.

## Treating registration as authorization

Successful registration only makes the runtime known. It does not prove that
the add-on is trusted, enabled, in activation scope, or allowed to invoke a
capability. Read `addon.access` and still handle `{ ok: false, reason }` from
every action because policy and route state can change afterward.

Never cache a separate long-lived trust decision in add-on storage.

## Crossing the UI ownership boundary

Core-owned mounts and dialogs may be inside a Shadow DOM or another managed
host. Do not guess core-generated IDs, query into its private tree, assign
`innerHTML`, or attach listeners directly to core internals.

Use the matching action instead:

- `ui.mount`, `ui.update`, and `ui.unmount` for hosted fragments;
- `ui.dialog.open`, `ui.dialog.update`, and `ui.dialog.close` for dialogs;
- `ui.style.register` and `ui.style.unregister` for add-on CSS;
- `ui.dock.setButtons` and `ui.dock.removeButtons` for core dock actions.

HTML sent to core is sanitized. Put action identifiers in allowed `data-*`
attributes and handle the delegated events exposed to the add-on. Do not rely on
inline handlers or scripts surviving sanitization.

## Confusing dock mounts with dock buttons

`ui.mount` with `slot: "page.dock"` mounts add-on-owned HTML and requires
`ui.unmount`. `ui.dock.setButtons` asks core to render action descriptors and
requires `ui.dock.removeButtons`. They are separate APIs with separate cleanup;
do not send an HTML mount payload to the dock-button action or vice versa.

## Leaking resources on disable or teardown

Ordinary disable must be reversible: stop work, close dialogs, remove dock
controls and mounts, then unregister styles. Terminal teardown additionally
unbinds the command listener and acknowledges completion exactly once.

Track timers, observers, listeners, in-flight work, and temporary page nodes.
Invalidate stale generations before awaiting cleanup so late async completions
cannot remount UI or commit state after disable.

## Ignoring scope and route changes

Manifest `matches`, runtime `pageScopes`, and current `page.getContext` answer
different questions. A runtime can be installed and enabled while inactive on
the current page. Treat out-of-scope as idle availability, not as a persisted
disable or trust failure. Invalidate route-owned work on `before-page-change`
and re-evaluate applicability during refresh.

## Using storage as live runtime state

Add-on storage is namespaced persistence. Load, normalize, and copy settings
into runtime state; do not repeatedly parse storage inside hot UI handlers.
Core-rendered settings trigger `feature.refresh` after writes, so refresh must
reload and apply the canonical stored values.

Never place secrets, DOM objects, functions, unbounded logs, or response bodies
in storage or diagnostics.

## Checklist

- Ping before bootstrap and stop a core-required runtime when ping fails.
- Bind commands before the single registration call.
- Register the complete generated descriptor, not a controller object.
- Let `addon.access` decide initial activation.
- Use status updates rather than repeated registration.
- Keep disable reversible and teardown terminal.
- Use core UI actions instead of reaching into core-owned DOM.
- Declare every capability actually invoked and no hypothetical capabilities.
- Bound payloads, logs, retries, timers, and retained DOM/data.
- Test persisted-disabled bootstrap, enable after registration, repeated disable,
  route invalidation, teardown acknowledgment, denied actions, and stale work.
