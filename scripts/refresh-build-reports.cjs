"use strict";

const path = require("path");
const { execFileSync } = require("child_process");

// Order matters: the size audit consumes the refreshed add-on baseline.
// Historical comparison baselines and size-gate limits are deliberately untouched.
const REPORT_COMMANDS = [
  ["addon-baseline.cjs", "--output", "docs/architecture/addon-baseline.json"],
  ["addon-api-audit.cjs"],
  ["library-personal-baseline.cjs", "--output", "docs/architecture/library-personal-baseline.json"],
  ["core-source-audit.cjs", "--output", "docs/architecture/core-size-baseline.json"],
  ["core-source-audit.cjs", "--reduction", "--output", "docs/architecture/core-size-reduction-current.json", "--compare", "docs/architecture/core-size-reduction-baseline.json"],
  ["css-audit.cjs", "--output", "docs/architecture/css-audit.json", "--compare", "docs/architecture/css-audit-baseline.json"],
  ["addon-service-size-audit.cjs", "--output", "docs/architecture/addon-service-size-audit.json", "--markdown", "docs/architecture/addon-service-size-audit.md"],
];

function refreshBuildReports({ rootDir = path.resolve(__dirname, ".."), run = execFileSync } = {}) {
  for (const [script, ...args] of REPORT_COMMANDS) {
    console.log(`Refreshing CI report: ${script}`);
    run(process.execPath, [path.join(rootDir, "scripts", script), ...args], {
      cwd: rootDir,
      stdio: "inherit",
    });
  }
}

if (require.main === module) refreshBuildReports();
module.exports = { refreshBuildReports, REPORT_COMMANDS };
