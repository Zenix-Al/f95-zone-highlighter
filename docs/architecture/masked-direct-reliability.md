# Masked + Direct reliability ownership

The step-by-step host integration and review checklist lives in
[`addons/masked-direct-addon/README.md`](../../addons/masked-direct-addon/README.md).
This document records the architecture and retained compatibility contracts.

Masked + Direct is a hybrid add-on. F95 thread and `/masked/` routes use the
core registration contract. Supported download hosts run standalone and become
managed only when an exact, fresh request identity is present in the URL or the
tab's session route context. Unsupported pages perform no bridge or host work.
Narrow Google and recaptcha.net `/recaptcha/*` iframe matches form a separate
standalone context used only by the masked-link checkbox fallback; they do not
register with core or enter download-host automation.

Each live handoff is stored independently at
`f95ue.addon.maskedDirect.request.<requestId>`. Completion, failure, timeout,
close timing, result delivery, and cleanup always carry that request ID. A
missing ID is not permission to enumerate or clear sibling requests. Abandoned
records expire through their existing TTL; no migration or central request
index is required.

## Redirect identity contract

The request record and route context solve different parts of one handoff and
must not be collapsed:

1. The F95 tab creates `f95ue.addon.maskedDirect.request.<requestId>` in GM
   storage before opening the external host. This is the cross-origin source of
   truth and keeps concurrent requests isolated.
2. For Datanodes, creation also writes a bounded lookup under
   `f95ue.addon.maskedDirect.source.<normalized-file-identifier>`. The lookup
   contains request IDs, not shared mutable request state; each referenced
   request remains independently stored and validated.
3. If the userscript executes on the first external page, it proves ownership
   using the request ID, owner-tab ID, timestamp, host, and marker carried in
   the URL. It then copies that same identity into `sessionStorage` under
   `f95ue.addon.maskedDirect.routeContext`.
4. Datanodes can instead redirect to `/download` before the userscript executes
   at all, stripping every URL marker. In that case no session context can
   exist. The `/download` page waits for its displayed filename, resolves the
   source lookup, and proceeds only when it identifies exactly one live
   request whose host and source filename agree.
5. If two live requests have the same Datanodes source filename, markerless
   recovery is ambiguous and automation remains blocked. It must never select
   the newest, sole-looking, or otherwise guessed request.

Writing only URL markers or session context is insufficient because the
redirect may happen before add-on code runs. Conversely, a source lookup is
not authorization by itself: its request record must still be live and match
the Datanodes host and normalized source filename. If no exact URL identity,
fresh same-tab session identity, or unambiguous source identity exists,
automation remains blocked and the page behaves as standalone/manual.

## Retained compatibility storage

- `f95ue.addon.maskedDirect.processingDownload` is read only for an exact
  request ID created by an older add-on build. New requests are never written
  there.
- `f95ue.addon.maskedDirect.directDownloadEvent` remains the targeted GM value
  transport for cross-tab results and managed-tab close commands.
- `f95ue.addon.directDownload.tabId` remains the session identity used to
  target a result at its originating F95 tab.
- `f95ue.addon.maskedDirect.routeContext` is the same-external-tab redirect
  identity. It is required for hosts such as Datanodes that strip URL markers;
  it does not replace the GM request record.
- `f95ue.addon.maskedDirect.source.<normalized-file-identifier>` is the
  Datanodes pre-execution redirect lookup. It references isolated request
  records and refuses recovery when more than one matching request is live.
- `f95ue_dd_downloadPageCloseDelayMs` remains readable for older request
  compatibility. New close timing is stored on the owning request.
- `downloadPageCloseDelayMs` is the post-trigger managed-tab close delay. It has
  a 3,000ms minimum and no configured maximum, starts only after the host's
  final action, and never limits host automation. Each request snapshots the
  value selected on its originating F95 tab.
- Browser-owned document downloads cannot be observed reliably from userscript
  fetch/XHR hooks, so no download detector is installed.
- At the configured deadline, the originating F95 tab closes its retained
  `GM_openInTab` handle and the external page attempts `window.close()` as a
  fallback.

The compatibility keys are intentionally retained while older open tabs may
still exist. A future compatibility-removal package may delete their read
paths after those builds are no longer supported.

## Lifecycle and diagnostics

The F95 lifecycle owner registers the command listener once, reverses resources
on disable or route refresh, and acknowledges terminal teardown exactly once.
Re-registration creates a fresh owner. The direct-download listener similarly
owns and removes its GM listener ID, while bounded event-ID deduplication makes
late duplicate callbacks harmless if external cleanup is missed.

Masked + Direct creates no local toast DOM, CSS, or timer on external hosts.
The originating F95 tab may present targeted success or failure results through
the core-owned `toast.show` action. Failures also use bounded, redacted console
diagnostics: request IDs and normalized hosts may be recorded, but signed URLs,
query strings, response payloads, and remote bodies must not be included.

Every managed external-host flow is guarded by one shared, page-lifetime
Cloudflare/Turnstile monitor. A debounced DOM observer provides immediate
detection and a slow fallback poll covers non-DOM transitions without adding a
scan loop per host. Before each meaningful network, navigation, or click step,
host automation waits on that same gate. When a challenge appears at startup or
later, automation pauses without attempting to click or solve verification.
The exact request lease is renewed while the user completes it, and the
originating F95 tab receives one core-owned warning toast per challenge episode.
Normal host automation resumes only after the challenge page disappears.

Vik1ngFile support is active again for `/f/<id>` routes on both
`vik1ngfile.site` and its `vikingfile.com` alias. Both names normalize to one
host setting and use this same challenge gate before each of the two expected
download controls. Its live selector flow remains provisional until the
currently unreachable host can be verified manually.

DelaFil support is limited to `/<hex-id>/<filename>` file routes. It uses the
site-generated same-file link containing `pt` or `download_token`, performs one
real element click, and relies on the normal host polling and shared challenge
gate rather than owning another observer or timing loop.

download.gg support recognizes localized and unlocalized `/file-<id>` routes
and performs one real click on the site's enabled download form control. It
shares the bounded file-page classifier, normal polling interval, request
ownership, and challenge gate with the other host handlers.

After the click, download.gg owns an eight-second settling grace before it
reports success and starts the shared configurable managed-tab close delay.
This host-local allowance does not increase other hosts' close timing.

download.gg receives no `f95ue_*` query parameters because its page scripts are
sensitive to unexpected query state. The clean destination recovers exactly
one live GM request by normalized file route and keeps that identity in session
for completion and close handling; ambiguous same-route requests remain manual.

Google Drive preview and legacy `/open` routes are converted to the documented
`/uc?export=download&id=...` route without adding custom query parameters.
Drive confirmation forms and links are accepted only on `drive.google.com` or
`drive.usercontent.google.com`; unrelated submit controls and destinations are
not activated.

Every Drive stage recovers the exact live GM request by file ID, including the
initial preview, `/uc`, and cross-origin `drive.usercontent` confirmation.
One matching request is required; concurrent requests for the same file are
ambiguous and remain manual. A newer request for the same file from the same
originating tab supersedes that tab's older request, so Drive removing
nonessential query parameters does not create a false ambiguity. Recovered
identity is kept in origin-local session
context, so Google never receives `f95ue_*` query parameters and origin-tab
success reporting does not depend on those parameters surviving.
The authorization gate also hands its validated request snapshot directly to
the flow controller before confirmation navigation, preserving the exact
request ID, owner, and configured close delay even if route state disappears.

MixDrop support is restricted to `/f/*` on `mixdrop.ag`, `miiixdrop.net`, and
`miiiixdrop.net`. It activates an
href-less `.download-btn` once, waits the host's five-second generation window,
then requires a visible `.download-btn` with a real HTTP(S) href before issuing
the final click. It then owns a separate ten-second post-click grace before
starting shared managed closing. Both stages pass through the shared challenge
gate and managed request owner; no host-specific observer is used.

UploadHaven support is restricted to `/download/<id>`. It honors the site's
initial 20-second countdown, waits up to 60 seconds for the enabled
`#submitFree` control, and clicks it once. Because UploadHaven initiates the
download asynchronously, the handler waits ten additional seconds before
starting managed-tab closing. A route-scoped
session guard prevents the host's post-click navigation from starting the same
request a second time.

KrakenFiles support is restricted to `/view/<id>/file.html`. It waits for the
visible enabled `Download now` submit control, rechecks the shared Cloudflare
gate immediately before clicking, and gives the host three seconds to leave its
loading state before shared failure detection or managed-tab closing begins.

UploadNow support is restricted to `/<id>/share`. The handler waits for the
download-button count to remain stable for roughly two seconds and proceeds
only when exactly one visible, enabled file download exists. Zero files fail
boundedly; two or more are treated as a multi-file share, left untouched, and
reported to the originating F95 tab through the core-owned notification path.
