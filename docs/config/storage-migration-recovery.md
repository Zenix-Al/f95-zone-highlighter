# Configuration Storage Migration and Recovery

This document records the release-blocking recovery work for the transition from surface-level configuration keys to the canonical envelope. The migration is evidence-backed, one-time, and marker-gated. It is not a general future migration framework.

## Root cause

Before `e51cf89`, released code wrote configuration sections directly under their section names (`color`, `globalSettings`, `latestSettings`, `tags`, and so on). `e51cf89` introduced `f95ue:config` and `f95ue:config:last-known-good` plus a surface-key migration. `b1f737f` removed that migration while leaving users with the earlier layout. On a user with no canonical key, `loadConfig()` therefore returned defaults; a later `saveConfigKeys()` persisted those defaults as the new canonical state. The supplied `config-ref.json` reproduces this: explicit surface preferences coexist with a default-heavy canonical envelope whose preference arrays are empty and whose catalogs are embedded.

The second source of bloat was that tags and prefixes were reference catalogs refreshed from F95Zone, but the complete runtime configuration candidate was written into both the current and backup envelopes on every refresh.

## Historical key lineage

| Generation | Key or layout | First known use | Last known use | Reader | Writer | Shape | Disposition | Migration source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Surface v0 | `color`, `overlaySettings`, `threadSettings`, `globalSettings`, `latestSettings` | Initial storage implementation through `e51cf89` | Legacy compatibility only | Historical `GM.getValues` load | Settings renderers and `saveConfigKeys` | Per-section objects | Migrate validated settings | Yes |
| Surface v0 | `preferredTags`, `excludedTags`, `markedTags`, `savedNotifID` | Initial storage implementation | Legacy compatibility only | Historical `GM.getValues` load | Tag UI and notification feature | Arrays/nullable number | Migrate preferences | Yes |
| Surface v0 | `tags`, `prefixes` | Initial storage; refreshed by tag/prefix services | Legacy compatibility only | Historical config load and overlay/tag UI | `tagsService`, `prefixService` | Large reference catalogs | Migrate to cache keys | Yes |
| Surface v0 | `addons` | Add-on integration before canonical persistence | Legacy compatibility only | Add-on state service | Add-on state/registration paths | `byAddon`, `installedMeta`, optional trust/service data | Migrate through add-on schema | Yes |
| Surface v0 | `minVersion` | Earliest latest-overlay settings | Legacy compatibility only | Historical migration | Historical settings UI | Number | Map to `latestSettings.minVersion` | Yes |
| Runtime/duplicate | `configVisibility` | Early settings UI | No current writer | Historical UI only | Historical settings UI | Boolean | Use only when nested value is absent | Bounded alias |
| Runtime/diagnostic | `directDownloadAttentionEvent` | Direct-download add-on/runtime | No current core reader | None in current core | Historical runtime path | Event object | Ignore; retain unknown source until cleanup | No |
| Runtime marker | `isImgRetryInjected` | Image repair runtime | No current core reader | None in current core | Historical injection path | Boolean | Ignore | No |
| Experimental | `metrics` | Experimental metrics service | Removed by `CORE-METRICS-REMOVE-01` | No current reader | Removed metrics service | Counter object | Drop; never reject siblings | No |
| UI preference | `settingsUiActivePanel` | Settings UI persistence | Current UI prefs service | Settings UI | `settingsRuntime/prefs.js` | String | Remains outside config migration | No |
| UI preference | `settingsUiPinnedAddonIds` | Settings UI persistence | Current UI prefs service | Settings UI | `settingsRuntime/prefs.js` | Array | Remains outside config migration | No |
| Canonical v1 | `f95ue:config` | `e51cf89` | Current | `settingsService`, sync | `settingsService.commitConfig` | Versioned envelope | Core preferences; empty catalog placeholders only | Current |
| Canonical backup v1 | `f95ue:config:last-known-good` | `e51cf89` | Current | Recovery in `settingsService` | `settingsService` commits | Previous verified core envelope | Core preferences only | Current |
| Cache v1 | `f95ue:cache:tags` | This recovery package | Current | `settingsService`, runtime config | `tagsService` through cache-aware save | Tag catalog | Regenerable cache | Historical tags |
| Cache v1 | `f95ue:cache:prefixes` | This recovery package | Current | `settingsService`, runtime config | `prefixService` through cache-aware save | Prefix catalog | Regenerable cache | Historical prefixes |
| Marker v1 | `f95ue:config:migration-version` | This recovery package | Current | `settingsService` | Verified migration/fresh install | Small integer | Migration complete at generation 1 | N/A |
| Temporary lock | `f95ue:config:migration-lock` | This recovery package | Temporary | Migration only | Migration lock owner | Owner/expiry object | Stale bounded lock; never user data | N/A |

The repository history was checked at `10a0e54`, `e51cf89`, and `b1f737f`, as well as earlier surface-storage commits. The current source tree retains the bounded migration service because released installations can still require this recovery path.

## Ownership and disposition

| Field/key | Current writer | Current reader | User-authored | Regenerable | Canonical config | Migration action | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core preference sections | Settings UI/features | Runtime/settings/sync | Yes | No | Yes | Validate and overlay historical value | Delete old surface key after verification |
| `preferredTags`, `excludedTags`, `markedTags` | Tag UI | Tag UI/overlay | Yes | No | Yes | Validate arrays | Delete old surface key after verification |
| `tags` | `tagsService` | Tag UI/overlay | No | Yes | No; cache only | Validate into tag cache | Delete old surface key after verification |
| `prefixes` | `prefixService` | Overlay/tag UI | No | Yes | No; cache only | Validate into prefix cache | Delete old surface key after verification |
| `addons.byAddon` | Add-on state repository | Add-on service/UI | Partly | Partly | Yes | Add-on-owned merge/normalization | Delete old root only after verified migration |
| `addons.installedMeta` | Add-on registry | Add-on service/UI | No | Yes | Yes | Preserve earliest install/latest seen metadata | Same bounded cleanup |
| `addons.trustedIds` / `addons.service` | Add-on repository/settings | Add-on service | Partly | No | Yes | Preserve explicit historical/current value | Same bounded cleanup |
| `metrics` | None; removed | None | No | No | No | Drop | Never recreate |
| `directDownloadAttentionEvent` | None in current core | None in current core | No | No | No | Ignore | Unknown source retained unless separately proven obsolete |
| `isImgRetryInjected` | None in current core | None in current core | No | No | No | Ignore | Unknown source retained unless separately proven obsolete |
| Settings UI panel/pins | `settingsRuntime/prefs.js` | Settings UI | User preference | No | No | Leave outside config migration | Never delete as config keys |

## Migration rules

When the marker is current, startup reads the marker, canonical envelope, and cache keys. It does not read surface keys or run migration transforms. A healthy or sanitized fast load performs no config/cache write.

The persisted schema contract remains version `1` with zero schema migration steps in
`src/config/persistence.js`. The marker-gated service described here is historical storage-layout
recovery, not a replacement migration framework.

When the marker is absent or old, the repository reads only the explicit bounded list in `configMigrationService.js`, plus canonical, backup, and the two cache keys. Historical surface sections take precedence for fields they explicitly contain. A valid canonical or backup source fills fields absent from the historical layout; defaults fill the remainder. Revisions are not compared across generations.

Core candidates are built from detached defaults and validated tolerantly, then strictly validated before commit. Invalid leaves fall back independently while valid siblings survive. Add-on state is merged by add-on and timestamps use earliest meaningful installation time and latest meaningful last-seen time. Metrics, runtime events, UI preferences, and unknown keys do not enter canonical config.

Tags and prefixes are validated separately and written to their cache keys. The canonical envelope and backup contain empty catalog placeholders, so their serialized size does not scale with catalog size.

## Marker and transaction semantics

`f95ue:config:migration-version = 1` is written only after cache writes, canonical write, canonical read-back verification, cache verification, and backup verification succeed. Fresh installations follow the same verified path with detached defaults. A marker-write or cleanup failure cannot turn an unverified result into a completed migration; cleanup is bounded and post-commit.

The temporary lock has an expiry. A second tab that loses ownership reloads the marker and committed canonical result; stale ownership can be recovered after the bounded TTL. Historical sources are not deleted before the verified canonical write.

All complete configuration writes remain in `settingsService`. `saveConfigKeys()` waits for config readiness, writes tag/prefix-only updates only to cache keys, and uses the canonical commit path for core or add-on changes. No current writer recreates the obsolete surface keys.

## Recovery procedure

For an affected installation, leave the old surface keys in place, update to a build containing this migration, and restart once. If migration fails, the marker remains absent and the source keys remain available for another attempt. If the canonical result is later corrupt, the verified backup is used. If both canonical and backup are unavailable, do not guess from unrelated keys; preserve the recovery marker and use the exported configuration or the still-retained historical keys for manual recovery.

## Removal boundary

The migration service and bounded key list may be removed only after released installations can no longer exist in the surface-key layout, or after an explicit compatibility-breaking release decision. Removal must include the marker check, cleanup list, migration fixtures, and this document’s historical compatibility section together. The normal post-migration startup path is intentionally kept independent of the migration transform.

## Measurements

The test harness records exact storage reads, writes, and deletes. Current expected behavior is:

- fast startup: marker, canonical, tag cache, prefix cache reads; zero migration/config/cache writes;
- migration: bounded marker/canonical/backup/surface/cache reads; cache writes, canonical/backup writes, verification reads, one marker write, and bounded cleanup deletes;
- tag refresh: one tag-cache write and no canonical/backup/marker write;
- prefix refresh: one prefix-cache write and no canonical/backup/marker write;
- core/add-on setting update: canonical/backup writes only, with cache keys untouched.

Serialized byte comparisons and migration bundle bytes are recorded with the core audit after implementation.
