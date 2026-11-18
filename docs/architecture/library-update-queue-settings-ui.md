# Library durable update settings and UI

This document records `LIBRARY-UPDATE-QUEUE-SETTINGS-01`.

The legacy `Session cap` is no longer persisted. `Daily cap` is read once as a
compatibility alias and normalized to `Checks per day`; stored output contains
only `checksPerDay`. The default is 100 and the minimum is 1. The maximum uses
the total saved Library record count N: `max(1, min(N, max(150, ceil(N / 3))))`.
Thus 100 records allow 100, 450 allow 150, 451 allow 151, and 600 allow 200.
It is a selectable ceiling, not an automatically increased user allowance. The
input label and HTML max share the same calculation and refresh with Library size.
Unsaved input text is preserved during live refresh; saving reconciles it with
the normalized value. The count/derived maximum are runtime metadata, not stored
settings or schema changes. If counting is unavailable, reads conservatively use
the former ceiling of 150 and saves fail rather than overwrite user settings.
There is no Unlimited mode; hourly API accounting and request pacing are unchanged.

The modal keeps one mounted DOM tree with an overview, collapsed cycle details,
and collapsed settings. Queue transitions patch dedicated text, progress, and
button nodes. They do not replace settings inputs, details elements, selection,
focus, or scroll state. Scheduler cycle notifications drive updates without an
idle repaint timer.

Activity colors are presentation, separate from dialog labels. Durable cycle
states are preparing, running, recovering, paused, waiting and completed.
Preparing/running/recovering are green only with a live local worker or active
other-owner lease; otherwise neutral. Waiting (including daily/scheduled waits),
manual pause and completed are neutral. Active challenge/rate-limit cooldowns
override normal states with yellow until their deadline; stale block reasons do
not remain yellow. Updater-level failures are red, not individual record failures.
The dialog still labels an active Cloudflare cooldown PAUSED: F95 BROWSER CHECK.

The add-on owns dialog scrolling: the overview and disclosures live in one
bounded scrolling body, while the primary action row remains a separate final
grid row. Native `details` markers communicate disclosure state; summary text
does not contain a manually maintained direction character. At narrow widths,
settings become one column and footer actions use a bounded two-column layout.

The primary button is derived from durable state: Update now, Resume updates,
disabled daily-limit/preparation/running/recovery labels, or Check again.
Extra-batch bonuses have been removed; old stored bonuses are ignored and the
configured daily allowance remains the limit. Early fresh cycles require confirmation
and do not reset that day's usage. Restart also requires confirmation and is the only UI
action that discards unfinished queue progress.

Manual single and Check-all operations remain independent from the automatic
cycle. They retain cancellation and shared spacing/timeout/retry configuration;
they do not mutate automatic queue positions or daily allowance.
