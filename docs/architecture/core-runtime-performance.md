# Core runtime performance current evidence

This deterministic report characterizes the current branch for
`MODAL-CSS-VERIFY-01`.

## CSS lifecycle

| Phase | Shadow styles | New CSS bytes |
| --- | ---: | ---: |
| Before first interaction | 1 | 3483 |
| First `openModal()` | 1 new | 27840 |
| Repeated `openModal()` | 0 new | 0 |

The complete Shadow stylesheet contains 31324 bytes,
218 style rules, and 238
selectors. Characterization marks
24 rules / 3379
rule bytes as startup-required (universal, toast, and page-dock rules); the
remaining 194 rules
are modal-layer candidates pending focused split tests.

## Integrated before/after verification

| Measurement | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Startup CSS bytes | 31122 | 3483 | -27639 |
| Startup CSS rules | 215 | 24 | -191 |
| Startup Shadow styles | 1 | 1 | 0 |
| First-open new Shadow styles | 0 | 1 | 1 |
| Repeated-open new Shadow styles | 0 | 0 | 0 |

Critical startup selectors remain in the startup asset. Modal-only selectors are
absent before first open and acquired synchronously before modal construction.


## Unrelated config update

An unrelated scalar `updateConfig` performs 0
explicit full-config JSON clone passes. With the deterministic 400-tag / 40-prefix
fixture, that copies at least 0 catalog items;
strict schema reconstruction is additional work.

## Tag search

Empty focus against 400 tags with nine already selected creates
60 result rows, 180 action buttons, and
0 result-action listeners synchronously. The
other deterministic query counts are stored in the JSON report.

## Ownership

- Startup CSS is acquired by `src/ui/helpers/cssInjector.js` from
  `src/ui/index.js` before the page dock is injected.
- Core modal demand begins at `src/ui/components/modal.js#openModal` and
  synchronously acquires the modal stylesheet before constructing or exposing
  modal content; repeated opens reuse the registered style.
- Config cloning is owned by `settingsService`,
  `configChangeApplication`, and canonical projection in
  `configMigrationService`.
- Tag filtering and full-catalog focus are owned by `tagsService`; result DOM
  and per-button listeners are owned by `ui/components/tag-search/index.js`.
