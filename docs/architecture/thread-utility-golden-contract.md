# Thread Utility Golden Add-on contract

This document records `THREAD-UTILITY-GOLDEN-01`. It freezes only the
Example Add-on paths required by the future Thread Utility implementation. It
does not copy Example playground behavior and does not create production
Thread Utility source.

The targeted review found no blocking misuse in the required Golden paths on
2026-07-28.

## Bounded reference list

Thread Utility may use these files as structural references:

| Concern | Golden reference |
| --- | --- |
| Bootstrap and injected metadata | `addons/example-addon/src/main.js` |
| Composition and access gate | `app/createExampleAddonApp.js` |
| Shared lifecycle wrapper | `app/lifecycle.js` |
| Registration descriptor | `app/registration.js` |
| Core-rendered settings | `app/settings.js` |
| Core command routing | `app/commands.js` |
| UI ownership and cleanup | `app/uiController.js` |
| Composed-path mount events | `ui/bindings.js` |
| Bridge/meta/page/storage wrappers | required `api/**` modules |
| Dialog/mount/style wrappers | required `api/ui/**` modules |
| Core adaptor | `core/adaptor.js` |
| Generation/resource lifecycle | `addons/shared/runtimeLifecycle.js` |

Example actions, IDB demos, observer demos, bulk import, playground panel
content, and domain logging are not Thread Utility templates.

## Bootstrap and access order

The required order is:

1. construct runtime metadata from injected manifest constants;
2. create the core adaptor and application;
3. await the core ping;
4. stop quietly when a core-required add-on cannot reach core;
5. bind commands and register runtime metadata;
6. request `addon.access`;
7. remain disabled when access fails, is blocked, or reports
   `enabled === false`;
8. load settings/context;
9. enable through the shared lifecycle.

Thread Utility must not mount UI before the access decision.

## Runtime metadata

Runtime registration consumes injected:

- add-on ID;
- name;
- version;
- description;
- capabilities;
- `requiresCore`;
- page scopes;
- runtime mode;
- userscript matches.

The manifest is authoritative. Source modules must not carry a second metadata
copy.

## Command contract

One command controller routes:

- `enable` to lifecycle enable;
- `disable` to lifecycle disable;
- `refresh` to lifecycle refresh;
- `before-page-change` to generation invalidation;
- `dialog-closed` to owned dialog-state cleanup;
- `teardown` to terminal lifecycle teardown.

Commands are filtered by the shared adaptor. Dialog IDs are filtered again by
the add-on command controller.

## Core API wrappers

Thread Utility may use the existing bounded actions through thin wrappers:

- `addon.access`;
- `page.getContext`;
- `storage.get`;
- `storage.set`;
- `config.getTagPrefs`;
- `toast.show`;
- `ui.mount`;
- `ui.update`;
- `ui.unmount`;
- `ui.dialog.open`;
- `ui.dialog.update`;
- `ui.dialog.close`;
- `ui.style.register`;
- `ui.style.unregister`.

No new public core action is justified by the first Thread Utility release.
Raw action strings remain in `api/**` or the adaptor.

Core storage is already namespaced by add-on identity. Thread Utility must use
its own versioned settings key and must not reuse the reference userscript's GM
keys.

## UI event and resource ownership

Core owns the mount, dialog, and registered style elements. The add-on owns:

- the composed-path window listener used to recognize actions from a
  Shadow-DOM mount;
- delegated dialog action listeners;
- active dialog state;
- pending rendering/extraction work;
- any bounded transient clipboard fallback node.

The mount listener:

- resolves actions through `event.composedPath()`;
- verifies the add-on-owned mount root before accepting a button;
- is bound once;
- is removed on disable and teardown.

The add-on must handle `dialog-closed` because Escape, backdrop, replacement,
and core cleanup can close a dialog without the add-on initiating it.

## Lifecycle contract

`createAddonRuntimeLifecycle` supplies:

- serialized enable/disable/refresh/teardown operations;
- monotonically changing generations;
- abort of superseded work;
- `isCurrent()` late-commit suppression;
- owned resource registration/release;
- pending-operation tracking;
- reversible disable;
- terminal teardown;
- one shared teardown promise;
- exactly-once teardown acknowledgment.

Thread Utility must use this lifecycle rather than create a second generation,
queue, or terminal-state mechanism.

## Cleanup order

Applicable UI cleanup order is:

1. mark runtime unavailable and invalidate pending work;
2. close owned dialogs;
3. remove dock buttons, if any;
4. unbind and unmount owned mounts;
5. remove transient resources;
6. unregister styles;
7. unbind command handling during terminal teardown;
8. acknowledge teardown exactly once.

Repeated cleanup is idempotent. A late callback cannot remount or update UI
after invalidation.

## Stop condition

If a later package proves that one of these required Golden paths violates the
current core action, lifecycle, scope, ownership, or teardown contract:

1. stop Thread Utility implementation;
2. add a focused failing Golden regression;
3. repair the Example/shared contract first;
4. rerun the Golden and full suites;
5. resume only after the prerequisite passes.

Convenience or preference differences are not permission to redesign the
Golden contract.
