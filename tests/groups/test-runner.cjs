"use strict";

module.exports = ({ assert, runTest, childProcess, ROOT }) => {
  const { GROUPS, resolveTestGroups } = require("../run.cjs");
  const child = (args) => childProcess.spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });

  runTest("TEST-RUNNER-01 selections preserve default coverage and reject empty or unknown groups", () => {
    assert.deepStrictEqual(resolveTestGroups([]).groups, [...GROUPS]);
    assert.deepStrictEqual(resolveTestGroups(["--group", "config", "--group=core", "--group", "core"]).groups, ["core", "config"]);
    assert.deepStrictEqual(resolveTestGroups(["--group", "masked-direct-*"]).groups, GROUPS.filter((group) => group.startsWith("masked-direct-")));
    for (const args of [["--group"], ["--group", ""], ["--group", "missing"], ["--group", "missing*"], ["--group", "core", "--group", "missing"], ["--group", "co*re"], ["--wat"]]) {
      assert.throws(() => resolveTestGroups(args));
    }
    assert.throws(() => resolveTestGroups([], []), /empty/);
  });

  runTest("TEST-RUNNER-02 CLI listing never executes tests and invalid requests fail nonzero", () => {
    const listed = child(["tests/run.cjs", "--group", "masked-direct-*", "--list"]);
    assert.strictEqual(listed.status, 0);
    assert.deepStrictEqual(listed.stdout.trim().split(/\r?\n/), GROUPS.filter((group) => group.startsWith("masked-direct-")));
    assert.doesNotMatch(listed.stdout, /PASS|Test results/);
    for (const args of [["--group"], ["--group", ""], ["--group", "does-not-exist*"]]) {
      const result = child(["tests/run.cjs", ...args]);
      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /Test runner failed/);
      assert.doesNotMatch(result.stdout, /PASS|Test results/);
    }
  });

  runTest("TEST-RUNNER-03 group setup failures and unsettled async cases cannot pass silently", () => {
    const setup = child(["-e", `
      const file = require.resolve('./tests/groups/test-timing.cjs');
      require.cache[file] = { exports: () => { throw Error('intentional setup failure'); } };
      require('./tests/run.cjs').main(['--group', 'test-timing']).catch(error => {
        console.error(error.message); process.exitCode = 1;
      });
    `]);
    assert.strictEqual(setup.status, 1);
    assert.match(setup.stderr, /intentional setup failure/);
    const empty = child(["-e", `
      const file = require.resolve('./tests/groups/test-timing.cjs');
      require.cache[file] = { exports: () => {} };
      require('./tests/run.cjs').main(['--group', 'test-timing']).catch(error => {
        console.error(error.message); process.exitCode = 1;
      });
    `]);
    assert.strictEqual(empty.status, 1);
    assert.match(empty.stderr, /No tests registered/);
    const unsettled = child(["-e", `
      const h = require('./tests/harness.cjs');
      h.runTest('never settles', () => new Promise(() => {}));
      h.finish();
    `]);
    assert.strictEqual(unsettled.status, 1);
    assert.match(unsettled.stderr, /Test run stopped early/);
  });
};
