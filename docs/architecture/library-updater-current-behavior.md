# Library updater: current behavior and investigation

Source review on 2026-10-13, updated with the daily-accounting fix on 2026-10-17.
This describes implementation, not a promise that every transition is correct.

## Browser-check message

`PAUSED: F95 BROWSER CHECK` is a UI label for an active `challenge_page`
cooldown. The durable cycle is actually `waiting`, not `paused`.

The detector searches raw response HTML for any of `cf-chl-`,
`challenge-platform`, `Just a moment`, or `Attention Required`, case-insensitively.
The request adapter examines HTTP 403/503 bodies; the parser examines successful
HTML responses too. HTTP 429 produces the separate `rate_limited` reason.
This is inferred from response content: it does not prove that the browser is
currently displaying a challenge or that the site blocked every thread.

On either reason, the automatic worker restores the claimed row's previous
status, attempts and allowance-day marker, refunds its newly consumed daily slot,
and sets a 30-minute site cooldown. Previously completed rows and Library facts
remain intact. Polls before expiry make no thread request. Retry now clears the
cooldown and tries again; another matching response starts another 30 minutes.
Fetching cannot solve an interactive challenge on the user's behalf.

## Conditions and transitions

| Condition | Current result |
| --- | --- |
| Add-on boots/enables or refreshes runtime state | Scheduler is armed. Normally first poll is within 60 seconds. A running/recovering cycle with a live lease waits until that lease's expiry plus 250 ms. |
| No cycle | Creates a snapshot of all auto-enabled Library records, ordered by record modification index. Per-record next-check timestamps are not the snapshot eligibility gate. |
| Existing running/waiting cycle | Uses the same cycle and remaining rows; completed rows are not deliberately rechecked. |
| Existing paused cycle | Scheduler run changes it back to running automatically if automatic updates are enabled. |
| Incomplete preparing cycle | Discards its incomplete snapshot and builds another. |
| Another tab owns an unexpired lease | This tab makes no check; later polling retries ownership. |
| Successful check | Commits observed facts, then settles the row completed; records current/changed counts. |
| Record removed or auto-update disabled | Settles it completed-but-skipped; no request if noticed before claiming. |
| Plain 403/404, thread_not_found or entry_not_found | Terminal failure for this cycle; a future new cycle can include the record again. |
| Other failure | Durable retry unless total HTTP attempts have reached three. Pending rows have priority over due retry rows. |
| No actionable row but unfinished rows exist | Waiting for retry/claim recovery; preserves cycle. |
| Daily allowance reached before a new record | Waiting until local midnight; Continue another batch grants extra allowance for the day, surviving cycle replacement. |
| Local day changes | Resets allowance count and bonus, not queue progress. |
| User presses Pause | Stops this tab's scheduler and aborts its request; writes paused. Other tabs/reloads can automatically resume it. |
| Page navigation/close, add-on disable or teardown | Stops this tab and aborts work. Unsettled processing claims may need to expire before recovery. Closing only the updater dialog does not stop the scheduler. |
| Ownership lost | Stops committing that fetched result; normally writes waiting, with claim expiry used for recovery. |
| Missing check result or cancelled commit | Writes paused; later enabled scheduler runs may resume. |
| Storage/network exception escapes scheduler | Returns run_failed and attempts lease release; automatic timer re-arms. Durable status can remain running/recovering. |
| All rows completed or terminal failed | Cycle completes. Next cycle is scheduled from its original slot, not completion time. |
| Completed cycle whose next slot has passed | Next poll builds a fresh cycle. This can look like immediately starting over after a long cycle. |

The scheduler normally polls every minute rather than sleeping exactly until
the displayed Next time. Browser throttling/suspension can delay polls further.
Automatic progress requires an enabled add-on in an open, executing page; this
is not a background server job. The dialog subscribes to its own tab's scheduler,
not a cross-tab realtime feed.

## Two retry layers and daily accounting

Automatic checks enforce at least 10 seconds of spacing, both when loading saved
configuration and at the queue worker boundary. Internal HTTP retries receive
the same minimum. The settings input also requires at least 10000 ms. Old or
manually edited 5000 ms values cannot lower automatic pacing. Daily allowance
semantics described below are unchanged.

The request checker retries timeout, network_error, and HTTP 500/502/503/504
inside one check. Configured retryLimit is the number of extra requests (default
two). Internal retries wait configured spacing. Parser errors and site-block
reasons are not internally retried.

The queue then counts those actual HTTP attempts. A record can therefore become
terminal after one check containing three failed requests, without a durable
retry. Durable delay is five minutes after attempt one, ten after attempt two;
the policy is capped at one hour, but ordinary rows stop at three attempts.

Daily allowance counts queue rows checked that local day across cycles, not every
HTTP request. Retrying the same row on the same day consumes no new slot. Fresh
cycle rows consume the remaining shared budget, rather than replenishing it.
An independent ledger survives active-cycle replacement, with usage and bonus
atomically checkpointed alongside the master. However, pending rows are selected first: a new pending row blocked by
the daily cap can prevent an otherwise eligible same-day retry being reached.

## Buttons

Library's dock button and the Manager's Auto update button show local scheduler
activity: a gently pulsing green ring while working, steady yellow when paused
or waiting (including site cooldown, allowance and retry waits), and
steady red for an updater-level failure. Idle/completed returns to normal;
individual unavailable threads do not turn a working or completed updater red.
Reduced-motion users see steady green. These are local scheduler subscriptions,
not a new cross-tab heartbeat or request poll. The dock publishes markup only
on activity transitions and unsubscribes on unmount; the Manager unsubscribes
on close. A running/recovering cycle with an observed unexpired lease from
another tab remains green during previous-process waits. Lease expiry removes
that working hint; paused/waiting/completed cycle states take precedence. This
uses existing lease reads and is not proof of continuous remote progress.
Recovery waits require a different lease owner and no active local run. The
current scheduler's own lease never creates a previous-process wait, including
re-arms during manual checks and repeated lease renewals. The dialog also gives
an active local run precedence over a stale recovery flag.

- Update now / Resume: run the existing unfinished cycle, or create one if none
  exists/completed. Resume does not clear an active site cooldown.
- Retry now: clear site cooldown, then run the same cycle.
- Continue another batch: add the cycle's checksPerDay to its bonus, then run.
- Check again: deliberately create a new snapshot after completion.
- Restart cycle: stop this tab, discard the existing queue, then build anew.
- Save settings: persist config and re-arm with a new nextRunAt. It does not
  abort an already-running worker or replace the unfinished snapshot.

## Flaws and verification priorities

1. **Challenge detector is too broad (confirmed implementation risk).** It
   searches the entire HTML before extracting valid thread facts. Ordinary post
   text saying "Just a moment", or embedded challenge script references, can
   trigger a site-wide cooldown. A repeatedly matching first row can block all
   later rows indefinitely because its attempts are restored. Capture the
   offending response to determine whether this explains the reported pauses.
2. **Pause is tab-local, not persistent user intent (confirmed).** Other tabs
   and reloads resume paused cycles. Disabling automatic updates is the persisted
   setting, but another already-running worker holds its config snapshot.
3. **Daily cap reset across cycles (fixed 2026-10-17).** Check again, Restart and
   overdue successor snapshots now inherit same-day usage and bonus from the
   independent ledger. Existing available counters are preserved before deleting
   a pre-fix snapshot. Usage already erased by an older version cannot be recovered.
4. **Overdue successor is intentional but confusing (confirmed).** Compare
   cycleId before/after: a changed ID after completion indicates a fresh cycle;
   unchanged ID with recovering/running means continuation, not restart.
5. **Cross-tab ownership is cooperative (needs focused race testing).** Lease
   claim uses read/write/read with jitter, not an atomic election. Some late
   cancellation/ownership-loss paths write cycle status from an old in-memory
   cycle. Pause/Restart do not first acquire exclusive ownership of another
   tab's worker. These warrant tests before claiming strict multi-tab safety.
6. **Commit success is not fully checked (confirmed source gap).** Worker checks
   cancellation but not general committed.ok before successful queue settlement.
   A failed canonical write could therefore be represented as checked. Review
   commitResults failure contracts before changing settlement logic.
7. **UI is not a live cross-tab status monitor (confirmed).** Its local updates
   and runtime flags can differ from another tab's active worker. Cooldown label
   expiration is recomputed when rendering, not by a dedicated countdown.

Existing tests cover positive challenge detection, site-block refund/cooldown,
retry policy, queue recovery and UI actions. They do not by themselves establish
that full real thread HTML cannot falsely match, or cover all concurrent
Pause/Restart/late-worker interleavings.

For a report, use Copy diagnostics before and after the event: retain cycle ID,
state, blockedReason/blockedUntil, Next wake, Today count, and current position.
Debug logs identify the requested thread and response status. Redact private
thread content/cookies before sharing a captured response. No storage dump is
needed to explain the browser-check label.

## Source owners

### Two-tab reproduction

`LIBRARY-UPDATE-TWO-TAB-01` uses the production scheduler, snapshot builder,
queue repository, API client and worker over a shared in-memory bridge with
successful synthetic responses and no wall-clock request spacing. It is not a
live browser or exhaustive IndexedDB ownership-race test.

Tab A resumes a 107-row cycle with 100 already completed, checks seven today,
completes 107/107 and releases its lease. Tab B then runs one minute later:

- Future next scheduled slot: returns `not_due`, no new snapshot or requests.
- Already missed next slot: creates a 110-row successor retaining seven used
  slots, checks **93**, and waits at 100. Combined successful requests today:
  **100** (7 + 93), rather than the pre-fix 107 (7 + 100).

Thus lease release alone does not restart the cycle; completed status plus a
due scheduling slot does. Library growth changes the successor's total, but
is not itself a rebuild trigger. The test also covers extra-batch allowance,
Check again, Restart at the cap and next-day rollover. Separate tests cover
pre-fix counter seeding, explicit refunds, stale writes and failed checkpoints.

- `addons/library-addon/src/api/threadHtml.js`: request classification.
- `addons/library-addon/src/library/threadUpdateParser.js`: successful HTML classification.
- `addons/library-addon/src/library/manualUpdateChecker.js`: internal retries.
- `addons/library-addon/src/library/autoUpdatePolicy.js`: delays and scheduling slots.
- `addons/library-addon/src/library/autoUpdateScheduler.js`: polling, lease and actions.
- `addons/library-addon/src/library/autoUpdateQueueWorker.js`: claim/check/commit/settle.
- `addons/library-addon/src/library/autoUpdateQueueSnapshot.js`: replacement and eligibility.
- `addons/library-addon/src/ui/autoUpdate/`: labels, actions and local subscription.
