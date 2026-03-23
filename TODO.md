Task: Add shadow DOM support to `createEl` and update call sites

Summary

- Problem: Many components now use `createEl` to build UI nodes. Components intended to render into a ShadowRoot or a host element relied on cloning or manual element creation; `createEl` currently always creates elements using the global `document` and does not optionally append into a provided mount point. This has caused some ghosts/children to lose the expected scoped styling or cause clipping when attachments happen in different document contexts.

Work done

- Modified `src/core/dom.js` to accept a new option `mount` on `createEl(tag, opts)`.
  - `mount` can be a `ShadowRoot`, its `host` element, a `DocumentFragment`, or any element that supports `appendChild`.
  - When `mount` is provided, `createEl` will use `mount.ownerDocument || mount.host.ownerDocument || document` as the document to create the element, and will attempt to `appendChild` the created element to `mount` before returning it.
  - If append fails, `createEl` still returns the element so the caller can append manually.

Files found using `createEl`
(These were discovered via a workspace search for `createEl(`; update call sites to pass `mount` when creating elements that should be placed inside a shadow root or host.)

- src/ui/components/tag-search/tagDrag.js
- src/ui/renderers/renderSetting.js
- src/ui/renderers/createLabel.js
- src/ui/renderers/createInput.js
- src/ui/components/toast.js
- src/ui/components/featureHealth/index.js
- src/ui/components/dialog.js
- src/ui/components/darkColorPicker.js
- src/features/image-repair/ui.js
- src/ui/components/...(others found in search — see full search output in development logs)

Planned next steps (priority order)

1. Audit each call site (above) and decide whether the element should be mounted immediately into a specific `mount` (e.g., a ShadowRoot or host). If yes, pass `mount: sr` (or `mount: sr.host`) to `createEl`.
2. For call sites that previously relied on `cloneNode(true)` or that require inner structure preserved, prefer owning logic that clones and then uses `mount.appendChild(clone)` (no change needed in those call sites beyond opting to use `mount` where appropriate).
3. Run the full test suite and manually verify UI components that use shadow roots (tag drag ghost, dialogs, toasts) to ensure scoped CSS and visibility are preserved.
4. If any components still show styling issues after mounting into the shadow root, consider copying computed styles to clones or applying explicit CSS variables in the host to propagate expected styles.

Notes and rationale

- Creating elements using the correct `ownerDocument` is necessary when rendering inside isolated contexts or if the environment uses multiple documents (iframes, etc.).
- Appending directly inside `createEl` is optional — callers that need to keep the element detached can still omit `mount` and append later.
