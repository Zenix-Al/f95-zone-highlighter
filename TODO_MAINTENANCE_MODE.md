# TODO: Project-wide maintenance mode

The README already places the **core** in maintenance mode. This checklist is
for extending that policy to the whole project, including official add-ons,
without abandoning bug fixes or existing users. It is not a new-feature roadmap.

## Before declaring the transition complete

- [ ] Decide and document the support boundary: fix security, data-loss,
  compatibility, and reproducible regressions; accept other work only when
  its user benefit justifies the long-term maintenance cost.
- [ ] Check that the current core and each published add-on have an installable
  release, accurate version/compatibility notes, and no known critical issue.
  Do not bump versions or rebuild artifacts merely to complete this checklist.
- [ ] Run the relevant lint, tests, documentation checks, and release smoke
  checks. Record or fix any failures; do not remove useful tests to make the
  transition look complete.
- [ ] Do one manual browser smoke pass on the supported Latest and thread
  pages, including core/add-on enable-disable, Library save/status, markers,
  and Library export/import of a disposable sample. Record any environment or
  account-dependent checks that cannot be completed.
- [ ] Review open TODOs and issues: close completed work, mark speculative
  ideas as deferred, and retain only actionable bugs or compatibility work.
- [ ] Update the README and add-on docs to say what maintenance mode covers,
  how to report bugs, and that new add-ons/features are evaluated case by case.

## Ongoing policy

- [ ] Triage reports by impact and reproducibility. Prefer a small fix with a
  regression test over a broad redesign.
- [ ] Revisit dependencies, site compatibility, and release health when a real
  breakage or security advisory occurs; no arbitrary release cadence is needed.
- [ ] Require a concrete repeated user problem, a clear owner, and a bounded
  support cost before accepting a new feature. Otherwise leave it as an idea.

Maintenance mode is complete when the boundary is documented, the current
releases are usable, and known critical problems are either fixed or clearly
disclosed. Finishing every speculative TODO is not required.
