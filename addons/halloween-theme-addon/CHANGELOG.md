# Changelog

## v0.1.0 - Initial Release

- First public add-on release.
- Applies Halloween logo and background decorations site-wide.
- Swaps standard F95Zone logo images to Halloween variants and restores originals on teardown.
- Injects Halloween background CSS via core style registry (`ui.style.register`).
- Cleans up images and styles fully on disable or teardown with zero DOM residue.
- Registers with core add-on bridge for status, settings, and runtime controls.
- Supports enable or disable from the main F95UE Add-ons UI.
