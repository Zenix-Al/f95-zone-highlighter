# ScriptCat Storage Baseline

This document records `CORE-STORAGE-SCRIPTCAT-BASELINE-01`. It characterizes
the supplied fresh-install storage exports without retaining or reproducing
their configuration values.

## Observed states

Both managers persisted a structurally valid schema-version-1 canonical
envelope with the expected configuration sections. Their canonical payload
sizes were effectively equivalent, so the supplied evidence does not indicate
that configuration size caused the failure.

The Tampermonkey state completed the fresh-install transaction:

- canonical envelope present;
- last-known-good backup present;
- migration-version marker set to 1;
- no migration lock;
- no recovery marker.

The ScriptCat state stopped after the canonical envelope became visible:

- canonical envelope present at revision 1;
- no last-known-good backup;
- no migration-version marker;
- `migration-failed` recovery marker present;
- an expired migration lock remained in the export.

The retained lock was collected before `GM.deleteValue` was granted. It is a
confirmed cleanup defect but is not sufficient to explain the transaction
failure: adding the grant removed that missing capability and did not make the
fresh initialization succeed.

## Narrowed failure window

The source transaction writes and verifies caches and canonical configuration
before it attempts the fresh-install backup. Based on the persisted keys, the
unidentified failure lies between canonical verification and completion-marker
commit. Runtime diagnostics now assign bounded names to these boundaries:

1. `cache-write`
2. `canonical-write`
3. `cache-verify`
4. `canonical-verify`
5. `backup-write`
6. `post-backup-canonical-verify`
7. `completion-marker-write`
8. `legacy-cleanup`

A failure records only its boundary and bounded error reason in feature health;
it never records configuration data. The recovery marker also stores the
boundary as an issue code so an exported post-failure structure remains useful
when console events are unavailable.

## Current conclusion

The follow-up schema-2 export identified the manager quirk. ScriptCat persists
the canonical envelope but normalizes object property order before returning
it. The old verification compared raw `JSON.stringify()` output, so a valid
reordered envelope failed at `fresh-canonical-verify` and bootstrap loaded
defaults read-only. Capability probing still succeeded because the small probe
value did not expose nested key reordering.

Canonical and schema-backup verification now compare object keys
order-independently while preserving array order. ScriptCat is therefore not
treated as generally storage-incompatible and no manager-specific writable
bypass is required.

## Capability probe contract

`CORE-STORAGE-CAPABILITY-PROBE-01` adds an adapter-level probe without invoking
it during startup. Each invocation owns a unique `f95ue:storage:probe:*` key and
performs absence read, small write, exact read-back, deletion, and deletion
verification. Concurrent tabs therefore cannot clean up one another's probe.

The result contains only manager context, boolean method capabilities, a stable
failed step, and bounded reasons. Probe values and configuration values are not
reported. Manager context is diagnostic only; capability decisions are based on
the methods and verified operations.

Synchronous completion and Promise completion remain supported. `undefined` is
accepted as the normal userscript-manager completion value, while an explicit
`false`, rejection, read-back mismatch, missing delete method, or failed cleanup
is reported rather than interpreted as success. Wave 2 does not change ordinary
adapter write scheduling; production result normalization belongs to the later
unified write-gate cutover.
