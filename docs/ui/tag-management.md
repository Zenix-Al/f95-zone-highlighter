# Tag Management UI

The tag UI is a coordinated subsystem rather than a simple settings list.

## User-Facing Capabilities

The interface supports:

- Searching available tags.
- Adding tags to preferred, excluded, or marked groups.
- Removing tags.
- Reordering tags within a group.
- Moving tags between groups.
- Updating the page after mutations.
- Displaying safety warnings or invalid-state information.

## Tag Search (`components/tag-search/index.js`)

This module:

- Initializes search behavior.
- Excludes tags already assigned to a configured group.
- Renders search results in stable 60-tag chunks with a `Load more` action.
- Keeps every matching tag reachable without mounting the full catalog at once.
- Handles all result actions through one delegated result-container listener.
- Validates delegated tag/action identities against the active result set and catalog.
- Renders configured tag lists.
- Handles empty states.
- Coordinates drops and cross-list moves.
- Discards active result state when results close, clear, change, or the runtime tears down.

## Tag Settings Bridge (`settings/tagsSettings.js`)

Bridges modal lifecycle and tag domain logic:

- Initializes the tag-search component.
- Loads tags.
- Prunes obsolete configured tags.
- Renders the current lists.
- Requests safety-state checks.
- Avoids unnecessary repeat initialization.

## Mutations (`components/tag-search/tagMutations.js`)

Mutation operations:

- Add a tag.
- Remove a tag.
- Reorder within a list.
- Move between lists.
- Persist through the tag service.
- Await the serialized config update before rendering the changed lists.
- Show success toasts only after the update commits.

## Effects

Tag-list effects are registered as shared config metadata by `settings/tagsSettings.js`:

- Latest-update tile reprocessing.
- Thread tag reprocessing.

This ensures that local edits, imports, and synchronized changes use the same effect pipeline without duplicate manual triggers. The old component-local effect helper was removed.

## Drag and Drop (`components/tag-search/tagDrag.js`)

Implements pointer-based drag and drop:

- Creates a drag ghost.
- Highlights potential destinations.
- Computes drop position.
- Performs cleanup.
- Exposes lifecycle hooks.

Native desktop drag support is explicitly disabled — pointer behavior is the active implementation.

## Related Services

The tag UI depends on:

- `tagsService` — storage, search, updating, and pruning.
- `safetyService` — warnings and configuration-state checks.
- Feature queues — repainting/reclassifying page content.
