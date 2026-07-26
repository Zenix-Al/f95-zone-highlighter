# Masked + Direct Reliability Plan

## Scope decision

Improve the existing `masked-direct-addon` before adding another download host.
This plan covers only:

1. removing add-on-owned toast presentation from external hosts while retaining
   targeted notices through core on the originating F95 tab; and
2. making simultaneous direct-download requests independent, especially when
   two F95Zone tabs start downloads at nearly the same time.

Do not add or alter host automation in these packages. Preserve every current
userscript `@match`, `@run-at`, route, selector, supported flow, registration
handshake, core management behavior, and external-host isolation.

The current primary concurrency lead is confirmed by source:

- `domain/directDownload/processingTrigger.js` stores all active requests under
  `f95ue.addon.maskedDirect.processingDownload`;
- adding and clearing a request performs an asynchronous read-modify-write of
  the complete shared array;
- two tabs can read the same old array and overwrite each other's additions or
  removals;
- a no-request cleanup clears the complete array;
- `reportAddonHealthy()` currently invokes that broad cleanup on ordinary
  non-download pages;
- the download-page close delay is also stored under one shared value rather
  than owned by a request.

Treat these as leads to prove with deterministic tests before changing the
transport. Do not assume they are the only faults.

---

## Fixed design decisions

### Request identity is authoritative

- Every automated download owns one immutable `requestId`.
- Keep the current per-main-tab `ownerTabId`.
- Carry both identities through the opened URL, session route context,
  processing state, completion/failure event, and managed-tab close request.
- A download page must never claim the newest or only unrelated request merely
  because its own identity is missing.
- Missing or stale identity must degrade to the existing standalone/manual
  behavior without clearing another request.

### Requests must not share mutable records

- Do not repair the shared trigger array with an unbounded retry loop or an
  assumed-atomic GM read-modify-write.
- Store active processing state by `requestId`, using a stable request-key
  prefix or an equivalently isolated representation.
- Request creation, lookup, completion, timeout, failure, and cleanup must
  touch only that request's state.
- Store request-specific close behavior with the request rather than in one
  global short-lived delay value.
- Keep bounded compatibility reads for existing shared trigger/delay records
  only where needed for an already-open flow. Do not create a general migration
  framework.
- Expired compatibility records may be ignored or cleaned opportunistically,
  but one tab must never delete another live request.

### Cross-tab results remain targeted

- Retain the add-on-owned `GM_addValueChangeListener` /
  `GM_removeValueChangeListener` result transport.
- Keep results targeted by `ownerTabId` and correlated by `requestId`.
- Retain request-specific managed-tab closing.
- Dedupe result events by event/request identity, not by one global timestamp
  rule that can discard a valid out-of-order sibling result.
- Local writes remain ignored through the listener's `remote` argument.
- Missing listener cleanup must not cause duplicate UI, lifecycle execution,
  or unrelated tab closure.

### Remove add-on-owned toast presentation

- Remove the local toast element, toast CSS, timer, and lifecycle ownership.
- Keep `toast.show` and the `toast` capability for targeted notices rendered
  by core on the originating F95 tab.
- External-host flows must never construct toast DOM, styles, or timers.
- Successful routing/download detection does not need replacement UI.
- Recoverable or terminal failures may emit one bounded
  `console.warn`/`console.error` message with host, stable reason, and
  `requestId`.
- Do not log complete signed download URLs, secrets, page HTML, or unbounded
  payloads.
- Continue publishing targeted success/failure/close events to the originating
  main tab and updating core runtime status where the current contract requires
  it. Removing toasts must not remove that transport.

---

## Global definition of done

- No host is added, removed, or behaviorally redesigned.
- Existing matches, grants, run timing, settings, storage compatibility,
  route parameters, and public registration/action response shapes remain
  compatible; the core toast capability remains intentional.
- Main-tab, masked-page, managed external-page, and external-standalone
  contexts retain separate behavior.
- Two or more live requests cannot overwrite, consume, complete, fail, close,
  or clear one another.
- Disable and teardown remove listeners, timers, managed-tab handles, and
  pending operations without clearing sibling-tab requests.
- Tests are deterministic and use local fake tabs, GM storage, listeners,
  clocks, and host fixtures only.
- Add-on lint, full tests, manifest/catalog/structure checks, regular/release
  smoke builds, deterministic audits, and `git diff --check` pass.
- Validation performs no version bump and does not modify tracked `dist/`.

## Required execution order

1. `MASKED-DIRECT-PARALLEL-BASELINE-01`
2. `MASKED-DIRECT-TOAST-REMOVE-01`
3. `MASKED-DIRECT-PARALLEL-REQUESTS-01`
4. `MASKED-DIRECT-RELIABILITY-VERIFY-01`

Do not begin host expansion until all four packages are accepted.

---

## MASKED-DIRECT-PARALLEL-BASELINE-01 — Reproduce current request collisions

### Goal

Create a deterministic, non-mutating characterization of toast ownership and
parallel direct-download state before changing production behavior.

### Required investigation

- [x] Inventory every `showToast` call and classify it as:
  - [x] F95 thread/masked progress;
  - [x] external-host success;
  - [x] external-host failure/timeout;
  - [x] core access/lifecycle;
  - [x] cross-tab result presentation.
- [x] Record local toast DOM, CSS, timer, and teardown ownership.
- [x] Record the `toast.show` capability/action path and fallback behavior.
- [x] Trace request identity from thread click through:
  - [x] generated URL;
  - [x] processing trigger;
  - [x] opened managed tab;
  - [x] route session context;
  - [x] host handler;
  - [x] success/failure event;
  - [x] originating-tab listener;
  - [x] managed-tab closure.
- [x] Inventory every read/write/delete of:
  - [x] `f95ue.addon.maskedDirect.processingDownload`;
  - [x] `f95ue.addon.maskedDirect.directDownloadEvent`;
  - [x] `f95ue_dd_downloadPageCloseDelayMs`;
  - [x] route/session context and tab identity keys.
- [x] Record which operations are complete-value read-modify-write cycles.

### Required failing fixtures

- [x] Two main tabs read an empty trigger ledger, then A and B write; reproduce
  one request disappearing.
- [x] A completion cleanup races B creation; reproduce B being removed or
  hidden where current behavior permits it.
- [x] An ordinary F95 tab reports healthy while A and B are active; reproduce
  the broad clear.
- [x] Two requests use different close-delay settings; reproduce the shared
  delay selecting the wrong request's value.
- [x] Two results for one owner arrive out of timestamp order; characterize
  whether the valid older sibling is discarded.
- [x] Two targeted results for different owner tabs never intentionally act on
  the other tab.
- [x] Record same-tab two-request behavior separately from two-main-tab
  behavior.

### Acceptance criteria

- [x] The exact collision is reproducible without network access.
- [x] Every shared mutable surface and broad cleanup caller is documented.
- [x] No production source, manifest, catalog, version, cache, or `dist/` file
  changes in this package.

---

## MASKED-DIRECT-TOAST-REMOVE-01 — Remove add-on-owned toast UI

### Goal

Remove local Masked + Direct toast presentation on external hosts while
retaining targeted F95-side notices through core, diagnostics, and transport.

### Required implementation

- [x] Delete local toast element creation, CSS, timer, and teardown code.
- [x] Remove the `showToast` composition dependency from app, lifecycle,
  context, detector, flow, and host handlers.
- [x] Keep `toast.show` behind a thin API wrapper for targeted notices on the
  originating F95 tab.
- [x] Keep the `toast` capability in manifest and generated catalog metadata.
- [x] Do not replace success/progress toasts with other page UI.
- [x] Replace actionable failure/timeout cases with bounded named diagnostics.
- [x] Include stable host/reason/request correlation where available.
- [x] Redact signed URLs, query secrets, HTML, and arbitrary remote messages.
- [x] Preserve originating-tab success/failure events, core status updates,
  button state, normal fallback navigation, and managed-tab closure.
- [x] Remove stale toast selectors, styles, tests, docs, and audit assumptions.

### Required tests

- [x] Repository-wide source search finds no Masked + Direct local toast DOM,
  selector, style, or timer; `toast.show` exists only in the thin API wrapper.
- [x] Success paths emit no page UI.
- [x] Failure and timeout paths emit at most one bounded warning/error.
- [x] Diagnostic fields are stable and redacted.
- [x] A download-host failure still reaches only its originating main tab.
- [x] Disable/teardown owns no toast timer or element.
- [x] Header matches, grants, and run timing remain unchanged.

### Acceptance criteria

- [x] The add-on creates no toast UI and requests core toast capability only
  for targeted F95-side notices.
- [x] Removing presentation does not remove result transport or lifecycle
  behavior.
- [x] Source and built-byte deltas are measured.

---

## MASKED-DIRECT-PARALLEL-REQUESTS-01 — Isolate concurrent request state

### Goal

Make every direct-download flow independently addressable so two main tabs can
start, complete, fail, and close downloads concurrently.

### Required implementation

- [x] Introduce one request-state contract containing at least:
  - [x] `requestId`;
  - [x] `ownerTabId`;
  - [x] normalized host;
  - [x] source identity;
  - [x] creation/expiry times;
  - [x] request-specific close delay;
  - [x] bounded status needed for recovery/cleanup.
- [x] Persist active request state under request-isolated ownership.
- [x] Make create/read/update/complete/fail/clear operations request-specific.
- [x] Remove all production no-ID complete-ledger clears.
- [x] Require exact request identity before an external page claims automated
  ownership.
- [x] Use URL identity first and fresh session route context as the bounded
  redirect/stripped-marker fallback.
- [x] Never fall back to the newest unrelated active request.
- [x] Preserve a bounded exact-ID compatibility read for an existing legacy
  shared record if required.
- [x] Move close-delay ownership into request state and stop using one shared
  two-second cache for new requests.
- [x] Keep the targeted event listener transport and request-specific managed
  tab registry.
- [x] Make event dedupe independent per event/request so out-of-order sibling
  results remain valid.
- [x] Expire stale request state without enumerating or deleting unrelated live
  requests.
- [x] Bound retained compatibility/index metadata if any is still necessary.

### Required tests

- [x] A and B can create requests from separate main tabs in either interleave
  order without loss.
- [x] A and B can create requests from one main tab without loss.
- [x] Reading A can never return B.
- [x] Completing, failing, timing out, or clearing A leaves B byte-equivalent.
- [x] Loading or refreshing an ordinary F95 tab leaves A and B intact.
- [x] Different close delays remain attached to their own requests.
- [x] Query markers survive ordinary redirects through session context.
- [x] Missing, mismatched, and expired request IDs cannot claim another flow.
- [x] Marker-stripped recovery accepts only the matching fresh request.
- [x] A success/failure closes only A's managed tab.
- [x] Results targeted at tab A are ignored by tab B and vice versa.
- [x] Two results for the same owner but different requests are both handled,
  including reverse timestamp order.
- [x] Duplicate delivery of one event is idempotent.
- [x] Local value-listener callbacks remain ignored through `remote === false`.
- [x] Disable/teardown of one tab does not clear another tab's request state.
- [x] Legacy exact-ID records remain readable only within the documented
  compatibility boundary.

### Acceptance criteria

- [x] The baseline lost-update fixtures pass under every tested interleaving.
- [x] No correctness depends on GM storage providing an atomic transaction.
- [x] No request can consume or clean another request's route, trigger, delay,
  result, or managed tab.
- [x] Existing single-download behavior remains unchanged.

---

## MASKED-DIRECT-RELIABILITY-VERIFY-01 — Integrated route and lifecycle matrix

### Goal

Verify toast removal and parallel request isolation across every currently
supported context and host without expanding host behavior.

### Required verification

- [x] Cover `f95-core`, `/masked/`, managed external, external standalone, and
  unsupported contexts.
- [x] Run all current host fixtures without changing selectors or automation
  steps.
- [x] Cover enable, disable, refresh, before-page-change, terminal teardown,
  and re-registration.
- [x] Cover two main tabs with overlapping:
  - [x] successful downloads;
  - [x] one success and one failure;
  - [x] one timeout and one success;
  - [x] reverse-order completion;
  - [x] one tab closing during processing.
- [x] Verify no local toast DOM, style, or timer returns and core toast remains.
- [x] Verify console diagnostics are bounded and contain no signed URLs or
  remote payload bodies.
- [x] Verify listener IDs are registered once and removed by their owner.
- [x] Verify missed cleanup cannot execute duplicate result handling.
- [x] Verify storage keys retained for compatibility are explicitly
  documented.
- [x] Update Masked + Direct changelog and architecture/development docs.
- [x] Regenerate deterministic add-on, API, and size reports.

### Validation commands

- [x] `npm run lint:addons -- --quiet`
- [x] `npm test`
- [x] `npm run check:addons:manifest`
- [x] `npm run check:addons:catalog`
- [x] `npm run check:addons:structure`
- [x] `npm run build:addons:smoke -- --addon masked-direct-addon`
- [x] `npm run build:addons:smoke -- --addon masked-direct-addon --release`
- [x] `npm run check:addons:baseline`
- [x] `npm run check:addons:api`
- [x] `npm run check:addons:size`
- [x] `git diff --check`

### Acceptance criteria

- [x] No add-on-owned toast remains; core-owned targeted F95 notices remain.
- [x] Every current host still completes its characterized supported flow.
- [x] Parallel requests remain independently correlated from creation through
  cleanup.
- [x] One tab's lifecycle cannot mutate another tab's live request.
- [x] Header behavior and the intentional core toast capability are unchanged.
- [x] Validation performs no version bump or tracked distribution mutation.
- [x] No unresolved concurrency, lifecycle, transport, or compatibility issue
  remains before host expansion begins.
