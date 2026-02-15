# TODO

## Completed (v4.7.1)

- [x] Feature-scoped CSS with a style registry and per-feature style lifecycle.
- [x] Runtime state key drift fixed and unknown-path guarding added in `StateManager`.
- [x] Color CSS variable naming normalized and centralized mapping added.
- [x] Typed setting coercion/validation added at input and persistence boundaries.
- [x] Latest overlay apply pipeline moved to frame-budgeted chunking for large tile sets.
- [x] Mutation observer pre-filtering added to reduce unnecessary callback work.
- [x] Global teardown path added for listeners/observers/resources/styles on navigation.
- [x] Blocking `prompt`/`confirm`/`alert` usage removed from app flows.
- [x] Dead/dormant modules removed.
- [x] Focused regression tests added and wired to `npm run test`.

## Next

- Add dedicated perf metrics sampling for overlay batch duration and mutation callback cost.
- Add E2E browser checks for feature toggling across SPA-like page transitions.
