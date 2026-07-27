# Library Update Inbox and Acknowledgement Repair

## Scope decision

Repair Library update acknowledgement and add one durable, user-visible inbox
for detected thread updates. Library IndexedDB records remain authoritative.
Do not add a second notification store, change the core add-on protocol, or
bump the Library database schema solely for this work.

Preserve:

- add-on ID, userscript metadata, grants, capabilities, handshake, and storage keys;
- the current version-5 normalized record and existing update/activity stores;
- `updateState: "changed"` as the durable unacknowledged-update marker;
- update-history deduplication and personal-state preservation;
- background manual/automatic update checks and their existing leases, pacing,
  retries, cancellation, and caps;
- the existing core-owned dialog and toast APIs;
- reversible disable, stale-work suppression, and exactly-once teardown.

Do not treat a routine same-version check as a new update or notification.

## Fixed design decisions

### Durable acknowledgement

An entry is in the update inbox exactly when its canonical record has
`updateState === "changed"`. Acknowledging an entry changes only:

```js
{
  updateState: "acknowledged",
  recordModifiedAt: now,
}
```

It must not alter thread facts, personal state, update-check status, version
history, activity history, or `personal.lastPlayedVersion`.

No separate unread flag or notification record is required. Existing records
survive reloads and naturally retain unacknowledged updates.

### Stable editor actions

Every asynchronous Full Edit action captures the active thread ID and dialog
generation before its first `await`. After each asynchronous boundary it must
verify the generation and active thread still match before replacing data or
rerendering.

`Acknowledge current update` and `Played this version` must re-read the complete
record after commit and retain the same thread identity. A missing or stale
record produces a bounded error result and toast; it must never render an
unknown/null editor.

Hide `Played this version` when normalized
`personal.lastPlayedVersion === thread.currentVersion`. Equivalent version
formatting must use the accepted Library version normalizer rather than literal
string equality.

### Update inbox

Add a Library Manager action labeled **Updates** with an unacknowledged count.
Open a dedicated Library-owned dialog using the existing core dialog API.

The dialog contains:

- bounded, newest-first entries whose `updateState` is `changed`;
- title, previous/current version when available, detected time, and current
  personal status;
- an **Edit** action per entry;
- an **Acknowledge** action per entry;
- **Acknowledge all**;
- empty, loading, partial-failure, and stale-entry states.

Selecting **Edit** closes the inbox and opens Full Edit for the captured thread
ID. If the entry was removed between those actions, show one error toast and
leave both dialogs closed. Editing does not acknowledge implicitly.

The inbox must not load every record into the DOM. Query in bounded pages and
reuse the accepted keyset/persistence facilities. The count may be exact when
the repository can provide it efficiently; otherwise use a bounded `99+`
presentation and document that contract.

`Acknowledge all` re-reads the selected/current changed records at commit time,
updates only records still marked `changed`, runs as a bounded serialized
operation, reports updated/skipped/failed counts, and refreshes both inbox and
manager. Partial failure must leave failed records visible and retryable.

### Notifications

Keep notification state in memory for the current page session only. When an
authoritative check first changes a record from a non-`changed` state to
`changed`, immediately show one generic success/info toast:

> There are updated games in your Library.

Do not wait for the complete check batch. This ensures the user receives notice
even if the page closes or the run is cancelled before checking the remaining
records.

After the first toast, latch notification delivery for the lifetime of the
current userscript/page instance. Further discoveries, retries, manual checks,
automatic checks, route changes, manager rerenders, and dialog activity on that
same page must not show another update-detected toast.

Do not persist the latch in IndexedDB, GM storage, records, metadata, or update
events. A new F95 page load starts with a fresh in-memory latch and may show one
toast when continued checking discovers another new update. Multiple tabs may
therefore each show one toast; this is accepted and must not justify a new
cross-tab transport or persistence field.

Do not toast for:

- unchanged checks;
- records already in `changed` state for the same update;
- initial observations;
- cancelled or stale generations;
- background checks after Library disable/teardown.

Manual, automatic, and opportunistic checks use the same page-session
notification coordinator. Update-detected notification must remain independent
of existing completion/failure summaries. The existing lease and update-event
deduplication continue to prevent duplicate state transitions; notification
code must not introduce cross-tab grants.

## Global definition of done

- Production source and directly related tests pass lint.
- All Library test groups pass.
- Full `npm test` passes.
- Add-on manifest, catalog, structure, and regular/release smoke checks pass
  without version, cache, or tracked `dist/` mutation.
- `git diff --check` passes.
- No userscript metadata, public action ID, response shape, storage key, or
  import/export format changes unintentionally.
- New listeners, dialog bindings, pending operations, and notification work
  have explicit owners and are released on close, disable, and teardown.
- Tests identify thread ID, action, generation, and failing persistence step.

## Required execution order

1. Add focused failing characterizations for the current unknown/null editor
   regression on acknowledgement and played-version actions.
2. Repair stable-ID/generation handling and conditional played-version rendering.
3. Add repository queries and bounded acknowledgement coordination.
4. Add the update-inbox dialog and manager action.
5. Add page-session first-detection notification coordination.
6. Run package validation and the global definition of done.

---

## `LIBRARY-UPDATE-INBOX-01` — Repair acknowledgement and add update inbox

### Required implementation

- [ ] Reproduce `Acknowledge current update` losing the active record after an
  awaited commit/rerender.
- [ ] Reproduce `Played this version` losing the active record under the same
  close/rerender race.
- [ ] Capture thread ID and generation before asynchronous editor actions and
  reject stale completion without mutating or rerendering another entry.
- [ ] Re-read the complete canonical record after successful acknowledgement
  and played-version commits.
- [ ] Hide `Played this version` when current and last-played versions are
  normalized-equivalent.
- [ ] Keep the action visible when the versions differ or last-played version
  is empty.
- [ ] Add a bounded repository query/count for records in `changed` state,
  ordered newest first with deterministic thread-ID tie-breaking.
- [ ] Add serialized single and bulk acknowledgement services that revalidate
  state at commit time and preserve all unrelated fields.
- [ ] Add the Library Manager **Updates** action and unread count.
- [ ] Add a dedicated update-inbox controller, renderer, bindings, and scoped
  style with explicit dialog lifecycle ownership.
- [ ] Add per-entry **Edit** and **Acknowledge** actions.
- [ ] Add **Acknowledge all** with updated/skipped/failed results and retryable
  partial failures.
- [ ] Close the inbox before opening Full Edit and pass a captured stable
  thread ID.
- [ ] Refresh manager rows/counts after acknowledgements without resetting
  unrelated search, sort, selection, or keyset position.
- [ ] Emit one generic toast immediately when the first newly changed record is
  committed during the current page session.
- [ ] Keep the notification latch in memory only and share it across manual,
  automatic, and opportunistic update paths.
- [ ] Suppress later notifications on the same page, plus notifications for
  unchanged, duplicate, cancelled, stale, or post-teardown results.
- [ ] Reset the latch only when a new userscript/page instance starts; route
  changes, manager reopen, and scheduler reruns must not reset it.
- [ ] Update Library documentation and changelog under an unreleased heading.

### Required tests

- [ ] Acknowledge from Full Edit preserves title, thread ID, draft fields,
  history, and dialog identity.
- [ ] Played-version preserves editor identity and creates only the accepted
  activity transition.
- [ ] Closing or switching entries during either action suppresses stale UI
  replacement.
- [ ] Played-version is hidden for normalized-equivalent versions and visible
  for differing/unknown personal versions.
- [ ] Inbox query is deterministic, bounded, newest-first, and excludes
  current/acknowledged/unavailable/unchecked entries.
- [ ] Reloading Library retains unacknowledged entries without a new store or
  migration.
- [ ] Single acknowledgement changes only update state and modification time.
- [ ] Acknowledge-all revalidates records, handles concurrent acknowledgement
  and removal, and reports partial failure without losing retryable entries.
- [ ] Inbox Edit closes the inbox and opens the correct Full Edit record.
- [ ] Removed records and stale generations never produce an unknown editor.
- [ ] The first newly changed record immediately emits one generic toast
  without waiting for batch completion.
- [ ] Later changed records on the same page emit no additional toast across
  manual, automatic, and opportunistic checks.
- [ ] Closing the page after the first changed commit still means the toast was
  already emitted; closing before any changed commit emits none.
- [ ] A fresh page session may emit one new toast when it discovers a new
  changed transition.
- [ ] No notification latch or delivery marker is written to IndexedDB, GM
  storage, records, metadata, update events, or import/export documents.
- [ ] Disable/teardown cancels inbox bindings, pending queries, bulk work, and
  late notifications.
- [ ] Import/export compatibility and existing version/activity histories
  remain unchanged.

### Acceptance criteria

- [ ] Neither editor action can replace the modal with unknown/null data.
- [ ] `Played this version` is absent when the current version is already the
  played version.
- [ ] Every detected update remains discoverable until explicitly
  acknowledged, including after reload.
- [ ] Users can inspect, edit, acknowledge individually, or acknowledge all
  from one bounded update inbox.
- [ ] Update detection notifies immediately on the first discovery, at most
  once per page session, without persisted notification state.
- [ ] No database schema bump, new GM grant, cross-tab listener, public core
  API, or second persistence architecture is introduced.
- [ ] All required tests and the global definition of done pass.

### Scope guardrails

- Do not redesign the Library Manager or Full Edit dialog beyond the required
  action visibility and update-inbox handoff.
- Do not change update polling cadence, retry policy, leases, thread parsing,
  or authentication behavior.
- Do not auto-acknowledge on view, edit, export, import, or a same-version check.
- Do not infer played state from acknowledgement.
- Do not delete or rewrite update/activity history when acknowledging.
- Do not add browser notifications, service workers, or new permissions.
- Do not build release artifacts or bump versions in this package.
