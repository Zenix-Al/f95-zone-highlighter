# F95UE Masked + Direct Download Add-on

Masked + Direct is a hybrid userscript with a deliberately limited standalone
fallback:

- On F95Zone it registers with core, resolves masked links, opens managed
  download tabs, and receives targeted results.
- On F95Zone `/masked/*`, confirmed missing core may resolve once and navigate
  directly. Standalone mode does not recreate thread observers or Resolve
  buttons; those remain core-owned.
- On supported external hosts, exact managed requests always win. Otherwise,
  only approved routes may automate when standalone policy permits it.
- On narrowly matched Google and recaptcha.net `/recaptcha/*` frames it runs
  only the existing masked-link checkbox fallback, without core registration.
- On unsupported routes it performs no automation.

Standalone execution never publishes an origin result, schedules managed tab
closing, or writes a managed request. A short-lived probing lease prevents an
external tab from consuming stale missing-core policy during the F95 handshake.

The detailed storage and redirect guarantees are documented in
[`docs/architecture/masked-direct-reliability.md`](../../docs/architecture/masked-direct-reliability.md).
This file is the implementation guide for maintaining hosts without breaking
request correlation, parallel downloads, notifications, or tab closing.

## Non-negotiable host contract

Every managed host follows this sequence:

1. The F95 tab creates one request record before opening the external page.
2. The external page proves the exact request through URL markers, fresh
   session context, or an explicitly supported unambiguous source lookup.
3. The shared Cloudflare monitor clears before automation begins and is checked
   again before every meaningful click, navigation, or network action.
4. The host handler validates its route and waits for one narrowly selected
   action.
5. The handler triggers the download exactly once.
6. Only after a successful trigger, it calls `reportAddonHealthy()`.
7. The managed tab closes after the request's configured post-trigger delay.
8. Success, failure, challenge, multi-file refusal, and close events carry the
   original request ID and owner-tab ID.
9. Request state, timers, observers, and route context are
    released on every terminal path.

Do not move `reportAddonHealthy()` before the final click. The configurable
close delay must begin only after the host has completed its own waits and final
download action.

The setting stored as `downloadPageCloseDelayMs` is the post-trigger download
managed-tab close delay. It does not limit host automation: the timer starts
only after the host handler reports that its final download action succeeded.
It has a 3,000ms minimum and no configured upper limit. Each request snapshots
the value from its originating F95 tab.

Closing deliberately has two request-scoped attempts at the same deadline. The
originating F95 tab closes its retained `GM_openInTab` handle, and the external
page attempts `window.close()` as a fallback. This redundancy is required
because userscript sandboxes cannot always close themselves.

## Ownership map

| Area | Owner |
|---|---|
| Manifest matches, grants, run timing | `addons/addons.manifest.json` |
| Host IDs, aliases, settings toggles | `src/hosts/metadata.js` |
| Canonical-host to handler wiring | `src/hosts/handlers.js` |
| Host selectors and flow | `src/hosts/<host>.js` |
| Route authorization and challenge lifetime | `src/app/contexts/downloadPageController.js` |
| Request creation, result delivery, close coordination | `src/domain/directDownload/flowController.js` |
| Isolated GM request and source lookup records | `src/domain/directDownload/processingTrigger.js` |
| Cross-tab success/failure/close transport | `src/domain/directDownload/attention.js` |
| Managed close timing | `src/domain/directDownload/managedClose.js` |
| Same-external-tab redirect identity | `src/ports/routeContextRepository.js` |
| Shared challenge handling | `src/hosts/shared/cloudflareChallenge.js` |
| Shared route classification and DOM helpers | `src/hosts/shared/` |

Host modules must not implement their own GM request protocol, core bridge,
toast DOM, cross-tab transport, Cloudflare observer, or tab-closing mechanism.

## Adding a host

### 1. Characterize the live flow

Record:

- every hostname and alias;
- the initial F95 link and every redirect;
- route patterns for file, intermediate, success, and unsupported pages;
- whether redirects preserve unknown query parameters;
- whether the userscript executes before or after each redirect;
- selectors, disabled/countdown states, and multi-file behavior;
- whether Cloudflare can appear initially or later;
- whether the final action is a click, form submit, navigation, page API call,
  fetch, or XHR;
- how success can be observed and how long the host needs after the final action.

Keep proof-of-concept scripts under `addons/reference/`. They are behavioral
references, not production code to copy verbatim.

### 2. Add manifest coverage

Add every required URL pattern to the Masked Direct entry in
`addons/addons.manifest.json`. Preserve `document-idle`, existing grants, and all
existing matches.

Use the narrowest practical path. Do not use a whole-domain match merely
because route classification also rejects unsupported pages.

### 3. Add host metadata

Add one entry to `DIRECT_DOWNLOAD_HOSTS` in `src/hosts/metadata.js`:

```js
{
  id: "exampleHost",
  canonicalHost: "download.example",
  hostIncludes: ["download.example", "www.download.example"],
  text: "Example Host",
  tooltip: "Enable direct download automation for Example Host",
}
```

All aliases normalize to one canonical host and one setting. Domain matching is
boundary-aware; never implement support with a raw substring check.

### 4. Implement a narrow host module

Use shared route, DOM, timing, and challenge helpers. A simple handler should
look like:

```js
export async function processExampleDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  if (!isExpectedFilePage()) {
    await notifyMainFailure("download.example", "Unsupported file page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const button = await waitForCandidate({
    timeoutMs: 30000,
    intervalMs: 250,
    getCandidate: findOneVisibleEnabledDownloadButton,
  });
  if (!button) {
    await notifyMainFailure("download.example", "Download button not found.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  if (!clickElement(button)) {
    await notifyMainFailure("download.example", "Download click failed.");
    return;
  }

  reportAddonHealthy();
}
```

Rules:

- Validate the route before querying controls.
- Require visible, connected, enabled elements.
- Prefer site-specific selectors over broad text scans.
- Never click when zero or multiple candidates make intent ambiguous.
- For multi-file pages, stop and call `notifyMainFailure()` with a useful
  explanation; this targets the originating F95 tab.
- Use bounded waits. Do not add recursive retries or permanent polling.
- Recheck `challengeGate` immediately before each side effect.
- Use a short documented post-click grace only when the host demonstrably
  needs it. This host-owned grace finishes before the shared close delay begins.
- download.gg currently owns an eight-second post-click grace because its
  server-side transition is materially slower than the other supported hosts.
- UploadHaven owns a ten-second post-click grace, while MixDrop owns ten
  seconds after its final generated-link click.
- Call `reportAddonHealthy()` exactly once after the final action succeeds.
- Return after `notifyMainFailure()`; never report both failure and success.

### 5. Register the handler

Import the module in `src/hosts/handlers.js` and map the canonical hostname to
it. The handler receives shared challenge, failure, success, settings, and
close-delay dependencies. Do not pass one giant application object.

### 6. Decide whether URL markers are safe

URL markers are the default and should remain so when a host tolerates unknown
query parameters.

Use clean URLs only when the host strips markers, rejects unknown parameters,
or uses query state as part of its own protocol. Clean routes require an exact
source identity:

- add the host deliberately to the clean-route decision in
  `flowController.js`;
- define a stable source identifier in `processingTrigger.js`;
- allow that host in the bounded source lookup;
- add markerless recovery and route classification in
  `downloadPageController.js`;
- require exactly one live matching request;
- preserve different-tab ambiguity rather than guessing;
- allow a newer same-tab retry to supersede its older request when appropriate.

Do not make all hosts markerless. Do not recover by “newest request,” hostname
alone, a global boolean, or enumeration of unrelated requests.

### 7. Test all contracts

At minimum add fixtures proving:

- supported aliases normalize to the canonical host;
- supported and unsupported routes are distinguished;
- no action occurs on a manual/unmanaged page;
- close timing starts only after the handler's final successful action;
- zero, one, and multiple candidates behave safely;
- challenge gating occurs before every side effect;
- the final action happens exactly once;
- success targets the originating tab and requests managed close;
- failure and multi-file refusal target the originating tab;
- configured close delay is retained, including values above 10 seconds;
- marker stripping or redirects preserve exact request correlation;
- simultaneous requests remain isolated;
- same-source ambiguity is refused;
- host-specific timers and late work cannot act after teardown.

Put host behavior tests in
`tests/groups/masked-direct-reliability.cjs` and request/redirect concurrency
tests in `tests/groups/masked-direct-parallel-requests.cjs`.

### 8. Regenerate and validate

Run:

```powershell
npm run generate:addons:catalog
npm run lint:addons -- --quiet
npm run audit:addons
npm run audit:addons:api
npm test
npm run check:addons
git diff --check
```

The catalog command updates generated catalog artifacts from the manifest.
Smoke builds must use temporary output and must not bump versions or modify
tracked distributions. Build a release artifact only when explicitly preparing
a release.

## Review checklist

Before accepting a host, verify:

- [ ] Existing matches, grants, storage keys, and host behavior remain intact.
- [ ] Canonical host and all observed aliases are represented.
- [ ] Unsupported pages produce no automation.
- [ ] Manually opened pages cannot be closed.
- [ ] Parallel requests cannot overwrite or clear each other.
- [ ] Download detection is armed before the final host action.
- [ ] Success is reported only after the final action succeeds.
- [ ] Failure and multi-file cases notify the correct F95 tab.
- [ ] Detected downloads bypass the fallback timeout.
- [ ] Undetectable downloads close only after the configured request delay.
- [ ] Cloudflare pauses and resumes the same request without auto-solving it.
- [ ] Every timer, observer, listener, and pending operation has
      bounded cleanup.
- [ ] Focused tests, the full test suite, smoke builds, and diff checks pass.
