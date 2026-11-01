"use strict";

module.exports = function registerMaskedDirectToastRemoval(context) {
  const { ROOT, assert, fs, loadModule, path, runTest } = context;
  const sourceRoot = path.join(ROOT, "addons", "masked-direct-addon", "src");

  function readSources(dir = sourceRoot) {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        const target = path.join(dir, entry.name);
        return entry.isDirectory() ? readSources(target) : [target];
      })
      .filter((file) => file.endsWith(".js"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
  }

  runTest("MASKED-DIRECT-TOAST-REMOVE-01 removes local presentation but retains core toast", () => {
    const source = readSources();
    assert.doesNotMatch(source, /f95ue-addon-toast|toastEl/);
    assert.match(
      fs.readFileSync(path.join(sourceRoot, "app", "coreIntegration.js"), "utf8"),
      /toast\.show/,
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "addons", "addons.manifest.json"), "utf8"),
    );
    const entry = manifest.addons.find(({ id }) => id === "masked-direct-addon");
    assert.ok(entry);
    assert.ok(entry.capabilities.includes("toast"));
  });

  runTest("MASKED-DIRECT-TOAST-REMOVE-02 diagnostics are bounded and redacted", () => {
    const { createMaskedDirectDiagnostics } = loadModule(
      "addons/masked-direct-addon/src/shared/diagnostics.js",
    );
    const previousError = console.error;
    const calls = [];
    console.error = (...args) => calls.push(args);
    try {
      createMaskedDirectDiagnostics().error(
        "https://host/file?token=secret<script>alert(1)</script>",
        {
          host: "host.test/path?signature=secret",
          requestId: "request-123?token=secret",
        },
      );
    } finally {
      console.error = previousError;
    }
    assert.strictEqual(calls.length, 1);
    const serialized = JSON.stringify(calls[0]);
    assert.ok(serialized.length < 320);
    assert.doesNotMatch(serialized, /token=|signature=|<script>|alert\(1\)/);
    assert.doesNotMatch(serialized, /requestId/);
    assert.match(serialized, /masked-direct-addon/);
  });
};
