const harness = require("./harness.cjs");
 
for (const group of [
  "core",
  "config",
  "addon-service",
  "addons",
  "addon-matrix",
  "addon-size",
  "library-personal",
  "library-idb-schema",
  "library-record-model",
  "library-rating-ui",
  "library-entry-editor",
  "library-keyset-pagination",
  "library-version-history",
  "library-activity",
  "library-update-inbox",
  "library-opportunistic-update",
  "library-import-export",
  "library-manual-update",
  "library-auto-update",
  "latest-filters-reset",
  "latest-filters-surprise",
  "latest-filters-expansion",
  "masked-direct-parallel-baseline",
  "masked-direct-toast-remove",
  "masked-direct-parallel-requests",
  "masked-direct-reliability",
  "integration",
]) {
  require(`./groups/${group}.cjs`)(harness);
}

void harness.finish();
