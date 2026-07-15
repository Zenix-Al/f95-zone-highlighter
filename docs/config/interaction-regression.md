# Configuration Interaction Regression Recovery

This document records `CORE-CONFIG-INTERACTION-REGRESSION-02`, which remains coordinated with the marker-gated storage migration in `storage-migration-recovery.md`. It does not introduce another persistence layer.

## Root cause

Before `e51cf89`, tag mutations changed the live arrays first. The hardening change in `tagMutations.js` correctly moved toward detached candidates, but left the surrounding sequence unchanged: start an asynchronous save, render immediately from the still-old global config, and manually trigger effects. The same unawaited complete-config save pattern allowed quick settings events to build multiple candidates from the same stale state and race their revisioned commits.

Latest Overlay dialog metadata was also not registered in the shared settings metadata registry. Its controls could persist successfully without invoking the feature lifecycle effect, while rapid independent saves could apply an older toggle after a newer one.

## Mutation contract

`settingsService.updateConfig(updater, { origin })` is the single serialized interactive mutation boundary. It:

1. waits for the existing migration/readiness barrier;
2. queues behind earlier config updates;
3. clones the latest committed runtime config and runs the updater against that draft;
4. strictly validates and commits through the existing canonical/backup revision path;
5. applies the committed value through `configChangeApplication` and awaits registered effects.

The same application path is used while loading a page and applying a remote envelope, but those replays pass `notify: false`. Feature lifecycle effects therefore reconcile the current page without producing “enabled” or “disabled” toasts merely because the userscript loaded or navigation re-applied settings. Interactive commits retain notifications, including custom effect messages that receive the `{ origin, notify }` context.

Tag add/remove/reorder/move operations await this result before rendering or showing success. `saveConfigKeys()` and `commitConfig()` remain compatibility wrappers, but their repository operations use the same serialized queue.

## Effect ownership

Tag list paths are registered once by `settings/tagsSettings.js`; array descendant paths resolve to the registered root metadata, so tile and thread refreshes use the shared application pipeline. Latest Overlay and Thread Overlay dialog maps are registered by their feature modules under namespaced metadata IDs. The observer resource cleanup callback is non-recursive, so lifecycle teardown does not report cleanup failures.

## Storage activity and measurements

The small tag-list update retains atomic persistence: it reads the current canonical envelope, validates the complete candidate, writes the verified previous envelope to backup, writes the new canonical envelope, deep-diffs the runtime config, resolves effect metadata, and schedules the registered tile/thread refresh tasks. It does not write the tag or prefix catalog caches.

Fetched catalogs use the existing cache-only path. The regression test measured the following representative run using compact JSON byte lengths and `performance.now()` timings; timings are environment-dependent:

| Update | Payload bytes | Canonical bytes | Storage writes | Time (ms) |
| --- | ---: | ---: | --- | ---: |
| One preferred-list tag | n/a | 1,937 | backup + canonical | 1.121 |
| 10 tags | 243 | 1,937 | tag cache only | 1.137 |
| 1,000 tags | 27,787 | 1,937 | tag cache only | 22.463 |
| 10,000 tags | 297,789 | 1,937 | tag cache only | 164.684 |
| 10 prefixes / representative categories | 1,095 | 1,937 | prefix cache only | 37.287 |
| 1,000 prefixes / representative categories | 55,010 | 1,937 | prefix cache only | 96.829 |

The canonical size remains independent of catalog size. The exact measurements are emitted by the `CORE-CONFIG-INTERACTION-REGRESSION-02` test and should be refreshed when the persistence envelope changes.

## Compatibility boundary

The interaction fix relies on the existing canonical version-1 envelope, backup recovery, migration marker, cache keys, and shared effect registry. Removing the historical storage migration remains governed by `storage-migration-recovery.md`; this package does not shorten that compatibility window or begin later cleanup work.
