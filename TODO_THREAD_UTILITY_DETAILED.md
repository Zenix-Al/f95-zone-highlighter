# Thread Utility Add-on Detailed Execution Plan

This is a standalone execution plan for the final planned add-on: a compact
thread dashboard and extensible collection of user-triggered thread tools.

The initial feature concept comes from
`addons/reference/F95 Utility buttons.user.js`. The canonical opening-post
fixture is `addons/reference/sample.html`.

Prepared against the repository inspected on **2026-07-28**.

---

## Scope

### Included

- new `addons/thread-utility-addon/**`;
- one authoritative entry in `addons/addons.manifest.json`;
- generated trusted-catalog projection;
- a core-owned thread-page launcher and dialog;
- current-thread summary extraction;
- core tag preference enrichment and prioritized tag chips;
- exact `+N` tag overflow expansion;
- collapsed Description and Installation sections;
- conservative opening-post download extraction;
- Open, Copy, and Copy All link actions;
- delegation to existing Masked Direct Resolve/Direct DL page controls;
- configurable quick-search utility buttons;
- utility registry for future thread tools;
- add-on documentation, fixture tests, lifecycle tests, audits, and smoke
  validation.

### Excluded

- Library records, personal state, history, and update scheduling;
- masked-link resolution implementation;
- direct-download request storage or external-host automation;
- new Masked Direct bridge actions;
- Latest-page behavior;
- site repairs;
- account-changing forum automation;
- background scraping, polling, or a persistent thread database;
- cloning the opening post wholesale into the core dialog;
- release builds, unrelated version bumps, and hand-edited generated output.

### Ownership decision

Thread Utility owns user-triggered convenience actions for the currently open
thread.

Masked Direct remains the sole owner of:

- masked-link resolution;
- direct-download request identity;
- GM request storage;
- managed external tabs;
- direct-download host automation.

Thread Utility may invoke a live, generation-verified Masked Direct button that
already exists beside an opening-post link. It must not reproduce Masked
Direct's listener, storage, event, or resolver logic.

---

## How to use this document

1. Execute one package ID at a time unless its wave explicitly permits
   parallel work.
2. Put the selected package ID in the task/PR description.
3. Read only the package's named source, reference, fixture, and documentation
   before editing.
4. Follow `AGENTS.md` and the canonical add-on boundaries.
5. Do not scan or copy the full Example Add-on playground.
6. Use only the required Example slices for handshake, access, registration,
   lifecycle, commands, settings, storage, page context, mount, dialog, style,
   and teardown.
7. If a required Golden Example path is proven wrong, stop this plan, add a
   focused regression, repair the Golden Example, and resume only after its
   checks pass.
8. Add tests in the same package as production behavior.
9. Edit source, never `dist/`.
10. Regenerate catalogs and audit evidence only through documented commands.
11. Run audit writers sequentially; their repository-state guards reject
    concurrent evidence writes.
12. Mark each checkbox only after the behavior or evidence exists.

---

## Golden Example prerequisite

Targeted paths reviewed:

- `addons/example-addon/src/main.js`;
- `app/createExampleAddonApp.js`;
- `app/lifecycle.js`;
- `app/registration.js`;
- `app/settings.js`;
- `app/commands.js`;
- `app/uiController.js`;
- `ui/bindings.js`;
- required `api/**` wrappers;
- `core/adaptor.js`;
- `addons/shared/runtimeLifecycle.js`.

Review result on 2026-07-28: no blocking core API misuse was found in the
required paths.

The new add-on must preserve these contracts:

- ping before application bootstrap;
- runtime registration before access-controlled enable;
- `addon.access` honors blocked and persisted-disabled state;
- manifest-injected metadata;
- shared generation-aware lifecycle;
- raw action names only in `api/**` or the adaptor;
- core-owned mounts, dialogs, and styles;
- namespaced core storage;
- explicit `dialog-closed` handling;
- reversible disable;
- cleanup before style unregister;
- exactly-once terminal teardown acknowledgment.

---

## Global definition of done

A package is complete only when all applicable items pass:

- [ ] Every package-specific implementation item is complete.
- [ ] Every package-specific test is present and passing.
- [ ] Every package-specific acceptance criterion passes.
- [ ] No unrelated user change is overwritten.
- [ ] Raw core action names remain inside `api/**` or `core/adaptor.js`.
- [ ] No sibling add-on or core-internal source is imported.
- [ ] No raw `MutationObserver` is introduced.
- [ ] Every listener, timer, dialog, mount, style, and transient DOM node has an
      explicit owner and cleanup.
- [ ] Disable remains reversible.
- [ ] Route invalidation and teardown suppress late commits.
- [ ] Teardown acknowledgment occurs exactly once.
- [ ] No masked URL, opening-post body, or copied content is written to logs.
- [ ] Add-on lint has zero warnings.
- [ ] Applicable focused tests pass.
- [ ] `git diff --check` passes.

---

## Required execution order

### Wave 0 — Contract and fixture baseline

1. `THREAD-UTILITY-BASELINE-01`
2. `THREAD-UTILITY-GOLDEN-01`

Do not create production add-on source before both packages pass.

### Wave 1 — Add-on foundation

1. `THREAD-UTILITY-FOUNDATION-01`
2. `THREAD-UTILITY-LIFECYCLE-01`

### Wave 2 — Thread data model

1. `THREAD-UTILITY-SNAPSHOT-01`
2. `THREAD-UTILITY-TAGS-01`

`THREAD-UTILITY-TAGS-01` depends on the normalized snapshot and may not run in
parallel with it.

### Wave 3 — Initial utility behavior

These may run in parallel after Wave 2:

- `THREAD-UTILITY-QUICK-SEARCH-01`
- `THREAD-UTILITY-CONTENT-01`
- `THREAD-UTILITY-DOWNLOADS-01`

They must converge on the same snapshot, utility registry, generation, and
dialog state. They may not create independent lifecycle or modal systems.

### Wave 4 — Integrated palette

1. `THREAD-UTILITY-PALETTE-01`
2. `THREAD-UTILITY-SETTINGS-01`

### Wave 5 — Hardening and release evidence

1. `THREAD-UTILITY-HARDENING-01`
2. `THREAD-UTILITY-VERIFY-01`
3. `THREAD-UTILITY-SIZE-AUDIT-01`

The size audit is last.

---

# Work packages

## THREAD-UTILITY-BASELINE-01 — Record reference behavior and fixture boundaries

**Priority:** Critical  
**Depends on:** None  
**Primary files:** `addons/reference/F95 Utility buttons.user.js`,
`addons/reference/sample.html`, new tests/architecture notes only

### Agent execution command

> Execute `THREAD-UTILITY-BASELINE-01` only. Record reference behavior and
> canonical fixture boundaries. Do not create production add-on source.

### Objective

Convert the reference and sample into explicit behavior and parser contracts
before implementation.

### Required work

- [x] Record the reference defaults:
  - Update with title;
  - New+Compressed with title;
  - Compressed without title;
  - Walkthrough with title;
  - Mod without title;
  - Cheats with title.
- [x] Record reference settings behavior:
  - custom label;
  - custom query;
  - include-title toggle;
  - ordering;
  - deletion;
  - new-tab preference.
- [x] Record the reference MIT license and author attribution requirement for
      GGD40727.
- [x] Characterize `sample.html` without modifying it.
- [x] Record canonical header selectors:
  - `h1.p-title-value`;
  - `.js-tagList a.tagItem`;
  - `select[name="rating"][data-initial-rating]`.
- [x] Record canonical opening-post selectors:
  - `article.message-threadStarterPost`;
  - `.message-body .bbWrapper`.
- [x] Record `#1` as fallback verification, not the primary selector.
- [x] Record content that must be excluded:
  - profile cell;
  - attribution/action controls;
  - reactions;
  - signature;
  - replies;
  - screenshots/lightbox links.
- [x] Record canonical sections represented by the fixture:
  - Overview/Description;
  - Developer and Version metadata;
  - Installation;
  - Win downloads.
- [x] Record fixture download cases:
  - Datanodes direct link and Direct DL button;
  - masked GoFile, MEGA, PixelDrain, and WorkUpload links;
  - adjacent Resolve buttons.
- [x] State that one fixture is canonical, not universal.
- [x] Define graceful partial behavior for absent or unrecognized sections.

### Required tests

- [x] Fixture is readable and contains one starter-post marker.
- [x] Fixture contains the expected header and content roots.
- [x] Fixture contains both direct and masked resolver-button examples.
- [x] Fixture test failure names the missing contract.

### Acceptance criteria

- [x] Later parser work can rely on named, bounded fixture expectations.
- [x] No claim of universal uploader-template support is made.
- [x] No production behavior changes.

---

## THREAD-UTILITY-GOLDEN-01 — Freeze the required Golden Add-on contract

**Priority:** Critical  
**Depends on:** `THREAD-UTILITY-BASELINE-01`  
**Primary files:** required `addons/example-addon/src/**` slices,
`addons/shared/runtimeLifecycle.js`, tests/docs only

### Agent execution command

> Execute `THREAD-UTILITY-GOLDEN-01` only. Characterize the exact Golden
> Example paths Thread Utility will consume. If a required path is incorrect,
> stop and report the prerequisite repair.

### Required work

- [x] Characterize ping-before-bootstrap behavior.
- [x] Characterize registration metadata from manifest-injected constants.
- [x] Characterize `addon.access` blocked and persisted-disabled behavior.
- [x] Characterize shared lifecycle generation and terminal teardown.
- [x] Characterize command routing for:
  - enable;
  - disable;
  - refresh;
  - before-page-change;
  - dialog-closed;
  - teardown.
- [x] Characterize namespaced storage wrappers.
- [x] Characterize `page.getContext`.
- [x] Characterize `config.getTagPrefs`.
- [x] Characterize core-owned mount, dialog/update/close, and style ownership.
- [x] Characterize composed-path mount event handling.
- [x] Characterize cleanup order and exactly-once acknowledgment.
- [x] Add or retain focused tests proving these paths.
- [x] Stop the Thread Utility plan if any required characterization fails.

### Acceptance criteria

- [x] Thread Utility has a bounded Golden reference list.
- [x] No Example demo/domain code is copied.
- [x] No new public core API is proposed for convenience.

---

## THREAD-UTILITY-FOUNDATION-01 — Create the add-on skeleton and metadata

**Priority:** Critical  
**Depends on:** `THREAD-UTILITY-GOLDEN-01`  
**Primary files:** `addons/addons.manifest.json`,
`addons/thread-utility-addon/**`, generated catalog, structure tests

### Agent execution command

> Execute `THREAD-UTILITY-FOUNDATION-01` only. Create the core-required,
> thread-scoped skeleton and empty launcher/palette shell. Do not implement
> content parsing or utilities.

### Metadata contract

- ID: `thread-utility-addon`
- Name: `F95UE Thread Utility Add-on`
- Initial version: `0.1.0`
- Runtime mode: `core-required`
- Page scopes: `thread`
- Match: `*://f95zone.to/threads/*`
- Run timing: `document-idle`
- Grants: `none`
- Initial capabilities:
  - `page`;
  - `storage`;
  - `toast`;
  - `ui.style`;
  - `ui.mount`;
  - `ui.dialog`.

### Required implementation

- [x] Add the authoritative manifest entry.
- [x] Generate the trusted catalog through the official generator.
- [x] Create `README.md` with reference attribution.
- [x] Create `CHANGELOG.md`.
- [x] Create composition-only `src/main.js`.
- [x] Create `core/adaptor.js` using the shared runtime kit.
- [x] Create thin wrappers for only the declared capabilities.
- [x] Create app registration, commands, settings, lifecycle, and UI ownership
      modules.
- [x] Create domain and UI directories without speculative modules.
- [x] Add one launcher mount in the core-owned page dock.
- [x] Add one empty core-owned dialog shell.
- [x] Register CSS through `ui.style`.
- [x] Keep all raw core action strings inside wrappers/adaptor.
- [x] Do not add IDB, observers, polling, or cross-origin matches.

### Required tests

- [x] Manifest metadata validates.
- [x] Catalog and manifest agree.
- [x] Structure follows canonical add-on boundaries.
- [x] Core absent exits quietly.
- [x] Blocked and persisted-disabled access does not mount UI.
- [x] Out-of-scope pages do not mount the launcher.
- [x] Repeated enable does not duplicate launcher/style/listeners.

### Acceptance criteria

- [x] Empty Thread Utility palette opens from one launcher on thread pages.
- [x] No thread parser or utility behavior is hidden in foundation work.
- [x] No unrelated add-on metadata changes.

---

## THREAD-UTILITY-LIFECYCLE-01 — Complete reversible route and UI ownership

**Priority:** Critical  
**Depends on:** `THREAD-UTILITY-FOUNDATION-01`  
**Primary files:** Thread Utility app lifecycle, commands, UI controller,
bindings, lifecycle tests

### Agent execution command

> Execute `THREAD-UTILITY-LIFECYCLE-01` only. Finish lifecycle, route
> invalidation, dialog-close synchronization, and owned cleanup before adding
> feature behavior.

### Required implementation

- [x] Use one shared runtime lifecycle instance.
- [x] Track one generation for extraction, rendering, and actions.
- [x] Enable registers style, mounts launcher, and binds owned events.
- [x] Refresh reloads settings/page context and reconciles UI.
- [x] Before-page-change invalidates pending work before remount.
- [x] Disable:
  - marks unavailable;
  - invalidates generations;
  - closes dialogs;
  - unbinds dialog and launcher events;
  - unmounts launcher;
  - unregisters styles.
- [x] Teardown performs disable cleanup, unbinds commands, and acknowledges
      exactly once.
- [x] Handle core `dialog-closed` for Escape, backdrop, replacement, and API
      close.
- [x] Roll back active modal state when style registration or dialog open
      fails.
- [x] Make repeated cleanup idempotent.

### Required tests

- [x] Enable → disable → enable creates one launcher and listener.
- [x] Route A → B → C cannot commit stale dialog content.
- [x] Dialog backdrop/Escape clears active state.
- [x] Failed style registration does not leave the launcher action stuck.
- [x] Disable during dialog open removes all owned UI.
- [x] Teardown acknowledgment occurs once across repeated terminal commands.
- [x] No late callback commits after invalidation.

### Acceptance criteria

- [x] Every later package can consume one stable generation and UI owner.
- [x] No feature package needs another lifecycle mechanism.

---

## THREAD-UTILITY-SNAPSHOT-01 — Normalize current-thread and opening-post data

**Priority:** High  
**Depends on:** `THREAD-UTILITY-LIFECYCLE-01`  
**Primary files:** Thread Utility domain snapshot/parser modules,
`addons/reference/sample.html`, parser tests

### Agent execution command

> Execute `THREAD-UTILITY-SNAPSHOT-01` only. Build a bounded immutable snapshot
> from the current thread and canonical starter-post fixture. Do not render
> heavy section content yet.

### Required model

```js
{
  threadId,
  url,
  title,
  canonicalTitle,
  version,
  developer,
  prefixes,
  rating,
  starter: { postId, author, postedAt },
  tags,
  sectionSources,
  downloadSource,
  capturedAt
}
```

### Required implementation

- [x] Use `page.getContext` for page applicability and thread ID.
- [x] Parse title and prefixes from `h1.p-title-value`.
- [x] Parse bracket suffixes for version/developer.
- [x] Parse rating from the rating select.
- [x] Parse header tags only from the header tag list.
- [x] Find the starter post by `.message-threadStarterPost`.
- [x] Use verified `#1` only as a fallback.
- [x] Restrict content to `.message-body .bbWrapper`.
- [x] Exclude signature, reactions, action bar, user cell, and replies.
- [x] Return partial data instead of throwing when optional markup is absent.
- [x] Bound source nodes, text, tags, and links.
- [x] Keep source DOM references runtime-only and generation-owned.
- [x] Clear source references on close, refresh, route change, disable, and
      teardown.

### Required tests

- [x] Canonical fixture produces expected title, prefixes, version, developer,
      tags, rating, and starter identity.
- [x] Signature/reply links are excluded.
- [x] Missing title uses a bounded fallback.
- [x] Missing starter post preserves header summary.
- [x] Synthetic fallback `#1` fixture works.
- [x] Malformed optional nodes do not throw.
- [x] Stale generation cannot publish a snapshot.

### Acceptance criteria

- [x] One snapshot is the only data input for later UI/utility families.
- [x] No sibling add-on parser is imported.
- [x] Heavy sections remain lazy/deferred.

---

## THREAD-UTILITY-TAGS-01 — Prioritize core user tags and implement exact overflow

**Priority:** High  
**Depends on:** `THREAD-UTILITY-SNAPSHOT-01`  
**Primary files:** Thread Utility tag domain/renderer, storage API wrapper,
settings, tag tests

### Agent execution command

> Execute `THREAD-UTILITY-TAGS-01` only. Enrich thread tags with
> `config.getTagPrefs`, apply deterministic ordering, and implement exact
> `+N` expansion.

### Required implementation

- [x] Call `config.getTagPrefs` through the thin storage wrapper.
- [x] Normalize the bounded result:
  - `tags`;
  - `preferredTags`;
  - `excludedTags`;
  - `markedTags`;
  - `color`.
- [x] Match thread tag labels to canonical core IDs by normalized name.
- [x] Preserve unknown thread tags as normal tags.
- [x] Characterize overlapping-list precedence from the current core resolver.
- [x] Do not silently invent a different status for overlapping IDs.
- [x] Sort display groups:
  - marked;
  - preferred;
  - normal;
  - excluded.
- [x] Preserve original thread order inside each display group.
- [x] Add `visibleTagLimit`, bounded from 1 to 20.
- [x] Render the visible chips and one real `+N` button.
- [x] Make `+N` equal exactly the currently hidden renderable tags.
- [x] Clicking `+N` expands all tags inline.
- [x] Replace it with `Show less` and `aria-expanded="true"`.
- [x] Keep expansion modal-session-only.
- [x] Add excluded-tag modes:
  - muted and last;
  - hidden.
- [x] Hidden excluded tags do not inflate `+N`.
- [x] Fall back to original-order normal tags if the core API fails.
- [x] Do not require hover to discover hidden tags.

### Required tests

- [x] Core names map to IDs.
- [x] Unknown tags survive.
- [x] Core overlap precedence is characterized.
- [x] Display priority and original-index tie-break are deterministic.
- [x] Exact limits 1, default, equal count, and over-count.
- [x] Exact `+N`.
- [x] Hidden excluded tags are not counted.
- [x] Expand/Show less retains other modal state.
- [x] API failure fallback works.

### Acceptance criteria

- [x] User-configured tags are visible first without mutating core config.
- [x] The complete list is always reachable by explicit click.

---

## THREAD-UTILITY-QUICK-SEARCH-01 — Adopt configurable utility buttons

**Priority:** High  
**Depends on:** `THREAD-UTILITY-TAGS-01`  
**Primary files:** utility registry, quick-search domain/controller, settings
model, tests, attribution docs

### Agent execution command

> Execute `THREAD-UTILITY-QUICK-SEARCH-01` only. Adopt the reference quick
> searches through the Thread Utility registry and normalized URL navigation.

### Required implementation

- [x] Add the six reference defaults with stable IDs.
- [x] Add normalized fields:
  - ID;
  - label;
  - query;
  - include title;
  - enabled;
  - order.
- [x] Bound definitions to 30.
- [x] Reject/repair empty, duplicate, oversized, and invalid values.
- [x] Create one utility registry with duplicate-ID rejection.
- [x] Register quick search as one utility family.
- [x] Build URLs with `URL`/`URLSearchParams`.
- [x] Support thread scope with current thread ID.
- [x] Support global F95 search without thread constraint.
- [x] Support current-tab and new-tab navigation.
- [x] Do not manipulate F95's global search input.
- [x] Do not use the reference's raw fixed-position DOM or GM storage.
- [x] Add fixed baseline utilities:
  - Copy thread link;
  - Copy title;
  - Copy formatted title + URL;
  - Go to opening post.
- [x] Keep account-changing actions out of scope.
- [x] Add reference attribution to README/changelog.

### Required tests

- [x] All six defaults match the reference behavior.
- [x] Include-title behavior.
- [x] Thread/global search URLs encode safely.
- [x] Current/new-tab behavior.
- [x] Utility ordering and duplicate rejection.
- [x] Invalid persisted settings normalize deterministically.
- [x] Fixed copy/navigation actions use the current generation snapshot.

### Acceptance criteria

- [x] Quick search works without fragile F95 search-input selectors.
- [x] Future utility families can register without changing the dispatcher.

---

## THREAD-UTILITY-CONTENT-01 — Extract collapsed Description and Installation

**Priority:** High  
**Depends on:** `THREAD-UTILITY-TAGS-01`  
**Primary files:** content section parser/model/renderer, fixture and synthetic
tests

### Agent execution command

> Execute `THREAD-UTILITY-CONTENT-01` only. Add bounded Description and
> Installation discovery, normalization, preview, and accordion behavior.

### Required implementation

- [x] Recognize Description and Overview case-insensitively.
- [x] Recognize Installation and How to install case-insensitively.
- [x] Support labels in bold/strong text, spoiler titles, and heading-like
      lines.
- [x] Stop at the next recognized top-level section.
- [x] Exclude Developer, Version, VNDB, Wiki, Other Games, Genres/Tags, and
      Downloads from Description.
- [x] Normalize only:
  - paragraphs;
  - line breaks;
  - ordered/unordered lists;
  - bold;
  - italic;
  - safe HTTP(S) links.
- [x] Strip images, media, scripts, inline handlers/styles, lightbox controls,
      toggle controls, and resolver buttons.
- [x] Bound output node count and text length.
- [x] Report truncation explicitly.
- [x] Render Description as a 2–8 line collapsed preview.
- [x] Show Read more only on overflow.
- [x] Expand by explicit click, never hover-only.
- [x] Add Show less and Copy description.
- [x] Keep Installation collapsed by default.
- [x] Use one-heavy-section-open accordion behavior.
- [x] Keep tag expansion independent from the accordion.

### Required tests

- [x] Fixture Overview becomes Description.
- [x] Fixture Installation is isolated.
- [x] Metadata and Downloads do not bleed into Description.
- [x] Missing spoilers and flat headings work in synthetic fixtures.
- [x] Missing sections are hidden/unavailable without failure.
- [x] Sanitized output contains only allowed structures.
- [x] Preview, Read more, Show less, and Copy states.
- [x] Accordion switching does not reset tags/utilities.

### Acceptance criteria

- [x] Long text remains readable on pointer and touch devices.
- [x] Original opening-post HTML is never cloned wholesale.

---

## THREAD-UTILITY-DOWNLOADS-01 — Present links and delegate Masked Direct actions

**Priority:** High  
**Depends on:** `THREAD-UTILITY-TAGS-01`  
**Primary files:** download parser/model/controller/renderer,
`addons/reference/sample.html`, Masked Direct boundary tests

### Agent execution command

> Execute `THREAD-UTILITY-DOWNLOADS-01` only. Extract conservative
> opening-post downloads, add Open/Copy actions, and delegate to existing live
> Masked Direct buttons. Do not add resolver logic or a new cross-add-on API.

### Required implementation

- [x] Search only inside the starter-post content root.
- [x] Prefer links after a recognized Download/Downloads boundary.
- [x] Exclude developer, VNDB, wiki, related-game, image, signature, post
      control, `javascript:`, `data:`, and malformed links.
- [x] If no reliable boundary exists, include only anchors adjacent to an
      existing Masked Direct resolver button.
- [x] Normalize:
  - stable runtime ID;
  - label;
  - platform;
  - host;
  - original URL;
  - direct/masked/unknown kind;
  - source anchor token;
  - optional Masked Direct token.
- [x] Detect nearby Win/Linux/Mac/Android/Other labels conservatively.
- [x] Use one flat Downloads group when platform grouping is ambiguous.
- [x] Deduplicate by normalized URL while preserving document order.
- [x] Keep a generation-owned runtime source map.
- [x] Never persist DOM elements.
- [x] Add Open and Copy original per link.
- [x] Add bounded Copy All originals.
- [x] Show Resolve/Direct DL only when the matching live adjacent button is
      present.
- [x] Before delegation verify:
  - current generation;
  - element is connected;
  - `data-addon-id="masked-direct-addon"`;
  - expected action type;
  - expected direct/masked URL attribute.
- [x] Invoke only the real page button's `.click()`.
- [x] Do not write Masked Direct GM keys, events, route markers, or request IDs.
- [x] On stale mapping, refresh once and otherwise show a bounded error toast.
- [x] Use `navigator.clipboard.writeText` from a direct user action.
- [x] Add a transient, immediately removed textarea fallback only if needed.
- [x] Do not add a clipboard grant without a separate evidence-backed review.
- [x] Defer copying resolved destinations.

### Required tests

- [x] Fixture Datanodes direct link maps to Direct DL.
- [x] Fixture GoFile, MEGA, PixelDrain, and WorkUpload map to Resolve.
- [x] Developer/wiki/image/signature links are excluded.
- [x] Link order and deduplication.
- [x] Platform grouping and flat fallback.
- [x] Absent Masked Direct shows Open/Copy only.
- [x] Delegation clicks the exact adjacent live button.
- [x] Stale or foreign button cannot be clicked.
- [x] No private Masked Direct transport/storage is written.
- [x] Close/refresh/route/disable/teardown clears source maps.
- [x] Copy All is bounded and deterministic.

### Acceptance criteria

- [x] Downloads are useful without Masked Direct.
- [x] Masked Direct remains the sole resolver/direct-download owner.
- [x] No new listener is required to make modal actions work.

---

## THREAD-UTILITY-PALETTE-01 — Integrate the compact thread dashboard

**Priority:** High  
**Depends on:** all Wave 3 packages  
**Primary files:** palette renderer/bindings/styles, UI controller, integrated
UI tests

### Agent execution command

> Execute `THREAD-UTILITY-PALETTE-01` only. Integrate the completed snapshot,
> tags, utilities, content, and downloads into one core-owned responsive
> palette.

### Required layout

1. title, version, developer, rating, and prefixes;
2. prioritized compact tags with `+N`;
3. primary Open/Copy actions;
4. quick utility buttons;
5. Description accordion;
6. Installation accordion;
7. Downloads accordion and count;
8. sticky Refresh and Settings footer.

### Required implementation

- [x] Open one large core dialog.
- [x] Register one sanitizer-compatible stylesheet.
- [x] Use an opaque, bordered, self-contained surface.
- [x] Keep one contained scroll region.
- [x] Keep footer actions visible.
- [x] Use `ui.dialog.update` to retain stable identity.
- [x] Rebind one delegated dialog listener after sanitized updates.
- [x] Suppress stale renders by generation.
- [x] Show loading, empty, partial, and failure states.
- [x] Keep summary/utilities available when starter sections fail.
- [x] Use real buttons and visible focus.
- [x] Add `aria-expanded` and section relationships.
- [x] Desktop layout remains compact.
- [x] Narrow layout stacks summary and uses a two-column utility grid.
- [x] No interaction is hover-only.
- [x] Verify CSS with the core add-on CSS sanitizer.

### Required tests

- [x] Initial compact layout contains the required hierarchy.
- [x] Partial snapshot still renders utilities.
- [x] Tags and accordion state survive dialog updates.
- [x] Only one heavy section opens by default.
- [x] Footer remains outside the scrolling content.
- [x] Narrow renderer classes are present.
- [x] Keyboard activation and ARIA state.
- [x] CSS sanitizer accepts the complete stylesheet.
- [x] Dialog update/rebind does not duplicate actions.

### Acceptance criteria

- [x] The first view is a compact thread summary, not a wall of post content.
- [x] Utilities remain immediately available above collapsed heavy content.

---

## THREAD-UTILITY-SETTINGS-01 — Complete persisted configuration

**Priority:** High  
**Depends on:** `THREAD-UTILITY-PALETTE-01`  
**Primary files:** settings model/registration/dialog/bindings/storage tests

### Agent execution command

> Execute `THREAD-UTILITY-SETTINGS-01` only. Complete core-rendered simple
> settings and the add-on-owned quick-utility editor.

### Persisted key

Use one namespaced versioned key:

```text
threadUtility.settings.v1
```

### Required implementation

- [x] Core-rendered settings:
  - show launcher;
  - visible tag limit;
  - description preview lines;
  - open searches in new tab.
- [x] Add-on dialog settings:
  - search scope;
  - excluded tag mode;
  - add utility;
  - label/query editing;
  - include-title;
  - enabled;
  - move up/down;
  - delete;
  - reset defaults;
  - save/cancel.
- [x] Edit a draft without mutating live settings.
- [x] Validate the complete draft before storage.
- [x] Save through `storage.set`.
- [x] Refresh through the canonical application path after save.
- [x] Preserve valid sibling settings when one field is invalid.
- [x] Report storage failure without closing the draft.
- [x] No inline handlers or raw modal overlay.

### Required tests

- [x] Defaults and tolerant normalization.
- [x] Bounds for counts/text/utility arrays.
- [x] Save/cancel/reset behavior.
- [x] Reorder and deletion.
- [x] Storage failure preserves draft.
- [x] Refresh applies settings once.
- [x] Disable/close removes settings bindings.

### Acceptance criteria

- [x] Every first-release behavior is configurable through one coherent model.
- [x] No reference GM storage key is reused.

---

## THREAD-UTILITY-HARDENING-01 — Bound extraction, accessibility, and races

**Priority:** Critical  
**Depends on:** `THREAD-UTILITY-SETTINGS-01`  
**Primary files:** all Thread Utility source/tests/docs

### Agent execution command

> Execute `THREAD-UTILITY-HARDENING-01` only. Harden limits, malformed markup,
> accessibility, cancellation, logging, and cleanup without adding features.

### Required implementation

- [ ] Define explicit limits for:
  - source nodes;
  - normalized nodes;
  - section text;
  - links;
  - tags;
  - utilities;
  - clipboard output;
  - dialog HTML;
  - stylesheet size.
- [ ] Parse heavy starter content only when palette/section demand requires it.
- [ ] No bootstrap-time full opening-post normalization.
- [ ] No background observer or polling.
- [ ] Manual Refresh handles changed opening posts.
- [ ] Escape all rendered text/attributes.
- [ ] Keep sanitized HTML within core payload limits.
- [ ] Redact URLs/query strings/content from diagnostics.
- [ ] Verify focus, keyboard, touch, and narrow-screen behavior.
- [ ] Verify route races and stale DOM tokens.
- [ ] Verify style/dialog/storage failures roll back cleanly.
- [ ] Document known parser limits and graceful fallback.

### Required tests

- [ ] Oversized fixture truncates deterministically.
- [ ] Malformed section/link markup is safe.
- [ ] Rapid open/refresh/close/route sequence.
- [ ] Disable during parsing/copy/delegation.
- [ ] No late UI/state commit.
- [ ] No listener/style/mount/dialog/transient-node leak.
- [ ] Logs contain no sensitive content.
- [ ] Accessibility assertions pass.

### Acceptance criteria

- [ ] Failure of one feature family does not disable summary or other utilities.
- [ ] Support burden remains bounded and observable.

---

## THREAD-UTILITY-VERIFY-01 — Run the integrated add-on matrix

**Priority:** Critical  
**Depends on:** `THREAD-UTILITY-HARDENING-01`  
**Primary files:** tests, manifest/catalog, smoke tooling, audit evidence

### Agent execution command

> Execute `THREAD-UTILITY-VERIFY-01` only. Run integrated validation and repair
> only failures caused by Thread Utility. Do not perform release builds.

### Required verification

- [ ] Add-on lint passes with zero warnings.
- [ ] Full lint passes.
- [ ] Focused Thread Utility tests pass.
- [ ] Full test suite passes.
- [ ] Manifest validation passes.
- [ ] Trusted catalog check passes.
- [ ] Add-on structure check passes.
- [ ] Regular add-on smoke build passes without mutation.
- [ ] Release-mode smoke build passes without mutation.
- [ ] Core CSS sanitizer accepts Thread Utility CSS.
- [ ] No version bump beyond the declared initial version.
- [ ] No build-cache mutation.
- [ ] No tracked `dist/` mutation.
- [ ] `git diff --check` passes.
- [ ] Catalog and audit evidence are refreshed through official commands.
- [ ] Audit writers were run sequentially.

### Route/lifecycle matrix

- [ ] ordinary thread route;
- [ ] thread route with canonical fixture structure;
- [ ] thread route with missing starter content;
- [ ] non-thread F95 route;
- [ ] repeated enable/disable;
- [ ] refresh while closed;
- [ ] refresh while open;
- [ ] before-page-change while parsing;
- [ ] dialog Escape/backdrop/API close;
- [ ] terminal teardown.

### Integration matrix

- [ ] Core tag preferences available.
- [ ] Core tag preferences unavailable.
- [ ] Masked Direct present with live buttons.
- [ ] Masked Direct absent.
- [ ] Masked Direct button stale after refresh.
- [ ] Clipboard primary path succeeds.
- [ ] Clipboard fallback/failure is bounded.

### Acceptance criteria

- [ ] No existing add-on behavior regresses.
- [ ] No new core public API is required.
- [ ] Every global definition-of-done item passes.

---

## THREAD-UTILITY-SIZE-AUDIT-01 — Record final footprint and ownership

**Priority:** Medium  
**Depends on:** `THREAD-UTILITY-VERIFY-01`  
**Primary files:** official add-on audit outputs and Thread Utility architecture
documentation

### Agent execution command

> Execute `THREAD-UTILITY-SIZE-AUDIT-01` only. Refresh deterministic add-on
> evidence and report Thread Utility's final source/build footprint. Do not
> refactor production code inside the audit package.

### Required work

- [ ] Run API audit sequentially.
- [ ] Run add-on service-size audit sequentially.
- [ ] Run add-on baseline audit sequentially.
- [ ] Record Thread Utility:
  - file count;
  - authored bytes;
  - physical/nonblank lines;
  - regular build bytes;
  - release build bytes;
  - gzip sizes;
  - largest contributors;
  - capabilities;
  - public core actions consumed.
- [ ] Confirm no unnecessary IDB/observer/hybrid capability.
- [ ] Confirm no sibling add-on imports.
- [ ] Confirm utility registry did not become a service locator.
- [ ] Confirm parser/UI/domain ownership is named in docs.

### Required tests

- [ ] Repeated audit output is byte-identical.
- [ ] Baseline check passes.
- [ ] API audit check passes.
- [ ] Audit excludes tests/reference fixtures from authored production totals.
- [ ] Smoke build leaves repository state unchanged.

### Acceptance criteria

- [ ] Final maintenance and bundle cost is explicit.
- [ ] No cleanup/refactor is hidden inside measurement.

---

# Final integrated verification

- [x] `THREAD-UTILITY-BASELINE-01`
- [x] `THREAD-UTILITY-GOLDEN-01`
- [x] `THREAD-UTILITY-FOUNDATION-01`
- [x] `THREAD-UTILITY-LIFECYCLE-01`
- [x] `THREAD-UTILITY-SNAPSHOT-01`
- [x] `THREAD-UTILITY-TAGS-01`
- [x] `THREAD-UTILITY-QUICK-SEARCH-01`
- [x] `THREAD-UTILITY-CONTENT-01`
- [x] `THREAD-UTILITY-DOWNLOADS-01`
- [x] `THREAD-UTILITY-PALETTE-01`
- [x] `THREAD-UTILITY-SETTINGS-01`
- [ ] `THREAD-UTILITY-HARDENING-01`
- [ ] `THREAD-UTILITY-VERIFY-01`
- [ ] `THREAD-UTILITY-SIZE-AUDIT-01`
- [ ] `npm run lint`
- [ ] `npm run lint:addons`
- [ ] zero lint warnings
- [ ] `npm test`
- [ ] manifest validation
- [ ] trusted-catalog check
- [ ] add-on structure validation
- [ ] regular smoke build
- [ ] release smoke build
- [ ] no build-cache change
- [ ] no tracked `dist/` change
- [ ] no unrelated version bump
- [ ] `git diff --check`
- [ ] no raw core action outside adaptor/API wrappers
- [ ] no sibling add-on/core-internal import
- [ ] no duplicate lifecycle/UI owner
- [ ] no stale commit after invalidation
- [ ] teardown acknowledgment exactly once
- [ ] no raw observer or polling
- [ ] exact tag `+N`
- [ ] explicit Description expansion
- [ ] conservative download extraction
- [ ] Masked Direct remains sole resolver owner
- [ ] reference attribution present
- [ ] final deterministic audit evidence generated

---

# Expected result

The project gains one extensible final add-on with a clear support boundary:

- users first see a compact, prioritized summary of the open thread;
- tags honor core preferences and expose an exact expandable overflow;
- long content remains collapsed and explicitly readable;
- utility searches are configurable without depending on fragile site search
  controls;
- download links are summarized safely;
- existing Masked Direct controls are reused without duplicating automation;
- all resources are core-owned or explicitly reversible;
- later thread utilities can join one registry without creating another add-on
  or another lifecycle system.
