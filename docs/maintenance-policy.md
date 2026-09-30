# Maintenance policy

The core and official add-ons are in maintenance mode. Bug reports, questions,
ideas, and contributions remain welcome. There is no fixed response or release
schedule, and an issue or pull request does not guarantee a merge.

## How we handle future work

- Triage reports by impact and reproducibility. Prefer a focused fix with a
  regression test for an isolated bug. If a report reveals a structural weakness
  that a local patch would leave in place, a broader redesign is appropriate
  when its scope and compatibility risks are made explicit.
- Revisit dependencies, site compatibility, and release health when a real
  breakage or security advisory occurs. There is no arbitrary release cadence.
- Evaluate proposed features and add-ons case by case for safety, fit with the
  documented architecture, usefulness in the main project, and ongoing support
  cost. Suggest a fork when an idea is legitimate but not a good main-project fit.

For bug-report details, see the root README. Technical add-on requirements live
in the add-on guide.
