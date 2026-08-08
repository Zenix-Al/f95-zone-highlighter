# Masked Direct `/masked/` Standalone Detailed Plan

This plan lets F95 `/masked/*` redirect pages resolve without F95UE core while
preserving the existing core-managed behavior whenever core is available.

Prepared against the repository inspected on **2026-08-08**.

---

## Decision

`/masked/*` becomes a dual-owner route:

```text
F95 thread route
  core available  -> existing core-managed add-on
  core missing    -> skip add-on behavior on F95

F95 /masked route
  core available  -> resolve, then hand supported destination to the managed
                     direct-download lifecycle
  core missing    -> resolve and perform one bare validated redirect only

External host route
  valid request   -> managed host mode
  no request      -> existing limited standalone policy
```

The resolver does not need core to perform its request. It sends a same-origin
XHR to the current F95 masked endpoint, validates the response, handles the
existing captcha flow, and produces one validated destination. Core is used to
select destination ownership and honor its enabled/settings state.

When core owns the masked route and the destination is a supported direct
download host, the destination must pass to the existing
`routeToDirectDownload()` flow. That flow remains the only owner of request
identity, `GM_openInTab`, origin signaling, result cleanup, and managed closing.
Unsupported destinations retain normal validated navigation.

When core is absent, the local masked owner performs only
`location.assign(destination)` (or the existing equivalent). It must not call
`routeToDirectDownload()`, create request identity, open a managed background
tab, publish an origin event, or schedule closing. The destination host may
then independently automate only if the existing limited standalone policy
authorizes its exact route.

The standalone masked route must not register with core, invoke core actions,
publish origin events, create a managed download request, or close the tab.
After redirect, the destination host independently applies the existing
managed/limited-standalone host decision.

---

## Fixed scope

### Included

- optional-core classification for F95 `/masked/*` only;
- reuse of the current bounded core ping/access probe;
- local standalone masked-page lifecycle after core is conclusively absent;
- mirroring the existing `skipMaskedLink` user preference into GM policy for
  no-core reads;
- defaulting standalone masked resolution to enabled when no preference has
  ever been mirrored;
- one in-flight resolver request and one terminal redirect per page;
- an explicit destination strategy selected by masked ownership: managed
  routing with core versus bare navigation without core;
- bounded captcha readiness and retry ownership;
- local page error rendering through existing F95 masked-page elements;
- focused tests and architecture documentation.

### Excluded

- rendering Resolve or Direct DL controls on F95 thread pages without core;
- local replacement for the core add-on settings panel;
- changing the masked endpoint, request body, captcha site key, or response
  protocol;
- creating managed request records from a standalone masked page;
- extending standalone eligibility to more download hosts;
- local toast UI, new CSS, background polling, or another observer;
- version bumps, release builds, and generated distributions until requested.

---

## Non-negotiable contracts

- Core availability is tri-state: `probing`, `available`, or
  `confirmed-missing`. Initial state is always `probing`, never standalone.
- While state is `probing`, the add-on must not run either managed or
  standalone masked resolution. An early user action may retain the site's
  native behavior or wait behind the single ownership promise, but it must not
  be classified as standalone.
- The tri-state is also published as a short-lived GM policy lease before the
  first F95 ping begins. This prevents an external host opened by a native,
  robot-fast F95 click from consuming an older `forcedByMissingCore: true`
  snapshot while the new handshake is unresolved.
- A valid exact managed request may run while the shared lease says `probing`.
  Requestless standalone host execution must wait for the probing lease to
  settle as `available` or `confirmed-missing`, then re-evaluate policy and
  route eligibility once.
- The probing lease has a bounded expiry. If the F95 tab disappears or crashes
  before publishing an outcome, external hosts fail closed rather than treating
  expired probing as confirmed missing.
- A confirmed core always owns `/masked/*`; standalone must not race it.
- A core-disabled or blocked add-on must remain disabled. Standalone is allowed
  only when core is conclusively unavailable, not when access says disabled.
- The existing full ping/access probe runs before local ownership begins.
- Core-owned masked resolution delegates supported destinations to the existing
  managed direct-download flow; it does not reproduce that flow.
- Standalone masked resolution always uses bare navigation and can never create
  managed state.
- The saved `skipMaskedLink` preference and missing-core state remain separate.
- Missing mirrored preference defaults to `true` for compatibility with the
  add-on's current default.
- One page may have at most one masked XHR in flight and one accepted terminal
  redirect.
- Captcha retry belongs to that same operation and cannot start a sibling XHR.
- Redirect destinations must pass the existing URL normalization and HTTP(S)
  validation before navigation.
- Standalone errors stay in the current page. They never use the direct-download
  event bus or core status commands.
- Pagehide/disposal aborts or ignores late XHR/captcha commits.

---

## Required execution order

### Wave 0 — Characterization

1. `MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01`

### Wave 1 — Route ownership and preference

1. `MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01`
2. `MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01`

### Wave 2 — Local resolver lifecycle

1. `MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01`

### Wave 3 — Integrated verification

1. `MASKED-DIRECT-MASKED-STANDALONE-VERIFY-01`

Execute one package at a time.

---

# Work packages

## MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01 — Freeze current masked behavior

**Priority:** Critical  
**Production changes:** None

### Required work

- [x] Characterize context classification for thread, masked, captcha-frame,
      external host, and unsupported routes.
- [x] Record every masked resolver dependency: settings read, XHR headers/body,
      response states, DOM elements, captcha callback, normalization, timers,
      and teardown.
- [x] Prove current `/masked/*` bootstrap stops when core is absent.
- [x] Record current duplicate-request risk from the 900ms interval and
      immediate invocation.
- [x] Add fixtures for success, server failure, malformed JSON, captcha,
      invalid destination, and Continue-button pages.
- [x] Confirm the resolver uses no managed request/event/close storage itself.

### Acceptance criteria

- [x] Managed ownership and local-only dependencies are explicit.
- [x] No production or generated file changes.

---

## MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01 — Make `/masked/*` optional-core

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-MASKED-STANDALONE-BASELINE-01`

### Required work

- [x] Classify F95 thread as `core-required` and F95 masked as `optional-core`.
- [x] Add one page-lifetime ownership promise with explicit `probing`,
      `available`, and `confirmed-missing` outcomes.
- [x] Publish one short-lived `probing` policy lease at F95
      bootstrap entry, before awaiting the first ping, while preserving user
      preferences.
- [x] Reuse the existing bounded core probe for both F95 routes.
- [x] Preserve normal registration/access/lifecycle when masked detects core.
- [x] Enter local masked ownership only after ping and access probe both fail.
- [x] Treat core access responses containing disabled or blocked state as core
      present; do not bypass them with standalone mode.
- [x] Keep external hosts and captcha frames on their current branches.
- [x] Do not install a standalone click listener, resolver timer, or destination
      strategy while ownership remains `probing`.
- [x] If an add-on-owned action occurs during probing, await the same ownership
      promise and dispatch it once to the resulting mode; do not optimistically
      execute or start a second probe.
- [x] Publish the missing-core host policy once as today, then start the local
      masked owner without registering or invoking core.
- [x] Replace the probing lease atomically with `available` or
      `confirmed-missing` after the ownership promise settles.
- [x] Leave no-core F95 thread behavior unchanged.

### Required tests

- [x] Core-present masked route uses managed ownership.
- [x] Core-disabled and core-blocked masked routes do not use local ownership.
- [x] Core-missing thread route remains skipped.
- [x] Slow successful ping never starts local ownership.
- [x] A robot-fast action during probing cannot enter standalone mode before a
      later successful handshake.
- [x] Multiple early actions cannot create multiple ownership probes.
- [x] An external host opened during F95 probing does not consume a stale
      missing-core override; it waits and then follows the settled outcome.
- [x] A managed external request remains authorized during probing.
- [x] An abandoned/expired probing lease fails closed without a heartbeat.

### Acceptance criteria

- [x] Route ownership is explicit and mutually exclusive.
- [x] No masked resolution begins before ownership is settled.
- [x] `probing` is observable in tests but is never persisted as missing-core
      policy.

---

## MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01 — Mirror masked intent

**Priority:** High  
**Depends on:** `MASKED-DIRECT-MASKED-STANDALONE-CONTEXT-01`

### Required work

- [x] Extend the versioned standalone policy with normalized
      `skipMaskedLink`, default `true` when absent.
- [x] Add normalized `coreState`, `probeStartedAt`, and `probeExpiresAt` fields
      without conflating them with user intent or the missing-core force.
- [x] Mirror `skipMaskedLink` whenever core settings are read or refreshed.
- [x] Preserve it through missing-core force, expiry, recovery, and stale-write
      conflict handling.
- [x] Make local masked mode read GM policy directly without a core action.
- [x] If policy is missing/malformed/future-version, use the safe compatibility
      default `skipMaskedLink: true` while keeping host automation fail-closed.
- [x] Do not add another storage key or duplicate settings object.

### Required tests

- [x] First install without core enables masked redirect but does not enable
      unrelated standalone host automation unless missing-core policy does so.
- [x] Mirrored false suppresses local masked resolution.
- [x] Mirrored true enables it.
- [x] Core loss/recovery and policy expiry retain both preference values.
- [x] The effective host automation override never rewrites masked intent.
- [x] A requestless host decision waits on fresh `probing`, while an exact
      managed request remains independent of it.

### Acceptance criteria

- [x] One policy snapshot carries independent host and masked intent.
- [x] External and local masked reads require no core connection.

---

## MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 — Own one local resolver operation

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-MASKED-STANDALONE-PREFERENCE-01`

### Required work

- [x] Separate masked resolution transport from page lifecycle state without
      duplicating the endpoint protocol.
- [x] Make destination delivery an injected operation owned by the selected
      masked mode rather than hard-coding `location.href` in the transport.
- [x] Add `idle`, `resolving`, `captcha`, `redirecting`, `failed`, and
      `disposed` operation states.
- [x] Replace repeat interval requests with one guarded operation; polling may
      only wait for required page/captcha readiness and must never issue sibling
      XHRs.
- [x] Preserve Continue-button handling and existing loading/leaving/error DOM
      behavior.
- [x] Validate response shape and destination before navigation.
- [x] Keep captcha callback in the same operation and accept at most one token
      retry.
- [x] Bound grecaptcha readiness; if unavailable, leave the page usable and
      render a local error instead of polling forever.
- [x] Abort XHR when possible on pagehide/disposal and suppress late commits.
- [x] In managed mode, reuse the same hardened operation owner.
- [x] In managed mode, send supported hosts through the existing flow controller
      and use normal navigation only for unsupported destinations.
- [x] In standalone mode, perform no core call, request record, result event,
      managed close, local toast, or injected style.

### Required tests

- [x] Success redirects once.
- [x] Repeated enable/apply calls share one operation.
- [x] An operation requested during ownership probing starts only after the
      ownership promise resolves and uses that final destination strategy.
- [x] Continue button clicks once without XHR.
- [x] HTTP, parse, invalid response, and invalid URL failures render locally.
- [x] Captcha performs at most one token retry and redirects once.
- [x] Disposal prevents late redirect/error commits.
- [x] Managed and standalone modes use identical endpoint payloads.
- [x] The same supported destination creates a request in managed mode and
      creates no request in standalone mode.

### Acceptance criteria

- [x] No duplicate masked POST is possible per operation.
- [x] No standalone masked path reaches core or managed-host signaling.

---

## MASKED-DIRECT-MASKED-STANDALONE-VERIFY-01 — Verify dual-mode redirect

**Priority:** Critical  
**Depends on:** All previous packages

### Required work

- [x] Test the complete core-present, core-missing, disabled, blocked, slow,
      captcha, success, failure, and disposal matrix.
- [x] Include immediate and repeated user actions fired before the first ping
      response, then resolve the probe as both available and missing.
- [x] Include a native F95 click that opens an approved external host while an
      older forced policy exists and the new probing lease is active.
- [x] Verify standalone masked success can navigate to an approved host, after
      which host automation independently selects standalone mode.
- [x] Verify core-owned masked success hands the same approved host to the
      managed direct-download lifecycle with exact request ownership.
- [x] Verify navigation to an unapproved host remains manual.
- [x] Re-run Masked Direct policy, recovery, engine, signal, host-guard,
      parallel-request, and reliability groups.
- [x] Update add-on README and reliability architecture with optional-core
      masked ownership and its restoration behavior.
- [x] Run add-on lint with zero warnings and `git diff --check`.

### Acceptance criteria

- [x] F95 thread behavior is unchanged.
- [x] Core-managed masked behavior remains compatible.
- [x] Core-present supported destinations use managed download ownership;
      core-absent destinations use bare navigation only.
- [x] No-core masked pages resolve without core when masked intent is enabled.
- [x] Managed request isolation and limited standalone host safety remain intact.
- [x] Build and distribution changes occur only for the requested v1.1.2 release.
