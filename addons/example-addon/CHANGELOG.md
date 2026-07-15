## [Unreleased] - Canonical add-on template

- keep `main.js` limited to injected runtime construction, core ping, composition, and fatal error reporting
- isolate app state, command dispatch, serialized lifecycle behavior, and bulk work under `app/`
- isolate DOM event binding under `ui/bindings.js`
- make disable, refresh, and terminal teardown abort stale work and acknowledge teardown once
- preserve every API playground demonstration and existing storage/IDB identifiers

## [0.2.5] - Throttled bulk import demo

- expose payload ceilings through `addon.throttle` so add-ons can batch against real core limits
- turn the example `idb.bulkPut` action into a throttled dummy bulk import that chunks by byte size and batch size
- add a progress dialog with cancellation support for the example bulk import flow

## [0.2.4] - Dialog update flow fix

- stop using repeated `ui.dialog.open` calls as the panel rerender path
- update the open playground dialog content in place so button clicks do not replace the whole dialog
- keep close and backdrop-dismiss behavior from being fought by a follow-up rerender

## [0.2.3] - Dock and dialog polish

- mount the example launcher into the dock without forcing the main panel open on bootstrap
- align the example dialog with the core dialog surface so the playground renders like a real panel
- keep the close flow explicit so the panel does not linger open after dialog teardown

## [0.2.2] - Core API playground

- expand the example add-on into a full core API playground
- route every demonstrated core action through the `api/` folder
- add examples for meta, feature, storage, idb, observer, dock, mount, dialog, confirm, toast, and style actions
