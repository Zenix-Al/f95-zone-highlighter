# Core Size Reduction Completed Checkpoint

Checkpoint created **2026-08-01** from
`TODO_CORE_SIZE_REDUCTION_DETAILED.md`. This file records completed packages,
measured rejections, and decisions that intentionally retain compatibility. It
is not an execution queue.

## Completed waves

### Wave 0 — Comparable evidence

- [x] `CORE-SIZE-REDUCTION-BASELINE-01`
  - Immutable baseline retained in
    `docs/architecture/core-size-reduction-baseline.json`.
  - Starting release bundle: 325,815 bytes / 96,838 gzip.
  - Starting regular bundle: 644,346 bytes.

### Wave 1 — Low-risk reductions

- [x] `CORE-SIZE-NATIVE-COLOR-01`
  - Replaced the custom color picker with the browser-native color input.
  - Removed picker-only JS/CSS and retained persistence, validation, reset, and
    effects behavior.
- [x] `CORE-SIZE-HTML-COMPACT-01`
  - Added a build-only transform for the static core modal HTML.
  - Authored HTML remains readable; regular and release builds use the same
    deterministic transform.

### Wave 2 — Support UI

- [x] `CORE-SIZE-HEALTH-UI-01`
  - Replaced rich diagnostic rendering with one bounded plain-text report while
    retaining Copy and Close behavior.
- [x] `CORE-SIZE-DIALOG-SHELL-01` — **rejected and reverted**
  - Prototype removed 2,555 authored bytes but saved only 641 uglified and 45
    gzip bytes.
  - The current local dialog implementations remain because the abstraction
    missed the 1,024 uglified / 512 gzip gate.

### Wave 3 — Latest capture specialization

- [x] `CORE-SIZE-LATEST-CAPTURE-01`
  - Moved capture ownership under Latest Overlay and removed generic feature
    metadata, keyed storage, subscriber sets, modes, and public facade.
  - Immediate package delta: −10,742 authored, −10,137 regular, −2,097 regular
    gzip, −3,893 release, and −1,197 release gzip bytes.
  - Early XHR/fetch capture, fallback transport, performance recovery, route
    invalidation, bounds, and redacted diagnostics remain.

### Wave 4 — Structural probes already decided

- [x] `CORE-SIZE-DEABSTRACTION-PROBE-01` — **completed with zero candidates**
  - Release attribution and exact references found no low-consumer helper with
    enough removable generic machinery to plausibly pass the gain gate.
  - Tag drag, Latest scoring, and feature-health presentation remain separated
    domain modules; no production code or artifact size changed.
- [x] `CORE-SIZE-OVERLAY-METADATA-PROBE-01` — **accepted by explicit exception**
  - The original prototype was reverted because it missed the package's gzip
    gate. The user later approved its roughly 1.4 KB release reduction despite
    the small gzip result, so the file-local metadata tables were restored with
    focused contract coverage.
  - Final delta: −2,609 authored, −2,744 regular, −70 regular gzip, −1,408
    release, and −62 release gzip bytes.
- [x] `CORE-SIZE-LATEST-CATALOG-BRIDGE-PROBE-01`
  - Replaced duplicate Tags/Prefixes page-world listeners, markers, event pairs,
    and timeouts with one private Latest-catalog request.
  - Tags and prefixes still normalize and persist independently, including
    partial success and timeout preservation.
  - Net delta: −2,328 authored, −2,183 regular, −156 regular gzip, −1,368
    release, and −158 release gzip bytes.

## Wave 5 compatibility record

- [x] `CORE-SIZE-STORAGE-COMPAT-AUDIT-01`
  - Historical surface-key migration was measured separately from current
    envelope validation and backup recovery.
  - Decision: retain compatibility because old installations can still upgrade
    directly to the current release.
- [x] `CORE-SIZE-STORAGE-COMPAT-RETIRE-01` — **blocked/retained**
  - No compatibility code was removed.
  - It may be reconsidered only after an explicit supported-version cutoff and
    compatibility-breaking approval.

The unexecuted transfer-format decision remains in the active plan because it
is independent from storage migration.

## Checkpoint measurements

The current reduction audit after the completed production packages records:

| Measurement | Baseline | Checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Authored non-add-on core | 476,860 | 450,851 | −26,009 |
| Regular bundle | 644,346 | 618,399 | −25,947 |
| Regular core contribution | 415,202 | 389,163 | −26,039 |
| Regular gzip | 137,635 | 132,325 | −5,310 |
| Release bundle | 325,815 | 312,483 | −13,332 |
| Release core contribution | 217,419 | 204,041 | −13,378 |
| Release gzip | 96,838 | 93,056 | −3,782 |

These are cumulative checkpoint measurements, not a replacement for the final
accepted baseline. `CORE-SIZE-VERIFY-01` remains unexecuted.

## Validation already completed

- [x] Core/add-on lint for the changed packages
- [x] Focused package tests
- [x] Full test suite after Latest Capture: 478 passed, 0 failed
- [x] Deterministic core reduction audit/check
- [x] Core smoke build
- [x] `git diff --check`
- [x] No release build or version bump

Later unrelated add-on UI fixes are outside this core checkpoint.
