const harness = require("./harness.cjs");

for (const group of [
  "core",
  "config",
  "addon-service",
  "addons",
  "addon-matrix",
  "addon-size",
  "integration",
]) {
  require(`./groups/${group}.cjs`)(harness);
}

void harness.finish();
