# Masked + Direct: standalone-first rework

Status: Final wave release preparation complete for add-on v1.3.0;
user full-suite and real-host browser checks remain pending.
Site-change amendment: numeric `/dl/<id>/` pages now have native Continue-button
automation (bounded wait, one click, saved policy, no self-close). Old POST resolving,
CAPTCHA fallback and origin-owned routing remain retired. Earlier statements that
all `/dl/` pages are inert are superseded by this narrowly scoped amendment.
See the [coupling and host ledger](masked-direct-standalone-rework-ledger.md).
Implement one wave at a time; do not treat this document
as authorization to release, bump versions, or rewrite unrelated architecture.

## Agreed direction

- Keep the current userscript `@name`, `@namespace`, add-on ID, and storage identity.
- Retire masked-link resolution from the shipped add-on; archive its implementation.
- Use one external-host automation pipeline, based on the existing standalone engine.
- Remove F95-origin-owned tab closing and managed per-download request routing.
- Completion feedback is generic, for example `Pixeldrain: download initiated`,
  shown only in an active F95 tab. No browser Notification permission or API.
- F95 remains a settings/feedback integration, not a second automation engine.
- Preserve useful host handlers and existing safety machinery. This is an in-place
  simplification, not a replacement framework or a rewrite of every host adapter.

## Evidence and limits

The supplied `addons/reference/new-design.html` contains signed-looking F95
`/dl/<post-id>/?...` anchors, not destination file URLs. Its favicon CSS exposes
host hints, including Pixeldrain; a hidden duplicate Drive anchor is also present.
The user observed one such link redirect to `https://pixeldrain.com/l/<id>`.
The sample does not establish redirect status, parameter preservation, or destination
file identity. No implementation should assume those properties.

The current flow creates managed request records and markers in
`domain/directDownload/flowController.js`. External startup in
`app/contexts/downloadPageController.js` branches between managed and standalone
decisions. Existing standalone policy, route guards, one-shot protection and staged
continuations already exist and are the starting point.

Reference files are disposable. Copy a minimal, sanitized fixture into
`tests/fixtures/` before writing a test; do not import reference HTML or signed URLs
into production or permanent tests.

## Wave 1 — Coupling ledger and behavior contract

- [x] Map imports/callers for masked resolution, thread buttons, managed markers,
  request/source storage, route context, managed tab handles, close/result transport,
  standalone policy, continuation storage, settings, and host navigation helpers.
- [x] Classify each dependency: archive, remove from runtime, retain unchanged,
  adapt to standalone, or unresolved. Inspect shared dependencies before deleting.
- [x] Record each supported host/alias and route: current managed capability,
  standalone capability, single-file/list/folder, entry/continuation stages,
  success signal, and challenge handling. Do not assume all managed routes are
  already standalone-safe.
- [x] Preserve the existing tests as characterization until replacement coverage
  exists. Identify which assertions deliberately describe retired behavior.
- [x] Confirm public settings behavior: automate supported routes regardless of
  origin, default on for new installs; preserve existing explicit enabled/disabled
  and host choices. No F95 provenance or core-presence gate.
- [x] Agree on self-close default and delay: enabled by default, independently
  switchable, existing 3500-ms default and 3000-ms minimum; no origin ownership
  requirement. Only close after a validated final download action and the delay.
  Browser refusal leaves the tab open harmlessly; file-write completion is not observable.

Exit: concrete host and dependency ledgers; unresolved behavior choices are visible.

Wave 1 complete, including user-confirmed defaults. Runtime changes belong to
later waves; no settings migration or behavior change has been applied yet.

## Wave 2 — Archive masked code and disconnect F95 download ownership

- [x] Archive masked-specific implementation and a historical README under
  `addons/masked-direct-addon/archive/`, outside the runtime source tree. Document
  its former entry points, dependencies and recovery requirements; not a second
  maintained build target. Do not move an entire shared module if only part is retired.
- [x] Remove runtime imports/registration for masked routes, resolution transport,
  masked-only CAPTCHA frames, and missing-core masked fallback.
- [x] Remove old thread Resolve/download actions that require known destination
  URLs or exact origin-owned handoffs. Keep ordinary site links working unchanged.
- [x] Remove origin-owned tab handle registration/closing, per-request result
  acknowledgements, request/source lookup records and route markers once no retained
  consumer needs them. Do not replace them with newest-request or host-only guesses.
- [x] Separate standalone continuation identity from retired managed request identity;
  retain the former wherever a host needs safe multi-page progression.
- [x] Stop reading/writing retired storage. Let obsolete bounded records expire or
  document an exact, limited cleanup; never erase unrelated preferences or requests
  owned by another feature. No new database/schema merely for this rework.
- [x] Trim obsolete `@match`, `@connect`, grants, constants and settings only after
  verifying remaining host handlers and core settings do not need them.

Exit: archived code is unreachable from the bundle; no masked or origin-close runtime.

Wave 2 evidence: `masked-direct-retirement` verifies both bundle import graphs,
retired contexts, untouched native links, no managed-marker authorization and no
origin-close callbacks. Obsolete records are left untouched, not purged. Existing
standalone policy/defaults and generic feedback/local-close work remain for later
waves. Some legacy test groups still target removed contracts; their explicit
historical/replacement adaptation is not a release gate pass (Wave 5).

## Wave 3 — One external automation pipeline

- [x] Replace managed-versus-standalone dispatch with one standalone route/policy
  decision, reusing existing handlers, guards and continuation primitives.
- [x] Remove external-host core-readiness dependence and missing-core forcing/probing
  policy where no longer meaningful. F95 settings may still use the core bridge.
- [x] Preserve exact host matching, final-action validation, one-shot guards,
  bounded retries/timeouts, teardown, cooldowns and challenge handling.
- [x] Convert previously managed-only routes individually, with fixture evidence;
  if a route cannot safely run without origin identity, leave it explicitly blocked
  and document the capability gap rather than pretending feature parity.
- [x] Specifically inspect Pixeldrain `/l/<id>`: distinguish list and single-file
  behavior, selection/user action, and what constitutes a valid completion signal.
  Do not equate it with the existing `/u|d|f/<id>` policy.
- [x] Concurrent independent tabs remain allowed; retire origin-controlled parallel
  orchestration/UI, not concurrency itself. No shared global run flag or single
  mutable active-download record that lets one tab overwrite another.
- [x] If self-closing is approved, keep it local to the destination, success-gated
  and cancellable on teardown. Never close on timeout, challenge, error, or merely
  finding/clicking a button. Do not promise that browsers will allow every close.

Wave 3 capability limits: no unsupported route was broadened merely to replace
managed authorization. Pixeldrain `/l/` stays blocked: the supplied F95 anchor is
not list-page DOM evidence. Workupload `/start/` retains owned navigation/health
handling, but that health-only callback does not authorize local closing.
Legacy policy v1 lacks enabled/host settings: one F95 settings read is needed to
mirror them into policy v2 before automation resumes. No external core polling is
introduced. Fresh installs default on; saved false preferences remain false.

Exit: one pipeline; preserved or explicitly documented host capabilities.

## Wave 4 — Generic feedback to an active F95 tab

- [x] Reuse existing cross-origin userscript storage/event transport where suitable;
  inspect it first. Do not use cross-origin BroadcastChannel or depend on `opener`,
  referrer, `/dl/` marker forwarding, or exact origin-tab identity.
- [x] Publish bounded generic host/outcome events with unique event IDs and short
  expiry. Include no signed URLs, download tokens, filenames or personal data.
- [x] Define the actual signal honestly: an initiated download or observed host
  success is not proof the browser finished writing a file. Use wording matching
  each handler's evidence, not an unsupported universal `download complete` claim.
- [x] Deliver through the existing core toast API only while an eligible F95 document
  is visible and focused. No system/browser notification permission prompts.
- [x] Deduplicate and expire events; define reload/concurrent-tab behavior. No replay
  of old events on later focus unless the user explicitly asks for queued feedback.
- [x] Bound retained events and optionally coalesce bursts; delivery failure must
  never fail/retry a download, close a tab, or introduce an idle polling loop.
- [x] Keep feedback best-effort when no active F95 tab/core exists; standalone
  automation must remain fully independent.

Exit: generic feedback without resurrecting origin-owned download requests.

Wave 4 contract: one GM mailbox (`hostFeedback.v1`), 15-second validity, last
64 event IDs remembered per loaded F95 page, at most three toasts per two seconds.
No startup reads, focus replay, acknowledgement, origin routing or idle polling.
Delivery is best-effort, not a durable queue or distributed exactly-once protocol.
Only the visible/focused enabled F95 page invokes core toast. F95 matches now
include ordinary site pages (including Latest), while `/masked` and `/dl` remain
runtime-inert. Disable/teardown detach listeners; BFCache resumes without replay.

## Wave 5 — Settings, documentation, and regression coverage

- [x] Remove obsolete masked/origin-close/parallel-orchestration controls and text.
  Retain meaningful host preferences; explain standalone operation and self-close
  limitations. Do not rename the script or reset its storage identity.
- [x] Update add-on README, GreasyFork description, reliability docs, host matrix,
  settings tests and diagnostic terminology. Historical baselines must be labeled
  historical, not presented as the new runtime contract.
- [x] Tests: delayed F95 content and hidden duplicate anchors if discovery remains;
  ordinary `/dl/` links must still navigate without interception or eager fetching.
  Favicon hints are untrusted metadata, not proof of destination or authorization.
- [x] Tests: approved/blocked routes, aliases, list/folder guardrails, disabled policy,
  missing core, one-shot execution, continuation claims, refresh/back navigation,
  concurrent tabs, stale state, and teardown during a request.
- [x] Tests: confirmed success versus initiation/error/challenge; self-close off/on,
  browser refusal; no origin tab handle use or accidental closure of other tabs.
- [x] Tests: focused/hidden/unfocused F95 tabs, duplicate/stale events, bursts,
  missing core, failed delivery/storage, and absence of per-file identity coupling.
- [x] Replace or archive retired managed/masked assertions only after retaining
  meaningful host, concurrency and cleanup coverage. Register replacements in the
  existing test runner; never remove failures wholesale to make the suite green.
- [x] Build evidence: neither regular nor release bundle includes archived masked
  code, origin-close machinery, or the old dual dispatch. Review actual size changes.
- [x] Use deterministic local fixtures/mocks; automated tests must not resolve live
  signed F95 links, trigger host downloads or contact CAPTCHA endpoints.

Wave 5 evidence: 160 focused tests passed, including explicitly labeled archive
characterization, retained production host tests and affected integration boundaries.
Current README/GreasyFork/runtime docs replace retired managed promises; historical
baseline docs are labeled. Old close-delay transport and button styling plumbing
are excluded. No full-suite or live-host pass is implied; those remain Wave 6.

## Wave 6 — Release gate (only when requested)

- [x] Run focused tests/lint/diff checks per wave; refresh only affected reports.
  User runs the final full suite unless explicitly delegated.
- [ ] Browser smoke: real `/dl/` navigation, representative standalone hosts and
  staged/list routes, disabled mode, simultaneous downloads, feedback focus behavior,
  challenges, and optional self-close. Record unsupported cases honestly.
- [x] Refresh add-on baseline/API/size/personal reports as actually affected;
  check manifest/catalog/structure, docs, inventory, regular/release smoke builds.
- [x] Decide release version from actual compatibility changes; write a concise
  changelog including retired functionality and retained settings identity.
- [x] Build only this add-on, regenerate catalog artifacts, and verify CI evidence.
  No core version bump unless the implementation truly changes a core contract.

Final-wave evidence (2026-10-20): v1.3.0 release built; 168 focused tests,
add-on lint, all eight size/baseline/API/CSS/personal report checks, manifest,
catalog, structure, docs, inventory and diff checks passed. Build tooling refreshes
current reports automatically. Core version and size-gate limits are unchanged.
The full repository test suite remains the user's final check. Browser smoke is
not marked complete: real host actions, countdown timing, focus feedback and
browser-permitted closing must still be checked manually. This is prepared, not
published; no commit, push or upload was performed.

## Explicit non-goals

- No new framework, host-engine rewrite, background service or telemetry.
- No automatic prefetch of every `/dl/` link or reverse-engineering opaque tokens.
- No icon-based trust, referrer-based ownership, or guessed origin correlation.
- No new F95 download buttons until there is a demonstrated useful operation that
  works without needing the hidden destination. Icons may be display hints only.
- No anti-bot bypass, CAPTCHA automation expansion or relaxed host safety checks.
