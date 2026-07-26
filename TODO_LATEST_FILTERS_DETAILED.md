# Latest Filters Expansion Plan

## Scope decision

Adopt the useful behavior from `addons/reference/Reset Filters.user.js` into
`latest-filters-addon` without copying its external utility dependency, global
state, fixed prefix IDs, full-page replacement, or unmanaged timers.

Add two related Latest-only capabilities:

1. Reset the included-tag, excluded-tag, and individual visible prefix groups.
2. Generate a weighted random included-tag filter through a **Surprise Me**
   action.

Keep the existing userscript match, `pageScopes: ["latest"]`, runtime mode,
grants, registration handshake, storage keys, preset formats, and public API
contracts unchanged. Do not add a core action or modify the site’s
`latest.min.js`.

The reference script is Unlicensed, but its behavior source and author should
still be credited in the add-on changelog or documentation.

## Fixed design decisions

### URL state is authoritative

- Parse and update the Latest hash segments used by the site:
  `tags`, `notags`, `prefixes`, `noprefixes`, and `page`.
- Preserve unrelated filters including category, search, creator, sort, date,
  rows, and tag type.
- Resetting a filter removes only the selected segment values owned by that
  reset action and removes `page` so results restart from page 1.
- Apply same-page changes through the existing Latest route mechanism. Do not
  reload the complete document merely to reset a filter.
- URL transformation must be DOM-free, deterministic, and independently
  tested.

### Prefix groups are dynamic

- Do not copy the reference script's fixed engine/other/status ID sets.
- Discover IDs from each rendered `.filter-block_prefix-group` using its own
  `input[data-prefix]` elements.
- A group reset removes those IDs from both `prefixes` and `noprefixes`.
- Category changes can replace the prefix-group DOM. Reconcile controls
  idempotently after route refresh; never create duplicate buttons.
- Do not create a raw `MutationObserver`.

### Page controls use site-owned presentation

- Controls inserted into the site filter drawer belong to the add-on and must
  have stable `f95ue-lf-*` identifiers for ownership and cleanup.
- Prefer existing F95Zone button/label classes where suitable. Do not depend on
  core Shadow DOM styles for page-document elements.
- Remove every inserted control during disable, route invalidation, and
  terminal teardown.
- The existing Saved Filters dialog and storage behavior remain independent.

### Surprise Me weighting

- Candidate tags come from the existing `config.getTagPrefs` result already
  loaded by Latest Filters. Do not fetch another catalog or persist a duplicate.
- Normalize candidates to unique finite tag IDs with usable names.
- Select without replacement.
- Select a random count from 1 through 3, clamped to the available candidate
  count.
- Default weight: `1`.
- Preferred-tag weight: `4`.
- Excluded-tag weight: `0.25`.
- If a malformed record appears in both preferred and excluded lists, excluded
  precedence wins so its chance remains reduced.
- Marked tags retain the default weight; this package does not invent an
  additional preference rule.
- Inject the random-number source into the pure selector for deterministic
  tests. Production uses `Math.random`.
- Surprise Me replaces the current `tags` segment, removes any selected IDs
  from `notags`, removes `page`, and preserves every other filter.
- If tag preferences/catalog data is unavailable or has no valid candidates,
  do not navigate; show one bounded user-facing error.
- Random selection is local and synchronous. It performs no network or storage
  write and does not automatically create a saved preset.

## Global definition of done

- Production code follows the existing `main.js` / `app` / `domain` / `ui`
  ownership boundaries.
- No raw bridge action appears outside the current API adaptors.
- No new grants, storage keys, public actions, capabilities, or response shapes.
- No raw observer, unmanaged timer, anonymous global listener, or stale
  asynchronous commit.
- Enable, disable, refresh, route change, repeated mount, and teardown are
  idempotent and reversible.
- Existing presets and current-filter detection still work after reset and
  Surprise Me navigation.
- Tests use local DOM/URL fixtures only and require no F95Zone or external
  network access.
- Add-on lint, full tests, manifest/catalog/structure checks, regular and
  release smoke builds, deterministic audits, and `git diff --check` pass.
- Validation does not bump versions or modify tracked `dist/`.

## Required execution order

1. `LATEST-FILTERS-RESET-01`
2. `LATEST-FILTERS-SURPRISE-01`
3. `LATEST-FILTERS-EXPANSION-VERIFY-01`

Do not implement a later package before the preceding package is accepted.

---

## LATEST-FILTERS-RESET-01 — Adopt scoped filter reset controls

### Goal

Move the reference script's reset behavior into Latest Filters using dynamic
group discovery, pure URL transformations, and explicit lifecycle ownership.

### Required implementation

- [x] Add a DOM-free Latest filter-route module that can:
  - [x] parse ordered hash segments without losing unknown segments;
  - [x] remove all included tags;
  - [x] remove all excluded tags;
  - [x] remove a supplied set of IDs from included and excluded prefixes;
  - [x] remove `page` after a mutation;
  - [x] preserve path, query, and unrelated hash filters;
  - [x] report `changed: false` for a no-op.
- [x] Add an app-owned filter-drawer controller.
- [x] Add one reset control to `#filter-block_tags`.
- [x] Add one reset control to `#filter-block_tags_exclude`.
- [x] Add one reset control to every rendered prefix group.
- [x] Derive each prefix reset set from that group's
  `input[data-prefix]` values.
- [x] Use delegated, named event handling with one explicit cleanup owner.
- [x] Reconcile controls after Latest route/category refresh without
  duplicates.
- [x] Do not remove another script's controls or alter the site's filter
  inputs directly.
- [x] Apply changed routes through the site's same-page navigation path.
- [x] Keep controls absent outside `/sam/latest_alpha/`.
- [x] Credit Edexal's Reset Filters behavior reference in the changelog.

### Required tests

- [x] Included-tag reset removes `tags` and `page` only.
- [x] Excluded-tag reset removes `notags` and `page` only.
- [x] Prefix-group reset removes matching IDs from both `prefixes` and
  `noprefixes` while retaining IDs from sibling groups.
- [x] Reset handles empty, missing, reordered, and unknown hash segments.
- [x] Encoded search/creator values and ordinary query parameters survive.
- [x] Repeated reconciliation creates exactly one control per target.
- [x] Replaced prefix-group DOM receives new controls and stale controls are
  not retained by application state.
- [x] Disable, route exit, and teardown remove all owned controls and
  listeners.
- [x] No-op reset performs no navigation.
- [x] Existing preset storage and records remain byte-compatible.

### Acceptance criteria

- [x] Every behavior supplied by the reference script is available through
  Latest Filters.
- [x] Prefix behavior is data-driven rather than tied to the reference's
  current ID list.
- [x] Resetting one group cannot clear unrelated filters.
- [x] No full-page reload is required.
- [x] All required validation passes without a version bump.

---

## LATEST-FILTERS-SURPRISE-01 — Add weighted random tag filters

### Goal

Add a deterministic, locally weighted **Surprise Me** action that favors
preferred tags and lowers the likelihood of excluded tags.

### Required implementation

- [x] Add a DOM-free weighted tag-selection module.
- [x] Normalize and deduplicate tag candidates by numeric ID.
- [x] Apply the fixed `4 / 1 / 0.25` preferred/default/excluded weights.
- [x] Give excluded precedence over preferred for contradictory input.
- [x] Perform weighted sampling without replacement.
- [x] Select between one and three tags, bounded by available candidates.
- [x] Accept an injected RNG and handle boundary values safely.
- [x] Add a **Surprise Me** button beside the existing Saved Filters page
  control.
- [x] Route the button through the existing root binding and application
  controller rather than adding another global listener.
- [x] Replace `tags`, remove selected IDs from `notags`, and remove `page`.
- [x] Preserve all unrelated URL filters.
- [x] Update current-filter rendering after same-page navigation.
- [x] Show a bounded error when the tag catalog is unavailable or empty.
- [x] Do not save a preset, write settings, or fetch data when Surprise Me is
  pressed.
- [x] Keep the action cancellable by route generation and unavailable after
  disable/teardown.

### Required tests

- [x] Equal-weight candidates are selectable deterministically with a stub
  RNG.
- [x] Preferred tags occupy proportionally larger selection ranges.
- [x] Excluded tags occupy smaller non-zero ranges.
- [x] Contradictory preferred/excluded membership uses excluded weight.
- [x] Selection contains no duplicate IDs.
- [x] Requested count is clamped to candidate availability.
- [x] RNG values at `0`, immediately below `1`, and invalid boundaries cannot
  select outside the candidate list.
- [x] Surprise URL replacement preserves prefix, search, creator, sort, date,
  tag type, category, and unrelated segments.
- [x] Selected tags are removed from `notags`; unrelated excluded tags remain.
- [x] Empty or unavailable catalogs produce one error and no navigation.
- [x] Repeated lifecycle transitions do not duplicate the button or listener.
- [x] Preset and settings storage receive zero writes.

### Acceptance criteria

- [x] Preferred tags are demonstrably more likely than ordinary tags.
- [x] Excluded tags remain possible but demonstrably less likely.
- [x] Surprise Me never produces contradictory included/excluded values for
  the selected IDs.
- [x] The action is Latest-only, reversible, and independent of preset
  persistence.
- [x] All required validation passes without a version bump.

---

## LATEST-FILTERS-EXPANSION-VERIFY-01 — Integrated lifecycle and compatibility

### Goal

Verify the adopted controls and weighted random action against the complete
Latest Filters lifecycle and existing preset behavior.

### Required verification

- [x] Add a local Latest filter-drawer fixture containing included tags,
  excluded tags, and multiple dynamic prefix groups.
- [x] Cover base Latest, filtered Latest, category change, route exit, and
  return-to-Latest transitions.
- [x] Cover enabled, disabled, refresh, rapid route changes, and terminal
  teardown.
- [x] Confirm stale mount retries cannot recreate reset or Surprise controls.
- [x] Confirm Saved Filters can save, detect, apply, update, and delete a
  route produced by reset or Surprise Me.
- [x] Confirm tag preference colors/rendering in the Saved Filters dialog are
  unchanged.
- [x] Confirm no change to storage keys or normalized preset shape.
- [x] Confirm userscript `@match`, `@grant`, `@run-at`, capabilities, and
  catalog metadata are unchanged.
- [x] Update the add-on changelog and Greasy Fork description to describe the
  accepted behavior and reference credit.
- [x] Regenerate deterministic add-on/API/size audit reports.

### Validation commands

- [x] `npm run lint:addons -- --quiet`
- [x] `npm test`
- [x] `npm run check:addons:manifest`
- [x] `npm run check:addons:catalog`
- [x] `npm run check:addons:structure`
- [x] `npm run build:addons:smoke -- --addon latest-filters-addon --release`
- [x] `npm run check:addons:baseline`
- [x] `npm run check:addons:api`
- [x] `npm run check:addons:size`
- [x] `git diff --check`

### Acceptance criteria

- [x] Reset and Surprise Me operate through one consistent Latest URL
  mutation pipeline.
- [x] All controls have explicit ownership and disappear completely when the
  add-on is inactive.
- [x] Existing Saved Filters behavior and persisted data remain compatible.
- [x] Temporary regular and release builds contain no metadata drift or debug
  leakage.
- [x] No unresolved lifecycle, routing, persistence, or compatibility issue
  remains.
