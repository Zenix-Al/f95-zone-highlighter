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

Some pre-envelope builds stored the complete raw configuration object at the eventual
`f95ue:config` or backup key. The same bounded recovery path recognizes that shape as a
historical source, validates it with the shared schema, and writes a verified v1 envelope
before the add-on bridge or settings commits depend on configuration readiness. This does
not change the schema version or add a schema migration step.

Core candidates are built from detached defaults and validated tolerantly, then strictly validated before commit. Invalid leaves fall back independently while valid siblings survive. Add-on state is merged by add-on and timestamps use earliest meaningful installation time and latest meaningful last-seen time. Metrics, runtime events, UI preferences, and unknown keys do not enter canonical config.

Tags and prefixes are validated separately and written to their cache keys. The canonical envelope and backup contain empty catalog placeholders, so their serialized size does not scale with catalog size.

## Marker and transaction semantics

`f95ue:config:migration-version = 1` is written only after cache writes, canonical write, canonical read-back verification, cache verification, and backup verification succeed. Fresh installations follow the same verified path with detached defaults. A marker-write or cleanup failure cannot turn an unverified result into a completed migration; cleanup is bounded and post-commit.

The temporary lock has an expiry. A second tab that loses ownership reloads the marker and committed canonical result; stale ownership can be recovered after the bounded TTL. Historical sources are not deleted before the verified canonical write.

All complete configuration writes remain in `settingsService`. `saveConfigKeys()` waits for config readiness, writes tag/prefix-only updates only to cache keys, and uses the canonical commit path for core or add-on changes. No current writer recreates the obsolete surface keys.

## Recovery procedure

For an affected installation, leave the old surface keys or raw pre-envelope `f95ue:config`
value in place, update to a build containing this migration, and restart once. If migration
fails, the marker remains absent and the source values remain available for another attempt.
If the canonical result is later corrupt, the verified backup is used. If both canonical and
backup are unavailable, do not guess from unrelated keys; preserve the recovery marker and
use the exported configuration or the still-retained historical values for manual recovery.

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

## Compatibility audit — 2026-08-01

`CORE-SIZE-STORAGE-COMPAT-AUDIT-01` reviewed the released version lineage and
retains historical surface-key recovery.

### Released upgrade window

- v5.1.1 (`10a0e54`, 2026-07-11) is the last identified build before the
  canonical-envelope transition and can leave configuration only in surface
  keys.
- v5.1.2 (`e51cf89`, 2026-07-13) introduced the canonical envelope and the
  first recovery path.
- v5.1.3 (`b1f737f`, 2026-07-14) removed that recovery path. An installation
  crossing this build could retain historical keys while receiving a
  default-heavy canonical envelope.
- v5.1.4 (`cfe0105`, 2026-07-15) restored the bounded recovery contract; later
  releases refined it. The current audited build is v5.2.2.

The project has no release tag or runtime rule that forces an installation
through v5.1.4 before reaching a current build. Userscript managers can resume
an old disabled installation and update directly, and the project has no
telemetry proving that all v5.1.1/v5.1.3 storage has already migrated. Direct
upgrade from those layouts therefore remains reasonably possible.

### Measured ownership

The release audit attributes complete files exactly; it does not pretend that
metafile attribution can split individual functions within `settingsService.js`.
The measured boundaries are:

| Boundary | Authored bytes | Readable release bytes | Uglified release bytes | Disposition |
| --- | ---: | ---: | ---: | --- |
| Historical transforms in `configMigrationService.js` | 7,917 | 7,381 | 3,209 | Historical-only; potentially removable after a cutoff |
| Lock constants and acquire/release functions in `settingsService.js` | 1,020 | Included in the service's 23,396 | Included in the service's 10,438 | Historical orchestration |
| Legacy cleanup function | 183 | Same contributor | Same contributor | Historical-only |
| Legacy reads, plan, verification transaction, marker write, and migration result | 3,097 | Same contributor | Same contributor | Historical plus fresh-install initialization |
| Marker-gated load dispatch and failure handling | 2,436 | Same contributor | Same contributor | Mixed historical/canonical control flow |
| Canonical fast path and backup recovery | 1,853 | Same contributor | Same contributor | Retain |
| Shared cache and canonical verification helpers | 1,800 | Same contributor | Same contributor | Retain |
| Migration harness plus supplied real-world fixture | 88,843 | 0 | 0 | Test-only; remove only with an approved retirement |

The authored `settingsService.js` regions are exact non-minified source
measurements, but they are not summed as promised bundle savings: the migration
transaction also initializes fresh installations, and marker dispatch shares
the normal load function. A retirement implementation would need to retain a
small fresh-install canonical initializer and normal backup recovery. The only
exact independently removable release contributor measured today is therefore
the 3,209-byte uglified migration-transform module; additional savings require a
separate retirement prototype and must be reported net of the retained
initializer.

### Decision

Retain compatibility. The potential size reduction does not justify silently
discarding user-authored preferences from a still-reachable direct-upgrade
path. `CORE-SIZE-STORAGE-COMPAT-RETIRE-01` remains blocked. A future cutoff must
be an explicit compatibility-breaking release decision, document the affected
v5.1.1/v5.1.3 layouts and manual export/recovery path, and measure a prototype
that separates fresh-install initialization from historical migration.
