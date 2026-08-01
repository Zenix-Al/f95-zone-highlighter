# Core Size Reduction Remaining Work

Active execution plan checkpointed **2026-08-01**. Completed/rejected work and
the blocked storage-retirement decision are recorded in
`TODO_CORE_SIZE_REDUCTION_COMPLETED.md`. The original detailed specifications
remain in `TODO_CORE_SIZE_REDUCTION_DETAILED.md` as an archived master record.

Execute one package at a time. A probe that misses its gate must be reverted
cleanly. Do not combine compatibility or product decisions with implementation
probes.

## Current measured point

| Measurement | Current |
| --- | ---: |
| Authored non-add-on core | 445,914 bytes |
| Whole regular bundle | 613,472 bytes |
| Regular core contribution | 384,236 bytes |
| Whole regular gzip | 132,099 bytes |
| Whole release bundle | 309,707 bytes |
| Release core contribution | 201,265 bytes |
| Whole release gzip | 92,836 bytes |

The immutable comparison baseline remains
`docs/architecture/core-size-reduction-baseline.json`.

## Active execution order

### Wave 4A — Existing de-abstraction probe

1. `CORE-SIZE-DEABSTRACTION-PROBE-01`

### Wave 4B — Accepted structural probes

1. [x] `CORE-SIZE-OVERLAY-METADATA-PROBE-01` — accepted by explicit user
   exception after the original gzip gate rejection; recorded in the completed
   checkpoint
2. [x] `CORE-SIZE-LATEST-CATALOG-BRIDGE-PROBE-01` — accepted; recorded in the
   completed checkpoint

Wave 4 packages are optional and independent. A zero-candidate or rejected
result is valid.

### Wave 5 — Compatibility record and remaining decision

1. `CORE-SIZE-STORAGE-COMPAT-AUDIT-01` — completed; retain compatibility
2. `CORE-SIZE-STORAGE-COMPAT-RETIRE-01` — blocked pending an explicit cutoff
3. `CORE-SIZE-TRANSFER-COMPAT-RETIRE-01` — unexecuted; explicit approval required

The completed and blocked storage packages stay listed so the independent
transfer decision is never mistaken for authorization to remove both formats.

### Wave 6 — Optional product decision

1. `CORE-SIZE-OPTIONAL-FEATURES-01` — explicit approval required per feature

### Wave 7 — Integrated verification

1. `CORE-SIZE-VERIFY-01`

---

## CORE-SIZE-DEABSTRACTION-PROBE-01 — Measure costly low-consumer helpers

**Risk:** Medium  
**Production status:** Probe only

### Required investigation

- [ ] Start from release attribution and exact production references.
- [ ] Shortlist only private helpers with one or very few consumers and clear
      unused modes, options, callbacks, or generic result machinery.
- [ ] Exclude public APIs, add-on contracts, persistence/schema boundaries,
      lifecycle primitives, and helpers whose repetition gzip already handles.
- [ ] Record all callers and the exact behavior each caller consumes.
- [ ] A zero-candidate result is valid and should end the package.

### Prototype and gate

- [ ] Prototype one helper at a time.
- [ ] Preserve ordering, cleanup, cancellation, errors, and return values.
- [ ] Measure regular, release, and both gzip outputs immediately.
- [ ] Keep a prototype only if it saves at least 1,024 release bytes or 512
      release-gzip bytes without increasing another primary metric.
- [ ] Revert each rejected prototype before testing another candidate.
- [ ] Run focused tests, full tests for lifecycle-sensitive changes, lint, core
      audit/check, smoke build, and `git diff --check`.

---

## CORE-SIZE-LATEST-CATALOG-BRIDGE-PROBE-01 — Unify duplicate page reads

**Risk:** Medium-high; page-world boundary and configuration refresh  
**Current evidence:** The readable distribution contains 165 lines attributed
to `prefixService.js` and 225 to `tagsService.js`. Both independently install a
page bridge, define request/result/marker strings, read `window.latestUpdates`,
handle a 1,200 ms timeout, normalize a response, and are launched together by
`updateTags()`.

This package tests one private Latest catalog read returning both `tags` and
`prefixes`. It is about deleting duplicate transport/runtime machinery, not
creating a generic bridge framework.

### Preserved contract

- Direct sandbox access remains the first path when `window.latestUpdates` is
  visible.
- Page-world fallback remains bounded and same-document.
- Tags and prefixes retain independent normalization, persistence, diagnostics,
  and failure handling.
- One missing catalog must not prevent the other valid catalog from updating.
- Stored tags/prefixes remain unchanged when their incoming catalog is missing,
  empty, malformed, or times out.
- Tag pruning runs only against the accepted current tag catalog.
- No response/catalog data is exposed to add-ons.

### Required investigation

- [x] Freeze direct-read, bridge-success, partial-result, timeout, malformed,
      thrown-read, and persistence-failure behavior for both catalogs.
- [x] Confirm every production caller of `updatePrefixes()` and the tag refresh
      path.
- [x] Measure bridge-only bytes separately from tag/prefix normalization and UI.
- [x] Confirm whether both refreshes are always requested in the same lifecycle;
      retain a narrow independent entry only if a real caller needs it.

### Prototype and gate

- [x] Replace the two injected listeners and event pairs with one private
      Latest-catalog request/result pair returning `{ tags, prefixes }` plus
      per-field availability/reasons.
- [x] Normalize tags and prefixes independently after the response crosses the
      page boundary.
- [x] Keep one timeout and one installed marker.
- [x] Do not add a registry, generic key/path options, subscriber API, or add-on
      action.
- [x] Add focused partial-success and timeout tests.
- [x] Keep only if the net result saves at least 1,024 release bytes or 512
      release-gzip bytes; otherwise revert completely.
- [x] Run lint, focused/full tests, core audit/check, smoke build, CSS checks,
      and `git diff --check`.

**Accepted evidence:** `updatePrefixes()` had one production caller and both
catalog refreshes were always launched by `updateTags()`. One private bridge now
returns both raw catalogs; direct and bridged values are selected independently
before their existing normalization/persistence paths. Partial success and one
bounded timeout are covered by focused tests. Net delta: −2,328 authored,
−2,183 regular, −156 regular gzip, −1,368 release, and −158 release gzip bytes.
The release-byte gate passed; no add-on API or generic bridge layer was added.

---

## CORE-SIZE-TRANSFER-COMPAT-RETIRE-01 — Decide legacy import support

**Risk:** High data-recovery compatibility  
**Authorization:** Investigation is allowed; deletion requires explicit approval

- [ ] Identify the exact legacy transfer documents and producing releases.
- [ ] Measure only legacy normalization and fixtures, not all Config Transfer.
- [ ] Decide whether old exported backups remain supported recovery artifacts.
- [ ] Obtain explicit approval before removing any accepted format.
- [ ] Preserve current export/import, read-only preview, strict validation,
      transactional commit, and failure rollback.
- [ ] Keep this independent from storage migration retirement.
- [ ] Record the decision and net savings or retained rationale.

---

## CORE-SIZE-OPTIONAL-FEATURES-01 — Product-surface decisions

**Risk:** Critical product behavior  
**Authorization:** Explicit approval naming each feature is required

Candidates remain: Dismiss Notification, Latest controls, Signature Collapse,
Wide Latest/Dense Grid, and Wide Forum. The combined attribution is not blanket
authorization.

- [ ] Review actual value and size one feature at a time.
- [ ] Choose retain, remove, or separately plan add-on migration per feature.
- [ ] Include JS, CSS, metadata, defaults/schema, and manifest effects.
- [ ] Preserve/migrate saved configuration deliberately.
- [ ] Never remove multiple features solely to reach a combined size number.

---

## CORE-SIZE-VERIFY-01 — Final integrated verification and baseline

- [ ] Resolve or explicitly skip every active probe/decision above.
- [ ] Generate a final report against the immutable reduction baseline.
- [ ] Record per-package and cumulative authored, regular, release, and gzip
      deltas, including rejected prototypes.
- [ ] Confirm no unauthorized compatibility, add-on API, or product change.
- [ ] Run lint, focused tests, `npm test`, CSS audit/check, core audit/check,
      core size gate, smoke build, and `git diff --check`.
- [ ] Confirm no version, release metadata, generated-manifest, build-cache,
      temporary-test, or tracked `dist/` mutation.
- [ ] Update the accepted normal core baseline only with a rationale tied to
      this checkpoint and after all checks pass.

## Distribution inspection conclusion

The 619,472-byte readable distribution was inspected by its source markers.
Beyond the new Latest catalog bridge probe, its largest remaining non-add-on
sections map to deliberately retained boundaries:

- settings persistence and schema validation;
- Latest Overlay product/scoring/settings behavior;
- core observer, lifecycle, task, and teardown safety;
- Config Transfer and migration compatibility;
- tag-management UI and optional user-facing features.

No additional package was added for plain metadata repetition, source-only DRY
cleanup, Map/Set substitutions, or lazy loading because those do not presently
show credible shipped-size savings.
