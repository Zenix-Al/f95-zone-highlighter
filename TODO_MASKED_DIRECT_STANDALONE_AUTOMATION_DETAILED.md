# Masked Direct Standalone Automation Detailed Plan

This plan lets Masked Direct automate supported external download hosts when
the F95UE core is unavailable, while preserving the existing managed F95
request flow unchanged.

Prepared against the repository inspected on **2026-08-08**.

---

## Problem statement

Masked Direct is installed as one userscript across F95 and supported download
hosts. On F95 it currently requires the core handshake. On external hosts it
runs without core, but its automation gate still requires a fresh managed
request created by an originating F95 tab.

This leaves users who installed Masked Direct without a working core with no
automatic host behavior, even though the host-side code is present.

The desired policy is:

- expose an `automateRegardless` user preference, defaulting to `false`;
- when the add-on conclusively fails to find core on an eligible F95 page,
  temporarily force the effective preference to `true`;
- preserve the user's original preference separately;
- when core is observed again on F95, remove the temporary force and restore
  the user's effective preference automatically;
- allow external-host automation without a managed request while that
  effective policy is enabled;
- never fabricate a managed request, publish a result to an origin tab, renew
  a request lease, or schedule managed-tab closing for standalone automation.

The implementation must represent the user's preference and the temporary
core-unavailable override as separate values. It must not overwrite the user
preference and later attempt to reconstruct it from a backup.

---

## Fixed scope

### Included

- one persisted user preference named `automateRegardless`, default `false`;
- one GM-backed external-host policy snapshot shared by the Masked Direct
  userscript across its matched origins;
- F95-side publication and clearing of a core-unavailable override after the
  existing bounded core probe reaches a conclusive result;
- an explicit host execution mode: `blocked`, `managed`, or `standalone`;
- request-independent host authorization when standalone policy is effective;
- managed-only wrappers for origin signaling, request renewal, managed result
  delivery, and managed-tab closing;
- bounded stale-policy recovery;
- exact route, challenge, ambiguity, and one-shot protections for standalone
  execution;
- focused tests, architecture documentation, and add-on validation.

### Excluded

- changes to F95 thread controls, masked resolution, Direct DL routing, or the
  shape and lifetime of managed request records;
- making `automateRegardless` default to `true` while core is healthy;
- treating a slow core response as immediately absent;
- letting an external host probe or call the core bridge;
- storing fake origin-tab IDs or fake request IDs;
- sending standalone success, failure, challenge, or close events through the
  existing cross-tab transport;
- automatically closing a manually opened external-host tab;
- weakening route classifiers, Cloudflare handling, selector validation, or
  multi-file refusal;
- adding another observer, retry framework, or host-specific persistence
  protocol;
- release builds, version bumps, or generated `dist/` edits unless requested
  separately.

---

## State and ownership contract

### Persisted user intent

`automateRegardless` is the user's desired setting. Its default is `false`.
It remains unchanged when core availability changes.

When core is available, the core settings value is authoritative and the
add-on mirrors the normalized boolean into its GM-backed host policy snapshot
so external origins can consume it without invoking core.

### Temporary core-unavailable override

Only the F95 branch can determine that core is unavailable. It may publish a
temporary override only after the current bounded ping retries and access probe
have all failed on a supported F95 route.

The override must contain at least:

- a schema/version discriminator;
- `forcedByMissingCore: true`;
- the last mirrored user preference;
- `observedAt`;
- `expiresAt`.

The override is not the user's preference. Core recovery clears only the
override and republishes the current user preference.

Because an external host cannot observe core directly, immediate restoration
is possible only after Masked Direct next executes on F95 and sees core. A
bounded expiry prevents a stale missing-core observation from forcing
standalone automation indefinitely when the user visits only external hosts.

### Effective policy

The host-side effective value is:

```text
effectiveAutomateRegardless =
  freshPolicy.forcedByMissingCore || freshPolicy.userPreference
```

Missing, malformed, unsupported-version, or expired policy data must resolve
to `false`. Do not infer missing core merely because the host cannot access it.

### Execution modes

The authorization engine returns a structured decision instead of a boolean:

```text
blocked
  Unsupported/ambiguous route, disabled policy, challenge terminal state, or
  another failed safety precondition.

managed
  A fresh exact request was proven through URL identity, session context, or
  an existing explicitly supported unambiguous source recovery.

standalone
  No managed request was proven, but effectiveAutomateRegardless is true and
  the current host route is explicitly safe for standalone execution.
```

A valid managed request always wins over standalone policy.

---

## Side-effect boundary

Host handlers may continue to use a small outcome interface, but its behavior
must depend on execution mode:

| Operation | Managed | Standalone |
|---|---:|---:|
| Run validated host action | Yes | Yes |
| Wait for shared challenge gate | Yes | Yes |
| Publish success/failure to origin | Yes | No |
| Publish challenge warning to origin | Yes | No |
| Renew managed request lease | Yes | No |
| Set active managed request | Yes | No |
| Read request-owned close delay | Yes | No |
| Schedule or request managed close | Yes | No |
| Local redacted diagnostic | Yes | Yes |

Standalone failures must stop safely and may emit a bounded local console
diagnostic. They must not write result events in hope that an origin exists.

Do not spread `if (standalone)` checks through every host module. Construct a
mode-aware execution/outcome context before invoking the selected handler, so
the existing `notifyMainFailure`, `reportAddonHealthy`, challenge notification,
lease renewal, and close paths become managed capabilities or safe standalone
no-ops in one owned boundary.

---

## Required execution order

### Wave 0 — Characterization

1. `MASKED-DIRECT-STANDALONE-BASELINE-01`

### Wave 1 — Policy and decision engine

1. `MASKED-DIRECT-STANDALONE-POLICY-01`
2. `MASKED-DIRECT-STANDALONE-ENGINE-01`

The policy package must finish before the engine consumes it.

### Wave 2 — Isolate managed side effects

1. `MASKED-DIRECT-STANDALONE-SIGNAL-GATE-01`
2. `MASKED-DIRECT-STANDALONE-HOST-GUARDS-01`

These packages may be implemented separately after Wave 1, but both must pass
before standalone automation is considered enabled.

### Wave 3 — Settings and recovery

1. `MASKED-DIRECT-STANDALONE-SETTINGS-01`
2. `MASKED-DIRECT-STANDALONE-RECOVERY-01`

### Wave 4 — Integrated verification

1. `MASKED-DIRECT-STANDALONE-VERIFY-01`

Execute one package at a time and mark checkboxes only after its behavior and
tests exist.

---

# Work packages

## MASKED-DIRECT-STANDALONE-BASELINE-01 — Freeze current authorization and side effects

**Priority:** Critical  
**Depends on:** None  
**Production changes:** None

### Objective

Record exactly which behavior currently depends on a managed request before
changing authorization.

### Required work

- [x] Trace F95 core detection through `bootstrapMaskedDirectAddon()` and the
      lifecycle access check.
- [x] Trace external authorization through `shouldRunHostAutomation()`.
- [x] Record every path that reads, updates, expires, or removes a managed
      request or source lookup.
- [x] Record every success, failure, challenge, close, and health signal sent
      to an origin tab.
- [x] Record which host routes are exact file routes and which are ambiguous,
      intermediate, collection, multi-file, or unsupported routes.
- [x] Add characterization tests proving manually opened host pages are
      currently blocked without a request.
- [x] Add characterization tests proving managed routing, redirect recovery,
      parallel request isolation, and close timing remain request-scoped.
- [x] Produce a host matrix identifying whether each handler is safe to enter
      in standalone mode without changing its selectors or navigation flow.

### Acceptance criteria

- [x] Every managed-only side effect has an identified owner.
- [x] Every supported host has an explicit standalone eligibility decision.
- [x] No production source, persisted value, or generated artifact changes.

---

## MASKED-DIRECT-STANDALONE-POLICY-01 — Persist user intent and missing-core override

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-STANDALONE-BASELINE-01`

### Objective

Create one versioned GM-backed policy repository that external origins can
read without core or managed-request storage.

### Required work

- [x] Add normalized `automateRegardless: false` to Masked Direct settings.
- [x] Define one namespaced GM key for the standalone policy snapshot; do not
      reuse request, route-context, result-event, or close-delay keys.
- [x] Implement tolerant read, normalized write, clear-override, and expiry
      behavior behind one repository module.
- [x] Preserve `userPreference` independently from
      `forcedByMissingCore`.
- [x] Publish `forcedByMissingCore: true` only after the existing F95 core
      detection sequence conclusively fails.
- [x] On successful F95 core detection and access initialization, clear the
      forced flag and mirror the current normalized setting.
- [x] On settings changes while core is available, refresh the mirror without
      changing the forced flag through unrelated code paths.
- [x] Give forced observations a documented bounded TTL and refuse malformed,
      future-version, or expired records.
- [x] Do not make an external-host page update core-presence state.

### Required tests

- [x] Default preference is false.
- [x] A healthy core plus false preference yields false externally.
- [x] A healthy core plus true preference yields true externally.
- [x] Conclusive missing-core detection forces true while preserving false
      user intent.
- [x] Core recovery restores the preserved false intent without a guessed
      backup value.
- [x] Expired/malformed/missing policy yields false.
- [x] Transient failed ping followed by successful probe never publishes the
      missing-core override.

### Acceptance criteria

- [x] No user preference is overwritten as part of core detection.
- [x] A stale missing-core observation cannot force automation indefinitely.
- [x] Policy storage has no dependency on managed request records.

---

## MASKED-DIRECT-STANDALONE-ENGINE-01 — Return managed, standalone, or blocked

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-STANDALONE-POLICY-01`

### Objective

Replace the current boolean host gate with a decision carrying authorization
mode and optional managed request context.

### Required work

- [x] Extract a narrow decision result with `mode`, normalized host, reason,
      and optional validated request.
- [x] Preserve all existing exact-request, owner-tab, freshness, session, and
      unambiguous source-recovery checks for managed mode.
- [x] Prefer managed mode whenever valid request identity exists.
- [x] Consider standalone mode only when no managed request was accepted and
      effective policy is true.
- [x] Require the current route to be explicitly marked standalone-safe in the
      baseline host matrix.
- [x] Keep unsupported and ambiguous routes blocked even under forced policy.
- [x] Ensure standalone authorization never creates, scans, or mutates a
      processing request.
- [x] Pass the decision into host execution rather than storing it in an
      unrelated global boolean.
- [x] Keep challenge monitor ownership and handler selection shared.

### Required tests

- [x] Valid request plus disabled standalone preference chooses managed.
- [x] Valid request plus enabled standalone preference still chooses managed.
- [x] No request plus effective true chooses standalone only on a safe route.
- [x] No request plus effective false remains blocked.
- [x] Stale or mismatched request may fall through to standalone only when the
      independent policy and route permit it.
- [x] Ambiguous source recovery never becomes managed accidentally.

### Acceptance criteria

- [x] Authorization mode is explicit at every host handler invocation.
- [x] Existing managed request validation is behaviorally unchanged.
- [x] Standalone authorization does not depend on origin-tab storage.

---

## MASKED-DIRECT-STANDALONE-SIGNAL-GATE-01 — Make origin communication managed-only

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-STANDALONE-ENGINE-01`

### Objective

Prevent standalone host execution from signaling, renewing, or closing a
nonexistent managed origin.

### Required work

- [x] Create one mode-aware host execution context at the controller/flow
      boundary.
- [x] In managed mode, retain the current request object and all current
      signaling and close behavior.
- [x] In standalone mode, make origin success/failure/challenge publication a
      safe local-only outcome.
- [x] Disable request lease renewal in the challenge monitor when no managed
      request exists.
- [x] Disable active-request assignment and request cleanup in standalone
      mode.
- [x] Disable managed close scheduling and `window.close()` fallback in
      standalone mode.
- [x] Ensure settings or defaults used by handlers do not require an origin
      request snapshot.
- [x] Preserve bounded, redacted local diagnostics without URLs, tokens, or
      remote bodies.
- [x] Keep mode logic centralized; do not edit every host merely to suppress
      the same side effects.

### Required tests

- [x] Standalone success produces no GM result event and no close command.
- [x] Standalone failure produces no GM result event and no request mutation.
- [x] Standalone challenge performs no lease renewal and sends no origin toast.
- [x] Managed success, failure, challenge, renewal, and close remain unchanged.
- [x] A handler calling its existing outcome callbacks cannot bypass the gate.

### Acceptance criteria

- [x] No standalone path needs a fake request ID or owner-tab ID.
- [x] No manually opened tab is closed by managed-close infrastructure.
- [x] Host modules retain one common callback contract.

---

## MASKED-DIRECT-STANDALONE-HOST-GUARDS-01 — Harden automatic direct visits

**Priority:** High  
**Depends on:** `MASKED-DIRECT-STANDALONE-ENGINE-01`

### Objective

Ensure request-independent automation acts only once on exact, safe host
routes.

### Required work

- [x] Apply the baseline standalone eligibility matrix to host metadata or one
      adjacent policy table.
- [x] Preserve every host's current route, selector, visibility, enabled-state,
      countdown, challenge, and ambiguity checks.
- [x] Add a page/session-scoped one-shot guard keyed by canonical host and
      normalized route identity.
- [x] Prevent reload, redirect, history update, and delayed DOM rerender from
      triggering the same standalone action repeatedly.
- [x] Do not let the one-shot guard weaken managed retry or redirect recovery.
- [x] Keep collection and multi-file pages manual unless a handler already
      proves exactly one intended file action.
- [x] Review clean-query hosts such as VikingFile, download.gg, and Google
      Drive without reintroducing custom query requirements.
- [x] Review Datanodes markerless identification separately; standalone mode
      must not wait for or guess a managed source lookup.
- [x] Keep Cloudflare/Turnstile behavior passive: pause and wait, never solve or
      click verification.

### Required tests

- [x] Each approved host accepts one representative direct file visit.
- [x] Refresh/rerender cannot produce repeated automatic clicks in one session.
- [x] Unsupported, challenge, missing-control, and multi-file fixtures remain
      safe.
- [x] VikingFile aliases normalize to one standalone guard identity.
- [x] Managed same-file parallel-request behavior remains unchanged.

### Acceptance criteria

- [x] Every standalone-enabled host has explicit route evidence.
- [x] No broad domain-level “click something that looks like download” fallback
      is introduced.
- [x] Hosts not proven safe remain managed-only.

---

## MASKED-DIRECT-STANDALONE-SETTINGS-01 — Expose the user preference

**Priority:** High  
**Depends on:** `MASKED-DIRECT-STANDALONE-POLICY-01`

### Objective

Expose the persistent user intent without presenting the temporary override as
if the user selected it.

### Required work

- [x] Add an `Automate supported hosts regardless of F95 request` toggle to
      the Masked Direct settings panel, default off.
- [x] Explain that direct host visits may trigger downloads automatically and
      that manually opened tabs will remain open.
- [x] Display a concise status note when missing-core fallback is currently
      forcing the effective value on F95.
- [x] Keep the checkbox bound to user intent, not the effective forced value.
- [x] Ensure saving settings mirrors the normalized user intent to GM policy.
- [x] Preserve settings sanitization and older stored settings that lack the
      new field.

### Required tests

- [x] Old settings sanitize with `automateRegardless: false`.
- [x] Forced status does not visually rewrite or persist the checkbox as true.
- [x] User true remains true after core loss and recovery.
- [x] User false is restored after core recovery.

### Acceptance criteria

- [x] UI distinguishes configured intent from temporary effective behavior.
- [x] No settings action requires an external host to contact core.

---

## MASKED-DIRECT-STANDALONE-RECOVERY-01 — Handle delayed core and stale observations

**Priority:** High  
**Depends on:** `MASKED-DIRECT-STANDALONE-POLICY-01`,
`MASKED-DIRECT-STANDALONE-ENGINE-01`

### Objective

Make fallback activation and restoration deterministic across slow startup,
core installation, updates, and long gaps between F95 visits.

### Required work

- [x] Reuse the existing full bounded ping/access probe before declaring core
      missing.
- [x] Publish at most one missing-core observation per F95 page bootstrap.
- [x] Clear the forced override as soon as a later F95 bootstrap confirms core.
- [x] Refresh the policy timestamp without creating a permanent heartbeat or
      background timer.
- [x] Define behavior when core becomes available after the add-on already
      returned from a failed bootstrap; recovery may wait for the next F95
      navigation/refresh unless an existing lifecycle signal safely proves it.
- [x] Define expiry behavior so external hosts fail closed after stale policy.
- [x] Ensure multiple F95 tabs cannot restore an older policy snapshot over a
      newer observation; compare schema generation/timestamps conservatively.
- [x] Keep storage writes bounded and avoid writing on every external page
      poll or DOM update.

### Required tests

- [x] Slow but available core does not activate fallback.
- [x] Missing core activates fallback after the final probe only.
- [x] Installing/enabling core and revisiting F95 clears fallback.
- [x] Out-of-order F95 tab writes do not resurrect an older forced state.
- [x] Expiry disables forced standalone mode without deleting user intent.

### Acceptance criteria

- [x] Core availability changes never destroy user intent.
- [x] No permanent polling or cross-origin core probing is added.
- [x] The documented restoration limitation matches actual behavior.

---

## MASKED-DIRECT-STANDALONE-VERIFY-01 — Integrated regression and documentation

**Priority:** Critical  
**Depends on:** All previous packages

### Objective

Prove standalone automation works without weakening the existing managed
system.

### Required work

- [x] Add an end-to-end matrix for core present/absent, user preference
      true/false, policy fresh/expired, request valid/invalid/missing, and route
      safe/unsafe.
- [x] Test first installation where no prior policy or settings record exists.
- [x] Test a user with Masked Direct installed but core absent on F95.
- [x] Test core recovery with both original preference values.
- [x] Test direct external visits for every standalone-approved host.
- [x] Re-run managed parallel-request, markerless recovery, challenge,
      notification, and close-delay groups.
- [x] Update `addons/masked-direct-addon/README.md` and
      `docs/architecture/masked-direct-reliability.md` with the two execution
      modes and policy ownership.
- [x] Update changelog only when preparing the eventual release.
- [x] Run add-on lint with zero warnings, applicable focused tests, full tests
      when practical, and `git diff --check`.

### Acceptance criteria

- [x] Core-managed F95 thread and masked flows remain behaviorally compatible.
- [x] Managed host execution remains request-scoped and signals its exact
      origin.
- [x] Standalone host execution requires no managed storage and emits no origin
      signal or managed close.
- [x] Missing core can force standalone behavior without changing stored user
      intent.
- [x] Core recovery restores the original effective preference.
- [x] No lint warning, leaked temporary file, generated artifact drift, or
      unrelated version change remains.

---

## Global definition of done

- [ ] Every package checkbox and acceptance criterion is complete.
- [ ] User intent and temporary fallback are stored separately.
- [ ] External origins never claim to know current core availability.
- [ ] A valid managed request always has priority over standalone policy.
- [ ] Standalone mode never publishes to or closes an origin tab.
- [ ] Existing request isolation and markerless ambiguity refusal remain intact.
- [ ] Challenge handling remains shared and passive.
- [ ] Every new listener, timer, and transient resource has lifecycle cleanup.
- [ ] Add-on lint has zero warnings.
- [ ] Applicable tests and `git diff --check` pass.
