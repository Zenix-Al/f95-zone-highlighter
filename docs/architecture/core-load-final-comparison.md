# Core load maintenance comparison — 5.4.6

The release retains focused reductions rather than restructuring bootstrap or
introducing dynamic feature loading. Final browser feedback confirmed that delayed
hover tags remain styled across repeated card hovers.

| Sampled metric | Initial ms | Final ms |
| --- | ---: | ---: |
| Core self CPU | 169.647 | 138.220 |
| Core plus invoked code | 300.502 | 259.677 |
| Schema metadata lookup self CPU | 26.198 | 1.694 |

Core self CPU decreased 18.5% and inclusive CPU 13.6% in one recording pair.
These overlapping metrics must not be added. Neither recording provides reliable
bootstrap elapsed-time boundaries; workload variation prevents treating this as
a repeatable startup-speed percentage. Other waves have focused synthetic evidence
in TODO_CORE_LOAD.md, not individually isolated live-trace improvements.

Exact supplied 5.4.5 browser bundle SHA-256:

- Initial: `c9f82f6e31663e6d0f2d18047f140cab54f1858b7d3d09aacfb405109f47fa37`
- Final: `4355a97c71e7716f72b142d2a2053a8fbe383805fd13258154d0ccd4c12ce7bf`

The three recordings and three browser bundle copies were removed from repository
references after comparison and archived outside the repository. Regression tests
use source modules and synthetic traces; none depends on these personal recordings.
The trace analyzer remains usable with any newly supplied recording.
