module.exports = ({ assert, loadModule, runTest, createDomSandbox }) => {
  runTest("ADDON-BUILD-CACHE shared-only imports invalidate cached builds", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const { computeAddonHash } = require("../../addons/build-addon.js");
    const tmpRoot = path.resolve(__dirname, "../.tmp");
    fs.mkdirSync(tmpRoot, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpRoot, "addon-hash-"));
    try {
      fs.mkdirSync(path.join(dir, "addon/src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "addon/src/main.js"), 'import { value } from "../../shared.js"; console.log(value);');
      fs.writeFileSync(path.join(dir, "shared.js"), 'export const value = 1;');
      const addon = { id: "hash-fixture", entry: path.relative(path.resolve(__dirname, "../.."), path.join(dir, "addon/src/main.js")) };
      const initial = computeAddonHash(addon, false);
      assert.equal(computeAddonHash(addon, false), initial);
      fs.writeFileSync(path.join(dir, "shared.js"), 'export const value = 2;');
      assert.notEqual(computeAddonHash(addon, false), initial);
      const changed = computeAddonHash(addon, false);
      fs.writeFileSync(path.join(dir, "unrelated.js"), 'export const unrelated = true;');
      assert.equal(computeAddonHash(addon, false), changed);
      assert.notEqual(computeAddonHash(addon, true), changed);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  runTest("ADDON-READINESS shared polling catches delayed core and stops on success", async () => {
    const { waitForCoreReady } = loadModule("addons/shared/coreReadiness.js");
    let clock = 0, calls = 0;
    const result = await waitForCoreReady({ waitForCorePing: async (timeout) => {
      calls++;
      if (calls === 3) return { ok: true, apiVersion: "test" };
      clock += timeout;
      return { ok: false };
    } }, { now: () => clock, delay: async (ms) => { clock += ms; } });
    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    assert.equal(clock, 1500);
  });
  runTest("ADDON-READINESS absent core respects ten-second deadline", async () => {
    const { waitForCoreReady } = loadModule("addons/shared/coreReadiness.js");
    let clock = 0;
    const timeouts = [];
    const result = await waitForCoreReady({ waitForCorePing: async (ms) => {
      timeouts.push(ms); clock += ms; return { ok: false };
    } }, { now: () => clock, delay: async (ms) => { clock += ms; } });
    assert.equal(result.ok, false);
    assert.equal(clock, 10000);
    assert.equal(timeouts.length, 14);
    assert.equal(timeouts.at(-1), 250);
  });
  runTest("ADDON-READINESS immediate success requires one ping", async () => {
    const { waitForCoreReady } = loadModule("addons/shared/coreReadiness.js");
    let calls = 0;
    const result = await waitForCoreReady({ waitForCorePing: async () => { calls++; return { ok: true }; } });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
  });
  runTest("ADDON-READINESS abort cleans up an active ping", async () => {
    const sandbox = createDomSandbox("https://f95zone.to/");
    try {
      const { createCoreBridge } = loadModule("addons/shared/coreBridge.js");
      const controller = new AbortController();
      const ping = createCoreBridge("readiness-test").waitForCorePing(10000, controller.signal);
      controller.abort();
      assert.equal((await ping).ok, false);
      const { waitForCoreReady } = loadModule("addons/shared/coreReadiness.js");
      let calls = 0;
      await waitForCoreReady({ waitForCorePing: async () => { calls++; } }, { signal: controller.signal });
      assert.equal(calls, 0);
    } finally { sandbox.restore(); }
  });
  runTest("ADDON-READINESS cancellation during backoff prevents another ping", async () => {
    const { waitForCoreReady } = loadModule("addons/shared/coreReadiness.js");
    const controller = new AbortController();
    let calls = 0;
    const result = await waitForCoreReady({ waitForCorePing: async () => { calls++; return { ok: false }; } }, {
      signal: controller.signal,
      delay: async () => { controller.abort(); },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
  });
};
