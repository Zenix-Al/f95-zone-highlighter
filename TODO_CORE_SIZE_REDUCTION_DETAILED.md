# Core Size Reduction Archived Master Plan

> **Checkpoint (2026-08-01):** This mixed master plan is retained as the full
> historical specification. Do not execute packages from this file directly.
> Completed, rejected, and blocked decisions are summarized in
> `TODO_CORE_SIZE_REDUCTION_COMPLETED.md`. Genuinely unexecuted work is tracked
> in `TODO_CORE_SIZE_REDUCTION_REMAINING.md`.

This plan reduces the non-add-on core without turning size work into a rewrite.
It starts with measured, behavior-preserving or explicitly accepted UI
simplifications, then stops before compatibility or product cuts unless those
cuts receive a separate decision.

Prepared against the repository inspected on **2026-07-31**.

---

## Goal

Reduce all three relevant footprints:

1. authored core source;
2. core bytes in the regular and fully uglified bundles;
3. whole-userscript gzip bytes.

Release-bundle and gzip reductions are the primary outcome. Source-only cleanup
does not count as a successful size package unless the package is explicitly a
dead-source hygiene package.

The plan must preserve the current framework, persistence safety, add-on API,
feature lifecycle, and release behavior. It must not replace working code with
a larger abstraction merely to reduce one file.

---

## Measured starting point

The current `core-source-audit` records:

| Measurement | Current |
| --- | ---: |
| Authored non-add-on core | 476,860 bytes |
| Regular-bundle core contribution | 415,202 bytes |
| Uglified-bundle core contribution | 217,419 bytes |
| Whole regular bundle | 644,346 bytes |
| Whole uglified bundle | 325,815 bytes |
| Whole uglified gzip | 96,838 bytes |

The bundle also contains 108,384 uglified bytes owned by the add-on service and
add-on management UI. That code is outside this core plan. Reducing it requires
its own add-on-runtime plan and must not be smuggled into a core package.

### Measured candidate contributions

These are attribution measurements, not guaranteed savings. Shared code and CSS
mean the retained output must be measured after each implementation.

| Candidate | Authored evidence | Current uglified contribution | Risk | Recommendation |
| --- | ---: | ---: | --- | --- |
| Custom dark color picker | 9,258 JS bytes plus 1,427 custom-only CSS bytes | 4,831 JS bytes plus CSS | Low-medium | Do first |
| Static modal HTML whitespace | 6,070-byte source; about 1,042 indentation-only bytes | 6,242 total HTML contribution | Low | Do first |
| Feature-health presentation UI | 11,712 JS bytes plus 940 CSS bytes | 5,944 JS bytes plus CSS | Low-medium | Do after first wave |
| General dialog implementation | 11,564 JS bytes | 3,914 bytes | Medium | Consolidate only behind a gain gate |
| Costly existing abstractions | Unknown until targeted call-site audit | Unknown | Medium | Probe whether selected low-consumer helpers are smaller when specialized or inlined |
| Latest Overlay metadata entry point | 17,439 JS bytes | 9,619 bytes | Medium | Prototype only; repetition already gzips well |
| Historical storage migration | 7,917 authored service bytes | 3,209 service bytes plus caller branches | High | Audit now; retire only by explicit compatibility decision |
| Legacy config-transfer normalization | Part of 18,976 authored transfer bytes | Part of 9,100 transfer subsystem bytes | High | Keep separate from storage migration |
| Five optional convenience features | 23,423 authored bytes | 12,603 bytes | Very high product risk | Decision-only, one feature at a time |
| Tag-management pointer/reorder system | 36,317 authored subsystem bytes | 16,671 bytes; drag module is 6,254 | High UX risk | Retain by default |
| Fast Capture | 33,985 authored subsystem bytes | 13,181 bytes | High performance/lifecycle risk | Specialize for its sole Latest Overlay consumer behind a strict gain gate |
| Config Transfer as a whole | 18,976 authored subsystem bytes | 9,100 bytes | High data-safety risk | Retain by default |
| Latest Overlay as a whole | 77,709 authored subsystem bytes | 31,769 bytes | Critical product risk | Retain by default |

`src/services/notificationService.js` is 669 authored bytes but contributes zero
bytes to the release bundle. It is referenced only by `_old/direct-download`.
Deleting it may clean the source tree, but it is not a release-size win and is
not prioritized by this plan.

---

## Ranking rules

Candidates are ordered by safe expected return, not raw file size.

### Risk levels

- **Low:** build representation or unreachable presentation detail; no persisted
  data, public API, lifecycle, or feature semantics change.
- **Low-medium:** a deliberately accepted UI simplification with a small,
  testable interaction contract.
- **Medium:** shared UI construction or declarative metadata where ordering,
  focus, callbacks, or cleanup can drift.
- **High:** compatibility, import/export, touch interaction, or user-facing
  feature availability can change.
- **Critical:** the candidate is a major performance or product subsystem.

### Gain gates

- Every production package must reduce the regular bundle, uglified bundle, or
  gzip output without increasing another primary metric unexpectedly.
- A refactor package with no accepted behavior simplification must save at least
  **1,024 uglified bytes** or **512 gzip bytes**. Otherwise revert it.
- A tiny source-only reduction is not enough to justify a new shared helper,
  registry, factory, or build framework.
- Report gross and net savings. Do not quote the full contributor size as the
  achieved reduction.
- If gzip grows, stop and explain why before accepting the package.

### Compression-aware repetition rule

Do not search the repository broadly for repeated source merely to make it
DRY. Minification and gzip already compress repeated syntax, while a shared
runtime helper adds calls, parameters, branches, and cleanup coordination. The
rejected dialog-shell prototype is the standing example: it removed 2,555
authored bytes but only 641 uglified and 45 gzip bytes.

A repetition candidate enters this plan only when targeted evidence shows one
of the following:

- the repeated paths carry materially different runtime machinery that can be
  deleted, not merely moved behind a helper;
- specialization can remove unused modes, registries, public contracts, or
  lifecycle branches;
- an accepted behavior simplification removes code outright.

Use one reversible prototype and measure the shipped artifact early. Do not
perform a repository-wide DRY inventory, do not keep abstractions for source
line-count savings, and do not revisit a rejected candidate unless its behavior
or consumer set materially changes.

The inverse is also valid: an existing helper is not automatically size-efficient.
A helper with only a few consumers can cost more than repeated direct code when
its options, callbacks, generic return shape, and defensive branches survive
minification. `CORE-SIZE-DEABSTRACTION-PROBE-01` may test that case, but it must
start from concrete low-consumer helpers rather than indiscriminately inlining
shared code.

---

## Fixed scope

### Included

- `src/config/**`;
- `src/core/**`;
- non-add-on `src/services/**`;
- `src/features/**`;
- non-add-on core UI and assets under `src/ui/**`;
- core build and size-audit tooling needed to measure the same artifacts;
- focused tests and deterministic before/after evidence.

### Excluded

- `src/services/addons/**`, `src/services/addonsService.js`, add-on settings UI,
  add-on renderers, and `addons/**`;
- changing the add-on API or moving core internals behind add-on actions as an
  incidental refactor;
- generated or tracked `dist/` edits before an explicitly requested release;
- hand-minifying source into unreadable one-line JavaScript or CSS;
- changing saved configuration into a JSON string merely to make storage look
  like one line;
- Map/Set substitutions without a measured size reduction;
- lazy loading that only moves bytes but leaves the userscript the same size;
- another CSS framework, dialog framework, settings framework, or generic
  metadata compiler;
- dropping safety, teardown, validation, or recovery behavior to win a few
  bytes;
- deleting user-facing features without an explicit product decision.

---

## How to use this document

1. Execute one package ID at a time.
2. Run `CORE-SIZE-REDUCTION-BASELINE-01` before production changes.
3. Keep the original reduction baseline immutable.
4. Generate a current report after every package using the same build modes and
   contributor attribution.
5. Add behavior tests before simplifying a component with incomplete coverage.
6. Apply the gain gate after tests pass; passing tests alone do not make a size
   refactor worthwhile.
7. Revert a failed prototype package cleanly instead of layering another helper
   on top to rescue it.
8. Mark a decision package complete when its evidence and decision are recorded,
   even if the correct decision is to retain the current code.
9. Never combine a compatibility retirement with an unrelated UI reduction.
10. Run audit writers sequentially.
11. Edit source, never generated userscripts.
12. Mark checkboxes only after the named evidence exists.

---

## Global definition of done

A production package is complete only when all applicable items pass:

- [ ] Package-specific behavior is covered before and after the change.
- [ ] Authored, regular, uglified, and gzip deltas are recorded.
- [ ] The package passes its minimum-gain gate.
- [ ] No unrelated user change is overwritten.
- [ ] No new lifecycle, observer, listener, task, or style owner is introduced
      without matching cleanup.
- [ ] No persisted config field, storage key, import format, or public API changes
      unless the package explicitly owns that compatibility decision.
- [ ] Add-on source and add-on API behavior remain unchanged.
- [ ] Lint completes with zero warnings.
- [ ] Focused tests pass.
- [ ] Full tests pass for medium-or-higher-risk packages.
- [ ] `npm run build:core:smoke` passes.
- [ ] `git diff --check` passes.
- [ ] No version, release metadata, generated manifest, build cache, or tracked
      `dist/` mutation occurs.

---

## Required execution order

### Wave 0 — Freeze comparable evidence

1. `CORE-SIZE-REDUCTION-BASELINE-01`

### Wave 1 — Accepted low-risk reductions

Execute separately; either order is valid after Wave 0:

1. `CORE-SIZE-NATIVE-COLOR-01`
2. `CORE-SIZE-HTML-COMPACT-01`

### Wave 2 — Simplify duplicated support UI

1. `CORE-SIZE-HEALTH-UI-01`
2. `CORE-SIZE-DIALOG-SHELL-01`

The dialog package must use the post-health baseline and may be rejected by its
gain gate without blocking later waves.

### Wave 3 — Specialize single-consumer capture infrastructure

1. `CORE-SIZE-LATEST-CAPTURE-01`

This is a high-risk internal specialization, not removal of early capture. It
must preserve Latest Overlay timing and every safety boundary, and it must not
create or expose an add-on interception API.

### Wave 4 — Optional measurement-gated structural candidates

1. `CORE-SIZE-DEABSTRACTION-PROBE-01`
2. `CORE-SIZE-OVERLAY-METADATA-PROBE-01`

This wave is optional. Do not execute it merely because the earlier packages
were successful.

### Wave 5 — Compatibility decisions

1. `CORE-SIZE-STORAGE-COMPAT-AUDIT-01`
2. `CORE-SIZE-STORAGE-COMPAT-RETIRE-01` — explicit approval required
3. `CORE-SIZE-TRANSFER-COMPAT-RETIRE-01` — separate explicit approval required

The two retirements are independent compatibility breaks and must never be
combined.

### Wave 6 — Optional product-surface decision

1. `CORE-SIZE-OPTIONAL-FEATURES-01` — explicit approval required

### Wave 7 — Integrated verification

1. `CORE-SIZE-VERIFY-01`

---

## CORE-SIZE-REDUCTION-BASELINE-01 — Freeze size and behavior evidence

**Priority:** Critical  
**Risk:** None; measurement only  
**Production changes:** None  
**Decision:** Retain compatibility; retirement remains blocked

### Required work

- [x] Generate an immutable core-size reduction baseline from the current
      source using `core-source-audit`.
- [x] Record authored bytes by area and file.
- [x] Record whole regular, whole uglified, and deterministic gzip bytes.
- [x] Record regular and uglified non-add-on core contributions.
- [x] Retain the complete core contributor list for this reduction plan rather
      than only the top twenty entries.
- [x] Record exact release contributions for the candidates in the ranking
      table.
- [x] Record custom color-picker JS bytes and custom-only CSS rule bytes.
- [x] Record modal HTML raw bytes and a non-writing inter-tag whitespace
      estimate.
- [x] Record feature-health and dialog JS/CSS ownership separately.
- [x] Record the current supported behavior for color changes, diagnostics,
      every dialog variant, config migration, and config transfer.
- [x] Add deterministic comparison output for later package reports without
      timestamps or machine-specific paths.
- [x] Run the baseline twice and confirm byte-identical evidence.

### Required tests

- [x] The audit distinguishes core-owned and excluded add-on-owned bytes.
- [x] Contributor totals equal the reported core contribution.
- [x] Candidate grouping does not double-count a file.
- [x] Smoke builds do not mutate tracked state.

### Acceptance criteria

- [x] Every later package can report a net delta against one immutable baseline.
- [x] No production source or release artifact changes.
- [x] Baseline values match the measured starting point in this document or any
      discrepancy is explained before continuing.

---

## CORE-SIZE-NATIVE-COLOR-01 — Replace the custom picker with native color input

**Priority:** High  
**Risk:** Low-medium; intentional UI simplification  
**Expected reduction:** approximately 5–6 KB uglified before gzip

### Accepted behavior change

The operating system/browser color picker replaces the custom HSL/hex popover.
The core retains the color swatch and stored hexadecimal value. Custom Apply,
Cancel, HSL sliders, hex text entry, popover placement, and popover-specific
keyboard behavior are removed.

### Required work

- [x] Freeze current color metadata paths, defaults, reset behavior, validation,
      effects, and rendered input IDs.
- [x] Render metadata type `color` as `<input type="color">` through the existing
      input renderer.
- [x] Preserve the existing `config-color-input` class where it remains useful
      for sizing and native swatch styling.
- [x] Preserve the current config update/effect path by using the native input's
      normal `input`/`change` behavior; do not create a new color save path.
- [x] Remove the `darkColorPicker` import and source module after repository-wide
      reachability confirms it has no other caller.
- [x] Remove only `.dark-color-*` CSS and popover-only rules.
- [x] Retain native swatch wrapper/swatch styling unless a focused browser check
      proves it unnecessary.
- [x] Remove the settings-modal backdrop exception that exists only for
      `.dark-color-popover`.
- [x] Update component and renderer documentation to describe native behavior.
- [x] Record exact JS, CSS, regular, uglified, and gzip reductions.

### Required tests

- [x] A color setting renders as `type="color"` with the expected current value.
- [x] A native color change persists through the existing setting handler.
- [x] Color validation still rejects malformed imported/stored values.
- [x] Color reset still restores every default and reruns required effects.
- [x] Rerendering does not duplicate change handlers.
- [x] Closing the settings modal no longer contains picker-specific logic.
- [x] CSS audit reports no stale `.dark-color-*` selector or source reference.

### Manual checkpoint

- [x] Open the native picker in the primary supported browser.
- [x] Change one overlay color and verify the swatch and affected page UI update.
- [x] Close/reopen settings and verify the persisted value.

### Acceptance criteria

- [x] Custom picker JS and custom-only CSS are absent.
- [x] Native color editing, persistence, validation, and reset work.
- [x] Uglified and gzip outputs both decrease.
- [x] No new color-picker wrapper or compatibility abstraction is introduced.

### Measured result

- Custom picker JS removed: 9,258 authored bytes.
- Custom-only CSS removed: 11 rules / 1,427 authored bytes.
- Net non-add-on core reduction: 10,709 regular bytes and 6,210 uglified bytes.
- Net whole-build reduction: 10,752 regular bytes, 6,210 uglified bytes,
  2,670 regular-gzip bytes, and 2,023 uglified-gzip bytes.

---

## CORE-SIZE-HTML-COMPACT-01 — Compact the static modal HTML at build time

**Priority:** High  
**Risk:** Low  
**Expected reduction:** about 1 KB before gzip

### Required work

- [x] Confirm `src/ui/assets/ui.html` is the only core HTML text import.
- [x] Add one narrow build transform for that asset which converts indentation-
      only inter-tag whitespace to one space.
- [x] Preserve visible text, attribute values, quoted whitespace, and all IDs,
      classes, data attributes, and element order.
- [x] Scope the transform to the core modal asset; do not create a repository-
      wide HTML minification framework.
- [x] Use the identical transform in release builds and `core-source-audit` so
      measured output cannot drift from built output.
- [x] Keep the authored HTML readable and multiline.
- [x] Record raw asset, transformed asset, regular, uglified, and gzip deltas.

### Required tests

- [x] The transform is deterministic.
- [x] Parsing authored and compacted HTML yields the same element tree,
      attributes, IDs, classes, and normalized visible text.
- [x] The transform preserves meaningful spaces inside text and attributes.
- [x] Settings navigation, panels, buttons, and add-in mount placeholders remain
      present exactly once.
- [x] Core smoke output uses the same compacted asset measured by the audit.

### Acceptance criteria

- [x] Authored HTML readability is unchanged.
- [x] No runtime HTML minification work is added.
- [x] Regular, uglified, and gzip output do not increase.
- [x] The transform remains a small build helper rather than a generic parser.

### Measured result

- Authored modal asset remains readable at 6,070 bytes.
- Built one-line modal asset: 4,307 bytes, a 1,763-byte asset reduction.
- Package-only whole/core regular reduction: 2,084 bytes.
- Package-only whole/core uglified reduction: 1,923 bytes.
- Package-only regular-gzip reduction: 232 bytes.
- Package-only uglified-gzip reduction: 181 bytes.

---

## CORE-SIZE-HEALTH-UI-01 — Render diagnostics once as compact text

**Priority:** Medium-high  
**Risk:** Low-medium; support UI presentation changes  
**Expected reduction:** approximately 2.5–4 KB uglified before gzip

### Preserved contract

The health collectors, bounded event stores, redaction, add-on health summary,
resource/queue diagnostics, summary toast, copy action, and close action remain.
Only the duplicated rich line-by-line presentation is simplified.

### Required work

- [x] Freeze the current diagnostic text fields and installed-add-on summary.
- [x] Freeze copy success/failure and close behavior.
- [x] Keep `src/core/featureHealth.js` behavior unchanged.
- [x] Generate the plain-text diagnostic report once.
- [x] Render that same report in a compact `<pre>` or equivalent text container
      instead of rebuilding a second rich DOM representation.
- [x] Keep Copy and Close controls and the clipboard fallback.
- [x] Remove rich-render-only loops, classes, and CSS after proving no other
      caller uses them.
- [x] Preserve text escaping by assigning `textContent`; never inject report
      text through `innerHTML`.
- [x] Record exact source, CSS, regular, uglified, and gzip deltas.

### Required tests

- [x] Feature statuses, errors, resource/queue counts, and installed add-ons all
      appear in the rendered and copied report.
- [x] Diagnostic details remain redacted and bounded.
- [x] Empty feature/add-on states remain understandable.
- [x] Copy uses the same payload shown to the user.
- [x] Close and repeated open do not duplicate nodes or listeners.
- [x] The support action still works when the Shadow root is available and in
      its documented fallback context.

### Acceptance criteria

- [x] No diagnostic data or collection behavior is removed.
- [x] The UI becomes simpler, not less useful for support.
- [x] Uglified output falls by at least 1,024 bytes and gzip decreases.
- [x] No generic report-rendering component is added.

### Measured result

- Feature-health source: 11,712 -> 7,936 bytes (`-3,776`).
- Feature-health CSS: 8 rules / 940 bytes -> 7 rules / 983 bytes (`+43`).
- Package-only whole/core regular reduction: 3,557 bytes.
- Package-only whole/core uglified reduction: 1,383 bytes.
- Package-only regular-gzip reduction: 453 bytes.
- Package-only uglified-gzip reduction: 401 bytes.

---

## CORE-SIZE-DIALOG-SHELL-01 — Deduplicate local dialog construction

**Priority:** Medium  
**Risk:** Medium  
**Expected reduction:** uncertain; package must pass the gain gate

### Required work

- [x] Characterize confirm, text prompt, reorder, and settings dialog return
      values, focus, Escape, Enter, backdrop, validation, and `onClose` behavior.
- [x] Identify only genuinely repeated backdrop, panel, heading, actions, close,
      and disposal code.
- [x] Introduce at most one file-local shell creator and one file-local close/
      disposal helper.
- [x] Keep all four public function signatures unchanged.
- [x] Preserve promise resolution values exactly: boolean, string/null, ordered
      key array/null, and settings controller object.
- [x] Preserve exactly-once `onClose` behavior when another dialog replaces the
      active dialog.
- [x] Keep reorder-specific behavior local; do not create a dialog framework or
      schema.
- [x] Prefer one delegated reorder-control listener only if it is smaller and
      preserves keyboard/button behavior.
- [x] Measure a prototype before accepting the refactor.
- [x] Revert the package if it saves less than 1,024 uglified bytes or 512 gzip
      bytes, or if the shared helper makes behavior harder to verify.

### Required tests

- [x] Confirm resolves true/false through buttons, Enter, Escape, and backdrop.
- [x] Text prompt preserves validation, read-only, multiline, Ctrl/Cmd+Enter,
      selection, and null cancellation.
- [x] Reorder preserves item order, disabled boundaries, save, and cancel.
- [x] Settings dialog renders metadata, closes from every supported path, and
      calls `onClose` exactly once.
- [x] Opening a second dialog disposes the first without stale listeners.
- [x] Focus behavior remains equivalent.

### Acceptance criteria

- [x] Public dialog behavior and CSS contracts remain unchanged.
- [x] The gain gate passes; otherwise the current implementation is retained and
      the rejection is recorded.
- [x] No cross-module dialog abstraction is introduced.

### Decision: rejected by the gain gate

The tested prototype used one file-local shell creator, one guarded disposal
helper, and unchanged public signatures. It also proved the intended
exactly-once replacement cleanup in isolation. The shipped-size gain was too
small, so the production refactor was reverted and the existing CSS retained.
Characterization also exposed an existing settings-dialog replacement hazard:
the replacement path invokes `onClose` directly instead of disposing the old
document listener through `close`. The prototype corrected it, but that repair
was not smuggled into this rejected size package and should be handled
separately.

- Prototype dialog source: 11,564 -> 9,009 bytes (`-2,555`).
- Package-only regular reduction: 1,157 bytes.
- Package-only uglified reduction: 641 bytes; required minimum: 1,024 bytes.
- Package-only regular-gzip reduction: 30 bytes.
- Package-only uglified-gzip reduction: 45 bytes; required minimum: 512 bytes.

---

## CORE-SIZE-DEABSTRACTION-PROBE-01 — Test whether selected helpers cost more than direct code

**Priority:** Low  
**Risk:** Medium  
**Production status:** Optional measurement-gated prototypes

This package investigates the inverse of ordinary DRY refactoring. Some existing
helpers may increase the shipped bundle because a small number of call sites pay
for generic options, dispatch, adapters, callbacks, and result normalization that
none of them need. The goal is not to make the source less organized; it is to
identify concrete abstractions whose removal deletes more runtime machinery than
the specialized call sites add back.

### Candidate selection

- [ ] Start from build attribution and exact symbol references; do not inventory
      every function or search for cosmetic one-line wrappers.
- [ ] Shortlist only helpers with few production consumers, preferably one to
      three, and a measurable uglified contribution.
- [ ] Require evidence of abstraction overhead such as unused modes, option
      parsing, branch dispatch, generic callback plumbing, adapters, registries,
      or normalized result objects.
- [ ] Record every production caller and the subset of behavior each caller uses.
- [ ] Exclude public APIs, add-on contracts, persistence/schema boundaries, and
      core lifecycle or safety primitives unless a separate package explicitly
      authorizes their redesign.
- [ ] Rank candidates by removable machinery and behavioral isolation, not by
      authored line count or subjective dislike of a helper.

### Prototype procedure

- [ ] Characterize the selected helper and all of its callers before editing.
- [ ] Prototype only one helper at a time by specializing or directly inlining
      the exact behavior each caller needs.
- [ ] Delete the helper only when no production caller remains; do not leave a
      compatibility wrapper that erases the expected saving.
- [ ] Preserve ordering, cleanup, error propagation, return values, focus, and
      lifecycle behavior relevant to the selected candidate.
- [ ] Measure regular, uglified, regular-gzip, and uglified-gzip output immediately.
- [ ] Revert that prototype cleanly before testing another candidate if it misses
      the gain gate or makes the call sites materially harder to verify.
- [ ] Do not combine several weak prototypes to hide an individually poor result.

### Gain gate

- [ ] Each retained de-abstraction must save at least **1,024 uglified bytes** or
      **512 gzip bytes**, with no unexpected growth in another primary metric.
- [ ] The report distinguishes helper bytes removed from direct-call-site bytes
      added and states the net shipped result.
- [ ] A zero-candidate result is valid: record that no sufficiently promising
      abstraction was found and make no production change.

### Verification

- [ ] Add or retain focused tests for every affected caller and shared edge case.
- [ ] Run lint, focused tests, full tests, core audit/check, smoke build, CSS
      audit/check when UI code is affected, and `git diff --check`.
- [ ] Confirm rejected prototypes leave no production or temporary-file residue.

### Acceptance criteria

- [ ] The package ends with each tested candidate accepted or rejected by named
      artifact measurements.
- [ ] No helper is removed merely to reduce source lines or make code less DRY.
- [ ] Every retained specialization has the same externally observable behavior
      unless a behavior simplification was separately approved.

---

## CORE-SIZE-OVERLAY-METADATA-PROBE-01 — Test compact metadata without committing complexity

**Priority:** Low  
**Risk:** Medium  
**Production status:** Accepted by explicit user exception after the original rejection

The Latest Overlay entry point is large, but much of its size is user-visible
labels, tooltips, config paths, and callbacks. Those strings compress well. This
package exists to prevent an attractive-looking source refactor from landing
without a real bundle win.

### Required work

- [x] Snapshot every Latest Overlay metadata ID, order, type, label, tooltip,
      config path, input constraint, option, effect, and toast result.
- [x] Separate unavoidable strings/data from repeated object boilerplate in the
      measurement.
- [x] Prototype only small file-local descriptor tables for repeated toggles,
      weights, and tag modifiers.
- [x] Preserve named exports that are current source/test contracts unless a
      repository-wide usage audit proves they can become local.
- [x] Do not add a shared metadata DSL, compiler, registry layer, or runtime
      schema.
- [ ] Measure startup work as well as size; loops that construct metadata must
      not add meaningful startup cost.
- [ ] Keep the prototype only if it saves at least 1,024 uglified bytes and 512
      gzip bytes with no behavior drift.
- [x] Otherwise revert all production edits and record the candidate as rejected.

### Required tests

- [ ] Metadata snapshots before and after are deeply equal in key order and
      behavior-relevant values.
- [ ] Every effect and toast still receives the same arguments.
- [ ] Reset, color-order dialog, overlay style, and all score settings work.
- [ ] Feature discovery and settings metadata registration remain unchanged.

### Acceptance criteria

- [x] The package ends in either a measured worthwhile reduction or a clean
      no-production-change rejection.
- [x] Source brevity alone is not accepted as evidence.

### Original decision record — rejected, then reconsidered

The reversible prototype replaced repeated overlay toggles, scoring weights, and
tag modifiers with file-local descriptor arrays and construction loops. It kept
the existing named exports and did not introduce shared infrastructure. Against
the post-health/post-dialog baseline it measured:

- authored core source: 461,619 -> 459,007 bytes (`-2,612`);
- regular bundle: 627,953 -> 625,443 bytes (`-2,510`);
- regular gzip: 134,280 -> 134,257 bytes (`-23`);
- release uglified bundle: 316,299 -> 314,931 bytes (`-1,368`);
- release uglified gzip: 94,233 -> 94,194 bytes (`-39`);
- `latest-overlay/index.js`: 9,619 -> 8,264 uglified bytes (`-1,355`).

The prototype passed the 1,024-byte uglified threshold but missed the required
512-byte gzip threshold by a wide margin. The new construction loops also added
startup work, so no startup benchmark or broader behavior-test expansion was
warranted after the hard size gate had already failed. All production edits were
reverted; the required behavior tests remain unchanged because no production
behavior or representation was retained.

### Reconsideration record — accepted 2026-08-01

The user explicitly accepted the approximately 1.4 KB release reduction even
though gzip remained below the original 512-byte AND gate. The same constrained,
file-local approach was restored without a shared DSL or registry layer. The
final implementation measured against the post-catalog checkpoint:

- authored core source: 448,523 -> 445,914 bytes (`-2,609`);
- regular bundle: 616,216 -> 613,472 bytes (`-2,744`);
- regular gzip: 132,169 -> 132,099 bytes (`-70`);
- release uglified bundle: 311,115 -> 309,707 bytes (`-1,408`);
- release uglified gzip: 92,898 -> 92,836 bytes (`-62`).

Focused metadata contract coverage now locks key order, config paths, effect
callbacks, and toast output. Acceptance is an explicit package-gate exception,
not a change to the default size thresholds for later probes.

---

## CORE-SIZE-LATEST-CAPTURE-01 — Specialize Fast Capture for Latest Overlay

**Priority:** High  
**Risk:** High; early interception, route lifecycle, and overlay timing  
**Current evidence:** 33,985 authored bytes / 13,181 uglified bytes  
**Production status:** Measurement-gated internal specialization

Fast Capture has one production consumer: Latest Overlay. Its generic feature
metadata, keyed store, subscriber sets, capture modes, and public facade were
created for hypothetical additional core or add-on consumers that do not
exist. This package makes capture private Latest Overlay infrastructure. It
does not remove early capture and does not expose authenticated response
interception to add-ons.

### Preserved contract

- Capture begins in the loader's early phase before normal feature enable and
  before the body is required.
- Existing XHR/fetch interception and page-context/sandbox fallback behavior
  remain reversible.
- Only same-origin HTTP(S) responses matching the Latest data endpoint are
  accepted.
- Payload, pending-work, retained-byte, TTL, and route-generation bounds remain
  equal or become strictly narrower.
- The newest valid Latest response replaces the previous snapshot.
- A response captured before Latest Overlay enables remains available when the
  handler starts.
- Later valid responses still refresh the active overlay.
- Performance-entry recovery remains available for a request that completed
  before interception.
- Disable, route transition, teardown, malformed data, oversize data, and
  transport failures cannot commit stale overlay state.
- Diagnostics remain bounded and expose metadata/counts only, never response
  bodies.

### Required investigation

- [x] Prove repository-wide that Latest Overlay is the only production consumer
      of snapshot reads and capture notifications.
- [x] Prove no current add-on API descriptor, action, bridge command, or trusted
      add-on imports Fast Capture.
- [x] Record the exact loader → capture → store → handler sequence for a response
      arriving before enable, during enable, after enable, and after disable.
- [x] Attribute bytes separately to generic rule normalization, feature
      registration, keyed storage/subscribers, transports, queueing, recovery,
      diagnostics, and Latest-specific behavior.
- [x] Freeze the current accepted URL, data path, transport, latest-mode, TTL,
      payload limit, queue limit, retained-byte limit, and drop reasons.

### Required implementation

- [x] Move or rename the retained implementation so ownership is visibly under
      Latest Overlay, while keeping the loader able to start it early.
- [x] Replace generic feature-list registration with one explicit Latest capture
      startup call using the current route context.
- [x] Remove `fastCapture` metadata from `createFeature`,
      `createStyledFeature`, descriptor validation, and documentation after
      proving no second descriptor uses it.
- [x] Replace the keyed `Map` snapshot store with one bounded Latest snapshot.
- [x] Replace public subscriber sets with at most one private Latest consumer
      callback plus an immediate current-snapshot read. This callback is an
      internal producer/consumer seam, not a reusable pub/sub API.
- [x] Remove unused generic feature keys, multiple capture modes, subscriber
      IDs/health metadata, and public consumer facade exports.
- [x] Keep transport patching, queued parsing, performance recovery, limits,
      route invalidation, diagnostics, and teardown only to the extent required
      by the frozen Latest contract.
- [x] Keep the response body inaccessible to add-on actions, bridge messages,
      settings metadata, logs, and diagnostics.
- [x] Update loader, feature, service, observability, and directory-map
      documentation to describe private Latest capture ownership.
- [x] Do not add a compatibility facade for hypothetical consumers.
- [x] Record exact authored, regular, uglified, and gzip deltas.

Evidence: a repository-wide scan found one production snapshot/notification
consumer (`latest-overlay/handler.js`) and no add-on descriptor, action, bridge,
or trusted add-on import. Ownership moved from `src/services/fastCapture/` to
`src/features/latest-overlay/capture/`; the loader now starts and refreshes that
single producer explicitly. The frozen lifecycle and safety contract is in
`docs/services/fastCapture.md`.

Against the immediate pre-package smoke build, authored core source fell by
10,742 bytes, the regular bundle by 10,137 bytes (2,097 gzip), and the release
uglified bundle by 3,893 bytes (1,197 gzip). The candidate audit records capture
at 23,153 authored / 22,128 readable / 9,609 uglified bytes versus the frozen
33,985 / 31,641 / 13,181 baseline.

### Required tests

- [x] Capture starts early enough to observe the site's first Latest request.
- [x] A pre-enable snapshot is consumed once Latest Overlay enables.
- [x] A post-enable capture updates the active overlay.
- [x] Repeated valid Latest captures retain only the newest bounded snapshot.
- [x] XHR, fetch, page transport, sandbox fallback, and performance recovery
      retain their supported behavior.
- [x] Same-origin, endpoint, response type, malformed JSON, payload-size, queue,
      TTL, and retained-byte limits remain enforced.
- [x] Route A → B → C invalidates queued and running work from stale generations.
- [x] Disable and teardown restore patches, clear the consumer callback, and
      prevent late commits.
- [x] Re-enable and same-route refresh do not duplicate transport hooks or
      callbacks.
- [x] Diagnostics remain bounded, redacted, and body-free.
- [x] Feature discovery, loader ordering, Latest Overlay enable/disable, and
      settings behavior remain unchanged.
- [x] Repository checks find no generic Fast Capture API or add-on exposure
      after specialization.

### Gain gate and rollback

- [x] Keep the specialization only if it saves at least 2,048 uglified bytes
      **and** 512 gzip bytes with no timing or safety regression.
- [x] If either threshold fails, revert every production move/refactor and
      record a clean rejection; retained characterization tests may remain.
- [x] Do not rescue a failed result with a new registry, adapter, compatibility
      facade, or add-on API.

### Acceptance criteria

- [x] Latest Overlay receives the same data at the same lifecycle points.
- [x] Early-load performance and duplicate-request avoidance are preserved.
- [x] All interception and memory safety boundaries remain present and owned.
- [x] Generic multi-consumer machinery and public Fast Capture contracts are
      absent.
- [x] Add-on API and trusted add-on behavior are unchanged.
- [x] The package passes both shipped-size thresholds or is cleanly rejected.

### Explicit future boundary

Do not expose response interception to add-ons from this package. A future
add-on capture API would require a separate threat model and plan covering URL
authorization, authenticated-response privacy, per-add-on payload and memory
quotas, lifecycle cancellation, trust gating, diagnostics redaction, and abuse
containment. No such API should be created without at least two concrete,
approved consumers.

---

## CORE-SIZE-STORAGE-COMPAT-AUDIT-01 — Decide whether historical storage recovery can retire

**Priority:** Medium  
**Risk:** None for audit; retirement risk is high  
**Production changes:** None

### Required work

- [x] Re-read the release evidence and removal boundary in
      `docs/config/storage-migration-recovery.md`.
- [x] Identify the last released builds that could leave users on surface-level
      storage without a canonical envelope or migration marker.
- [x] Record whether such installations can still reasonably upgrade directly
      to the current release.
- [x] Measure the exact release bytes owned by migration transforms, marker/lock
      orchestration, legacy reads, cleanup, and fixtures separately.
- [x] Separate normal canonical-envelope recovery and backup validation, which
      must remain, from historical surface-key recovery.
- [x] Decide one of: retain compatibility, announce a future cutoff, or approve
      a compatibility-breaking retirement.
- [x] Record the decision and rationale before any production deletion.

### Acceptance criteria

- [x] No compatibility code is removed by this package.
- [x] Potential savings are measured rather than inferred from the whole
      settings service.
- [x] A retirement package remains blocked unless the decision explicitly
      accepts loss of direct upgrades from legacy surface storage.

---

## CORE-SIZE-STORAGE-COMPAT-RETIRE-01 — Remove surface-key migration after an approved cutoff

**Priority:** Decision-dependent  
**Risk:** High; persisted user settings can otherwise be lost  
**Depends on:** approved `CORE-SIZE-STORAGE-COMPAT-AUDIT-01`

Do not execute this package from the TODO alone. Obtain explicit user approval
after presenting the audit's compatibility impact and measured savings.

### Required work

- [ ] Confirm the approved cutoff/compatibility-breaking decision in the task.
- [ ] Preserve canonical version-1 envelope validation, tolerant sanitization,
      last-known-good recovery, cache ownership, revisions, and cross-tab sync.
- [ ] Remove only historical surface-key reads and transforms.
- [ ] Remove migration marker/lock orchestration only where no current path
      requires it.
- [ ] Remove bounded cleanup keys and legacy migration fixtures together with
      their now-dead code.
- [ ] Update storage-migration documentation with the cutoff and recovery advice
      for users upgrading from unsupported builds.
- [ ] Do not change schema version merely to remove the historical migration.
- [ ] Measure gross and net savings independently from config transfer.

### Required tests

- [ ] Fresh install loads defaults and writes only the current canonical format.
- [ ] Current canonical envelope loads without writes.
- [ ] Invalid current data still sanitizes safely.
- [ ] Backup recovery and cache validation still work.
- [ ] Failed persistence never updates live config.
- [ ] Cross-tab and effect behavior remain unchanged.
- [ ] A legacy surface-only fixture now fails in the explicitly documented way;
      this behavior must not be accidental or silent in tests.

### Acceptance criteria

- [ ] Only the explicitly retired compatibility surface is lost.
- [ ] Current-user persistence and recovery behavior remain intact.
- [ ] Release notes and migration documentation state the breaking boundary.
- [ ] Uglified and gzip outputs decrease by the audited amount.

---

## CORE-SIZE-TRANSFER-COMPAT-RETIRE-01 — Retire legacy import documents separately

**Priority:** Decision-dependent  
**Risk:** High; old exported backups may stop importing  
**Production changes:** Explicit approval required

This is not part of storage migration retirement. A user with current storage
may still possess an old export file.

### Required work

- [ ] Identify the exact supported legacy transfer shape and the releases that
      produced it.
- [ ] Measure only legacy-normalization bytes, not the whole Config Transfer
      subsystem.
- [ ] Decide whether old backup documents remain a supported recovery contract.
- [ ] Obtain explicit approval before removing normalization.
- [ ] Preserve current export format, strict preview validation, transactional
      commit, warnings, reload metadata, file UI, and error dialogs.
- [ ] Update config-transfer documentation and unsupported-format errors.

### Required tests

- [ ] Current export/import round trip remains lossless.
- [ ] Preview remains read-only.
- [ ] Failed import leaves storage and live config unchanged.
- [ ] The retired legacy fixture receives the documented unsupported-format
      result.

### Acceptance criteria

- [ ] Storage migration code is untouched.
- [ ] Current backup safety is preserved.
- [ ] The compatibility break and net savings are recorded independently.

---

## CORE-SIZE-OPTIONAL-FEATURES-01 — Decide whether convenience features leave core

**Priority:** Low  
**Risk:** Very high product risk  
**Production changes:** Explicit approval required per feature

Current measured uglified contributions:

| Feature | Approximate contribution |
| --- | ---: |
| Wide Latest | 3,475 bytes |
| Dismiss Notification | 3,566 bytes |
| Signature Collapse | 2,711 bytes |
| Latest Controls Sync | 1,502 bytes |
| Wide Forum | 1,349 bytes |
| **Combined upper bound** | **12,603 bytes** |

These are working features, not dead code. The combined value is an upper bound;
shared factory/schema/settings code will remain.

### Required work

- [ ] Review usage and product value one feature at a time.
- [ ] For each candidate, choose retain, remove, or migrate to a separately
      installable add-on.
- [ ] Obtain explicit approval naming the exact feature before changing it.
- [ ] Measure feature JS, CSS, metadata, defaults, schema, manifest entry, and
      shared-code effects independently.
- [ ] If migrating to an add-on, write a separate add-on plan; do not implement
      the migration inside this core package.
- [ ] Preserve or deliberately migrate user configuration according to the
      approved decision.
- [ ] Never remove all five merely to reach the combined upper bound.

### Acceptance criteria

- [ ] Each feature has an independent decision and measured net saving.
- [ ] No feature disappears as an incidental cleanup.
- [ ] Add-on extraction, if selected, follows the canonical add-on lifecycle and
      is executed under its own TODO.

---

## Candidates retained by default

The following are deliberately not execution packages in this plan:

### Tag pointer drag/reorder

The drag module contributes 6,254 uglified bytes, but it owns pointer/touch
behavior, ghost positioning, cross-list moves, drop targeting, and cleanup.
Replacing it with arrows or native desktop drag is a visible UX reduction. Keep
it unless the user explicitly chooses that tradeoff, then create a dedicated
interaction plan with touch testing.

### Fast Capture safety and timing

The generic multi-consumer architecture is now covered by
`CORE-SIZE-LATEST-CAPTURE-01`, but early capture itself remains retained by
default. Do not obtain savings by removing interception timing, recovery,
route invalidation, bounds, teardown, or duplicate-request avoidance. If the
specialization fails its gain gate, retain the current service.

### Config Transfer

The subsystem contributes 9,100 uglified bytes but owns backups, strict preview,
transactional import, and recovery. Removing it is disproportionate to its data-
safety value. Only its separately identified legacy-normalization branch is a
possible compatibility decision.

### Latest Overlay scoring and rendering

Latest Overlay contributes 31,769 uglified bytes because it is a primary product
feature. Formula or behavior simplification requires a feature-design plan, not
a size cleanup. Only the metadata boilerplate probe is allowed here.

### Core safety and lifecycle utilities

Do not weaken task queues, observer ownership, teardown, resource tracking,
schema validation, health event redaction, or persistence recovery because their
individual files look large. Their failure cost exceeds likely gzip savings.

---

## CORE-SIZE-VERIFY-01 — Verify integrated reductions and freeze the new baseline

**Priority:** Critical  
**Depends on:** every accepted production package

### Required work

- [ ] Generate one final current report against the immutable reduction baseline.
- [ ] Record per-package and cumulative authored-byte deltas.
- [ ] Record per-package and cumulative regular core contribution deltas.
- [ ] Record per-package and cumulative uglified core contribution deltas.
- [ ] Record whole regular, whole uglified, and gzip deltas.
- [ ] Distinguish accepted reductions, rejected prototypes, retained candidates,
      and explicitly deferred compatibility/product decisions.
- [ ] Confirm no add-on-owned source or API changed.
- [ ] Confirm no persisted format or compatibility contract changed except an
      explicitly approved retirement package.
- [ ] Update the normal core size baseline only after all final checks pass and
      include the required rationale.

### Required validation

- [ ] `npm run lint`
- [ ] targeted lint for changed build/audit/test scripts
- [ ] focused tests for every accepted package
- [ ] `npm test`
- [ ] `npm run audit:css`
- [ ] `npm run check:css`
- [ ] `npm run audit:core`
- [ ] `npm run check:core`
- [ ] `npm run check:core:size`
- [ ] `npm run build:core:smoke`
- [ ] `git diff --check`
- [ ] no version bump, release metadata change, generated-manifest drift,
      build-cache leak, or tracked `dist/` change

### Acceptance criteria

- [ ] Every retained production change has a positive measured net reduction.
- [ ] The first safe waves do not alter persistence, add-on contracts, or core
      feature behavior beyond the accepted native color-picker simplification.
- [ ] Rejected prototypes leave no production residue.
- [ ] The final evidence is deterministic and machine-neutral.
- [ ] The new baseline includes a rationale tied to this TODO.

---

## Final execution checklist

- [x] `CORE-SIZE-REDUCTION-BASELINE-01`
- [x] `CORE-SIZE-NATIVE-COLOR-01`
- [x] `CORE-SIZE-HTML-COMPACT-01`
- [x] `CORE-SIZE-HEALTH-UI-01`
- [x] `CORE-SIZE-DIALOG-SHELL-01` rejected by evidence
- [x] `CORE-SIZE-LATEST-CAPTURE-01` accepted by evidence
- [ ] `CORE-SIZE-DEABSTRACTION-PROBE-01` accepted, rejected, or explicitly skipped
- [x] `CORE-SIZE-OVERLAY-METADATA-PROBE-01` accepted by explicit user exception
- [x] `CORE-SIZE-STORAGE-COMPAT-AUDIT-01` retained compatibility
- [x] storage compatibility retirement retained and blocked
- [ ] transfer compatibility retirement explicitly approved or retained
- [ ] optional features individually approved or retained
- [ ] `CORE-SIZE-VERIFY-01`
- [ ] cumulative regular, uglified, and gzip savings recorded
- [ ] all required validation passes
- [ ] no unauthorized product, compatibility, add-on, or release mutation
