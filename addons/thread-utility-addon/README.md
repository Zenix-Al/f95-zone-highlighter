# F95UE Thread Utility Add-on

Thread Utility is a core-required, thread-page add-on that will provide a
compact dashboard and an extensible collection of user-triggered thread tools.
The initial foundation contains only the core-owned launcher and empty palette
shell.

The quick-search concept is adapted from **F95 Utility Buttons** by GGD40727,
used under its MIT license. No reference userscript storage, fixed-position UI,
or raw page behavior is copied into this add-on.

The initial quick-search family preserves the reference defaults (Update,
New+Compressed, Compressed, Walkthrough, Mod, and Cheats) while constructing
thread or global search URLs directly through the Thread Utility registry.

## Ownership

- Core owns the launcher mount, dialog, and registered stylesheet.
- This add-on owns its event bindings and reversible lifecycle.
- Masked Direct remains the sole owner of link resolution and direct-download
  automation.

Source is under `src/`; generated userscripts under `dist/` are not edited by
hand.
