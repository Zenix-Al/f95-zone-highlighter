# Maintenance Checklist

Before merging a UI change:

- Verify Shadow DOM isolation and document-level selectors
- Ensure no duplicate listeners after reinit
- Confirm cleanup/ownership for mounts and timers
- Validate config paths in migration and validation
- Align `metaRegistry` with sync-observed keys
- Ensure persistence failure has visible handling
- Confirm accessibility: focus restore, traps, labels
- Run focused tests for changed subsystems