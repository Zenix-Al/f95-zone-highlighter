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
- Renders search results.
- Adds action buttons for each destination group.
- Renders configured tag lists.
- Handles empty states.
- Coordinates drops and cross-list moves.
- Clears or closes search results when appropriate.

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
