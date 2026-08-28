# Library durable update settings and UI

This document records `LIBRARY-UPDATE-QUEUE-SETTINGS-01`.

The legacy `Session cap` is no longer persisted. `Daily cap` is read once as a
compatibility alias and normalized to `Checks per day`; stored output contains
only `checksPerDay`. The supported range is 1 through 500, defaults to 100, and
does not include an Unlimited mode because request traffic must remain bounded.

The modal keeps one mounted DOM tree with an overview, collapsed cycle details,
and collapsed settings. Queue transitions patch dedicated text, progress, and
button nodes. They do not replace settings inputs, details elements, selection,
focus, or scroll state. Scheduler cycle notifications drive updates without an
idle repaint timer.

The primary button is derived from durable state: Update now, Resume updates,
Continue another batch, disabled preparation/running/recovery labels, or Check
again. Additional batches and early fresh cycles require confirmation. A daily
bonus is persisted on the master, leaves the saved setting unchanged, and resets
at local-day rollover. Restart also requires confirmation and is the only UI
action that discards unfinished queue progress.

Manual single and Check-all operations remain independent from the automatic
cycle. They retain cancellation and shared spacing/timeout/retry configuration;
they do not mutate automatic queue positions or daily allowance.
