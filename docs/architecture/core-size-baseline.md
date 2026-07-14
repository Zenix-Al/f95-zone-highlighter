# Core source and bundle baseline

This baseline is produced by `npm run audit:core` using `scripts/core-source-audit.cjs`. The report is deterministic for unchanged source and keeps machine paths, timestamps, and temporary output paths out of the JSON.

The earlier **480 KB** observation is retained as a user-reported approximation only. It is not treated as a measured baseline.

## Measured baseline

| Measure | Result |
| --- | ---: |
| Audited authored source | 483,481 bytes |
| Audited files | 118 |
| Physical lines | 15,001 |
| Nonblank/noncomment lines | 12,859 |
| Readable regular bundle | 585,931 bytes |
| Readable regular bundle gzip | 124,260 bytes |
| Release uglified bundle | 301,645 bytes |
| Release uglified bundle gzip | 88,371 bytes |

Authored bytes by area: `config` 31,297; `core` 107,204; `services` 86,630; `features` 105,675; `ui` 152,675. Test fixtures under `src/**/test/**` are excluded from authored totals.

The readable and uglified bundle reports include the full application entrypoint so that the result reflects the shipped userscript. Add-on-owned inputs and Latest Ajax Error Recovery are listed separately as excluded contributors; they are not part of the authored core totals and remain outside this package.

## Largest core bundled contributors

The largest readable contributors are `src/ui/assets/css.css` (26,401 bytes), `src/config/schema.js` (18,944), `src/services/fastCapture/fastCaptureService.js` (16,792), `src/features/latest-overlay/index.js` (15,531), and `src/ui/components/tag-search/tagDrag.js` (13,150). The transfer domain is `src/services/configTransfer/index.js` (12,450 bytes).

The largest release-uglified contributors are `src/ui/assets/css.css` (26,387 bytes), `src/config/schema.js` (9,914), `src/features/latest-overlay/index.js` (9,145), `src/ui/assets/ui.html` (6,690), and `src/ui/components/tag-search/tagDrag.js` (6,254). The transfer domain contributes 6,097 uglified bytes.

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
