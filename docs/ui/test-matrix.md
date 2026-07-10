# Recommended Test Matrix

High-value tests:

- Bootstrap: unsupported site, repeated init
- Modal: open/close, backdrop, Escape, focus isolation
- Navigation: desktop/mobile, persisted panel, rerender scroll
- Renderer: input types, structural items, invalid type
- Persistence: success/failure, migration edge cases
- Colors: reset, CSS var update, reprocess queue
- Tags: search, add/remove/reorder/move, pruning
- Drag: pointer cancel, outside drop, cleanup
- Toasts: queue limit, fallback, accessibility
- Dialogs: focus trap and restore
- Add-ons: statuses, trust, pin/reorder, commands
- Add-on mounts: host missing, repeat mount, cleanup