# F95UE Masked + Direct Download Add-on

The name, namespace, add-on ID and storage identity are retained for updates.
The unreleased rework uses one standalone host pipeline. Core supplies settings
and generic F95 feedback, not origin-owned downloads. Resolve/Direct DL buttons,
masked resolving and its CAPTCHA fallback are retired.

See the [runtime contract and host matrix](../../docs/architecture/masked-direct-reliability.md)
and [execution plan](../../docs/architecture/TODO_MASKED_DIRECT_STANDALONE_REWORK.md).

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
- Only a visible, focused F95 page with core receives generic feedback.
  Missed messages are not replayed. No browser notification permission is requested.

## Maintenance ownership

| Area | Owner under src/ |
| --- | --- |
| Host aliases/package switches | hosts/metadata.js |
| Policy/route/continuation authorization | app/contexts/downloadPageController.js |
| Final-action validation and dispatch | hosts/, hosts/handlers.js |
| Local closing and handler outcomes | domain/directDownload/flowController.js |
| Focused-F95 feedback | domain/directDownload/feedback.js |
| Durable preference mirror | ports/standaloneAutomationPolicyRepository.js |
| Tab-local duplicate/stage guards | ports/standaloneRunGuard.js, standaloneContinuation.js |
| F95 settings/lifecycle | app/settings.js, app/lifecycle.js |
| Challenge gate | hosts/shared/cloudflareChallenge.js |

The archive/ tree is historical and excluded from both build modes. Do not
import it into production or add a second automation/closing protocol.

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
