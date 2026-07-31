# Thread Utility hardening contract

`THREAD-UTILITY-HARDENING-01` keeps opening-post work bounded and
user-triggered. Bootstrap captures only compact metadata and a generation-owned
source token. Description, installation, and download normalization begin when
the palette opens; there is no observer, polling loop, or background parser.
Manual Refresh recaptures the current starter post.

## Limits

The runtime limits are declared in `src/domain/limits.js`:

- 1,500 inspected source nodes and 250 source links;
- 400 normalized section nodes and 12,000 characters per section;
- 100 download links, 100 rendered thread tags, and 30 quick utilities;
- 4,096 clipboard characters;
- 120 KiB of dialog HTML and 60 KiB of stylesheet text.

The dialog and stylesheet limits remain below the corresponding core API
ceilings. Oversized payloads fail locally and are not sent to core.

## Graceful fallback

Missing or malformed section markup produces an unavailable section while the
compact summary and utilities remain usable. Unsupported and malformed links
are omitted. Normalized section HTML allows only basic text/list/link elements;
images, scripts, forms, inline handlers, and unsafe URL schemes are discarded.
Truncated sections are labeled in the palette.

Every asynchronous UI, clipboard, delegation, and settings operation checks
its current generation or active editor session after awaiting external work.
Disable, route invalidation, dialog closure, refresh, and teardown therefore
suppress late updates, toasts, saves, and remounts. Transient clipboard nodes
are removed in a `finally` block.

Runtime failure reporting uses bounded generic messages. Thread titles,
descriptions, download URLs, query strings, and exception messages are not
written to diagnostics.

## Final footprint and ownership

The deterministic add-on audits record the `0.1.0` production boundary as 38
files, 95,331 authored bytes, 3,110 physical lines, and 2,866 nonblank lines.
Tests and reference fixtures are outside that `src/` production boundary.

| Build | Bytes | Gzip bytes |
| --- | ---: | ---: |
| Regular | 110,328 | 24,506 |
| Release | 83,018 | 21,440 |

The five largest authored contributors are
`app/createThreadUtilityApp.js` (12,053 bytes), `ui/threadUtility.css` (8,752),
`ui/palette.js` (8,062), `domain/content/parser.js` (6,721), and
`app/uiController.js` (6,128).

Ownership remains split by layer:

- `domain/snapshot`, `domain/content`, and `domain/downloads` own extraction,
  normalization, and bounded parsing;
- `ui/` owns HTML/CSS rendering and delegated page-document bindings;
- `app/` owns lifecycle, commands, settings sessions, and UI orchestration;
- `api/` and `core/adaptor.js` alone own the public core bridge boundary;
- `domain/utilities/registry.js` is a local registry of executable utility
  definitions, not a service locator: it does not resolve core APIs, storage,
  UI services, or sibling add-ons.

The manifest capabilities are `feature`, `page`, `storage`, `toast`,
`ui.style`, `ui.mount`, `ui.dock`, and `ui.dialog`; the audit found no unused
declaration. The add-on has no IDB, observer, or hybrid-runtime capability and
imports no sibling add-on. Its public core actions are `addon.access`,
`config.getTagPrefs`, `page.getContext`, `storage.get`, `storage.set`,
`toast.show`, `ui.dialog.close`, `ui.dialog.open`, `ui.dialog.update`,
`ui.dock.removeButtons`, `ui.dock.setButtons`, `ui.mount`,
`ui.style.register`, `ui.style.unregister`, `ui.unmount`, and `ui.update`.

These figures are measurement evidence only; the size-audit package made no
production cleanup or behavior change.
