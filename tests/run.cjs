const GROUPS = Object.freeze([
  "test-timing",
  "test-infrastructure",
  "test-runner",
  "core",
  "signature-collapse",
  "core-load-trace",
  "config",
  "core-runtime-performance",
  "core-size-reduction",
  "core-size-dialog-shell",
  "addon-service",
  "latest-marker-provider",
  "latest-marker-overlay",
  "library-latest-marker",
  "example-latest-marker",
  "addons",
  "addon-readiness",
  "addon-matrix",
  "addon-size",
  "library-personal",
  "library-idb-schema",
  "library-legacy-upgrade-guard",
  "library-record-model",
  "library-rating-ui",
  "library-entry-editor",
  "library-keyset-pagination",
  "library-version-history",
  "library-activity",
  "library-update-inbox",
  "library-opportunistic-update",
  "library-import-export",
  "library-bulk-budget",
  "library-manual-update",
  "library-hybrid-baseline",
  "library-hybrid-selector",
  "library-hybrid-budget",
  "library-hybrid-integration",
  "library-auto-update",
  "library-update-activity",
  "library-update-queue-snapshot",
  "library-update-queue-worker",
  "latest-filters-reset",
  "latest-filters-surprise",
  "latest-filters-expansion",
  "thread-utility-baseline",
  "thread-utility-golden",
  "thread-utility-foundation",
  "thread-utility-lifecycle",
  "thread-utility-snapshot",
  "thread-utility-tags",
  "thread-utility-quick-search",
  "thread-utility-content",
  "thread-utility-downloads",
  "thread-utility-palette",
  "thread-utility-settings",
  "thread-utility-hardening",
  "masked-direct-retirement",
  "masked-direct-single-pipeline",
  "masked-direct-feedback",
  "masked-direct-current-contract",
  "masked-direct-standalone-engine",
  "masked-direct-standalone-host-guards",
  "masked-direct-standalone-settings",
  "masked-direct-standalone-expansion-simple",
  "masked-direct-standalone-expansion-direct",
  "masked-direct-standalone-expansion-staged",
  "masked-direct-toast-remove",
  "masked-direct-reliability",
  "integration",
]);

function resolveTestGroups(args, groups = GROUPS) {
  const selected = new Set();
  let filtered = false, list = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list") { list = true; continue; }
    let pattern;
    if (arg === "--group") pattern = args[++index];
    else if (arg.startsWith("--group=")) pattern = arg.slice(8);
    else throw new Error(`Unknown test argument: ${arg}`);
    if (!pattern?.trim() || pattern.startsWith("--")) throw new Error("--group requires a non-empty group name or prefix*");
    filtered = true;
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
    if ((prefix ?? pattern).includes("*")) throw new Error(`Only trailing prefix* patterns are supported: ${pattern}`);
    const matches = groups.filter((group) => prefix === null ? group === pattern : group.startsWith(prefix));
    if (!matches.length) throw new Error(`No test groups match: ${pattern}`);
    matches.forEach((group) => selected.add(group));
  }
  const result = filtered ? groups.filter((group) => selected.has(group)) : [...groups];
  if (!result.length) throw new Error("Test selection is empty");
  return { groups: result, list };
}

async function main(args = process.argv.slice(2)) {
  const selection = resolveTestGroups(args);
  if (selection.list) { console.log(selection.groups.join("\n")); return; }
  const harness = require("./harness.cjs");
  for (const group of selection.groups) {
    harness.runTest.registerGroup(group, () => require(`./groups/${group}.cjs`)(harness));
  }
  await harness.finish();
}

module.exports = { GROUPS, resolveTestGroups, main };

if (require.main === module) {
  main().catch((error) => { console.error("Test runner failed:", error); process.exitCode = 1; });
}
