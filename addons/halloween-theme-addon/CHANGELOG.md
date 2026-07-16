# Changelog

## Unreleased - Restore page theme application

- Restored the Halloween page background and logo swap after the scoped add-on UI style API rejected the global theme CSS.
- The page-owned style now has explicit add-on ownership and is removed on disable or teardown.

## v0.2.2 - bugfix

- fixed flow execution issue where add-on execute first before register, causing halloween theme is on despite core disabled it.
- normalized the add-on around the canonical runtime lifecycle, core-owned styles, narrow logo selection, and reversible route refresh cleanup.

No core update required.

## v0.1.0 - Initial Release

- First public add-on release.
- Applies Halloween logo and background decorations site-wide.
- Swaps standard F95Zone logo images to Halloween variants and restores originals on teardown.
- Injects an explicitly owned Halloween page-background style and removes it on disable.
- Cleans up images and styles fully on disable or teardown with zero DOM residue.
- Registers with core add-on bridge for status, settings, and runtime controls.
- Supports enable or disable from the main F95UE Add-ons UI.
