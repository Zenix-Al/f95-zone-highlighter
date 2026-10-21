# Standalone download automation: current runtime contract

This describes the unreleased rework, not a new release. The historical script
name, namespace, masked-direct-addon ID and storage identity remain unchanged.
The [archive](../../addons/masked-direct-addon/archive/README.md) holds retired code;
the [maintenance guide](../../addons/masked-direct-addon/README.md) describes host integration.

## Authorization and state

One pipeline checks enabled/automation preferences, exact declared aliases, host
switches, approved routes, one-shot guards and owned continuation stages.
External hosts never ping core or require F95 provenance. Native F95 links are
not intercepted/prefetched; favicons are not download identity. Masked and /dl/
routes no longer use the old resolver. Numeric `/dl/<id>/` pages optionally click
the native Continue button once after a 250ms delay, waiting up to 10 seconds for
readiness. Saved automation and skip preferences apply; no self-close or host-success
feedback is attached to that intermediate action. Old `/masked` routes stay inert.
No origin-owned tab or per-file result protocol remains.

The GM key f95ue.addon.maskedDirect.standaloneAutomationPolicy now holds policy v2:
enabled, automation, host switches, local-close choice/delay and upgrade state.
Fresh defaults are on; saved false choices remain false. Read/API failure or
malformed/newer policy blocks rather than authorizes automation. Legacy v1 did
not mirror all enabled/host choices, so one successful F95 settings read is needed;
partial enabled updates cannot remove that safeguard. No forcing/probing TTL remains.

Existing one-shot and continuation records stay tab-local and bounded. A stage
cannot authorize itself from a generic button. Retired request/source/route
records are no longer consumed or broadly deleted.

## Final-action evidence and closing

Only `reportAddonHealthy({ downloadTriggered: true })` after a validated final
action permits initiation feedback or closing. Health-only/already-triggered or
terminal observations and initial stage navigation do not.

Closing defaults on, independently switchable. It waits 3500 ms by default
(minimum 3000 ms), then rechecks current automation, host/close switches and challenge
state. Failure/pagehide/teardown cancel. Browser refusal leaves the tab open.
Manual host tabs follow the same rules. Browser file-write completion is not observed.

## Current host matrix

Exact aliases live in src/hosts/metadata.js. Metadata normalization does not
authorize arbitrary subdomains.

| Package | Retained route/action boundary |
| --- | --- |
| Buzzheavier/Bzzhr | File route, validated signed same-origin action |
| Gofile | Content readiness, exactly one file and page bridge; multi-file refusal |
| Google Drive | Known file-ID entry and owned confirmation; folders excluded |
| Pixeldrain | Exact /u/, /d/, /f/ file routes; /l/ lists remain blocked |
| KrakenFiles | Exact view/file route and visible enabled submit |
| Datanodes | Classified entry/owned stage, unambiguous action scoring and cooldown |
| DelaFil | Hex-token/file route; tokenized terminal health is non-closing |
| download.gg | File/locale route, validated action and post-click grace |
| Vik1ngFile/VikingFile | Exact entry and owned continuation |
| MediaFire | Regular/premium file route and validated final action |
| MixDrop | Exact alias/file route, bounded generation/final-link stages |
| UploadHaven | Download route/recent-trigger guard; no fresh completion on reload |
| UploadNow | Locale share and exactly one stable actionable file |
| Workupload | File and owned same-host start stage; start health alone does not close |

Shared challenge checks precede meaningful actions; disposed gates refuse later
waits. Datanodes clears scan resources on pagehide. Unsupported routes require
manual use, not relaxed guards or guessed ownership.

## Generic focused-F95 feedback

The fixed GM mailbox f95ue.addon.maskedDirect.hostFeedback.v1 contains only
version, random event ID, timestamp, canonical host and initiated/failure/challenge
outcome. No filename, signed URL, origin tab, request ID or close command is sent.
Validity is 15 seconds, memory is capped at 64 event IDs, and bursts permit three
toasts per two seconds without queued trailing messages.

Only visible, focused, enabled F95 pages with core invoke its toast API.
Hidden/unfocused events are discarded, not replayed on focus. Startup/reload/
BFCache resume never reads old mailbox state. Disable/teardown remove listeners;
pagehide suspends and pageshow reattaches without replay.

This is best-effort feedback, not a durable queue or distributed exactly-once
protocol. No listener/core means no feedback; bursts or manager coalescing may
lose messages. Delivery failure never alters host outcomes, retries or closing.
No browser Notification permission, idle polling, or new ownership service exists.

## Evidence

See the [ledger](masked-direct-standalone-rework-ledger.md) and
[plan](TODO_MASKED_DIRECT_STANDALONE_REWORK.md).
Current coverage includes retirement, pipeline, feedback, settings and retained
host/staged fixtures. Archive-only tests have been retired; historical baseline
documents remain reference evidence, not current feature promises.
Automated tests use local fixtures/mocks. Live-host smoke and the final full suite
remain release gates.
