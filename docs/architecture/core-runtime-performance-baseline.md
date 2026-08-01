# Core runtime performance baseline

This deterministic baseline characterizes the current branch before production
changes in `MODAL-CSS-BASELINE-01`.

## CSS lifecycle

| Phase | Shadow styles | New CSS bytes |
| --- | ---: | ---: |
| Before first interaction | 1 | 31122 |
| First `openModal()` | 0 new | 0 |
| Repeated `openModal()` | 0 new | 0 |

The complete Shadow stylesheet contains 31122 bytes,
215 style rules, and 234
selectors. Characterization marks
24 rules / 3506
rule bytes as startup-required (universal, toast, and page-dock rules); the
remaining 191 rules
are modal-layer candidates pending focused split tests.

## Unrelated config update

An unrelated scalar `updateConfig` performs 8
explicit full-config JSON clone passes. With the deterministic 400-tag / 40-prefix
fixture, that copies at least 3520 catalog items;
strict schema reconstruction is additional work.

## Tag search

Empty focus against 400 tags with nine already selected creates
391 result rows, 1173 action buttons, and
1173 result-action listeners synchronously. The
other deterministic query counts are stored in the JSON report.

## Ownership

- Startup CSS is acquired by `src/ui/helpers/cssInjector.js` from
  `src/ui/index.js` before the page dock is injected.
- Core modal demand begins at `src/ui/components/modal.js#openModal` and
  currently performs no CSS acquisition.
- Config cloning is owned by `settingsService`,
  `configChangeApplication`, and canonical projection in
  `configMigrationService`.
- Tag filtering and full-catalog focus are owned by `tagsService`; result DOM
  and per-button listeners are owned by `ui/components/tag-search/index.js`.
