# F95UE Masked + Direct Download Add-on

The name, namespace, add-on ID and storage identity are retained for updates.
The unreleased rework uses one standalone host pipeline. Core supplies settings
and generic F95 feedback, not origin-owned downloads. Resolve/Direct DL buttons,
masked resolving and its CAPTCHA fallback are retired.

See the [runtime contract and host matrix](../../docs/architecture/masked-direct-reliability.md)
and [rework ledger](../../docs/architecture/masked-direct-standalone-rework-ledger.md).

## User behavior

- Fresh installations default to automation on, regardless of tab origin.
  Saved false automation choices, the enabled switch and host switches apply.
- Local automatic closing defaults on with its own switch. Delay: 3500 ms by
  default, minimum 3000 ms, after a validated final download action.
- Manually opened host tabs may automate and close too. Browsers can refuse a
  close; the add-on does not detect when a file finishes saving to disk.
- Legacy policy v1 needs one ordinary F95 page visit with core available to
  mirror saved enabled/host choices into v2. External pages never probe core.
- Native links, including signed F95 /dl/ links, are untouched and not prefetched.
  Favicons are not authorization. Unsupported routes need manual handling.
- On numeric `/dl/<id>/` intermediate pages, automation clicks the native Continue
  submit button once after a 250ms delay when ready (up to 10 seconds to find it).
  Disable **Skip the F95 download countdown** to leave the native countdown alone.
  It respects the saved automation
  policy, needs no core handshake, and never closes this intermediate tab or reports
  a download as initiated. The site's own form/navigation behavior is preserved.
- Pixeldrain /l/ lists remain unsupported. Folders/multiple files require an
  approved single-file guard. Workupload start-stage health alone does not
  authorize closing or a download-initiated message.
- qu.ax five-character file pages click the validated native download link once,
  preserving its download attribute. No new tab or additional grant is used.
  Disable external download-manager interception for qu.ax if it saves HTML
  instead of the file. Existing close preferences/delay still apply.
- Akirabox supports the observed twelve-character `akirabox.to/<id>/file`
  pages only. Complete Cloudflare verification manually; automation waits and
  clicks the ready native download link. Folder routes remain unsupported.
- Only a visible, focused F95 page with core receives generic feedback.
  Missed messages are not replayed. No browser notification permission is requested.

## Maintenance ownership

| Area | Owner under src/ |
| --- | --- |
| Host aliases/package switches/routes/actions | Each host definition; hosts/metadata.js collects them |
| Shared route matching and stage descriptions | hosts/shared/routes.js, hosts/hostRoutes.js |
| Settings/route/continuation checks | app/contexts/downloadPageController.js |
| Final-action validation and dispatch | hosts/, hosts/handlers.js |
| Shared sequence/repeat execution | hosts/shared/automation.js, hosts/shared/repeat.js |
| Host timing/selector constants, including close-delay defaults | hosts/constants.js |
| F95 core bridge/readiness/toast integration | app/coreIntegration.js |
| Local closing and handler outcomes | domain/directDownload/flowController.js |
| Focused-F95 feedback | domain/directDownload/feedback.js |
| Durable automation settings | ports/automationSettingsRepository.js |
| Tab-local duplicate/stage guards | ports/standaloneRunGuard.js, standaloneContinuation.js |
| F95 settings/lifecycle | app/settings.js, app/lifecycle.js |
| Challenge gate | hosts/shared/cloudflareChallenge.js |

The archive/ tree is historical and excluded from both build modes. Do not
import it into production or add a second automation/closing protocol.

Automation settings are read directly from the GM-backed repository; there is no
separate standalone policy/effective-policy layer. The historic GM key and v2 wire
fields remain unchanged for installed-copy compatibility. Runtime callers receive
ordinary enabled/automation/host/close preferences, not legacy userPreference or
timestamp fields. A shared predicate checks enabled + automation + legacy refresh
readiness; close timing rereads the settings. Legacy v1 needs a full successful
F95 settings mirror including enabled/host choices before automation is allowed.

## Host-development contract

1. Store sanitized route/action/failure/challenge fixtures in tests/fixtures/.
   addons/reference/ is disposable, not a permanent test dependency.
2. Declare only necessary matches and exact aliases. Normalizing a host is not
   permission: validate route, action, visibility, enabled state and ambiguity.
3. Reuse bounded readiness and shared challenge helpers; recheck before meaningful
   side effects. Do not expand CAPTCHA solving or weaken multi-file refusal.
4. Preserve the existing one-shot guard and owned continuation stages. A familiar
   hostname or generic download button cannot authorize a continuation.
5. After a validated final action succeeds, call
   `reportAddonHealthy({ downloadTriggered: true })`. Plain
   `reportAddonHealthy()` means health only: it cannot authorize a toast or close.
   Already-triggered/terminal observations and initial navigation are not new
   final actions. Keep host-specific post-click grace before the shared delay.
6. Use notifyMainFailure for failure, without reporting success too. Host modules
   do not own toast DOM, cross-tab delivery, origin IDs or tab-closing timers.
7. Clean timers/listeners/observers and late work on terminal paths and teardown.

Use focused tests during development; the final full suite and real-browser
smoke are release gates. Current groups include retirement, single-pipeline,
feedback, settings, host guards and simple/direct/staged expansion. Retired
archive-only behavior is no longer executed by the default suite.

Temporary, non-version-bumping smoke builds:

```powershell
node scripts/addon-build-tools.cjs --addon masked-direct-addon --regular --release
```

Cover disabled preferences, aliases, unsupported/list/folder routes, one-shot and
staged ownership, independent tabs, challenge/teardown, health-only versus final
actions, close refusal, feedback privacy/focus/expiry and listener cleanup.
Automated tests never fetch signed F95 links or trigger live downloads.

### Host metadata and action tools

The single registry is `hosts/metadata.js:HOST_PROCESSORS`. Each processor exposes
one definition containing its package ID, exact aliases, UI labels, routes and
actions (or documented custom method). Package defaults/UI settings, handler
dispatch and route checks derive from it; do not add another alias or route table.
`hosts/handlers.js:HOST_AUTOMATIONS` is a derived dispatch view. Fourteen hosts declare
action metadata using `hosts/shared/automation.js`, including KrakenFiles and
download.gg directly; the temporary final-click adapter has been removed.

Supported tools are `click`, `navigate`, `delay` and `healthy`. Sequences await
readiness/dispatch before moving to the next action. Final initiation is opt-in
(`final: true`); intermediate clicks/navigation never imply completed downloads.
The existing execution context alone owns focused feedback and local closing.

Descriptors can declare ordered selectors or a pure selector/inspector, candidate
validation/revalidation, allowed destination checks, readiness timeout, interval,
identity-stability checks, preparation names, delay/grace and conditional actions.
Preparation names are `scroll`, `focus`, `self` and `removeRel`. Optional native
site initialization is invoked by the tool once per candidate after the function
exists. Predicates must not own timers, requests, observers or direct dispatch.

Routes use exact hosts plus path/query constraints. Entry/continuation metadata
describes identity and next stage; it does not prove ownership. The destination
controller still validates tab-local continuation records and preferences before
dispatch. A continuation-only route is not an independently authorized entry.
Actions may use `whenRoute` for terminal/stage-specific branches. Keep specialized
candidate/URL validators as pure functions rather than expanding metadata into a
general-purpose language.

Datanodes declares `mode: "repeat"`, priorities, exclusions, a 90-second maximum,
250ms poll cadence, 900ms cooldown and 5ms frame budget. The shared repeat tool owns
observation and cleanup. Idle full scans fall back to once per second; relevant
mutations may trigger sooner. Only one scan/gate wait is active. Ambiguity refuses
action, and a final dispatch is never automatically retried. Repeat processors
start a run-scope-owned operation; their initial return is not terminal completion.
Legacy timing overrides may shorten, but not extend, the metadata deadline.

Custom methods are allowed only where genuinely unique. Google Drive retains
file-ID preview navigation and confirmation form/requestSubmit fallback across
its approved origins. Pixeldrain retains HEAD validation, optional JSON error-body
handling and direct file navigation. Both expose `definition.mode: "custom"` and
a reason, and retain the same cancellation/gate/flow boundaries. Do not use this
exception to preserve ordinary click/wait loops.

The unused core observer API wrapper and observer command/no-op plumbing are
removed. External automation uses its local shared tools, never core's observer
API. Archived resolving code remains excluded. See the
[measurement ledger](../../docs/architecture/masked-direct-host-wave1-baseline.md)
for behavior tests, remaining live-smoke limits and size tradeoffs.
