# Library Legacy Upgrade Guard

The current Library add-on no longer contains the schema-v1 record conversion code.
Library add-on v1.2.2 is the minimum upgrade bridge from that legacy storage shape.
Its source is preserved in repository commit `5a43530`, and its published version is
available from the [Library add-on version history](https://greasyfork.org/en/scripts/572506-f95ue-library-add-on/versions).

The bridge evidence is the GM-storage marker `libraryMigrationV1Done=true` with no
remaining non-empty `libraryRecords` payload. The current database is IndexedDB
`library` version 4 with schema marker `schema-v4-complete`; those modern database
details are deliberately not accepted as substitutes when an old payload remains.

## Startup states

| Legacy payload | `libraryMigrationV1Done` | Result |
| --- | --- | --- |
| Empty | Missing | Fresh install; initialize the current schema and write the bridge marker. |
| Empty | `true` | Supported v1.2.2 bridge; initialize normally. |
| Non-empty | Either value | Stop with `upgrade_required`; do not initialize, mutate, or clear Library data. |

The guard runs before IndexedDB schema creation, pinned-index backfill, settings
writes, scheduler startup, UI mounting, and page actions. An unsupported direct
upgrade therefore fails closed and leaves the legacy payload available for v1.2.2.

To recover, install and open Library add-on v1.2.2 once so it creates the supported
bridge state, then reinstall the current release. This retirement does not change
the current IndexedDB schema version; it only removes the obsolete conversion path.
