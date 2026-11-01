# Standalone rework: Wave 1 ledger

Investigated 2026-10-20. Wave 1 below characterizes the pre-rework implementation;
Wave 2 progress is recorded at the end. The execution TODO has been retired;
see the [current runtime contract](masked-direct-reliability.md).

Maintenance note (2026-11-01): the historical standaloneEligibility.js table below
has since been replaced by per-host route metadata and hosts/hostRoutes.js, with
pure matching in hosts/shared/routes.js. The original findings remain historical;
the destination controller still owns continuation authorization.

## Findings that constrain implementation

1. `hosts/standaloneEligibility.js` now has rules for all 14 canonical host
   packages. Older expansion-baseline documents describe an earlier state and
   are not the current authorization matrix. Current metadata also includes
   `miixdrop.com`; historical prose describing it as unmatched is stale.
2. Host normalization is not authorization: `metadata.js` can resolve parent
   domain suffixes, while several entry classifiers use exact host checks.
   Keep route-specific exact validation; do not widen to arbitrary subdomains.
3. `app/contexts/downloadPageController.js` gives exact managed identity
   precedence, then consults standalone policy, route eligibility, continuation
   ownership and one-shot guards. Remove the first branch, not the latter guards.
4. `domain/directDownload/flowController.js:createHostExecutionContext` already
   isolates standalone outcomes from managed completion/closing. Extend that
   existing boundary for generic feedback; do not create a second host runner.
5. The provided Pixeldrain `/l/<id>` destination is NOT an approved standalone
   route today. Both the classifier and direct API-file path extraction recognize
   `/u|d|f/<id>`, not lists. Keep `/l/` blocked until separately characterized.
6. Host `reportAddonHealthy()` callbacks generally mean the final action was
   triggered, not that a file finished downloading. Some terminal/already-triggered
   branches also call it. Audit these call sites before allowing a toast or close;
   a health callback alone is not proof of a new successful action.
7. Original F95 anchors use `noopener`; favicon hints reveal only a host. The new
   pipeline must not depend on recovering origin ownership through these anchors.

## Dependency / disposition ledger

Paths below are relative to `addons/masked-direct-addon/src/`. “Adapt” means edit
in place and preserve the retained responsibilities, not replace the subsystem.

| Component | Current callers / coupling | Rework disposition |
| --- | --- | --- |
| `app/createMaskedDirectApp.js`, `app/context.js`, `app/runtime.js` | Bootstrap composes F95 thread, masked, external and CAPTCHA contexts; core availability affects standalone policy | Adapt: settings/feedback on F95, one external runner; disconnect masked/CAPTCHA contexts and managed wiring |
| `app/contexts/threadPageController.js` | Thread scanning, mutation sync, Resolve/Direct DL buttons; invokes resolution and `routeToDirectDownload` | Archive button/resolution behavior; remove observers, event listeners and styles owned only by it; native links remain untouched |
| `app/contexts/maskedPageController.js`, `maskedResolutionTransport.js` | Masked route resolution and checkbox fallback, supplied by app composition | Archive masked-specific implementation outside runtime imports |
| `app/maskedDestinationDelivery.js` | Delivers a resolved destination into managed routing | Archive; no replacement destination-resolver pipeline |
| `domain/directDownload/flowController.js` | Thread/masked routing, request creation, owner identity, managed success/failure/close; also standalone execution context | Split by responsibility: retire routing and managed callbacks; retain/adapt host execution context and diagnostics |
| `app/managedTabs.js`, `domain/directDownload/managedClose.js` | `GM_openInTab` handles, request-associated close timers, origin close and local managed fallback | Remove from runtime; optional standalone local close is a separate explicit setting, not an ownership fallback |
| `ports/processingDownloadRepository.js`, `domain/directDownload/processingTrigger.js` | Flow creates requests; external controller reads exact IDs/source lookup and renews them | Retire request/source ownership reads and writes after consumer removal |
| `ports/routeContextRepository.js` | External startup and attention recover request/origin markers through redirects | Retire managed identity storage; do not remove standalone continuation storage |
| `domain/directDownload/attention.js` | Cross-origin GM value-change event transport; origin targeting, acknowledgements and managed close timers | Adapt bounded transport/lifecycle for generic focused-F95 feedback; remove targeting and close semantics |
| `app/contexts/downloadPageController.js` | Managed precedence, source recovery, standalone gate, challenge monitor, one-shot and continuation guards | Adapt to a single policy/route/continuation decision and existing handler dispatch |
| `hosts/handlers.js`, individual host modules | Shared processors receive failure, healthy, challenge and execution context callbacks | Retain processors and host-specific guards; audit callbacks for truthful outcome evidence |
| `hosts/shared/managedNavigation.js` | Imported by `hosts/workupload.js` to preserve managed URL parameters | Remove marker propagation only; preserve validated `/start/` navigation and standalone continuation ownership |
| `ports/standaloneContinuation.js` | External controller claims entry/next-stage operations across navigation | Retain: distinct from F95 request IDs; bounded stage and identity checks must survive |
| `ports/standaloneRunGuard.js` | External controller prevents repeated host execution and releases incomplete runs | Retain; verify refresh/back, redirects and concurrent independent tabs |
| `hosts/shared/cloudflareChallenge.js`, DOM/file-page helpers | Shared handler/controller readiness, validated actions and challenge waits | Retain; no challenge bypass or unbounded retry expansion |
| `app/settings.js`, `ports/downloadSettingsRepository.js`, host metadata | Core settings and mirrored host/close preferences consumed on external hosts | Adapt obsolete controls; preserve storage identity and package toggles; resolve policy decisions below first |
| `ports/standaloneAutomationPolicyRepository.js`, `app/coreAvailability.js` | Saved `automateRegardless`; temporary missing-core override, probing lease and recovery | Retain explicit user preference; retire core-forced host authorization/probing when single pipeline replaces dual mode; preserve core readiness for F95 integration |
| `app/pageBehavior.js`, `app/lifecycle.js`, style controller, constants and API adaptors | Mixed thread/masked/host lifecycle and UI responsibilities | Adapt by call-site ownership; do not delete shared teardown, settings or toast support wholesale |

Archive location: `addons/masked-direct-addon/archive/`, with historical README;
no runtime imports, separate build target, new framework, or blanket move of shared
host code. Reachability and manifests must be checked after disconnection.

## Current host capability ledger

All packages below have a managed handler and a standalone eligibility rule today.
That is code evidence, not a live-host pass. Host aliases come from `metadata.js`;
route behavior comes from `standaloneEligibility.js` and the named handler module.
Every runner uses the challenge gate; individual action waits/validators stay intact.
Final action evidence below is **initiation**, never browser file-write completion.

| Canonical host and declared aliases | Standalone entry / scope | Stages, final action and retained limits |
| --- | --- | --- |
| `buzzheavier.com`, `bzzhr.to` | Exact file-page classifier; not arbitrary host pages | Bounded primary-anchor discovery, validated signed same-origin download endpoint; click initiation |
| `gofile.io` | `/d/<content-id>` content page | Page-realm download bridge; content readiness/alerts and exactly-one-item guard; do not auto-download whole folders/lists |
| `drive.google.com`, `drive.usercontent.google.com` | Known file-ID preview, `/open`, `/uc`, or supported download entry | Validated confirmation form/link; owned `drive-confirmation` continuation when identity disappears; Drive folders remain excluded |
| `pixeldrain.com` | Exact `/u/`, `/d/`, `/f/` file ID | HEAD validation then API-file navigation, or bounded fallback button; `/l/` list is an explicit unresolved gap |
| `krakenfiles.com`, `www.krakenfiles.com` | `/view/<id>/file.html` | Visible enabled `download now` submit action; retains candidate and challenge checks |
| `datanodes.to` | Entry classifier plus qualified `/download` behavior | Preserve single-file evidence, action scoring/cooldowns, final marker and owned `datanodes-download` stage; remove only managed source lookup |
| `delafil.se` | Hex-token/filename file page, including tokenized form | Validated action/token navigation; terminal/tokenized branches may report healthy without initiating a new download |
| `download.gg`, `www.download.gg` | Exact classifier-approved file route (including supported locale prefix) | Validated visible action, bounded waits and existing 8-second post-click grace |
| `vik1ngfile.site`, `vikingfile.com` | Classified file entry | Preserve owned staged continuation, action validation and cross-origin constraints; generic buttons alone cannot authorize a stage |
| `mediafire.com`, `www.mediafire.com` | Classified regular/premium file routes | Validated final anchor or supported initialization path; final navigation/click is initiation |
| `miiiixdrop.net`, `miiixdrop.net`, `miixdrop.com`, `mixdrop.ag` | Exact `/f/<id>` entry | Two actions on one page: generate, wait, validate final link, click; keep grace/one-shot protection |
| `uploadhaven.com`, `www.uploadhaven.com` | Classifier-approved `/download/<id>` route | Final-action/session-trigger guard and post-click behavior; already-triggered health is not a fresh notification |
| `uploadnow.io`, `www.uploadnow.io` | Supported locale `/share` route, qualified by DOM | Require exactly one stable visible enabled download button; zero/multiple candidates remain blocked |
| `workupload.com` | `/file/<id>` entry | Validated same-host `/start/<id>` navigation and owned continuation; remove marker copying, not continuation protection |

Host expansion is NOT automatic in this rework. Wave 3 must validate every changed
route with fixture tests and record gaps; multi-file/list routes require an explicit
policy and host-specific evidence, not a broader regex.

## Settings contract: confirmed versus pending

Confirmed: preserve `@name`, namespace, `masked-direct-addon` ID, storage namespace,
add-on enabled state and per-host package preferences. Retire `skipMaskedLink` and
`directDownloadLinks` UI because their Resolve/Direct DL actions are retired; those
fields are not authority to turn standalone automation on. External operation must
not depend on core presence or a missing-core override in the new architecture.

Current saved settings default `automateRegardless` to false. Current policy mirrors
that choice but can temporarily force requestless automation after missing core.
Do not silently reinterpret an existing false preference as consent to automate.

User-confirmed behavior after Wave 1:

- Automate regardless of origin, default on for new installs, while preserving
  existing enabled/disabled choices and per-host settings. Neither F95 referrer,
  opener, URL markers, nor core availability authorizes the sole host pipeline.
  Existing storage may materialize defaults: do not guess that stored false is
  an unset value; preserve it conservatively.
- Local self-close defaults on with a separate off switch; retain the existing
  3500-ms delay and 3000-ms minimum. Close only after a validated final download
  action, not on startup, health-only callbacks, failure or challenge. Browser
  refusal is harmless. This does not detect completion of browser file writes.

These decisions are recorded for subsequent settings/self-close implementation.
No settings migration or new default has been applied by Wave 1.

## Test disposition and next-wave gates

- Preserve all existing `tests/groups/masked-direct-*.cjs` groups for now. No tests
  were removed, weakened, or run against the site in this documentation-only wave.
- Historical characterization: `parallel-baseline`, `standalone-baseline`,
  `standalone-expansion-baseline`, `masked-standalone-baseline`. Keep as evidence
  until their replacements clearly distinguish historical versus shipped contracts.
- Deliberately retired assertions: masked context/preference/runtime fallback,
  managed request precedence and marker/source recovery, origin-targeted events,
  managed tab closing and parallel owner correlation. Replace these with negative
  runtime/build reachability assertions and focused-F95 feedback coverage.
- Retain/adapt `standalone-policy`, `standalone-engine`, `standalone-signal-gate`,
  `standalone-host-guards`, `standalone-settings`, `standalone-recovery`, expansion
  simple/direct/staged tests and reliability host assertions. A whole group may
  contain both retired and retained behavior: classify individual tests before edits.
- New evidence required: explicit enabled/disabled preservation, no core-forced
  automation, no F95 injected buttons, native links untouched, no masked code in
  bundles, no origin-owned close, independent concurrent tabs, and generic event
  focus/expiry/deduplication. Preserve continuation and challenge regression coverage.
- Disposable input is still under `addons/reference/`; no permanent test currently
  depends on `new-design.html`. Future fixtures must remove real user IDs and signed
  tokens and live under `tests/fixtures/`.

Wave 1 validation: documentation links and diff hygiene only. No live downloads,
signed-link fetches, production behavior changes, builds or version bumps.

## Wave 2 implementation evidence

- Archived masked/thread resolution, managed request/source identity, route context,
  attention/closing, UI styles, managed navigation, and mixed-module pre-rework
  snapshots under `addons/masked-direct-addon/archive/`. Shared host logic remains
  in `src/`; archive imports use historical copies where available.
- Removed masked and CAPTCHA runtime contexts, F95 button injection, managed
  dispatch/recovery/lease renewal and origin-owned tab closing. Workupload still
  navigates its validated target, without copying retired managed URL parameters.
- Retained standalone route classifiers, one-shot guard, staged continuation store,
  challenge monitor and host processors. Exact old URL markers grant no authority.
- Removed masked/CAPTCHA matches, `GM_openInTab` and currently unused value-change
  listener grants, plus retired page/observer/style capabilities. Generic feedback
  may deliberately reintroduce value-change grants in Wave 4, without origin routing.
- Removed obsolete thread-button controls; preserved stored preferences and old
  bounded records without enumeration or broad deletion. Policy defaults, optional
  local closing, and feedback remain deliberately unfinished until subsequent waves.
- New production retirement tests inspect regular/minified import graphs and verify
  native-link preservation, disabled policy, and local callback behavior. Two managed
  precedence assertions in expansion groups now explicitly exercise archived code;
  remaining host checks in those groups still exercise production.
- Broader legacy managed/masked tests need archival adaptation/replacement in Wave 5.
  Do not run a release or describe the full suite/CI as verified at this checkpoint.

Focused evidence: 31 tests passed across retirement, standalone host guards, and
simple/direct/staged expansion groups. Add-on lint, diff hygiene and both temporary
smoke builds passed. No version or tracked distribution was updated. No live site
request/download was made. F95 name, namespace, ID and version remain unchanged.

## Wave 3 implementation evidence

- A single standalone decision checks exact declared host aliases, saved automation
  and enabled state, host packages, routes and continuation claims. Core presence,
  origin/referrer, old request markers and forced/probing observations grant no access.
- Same GM policy key now stores version 2: enabled, user preference, host package
  switches, auto-close and close delay. No new database or origin-request storage.
  Fresh installs default on; legacy v1 booleans are preserved, but v1 lacks enabled
  and host-package mirrors. Existing installations wait for one successful F95
  settings read before resuming. Partial enabled updates cannot discard this guard.
  Malformed/newer policy or read failure blocks rather than authorizes automation.
- F95 enable/disable and successful settings reads mirror preferences for independent
  host use. Failed reads do not publish fallback defaults over the existing mirror.
  Host pages never ping core or wait for an ownership/probing lease.
- Final-action callbacks now explicitly carry `downloadTriggered: true`; ordinary
  health/terminal/already-triggered branches do not authorize closing. Local closing
  defaults on with a separate switch, waits the normalized delay (3500-ms default,
  3000-ms minimum), then rechecks current policy/host/challenge state. Failure,
  teardown or pagehide cancels; browser refusal is harmless. No OS file-completion
  claim, origin handle or per-download result routing has returned.
- Workupload's owned `/start/` health callback is deliberately non-closing without
  additional final-action evidence. Pixeldrain `/l/` remains blocked, not treated as
  `/u|d|f/`; supporting a list needs its own DOM fixture and selection policy.
- Existing route/one-shot/continuation machinery remains tab-local. Datanodes now
  cleans its initial scan timer and scan resources on pagehide; a disposed challenge
  gate refuses later action waits, rather than permitting post-navigation clicks.
- Tests cover default and legacy policy, corruption/storage failure, durable settings,
  host/list/folder rejection, explicit evidence versus health-only callbacks,
  close delay/off/challenge/failure/refusal/teardown, and controller/guard integration.
  Existing single-file and staged host fixtures remain in the focused validation.

Wave 3 focused validation: 37 tests passed. Full legacy-suite adaptation and live-host
smoke remain later gates; this is not a release or full-CI claim. Generic F95 feedback
is still Wave 4. The archived forcing/probing policy remains historical only.

## Wave 4 implementation evidence

- Added `domain/directDownload/feedback.js` using the existing GM value-change
  transport pattern, not the archived origin bus. One fixed key stores only
  version, random event ID, timestamp, canonical host and bounded outcome.
  No URL, signed parameter, filename, origin tab, request ID or close instruction
  is sent. A stale slot may remain stored, but is ignored after 15 seconds.
- External explicit final-action evidence publishes `initiated`; ordinary healthy
  callbacks do not. Failure/challenge messages use fixed generic text and do not
  forward handler errors or URLs. Publisher failures are isolated from handler
  outcomes and local closing; no publisher waits/retries or changes download state.
- Core-authorized F95 pages subscribe to new remote events only. `hasFocus()` and
  visible-document checks gate each toast invocation. Hidden/unfocused events are
  consumed without display, never queued for later focus. No mailbox read occurs
  at startup, reload, or BFCache resume, so historical values are not replayed.
- Per-page memory retains at most 64 event IDs; bursts allow three messages per
  two seconds without timers or queued trailing messages. Focus gating selects the
  active page among F95 tabs; this is best-effort feedback, not a new distributed
  exactly-once or origin ownership service. Concurrent GM writes can be coalesced
  by managers; missing feedback never retries a file operation.
- F95 matches now cover ordinary pages, not only threads; runtime classification
  explicitly excludes `/masked` and `/dl`. Existing name, namespace, ID, version
  and host matches remain unchanged. Restored only the GM value-change listener
  grants needed for feedback; no `GM_openInTab` or Notification permission.
- Add-on disable/teardown removes listeners and invalidates late callbacks;
  pagehide suspends delivery and pageshow reattaches without replay. A missing core
  means no F95 subscriber, while independent host automation remains operational.
- Tests cover payload privacy, focused/hidden/multiple-tab behavior, malformed and
  expired/future events, duplicate/reload behavior, bounded bursts, failure isolation,
  close independence, BFCache, F95 route scope, and enable/disable integration.

Wave 4 focused evidence: 46 tests passed across feedback and retained standalone/
retirement/host-guard/staged groups. Full legacy-suite adaptation and browser smoke
remain later gates; no version bump or tracked distribution rebuild is included.

## Wave 5 reconciliation evidence

- Replaced the current add-on README, GreasyFork description and reliability/host
  matrix with the actual standalone contract and caveats. Historical baseline docs
  carry explicit notices linking current behavior; name and storage identity remain.
- Simplified automation wording and removed dead old close-delay transport and
  button-style lifecycle plumbing. Those implementations are recoverable in the
  archive. Enabling a previously disabled upgrade now rereads settings to populate
  the new mirror instead of requiring another reload.
- Retired-contract tests explicitly load archive snapshots and are prefixed
  HISTORICAL, including masked resolution, managed requests/closing, old policy
  forcing and handoff storage. No tests were skipped. Mixed groups retain current
  production host checks; source layout, settings, route and manifest assertions
  were changed to test the new runtime, not waived.
- Added a sanitized permanent native-link fixture and tests for delayed/hidden
  links, isolated tab guards/closing, long close delays, disposed challenge gates
  and enable-after-upgrade settings refresh. No test depends on disposable reference
  files or fetches a real signed link/download.
- Targeted validation: 160 tests passed across all masked-direct groups and selected
  add-on/matrix/integration boundaries; source/test lint, docs, inventory and diff
  checks passed. Temporary regular/release bundles exclude archived code.
- Comparable add-on-baseline release metric: 170,808 bytes before the rework versus
  107,426 now (37.1% smaller). The separate temporary minified smoke output is
  90,164 bytes; do not confuse that build representation with the audit metric or
  a final installed release artifact. Affected baseline/API/size reports are refreshed.

The full repository suite, real-host smoke and release/version decisions remain
Wave 6. This checkpoint does not claim final CI readiness or live-host verification.

## Final-wave release preparation — 2026-10-20

- Built Masked + Direct v1.3.0 in release mode; name, namespace and storage identity
  retained. Core version unchanged. New numeric F95 download pages click native
  Continue once after 250ms when skip is enabled; this intermediate never closes.
- Added the default-on skip setting and mirrored policy. Disabling it leaves the
  native countdown untouched. Old resolver/managed ownership remains archived.
- All 168 focused tests passed, plus add-on lint, eight report checks, manifest,
  catalog, structure, docs, inventory and diff checks. Regular/release smoke coverage
  is included in the focused build tests. Reports refresh after normal builds;
  safety thresholds and historical comparison baselines are not auto-approved.
- User full-suite and actual host/browser checks remain pending. No release was
  published and no Git commit/push was made.
