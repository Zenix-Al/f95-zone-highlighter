# Core size reduction baseline

This is the immutable starting evidence for
`CORE-SIZE-REDUCTION-BASELINE-01`, recorded on 2026-07-31. The JSON baseline is
`docs/architecture/core-size-reduction-baseline.json`; later packages write
`core-size-reduction-current.json` and compare it with that original file.

No production source was changed to produce this baseline.

## Measured footprint

| Measurement | Baseline |
| --- | ---: |
| Audited non-add-on authored source | 476,860 bytes |
| Audited files | 113 |
| Regular whole bundle | 644,346 bytes |
| Regular whole bundle gzip | 137,635 bytes |
| Regular non-add-on core contribution | 415,202 bytes |
| Uglified whole bundle | 325,815 bytes |
| Uglified whole bundle gzip | 96,838 bytes |
| Uglified non-add-on core contribution | 217,419 bytes |

The reduction report retains every core contributor, including zero-byte facade
entries. Their sums equal the reported core contributions. Add-on services,
add-on management UI, generated source, tests, and tracked distributions remain
outside the authored/core contributor scope.

## Candidate evidence

Contributor values are upper bounds, not promised net savings. CSS rule bytes
are reported separately and are not added to candidate file assignments.

| Candidate | Authored | Regular contribution | Uglified contribution | Extra evidence |
| --- | ---: | ---: | ---: | --- |
| Custom color picker | 9,258 | 9,209 | 4,831 | 11 custom-only CSS rules / 1,427 bytes |
| Modal HTML | 6,070 | 6,416 | 6,242 | one-space inter-tag estimate: 5,028 bytes (−1,042) |
| Feature-health UI | 11,712 | 11,483 | 5,944 | 8 CSS rules / 940 bytes |
| Dialogs | 11,564 | 8,163 | 3,914 | 16 dialog/reorder CSS rules / 2,162 bytes |
| Latest Overlay | 77,709 | 65,032 | 31,769 | complete feature/config grouping |
| Storage migration service | 7,917 | 7,381 | 3,209 | caller branches intentionally not guessed |
| Config Transfer | 18,976 | 18,550 | 9,100 | service and core UI grouping |
| Optional convenience features | 23,423 | 19,599 | 12,603 | five independently owned features |
| Tag management | 36,317 | 35,236 | 16,671 | service, search, mutations, and drag |
| Fast Capture | 33,985 | 31,641 | 13,181 | all transport/store/queue/rule files |
| Notification service | 669 | 0 | 0 | authored-only candidate |

## Frozen behavior contracts

These contracts describe the current behavior before any reduction package.

### Color settings

- Metadata type `color` attaches the custom dark picker.
- The picker supports hexadecimal and HSL editing, Apply, Cancel, outside-click
  commit, Escape cancellation, one active instance, and a styled swatch.
- The settings renderer owns config coercion and effects after a change.
- Color reset restores defaults and reruns page effects.

Coverage is owned by the config/settings renderer tests and the CSS selector
contract in `tests/groups/core.cjs`.

### Feature-health diagnostics

- Core health collection remains bounded and redacted.
- The UI reports feature status, runtime errors, resource/queue diagnostics, and
  installed add-on health.
- The support surface shows a summary toast, renders a detailed box, copies a
  plain-text report with a fallback path, and can be closed and reopened.

Coverage is owned by core health tests, add-on health tests, and integration
tests that inspect bounded diagnostics.

### General dialogs

- Confirm resolves a boolean through buttons, keyboard, or backdrop.
- Text prompt returns a trimmed string or null and supports validation,
  multiline submission, read-only input, Escape, and focus/selection.
- Reorder returns ordered keys or null and preserves boundary controls.
- Settings dialogs render metadata, return a close controller, and invoke
  `onClose` exactly once.
- Replacing the active dialog removes the previous dialog and runs its close
  callback.

Coverage is owned by config interaction, Config Transfer, Latest Overlay, and
integration dialog tests.

### Storage migration and recovery

- Migration generation 1 recovers the released surface-key format into the
  canonical version-1 envelope.
- The current marker path does not rerun historical transforms.
- Canonical validation, tolerant sanitization, cache ownership, backup
  verification, failure recovery, and readiness ordering remain independent
  current contracts.
- Retirement remains blocked by the compatibility boundary in
  `docs/config/storage-migration-recovery.md`.

Coverage is owned by the config storage/migration fixtures and interaction
regression tests.

### Config Transfer

- Current exports carry format/schema metadata and exportable settings only.
- Preview is read-only, validates strictly, and supports the documented legacy
  transfer shape.
- Commit is transactional: persistence succeeds before live config/effects.
- Browser file and dialog behavior remains owned by `src/ui/configTransfer/`.

Coverage is owned by the config-transfer unit and integration tests.

## Determinism and commands

The report contains no timestamps, absolute paths, network results, or temporary
output paths. Both bundles are produced in temporary directories, and the audit
checks that the working tree, version, and tracked distributions remain
unchanged.

Generate the later current report:

```powershell
npm run audit:core:size-reduction
```

Verify it against the immutable baseline:

```powershell
npm run check:core:size-reduction
```

The initial current report has zero deltas for authored bytes, both whole
bundles, both core contributions, both gzip measurements, and every candidate.
