# Visual Browser Tests

Playwright visual tests are separate from the fast `npm test` harness. They run
real Chromium layout and are intended for overflow, scrolling, computed-style,
focus, and hit-testing regressions that a simulated DOM cannot prove.

## Commands

```powershell
npm run test:visual
npm run test:visual:headed
npm run test:visual:debug
npm run test:visual:report
```

- `test:visual` runs headlessly and writes `playwright-report/index.html`.
- `test:visual:headed` opens Chromium while tests run.
- `test:visual:debug` opens Playwright Inspector and pauses interactively.
- `test:visual:report` serves the latest HTML report in a browser.

Successful visual tests attach screenshots to the HTML report. Failed tests
also retain a trace under `test-results/`; open it through the report to inspect
the DOM, screenshots, actions, and console at each recorded step.

Visual tests live in `tests/visual/*.visual.cjs`. They should consume production
renderers and styles where practical. Fixtures may provide the surrounding page
shell, but must not duplicate the component behavior being tested.

The first regression renders the production Thread Utility settings markup and
the production stylesheet after core add-on CSS sanitization. It scrolls the
actual utility list, compares browser bounding boxes, verifies footer hit
ownership, and attaches the rendered result.
