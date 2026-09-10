# Thread Utility visual style baseline

This records `THREAD-UTILITY-STYLE-BASELINE-01` before production styling is
changed. The machine-readable evidence is in
`thread-utility-style-baseline.json` and is locked by the Playwright suite.

## Current mismatch

The palette is internally consistent but does not match core Settings. Its main
surface is `#1f2329`, header/footer are `#252a31`, ordinary actions use
`#30353d`, quick searches use `#293849`, and keyboard focus uses blue
`#8ab4f8`. Core Settings instead establishes neutral `#191b1e`, `#17191d`,
`#20242a`, `#222`, and accent/focus `#893839` / `#c15858` roles.

Current tag semantics are also inverted relative to core: marked is purple,
preferred is green, and excluded is gray. Prefix purple is a separate styling
decision and must not be treated as user-tag state during normalization.

## Browser coverage

The visual fixture imports the production `renderPalette()` function and runs
the production stylesheet through core `sanitizeAddonCss()` before mounting it.
It covers normal, marked, preferred, excluded, and overflow tags; a missing
rating; ready/loading/partial/empty/failure statuses; collapsed and each open
content section; download actions; desktop width; and narrow width.

Successful runs attach screenshots and computed-style JSON to the Playwright
HTML report. The baseline records literal `>` / `v` in disclosure labels so the
later pseudo-element package can prove both visual and accessible-name cleanup.

No production source, behavior, CSS, generated distribution, or version is
changed by this package.
