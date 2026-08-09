# Masked Direct standalone host expansion

## Objective

Expand requestless standalone automation to every currently managed-only host
without turning a userscript domain match into blanket permission to automate.
Each host must enter through a narrow file route, retain one-shot ownership
through only its known continuation routes, and keep all standalone outcomes
local.

This plan does not change the existing managed lifecycle. A fresh exact managed
request always wins over standalone eligibility and retains its request ID,
origin notifications, recovery rules, and managed close behavior.

## Non-negotiable boundaries

- [ ] A manifest `@match` is activation scope, not automation authorization.
- [ ] Every host has an explicit entry-route classifier.
- [ ] Intermediate routes require a same-tab continuation claim where the URL
      alone is not safe enough to authorize automation.
- [ ] Standalone claims are host-scoped, route-scoped, short-lived, and cleared
      on success, failure, timeout, mismatch, pagehide, or disposal.
- [ ] Standalone execution creates no managed request, result event, origin
      notification, managed close, or core action.
- [ ] Managed request identity is evaluated before standalone policy or route
      eligibility.
- [ ] Missing-core forcing does not broaden the approved route matrix.
- [ ] Multi-file and ambiguous pages fail closed unless the handler has an
      explicit deterministic refusal or selection rule.
- [ ] Hostname aliases are exact. Do not use fuzzy spelling or substring rules
      to compensate for MixDrop-style domain variations.
- [ ] No package bumps or builds the add-on unless explicitly requested.

## Observed route inventory

| Host | Entry route | Continuation or exclusion |
|---|---|---|
| Buzzheavier / Bzzhr | `https://buzzheavier.com/<file-id>` or `https://bzzhr.to/<file-id>` | Require the primary `.download-row a.download-btn` and a signed same-origin `/<file-id>/download?t=...`; exclude mirror and preview actions. |
| Gofile | `https://gofile.io/d/<content-id>` | Require exactly one `[data-item-id]`; folders or multiple items refuse automation. |
| Google Drive | `/file/d/<file-id>`, `/open?id=<file-id>`, `/uc?id=<file-id>` | Allow known `drive.usercontent.google.com/download` confirmation only as a continuation; exclude `/drive/u/<n>/folders/*`. |
| Datanodes | `https://datanodes.to/<token>/<filename>` | Opportunistic stages must remain in the claimed tab and stop on unknown routes or ambiguous actions. |
| MediaFire | `/file/<id>/<filename>/file` and `/file_premium/<id>/<filename>/file` | Final resolved HTTP(S) download target may continue only from the claimed entry operation. |
| MixDrop | exact alias plus `/f/<file-id>` | Two-stage button generation remains one operation. Known aliases must be listed individually. |
| UploadNow | `/<locale>/share` | The route is broad; require exactly one stable visible download action before authorization can commit. |
| Vik1ngFile / VikingFile | `https://vikingfile.com/f/<file-id>` and known equivalent entry aliases | Marker-stripping or cross-origin stages require a same-tab continuation claim; generic download text alone cannot establish ownership. |
| Workupload | `https://workupload.com/file/<file-id>` | `/start/*` is continuation-only and cannot independently establish standalone ownership. |

### MixDrop alias audit

- [ ] Retain currently supported exact aliases: `mixdrop.ag`,
      `miiixdrop.net`, and `miiiixdrop.net`.
- [ ] Verify and, if confirmed live, add exact `miixdrop.com` manifest and host
      metadata support.
- [ ] Record any additional live alias separately with fixture evidence.
- [ ] Never authorize a hostname merely because normalized text resembles
      `mixdrop`.

## Package order

### Wave 0 — Characterization

1. `MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01`

### Wave 1 — Narrow single-page hosts

1. `MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01`

### Wave 2 — Direct routes with strong handler guards

1. `MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01`

### Wave 3 — Multi-stage continuation ownership

1. `MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01`

### Wave 4 — Integrated verification

1. `MASKED-DIRECT-STANDALONE-EXPANSION-VERIFY-01`

Execute one package at a time.

---

## MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01 — Freeze routes and side effects

**Priority:** Critical  
**Production changes:** None

### Required work

- [x] Add deterministic URL fixtures for every entry, continuation, malformed,
      broad, folder, multi-file, unsupported, and alias route in this plan.
- [x] Characterize current standalone eligibility for all canonical hosts.
- [x] Record every candidate handler’s clicks, navigation, page bridge,
      observers, timers, network actions, and terminal callbacks.
- [x] Identify which handlers are naturally one-page and which require a
      continuation claim.
- [x] Confirm exact managed requests bypass standalone eligibility unchanged.
- [x] Record the current behavior of manually opened pages for every candidate.
- [x] Update the route catalog if live examples differ from this plan.

### Required tests

- [x] Every observed safe and unsafe URL appears in the route matrix.
- [x] Existing approved standalone hosts retain their classifications.
- [x] Every expansion host remains requestless-blocked before production work.
- [x] Managed behavior and host settings remain unchanged.

### Acceptance criteria

- [x] Every proposed route decision has fixture evidence.
- [x] No source, manifest, version, catalog, or distribution changes.

---

## MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01 — Approve narrow single-page hosts

**Priority:** High  
**Depends on:** `MASKED-DIRECT-STANDALONE-EXPANSION-BASELINE-01`

### Hosts

- Buzzheavier / Bzzhr
- Gofile
- MediaFire
- Workupload entry route

### Required work

- [x] Add pure classifiers for exact Buzzheavier/Bzzhr file routes.
- [x] Require the Buzzheavier primary dynamic action and validated signed
      same-origin `/download` endpoint.
- [x] Add a pure Gofile `/d/<content-id>` classifier.
- [x] Preserve Gofile’s exactly-one-item guard before invoking
      `downloadContent(contentId)`.
- [x] Add pure MediaFire regular and premium file-route classifiers.
- [x] Preserve MediaFire final-link validation and reject broad landing pages.
- [x] Add a pure Workupload `/file/<id>` entry classifier.
- [x] Do not authorize direct `/start/*` visits in this package.
- [x] Register only these exact classifiers in standalone eligibility.
- [x] Keep standalone success/failure local through the existing execution
      context.

### Required tests

- [x] Every host accepts its exact entry route and aliases.
- [x] Empty IDs, extra path forms, landing pages, and unrelated pages reject.
- [x] Buzzheavier mirror and preview links are never selected.
- [x] Gofile with zero or multiple items refuses automation.
- [x] MediaFire placeholder or invalid final links fail closed.
- [x] Workupload `/start/*` remains blocked without continuation ownership.
- [x] Managed requests for the same URLs still win.

### Acceptance criteria

- [x] Four host families gain requestless entry authorization without broad
      domain fallback.
- [x] No handler emits managed side effects in standalone mode.

---

## MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01 — Approve guarded direct routes

**Priority:** High  
**Depends on:** `MASKED-DIRECT-STANDALONE-EXPANSION-SIMPLE-01`

### Hosts

- Google Drive entry routes
- MixDrop exact aliases
- UploadNow single-file share pages

### Required work

- [x] Add standalone Google Drive classifiers for `/file/d/<id>`,
      `/open?id=<id>`, and `/uc?id=<id>` only.
- [x] Explicitly reject Drive folders, root Drive pages, and missing IDs.
- [x] Preserve clean Google URLs; do not add managed markers in standalone mode.
- [x] Treat `drive.usercontent.google.com/download` as continuation-only unless
      its URL independently carries the exact file identity required by the
      classifier.
- [x] Add exact `/f/<id>` classification for every verified MixDrop alias.
- [x] Verify `miixdrop.com` before adding its manifest match and metadata alias.
- [x] Keep both MixDrop stages inside one guarded handler operation.
- [x] Add UploadNow locale-share classification without treating the route
      alone as sufficient authorization.
- [x] Require one stable visible enabled UploadNow download action; zero or
      multiple actions refuse automation.

### Required tests

- [x] Drive file/open/UC routes pass with IDs and fail without IDs.
- [x] Drive folder routes never automate.
- [x] Standalone Drive navigation creates no request record or route markers.
- [x] Every exact MixDrop alias has safe and unsafe route tests.
- [x] Similar or misspelled MixDrop domains remain unsupported.
- [x] MixDrop performs at most one initial and one final click.
- [x] UploadNow permits exactly one stable file and refuses all other counts.
- [x] Managed request ownership remains authoritative on every route.

### Acceptance criteria

- [x] Direct-route expansion does not depend on broad hostname matching.
- [x] Ambiguous Drive and UploadNow pages remain manual.

---

## MASKED-DIRECT-STANDALONE-EXPANSION-STAGED-01 — Own continuation routes

**Priority:** Critical  
**Depends on:** `MASKED-DIRECT-STANDALONE-EXPANSION-DIRECT-01`

### Hosts

- Datanodes
- Vik1ngFile / VikingFile
- Workupload `/start/*`
- Google Drive confirmation redirects where needed

### Required work

- [x] Extend the existing standalone run guard or add one bounded session-local
      continuation record; do not create a second general request protocol.
- [x] Store only the minimum continuation identity: canonical host family,
      operation nonce, normalized entry identity, allowed next stage, creation
      time, and expiry.
- [x] Scope continuation state to the same external tab/session.
- [x] Claim continuation only after an approved entry route begins.
- [x] Advance stages monotonically and reject replay, sibling tabs, unknown
      routes, aliases outside the host family, and expired state.
- [x] Clear state on success, local failure, timeout, pagehide, mismatch, or
      explicit disposal.
- [x] Add exact Datanodes token/filename entry classification.
- [x] Bound Datanodes opportunistic scanning to the claimed operation and retain
      existing final-action deduplication.
- [x] Add exact VikingFile `/f/<id>` entry classification and explicitly map
      only known cross-origin continuation aliases.
- [x] Do not let generic “download” text establish Viking ownership.
- [x] Allow Workupload `/start/*` only after a claimed `/file/<id>` operation.
- [x] Reuse continuation ownership for Drive confirmation redirects only when
      the confirmation URL lacks independently sufficient identity.

### Required tests

- [x] Direct visits to every continuation route remain blocked.
- [x] Claimed same-tab transitions advance exactly once.
- [x] Reloads cannot repeat completed stages.
- [x] Sibling tabs and mismatched file identities cannot consume a claim.
- [x] Expired and malformed continuation state fails closed.
- [x] Datanodes ambiguous action sets remain blocked or time out locally.
- [x] Viking performs at most its intended stage count.
- [x] Workupload entry-to-start succeeds; direct start remains manual.
- [x] Managed request and markerless recovery behavior is unchanged.

### Acceptance criteria

- [x] Multi-stage standalone execution is bounded by same-tab operation
      ownership rather than domain-wide permission.
- [x] No continuation record becomes a managed request or origin signal.

---

## MASKED-DIRECT-STANDALONE-EXPANSION-VERIFY-01 — Integrated host matrix

**Priority:** Critical  
**Depends on:** All previous packages

### Required work

- [ ] Build a complete matrix across every supported host and alias for managed,
      explicit standalone preference, missing-core forcing, policy disabled,
      safe route, unsafe route, and continuation route.
- [ ] Re-run standalone policy, recovery, engine, signal-gate, host-guard,
      masked resolver, parallel-request, markerless recovery, challenge,
      notification, and managed-close groups.
- [ ] Verify every standalone handler leaves a manually opened tab open.
- [ ] Verify every standalone success and failure remains local.
- [ ] Verify every managed run reports to the exact origin and retains close
      delay behavior.
- [ ] Smoke-test the route checklist manually with one live URL per host.
- [ ] Update add-on README, Greasy Fork description, reliability architecture,
      and changelog for the final approved matrix.
- [ ] Refresh deterministic add-on/API baselines only after behavior is final.
- [ ] Run add-on lint with zero warnings, applicable focused tests, full tests
      when practical, and `git diff --check`.
- [ ] Build only when explicitly requested, using `--no-bump` if the target
      release version has already been selected but not published.

### Acceptance criteria

- [ ] Every supported host has an explicit standalone decision.
- [ ] Every unsafe or unknown route fails closed.
- [ ] Managed identity always wins over standalone policy.
- [ ] Missing-core forcing cannot authorize more routes than explicit policy.
- [ ] No standalone path mutates managed storage, signals an origin, or closes a
      managed tab.
- [ ] No lint warning, temporary-file leak, stale audit, catalog drift, or
      accidental version bump remains.

## Deferred decisions

- [ ] Decide whether explicit user preference should eventually permit a wider
      experimental matrix than missing-core forcing. This plan keeps both on
      the same safe route matrix.
- [ ] Decide whether frequently changing MixDrop aliases need a documented
      maintenance cadence. Do not replace exact aliases with fuzzy matching.
