# Core source and bundle baseline

This baseline is produced by `npm run audit:core` using `scripts/core-source-audit.cjs`. The report is deterministic for unchanged source and keeps machine paths, timestamps, and temporary output paths out of the JSON.

The earlier **480 KB** observation is retained as a user-reported approximation only. It is not treated as a measured baseline.

## Measured baseline

| Measure | Result |
| --- | ---: |
| Audited authored source | 483,351 bytes |
| Audited files | 114 |
| Physical lines | 14,951 |
| Nonblank/noncomment lines | 12,904 |
| Readable regular bundle | 607,726 bytes |
| Readable regular bundle gzip | 128,694 bytes |
| Release uglified bundle | 311,272 bytes |
| Release uglified bundle gzip | 91,301 bytes |

Authored bytes by area: `config` 31,294; `core` 88,154; `services` 105,986; `features` 104,242; `ui` 153,675. Test fixtures under `src/**/test/**` are excluded from authored totals.

The readable and uglified bundle reports include the full application entrypoint so that the result reflects the shipped userscript. Add-on-owned inputs and Latest Ajax Error Recovery are listed separately as excluded contributors; they are not part of the authored core totals and remain outside this package.

## Largest core bundled contributors

The largest readable contributors are `src/ui/assets/css.css` (26,401 bytes), `src/services/settingsService.js` (22,238), `src/config/schema.js` (18,867), `src/services/fastCapture/fastCaptureService.js` (16,792), and `src/features/latest-overlay/index.js` (16,307). The transfer domain is `src/services/configTransfer/index.js` (12,581 bytes); the migration service contributes 7,247 authored/readable bytes.

The largest release-uglified contributors are `src/ui/assets/css.css` (26,387 bytes), `src/services/settingsService.js` (9,991), `src/config/schema.js` (9,893), `src/features/latest-overlay/index.js` (9,621), and `src/ui/assets/ui.html` (6,690). The transfer domain contributes 6,149 uglified bytes; the migration service contributes 3,131 uglified bytes.

## CORE-CONFIG-STORAGE-01 delta

Compared with the CORE-LEAN-BASE-01 measured baseline, authored source decreased by 5,673 bytes, readable bundle by 5,017 bytes, readable gzip by 871 bytes, release uglified bundle by 2,867 bytes, and release uglified gzip by 644 bytes. The settings service is now 11,070 authored bytes (down from 13,381) and 5,349 release-uglified bytes (down from 6,450).

## CORE-UI-ASSET-01 delta

The CSS audit measured `src/ui/assets/css.css` at 33,564 → 32,106 authored bytes (−1,458), with selector count 252 → 241 (−11), declaration count 952 → 914 (−38), and duplicate selector blocks 3 → 0. Its readable bundle contribution decreased 27,394 → 26,401 bytes (−993), while the full readable bundle gzip decreased 124,202 → 124,122 bytes (−80). Its release-uglified contribution decreased 27,380 → 26,387 bytes (−993), while the full release bundle gzip decreased 88,402 → 88,305 bytes (−97).

Use `node scripts/core-source-audit.cjs --compare docs/architecture/core-size-baseline.json` to attach deterministic before/after deltas to a later audit. `npm run build:core:smoke` performs both temporary-output smoke builds without changing `version.json`, tracked `dist/`, generated manifests, or other working-tree files.

## CORE-METRICS-REMOVE-01 delta

Compared with the accepted post-CSS baseline, removing the persisted metrics stack decreased authored source by 1,281 bytes (484,724 to 483,443), readable bundle bytes by 452 (585,587 to 585,135), readable gzip by 95 (124,122 to 124,027), release uglified bytes by 236 (301,512 to 301,276), and release uglified gzip by 86 (88,305 to 88,219). The audited source file count decreased from 120 to 119; the removed service was 791 authored bytes and the remaining reduction came from defaults, runtime state, and schema removal. No metric service was bundled before removal because it had no live caller.

The retained largest core contributors are CSS (26,401 readable / 26,387 uglified), schema (18,944 / 9,914), fast capture (16,792 / 5,680), latest overlay (15,531 / 9,145), and tag drag (13,150 / 6,254). Bounded `featureHealth` diagnostics remain bundled (11,483 readable / 5,944 uglified for its UI, plus 7,466 / 3,616 for the core health module).

## CORE-TRANSFER-LEAN-01 delta

Compared with the accepted post-metrics baseline, authored source changed by +38 bytes (483,443 to 483,481), readable bundle bytes by +796 (585,135 to 585,931), readable gzip by +233 (124,027 to 124,260), release uglified bytes by +369 (301,276 to 301,645), and release uglified gzip by +152 (88,219 to 88,371). This is an ownership refactor with explicit picker/dialog cleanup; it is not claimed as a size reduction. The generated manifest remains unchanged because Config Transfer was already an action-only settings entry rather than a discovered `*Feature` export.

The retained compatibility path is the public raw format-0/schema-0 transfer normalization exercised by the legacy import test. Its explicit legacy key/normalization constants, helper, and preview branch total 1,855 authored bytes by source-slice measurement; shared tag/id normalization is used by both current and legacy documents and is not double-counted. No persisted-storage migration code was added.

## CORE-CONFIG-MIGRATION-RECOVERY-01 delta

Compared with the accepted CORE-TRANSFER-LEAN-01 measurement, the bounded recovery implementation adds 17,906 authored bytes (483,481 to 501,387), 17,828 readable bundle bytes (585,931 to 603,759), 3,500 readable gzip bytes (124,260 to 127,760), 7,628 release-uglified bytes (301,645 to 309,273), and 2,328 release-uglified gzip bytes (88,371 to 90,699). The authored file count increases from 118 to 119. The temporary `configMigrationService.js` is 7,247 audited authored/readable bytes and 3,131 release-uglified bytes; the remainder is repository/readiness, cache ownership, and verification logic in `settingsService` and related paths.

The supplied `config-ref.json` contains 26,563 bytes of compact JSON across its tracked keys: 8,878 bytes each for the current and backup envelopes, 4,987 bytes for `prefixes`, 36 bytes for `tags`, and 8,807 bytes across the other surface keys. The migrated canonical and backup envelopes contain empty catalog placeholders, so their serialized size no longer scales with catalog size; catalogs are stored separately under `f95ue:cache:tags` and `f95ue:cache:prefixes`. These values use `Buffer.byteLength(JSON.stringify(value))` and are comparative storage measurements, not bundle sizes.

## CORE-CONFIG-INTERACTION-REGRESSION-02 delta

Compared with the accepted migration-recovery measurement, the serialized interaction contract and dialog metadata add 3,714 authored bytes (501,387 to 505,101), 3,964 readable bundle bytes (603,759 to 607,723), 884 readable gzip bytes (127,760 to 128,644), 1,944 release-uglified bytes (309,273 to 311,217), and 554 release-uglified gzip bytes (90,699 to 91,253). The audited source file count decreases from 119 to 118 because the duplicate component-local tag-effects helper was removed. The increase is concentrated in the serialized settings repository, dialog metadata registration, and lifecycle/effect ownership corrections; it is not a claimed bundle-size reduction.

## CORE-DEAD-CODE-01 delta

Compared with the pre-deletion audit produced immediately before this package, the four proven-unreachable audio/sound modules remove 21,778 authored bytes, 657 physical lines, 511 meaningful lines, and four audited files (505,308 to 483,530 bytes; 15,618 to 14,961 physical lines; 13,424 to 12,913 meaningful lines; 118 to 114 files). The reduction is 19,076 bytes in `core` and 2,702 bytes in `features`.

The readable regular bundle remains 607,944 bytes / 128,700 gzip bytes, and the release uglified bundle remains 311,352 bytes / 91,315 gzip bytes: none of the deleted modules was a shipped bundle contributor. The largest current core contributors remain CSS (26,401 readable / 26,387 uglified), `settingsService.js` (22,238 / 9,991), `schema.js` (19,085 / 9,973), `fastCaptureService.js` (16,792 / 5,680), and `latest-overlay/index.js` (16,307 / 9,621). The unchanged bundle result is intentional evidence that this deletion removes authored dead code excluded from the userscript entry graph.

## CORE-CONFIG-RUNTIME-LEAN-01 delta

The config/schema contributor was meaningful before editing: `src/config/schema.js` contributed 19,085 readable bytes and 9,973 release-uglified bytes, while the audited config area totaled 31,473 authored bytes. The package removed the unused `PATH_INDEX`, replaced the duplicated root `DEFAULTS` literal with a schema-derived immutable default template, and kept the required migration service and version-1 persistence contract because they still have active callers.

Compared with the pre-package audit, authored core source decreased by 179 bytes (483,530 to 483,351), readable bundle bytes by 218 (607,944 to 607,726), readable gzip by 6 (128,700 to 128,694), release uglified bytes by 80 (311,352 to 311,272), and release uglified gzip by 14 (91,315 to 91,301). The schema contributor decreased to 18,867 readable / 9,893 uglified bytes. The largest contributors remain CSS (26,401 / 26,387), `settingsService.js` (22,238 / 9,991), `schema.js` (18,867 / 9,893), `fastCaptureService.js` (16,792 / 5,680), and `latest-overlay/index.js` (16,307 / 9,621).

The fixed benchmark bundles 1,000 iterations of default cloning, four exact/wildcard/array metadata lookups, exportable/persisted path reads, and schema-index reads. Median time improved from 158.5544 ms before the change to 153.3819 ms after the change, with the same Node/esbuild command and warm-up policy. Metadata lookup now covers array indices and wildcard object keys combined in a single path without changing exact issue paths or strict/tolerant validation.

## CORE-CONFIG-SYNC-REMOVE-01 delta

Compared with the accepted CORE-SIZE-GATE-01 audit, removing the unreleased core configuration
synchronization path decreased audited authored source by 6,023 bytes (483,351 to 477,328),
readable bundle bytes by 5,137 (607,726 to 602,589), readable gzip by 1,417 bytes (128,694 to
127,277), release uglified bytes by 2,652 (311,272 to 308,620), and release uglified gzip by
943 bytes (91,301 to 90,358). The audited file count decreased from 114 to 113. The removed
`src/services/syncService.js` was 3,977 authored bytes in the prior audit; the remaining reduction
comes from removing its storage-adapter listener wrappers, schema synchronization metadata,
default/state/UI surfaces, and the shared application pipeline's sync-only branch.

The two core listener grant lines were also removed from `header.txt` (91 metadata bytes). The
masked-direct add-on's listener grants, direct listener calls, callbacks, and cleanup remain in its
own manifest and source. Revision/writer metadata remains in persistence for commits and recovery;
it is no longer used to synchronize core configuration across tabs.

## CORE-SIZE-GATE-01 accepted baseline

The accepted trend baseline is stored in `docs/architecture/core-size-gate-baseline.json` and
references this audit report by SHA-256. Its core-only bundle inputs are 420,227 readable bytes
and 221,193 release-uglified bytes. The full userscript measurements remain 607,726 readable /
128,694 gzip and 311,272 uglified / 91,301 gzip; gzip is informational because compressed output
cannot be attributed precisely by source area. Add-on source, add-on services, and add-on builds
are excluded from authored-area and core-input growth calculations.

The gate fails a positive authored-area delta only when both thresholds are exceeded: more than
1,024 bytes and more than 1%. Readable core-input growth uses 2,048 bytes and 1%; uglified
core-input growth uses 1,024 bytes and 1%. Gzip uses 4,096 bytes and 2% for reporting only. This
allows small legitimate changes while requiring a deliberate baseline update for meaningful
unexplained growth. New import cycles or new cross-area import directions fail immediately;
existing accepted cycles and directions are not regressions. The report lists the largest positive
file deltas and owning paths when a size threshold fails.

Run the gate with:

```powershell
npm run check:core:size
```

To deliberately accept a reviewed baseline change, provide a non-empty rationale file (or a
commit note) to the update command:

```powershell
npm run update:core:size-baseline -- --rationale docs/architecture/core-size-baseline.md
# or
npm run update:core:size-baseline -- --commit-note "Rationale recorded in the review commit"
```

The update command regenerates the accepted audit report and gate metadata, records the rationale
path/hash, and never runs a release build, bumps `version.json`, or modifies tracked `dist/` files.
Review the generated audit and gate diff together; do not update the baseline to hide an unexplained
increase.
