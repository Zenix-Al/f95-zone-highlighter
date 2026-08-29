# Core Storage Legacy Upgrade Guard

Core v5.1.2 is the supported bridge for pre-envelope and surface-key
configuration. Repository commit `e51cf89` contains the released surface-key
conversion while `version.json` records `5.1.2`. Commit `b1f737f` removes that
conversion and records `5.1.3`, establishing the compatibility boundary.

The current release supports fresh schema 2 storage, existing schema 2 storage,
and the single schema-1-to-schema-2 migration. Recognized older layouts are not
merged, sanitized, cleaned, or replaced. Detection reads only the explicit
historical key list and the canonical/backup roots. It never scans storage.

When historical evidence is present without the completion marker, bootstrap
publishes `upgrade-required` through the Storage Feature Health owner and stops
required startup before features or the add-on bridge load. A native blocking
notice remains usable before the ordinary UI exists. It instructs the user to:

1. Install and open core v5.1.2 once.
2. Confirm that release creates the canonical schema-1 envelope.
3. Reinstall the current release, which performs the supported schema-1-to-2
   migration.

The guard writes no canonical envelope, backup, cache, completion/recovery
marker, add-on state, or cleanup key. Unknown corrupt storage and future schemas
also remain read-only, but they are not misreported as bridge-compatible legacy
data.
