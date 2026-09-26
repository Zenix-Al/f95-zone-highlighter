"use strict";

module.exports = function registerLatestMarkerProviderGroup({ assert, loadModule, runTest, validateConfig }) {
  const { createLatestMarkerBroker, MARKER_LIMITS } = loadModule("src/services/addons/latestMarkerBroker.js");
  const metadata = { id: "library-status", name: "Library status", description: "Saved state" };
  const make = (options = {}) => {
    const commands = [];
    const changes = [];
    const broker = createLatestMarkerBroker({
      authorize: (owner) => owner === "trusted" || options.allow?.has(owner),
      enabled: (id) => options.enabled?.(id) ?? true,
      dispatch: (owner, detail) => commands.push({ owner, detail }),
      onChange: (id) => changes.push(id),
      timeoutMs: options.timeoutMs,
    });
    return { broker, commands, changes };
  };

  runTest("Latest marker contract rejects absent, untrusted, duplicate and spoofed providers", async () => {
    const { broker, commands } = make();
    assert.deepStrictEqual(await broker.query("library-status", ["1"]), {});
    assert.strictEqual(broker.register("untrusted", metadata).reason, "provider_owner_not_allowed");
    assert.strictEqual(broker.register("trusted", { ...metadata, id: "__proto__" }).reason, "invalid_provider_id");
    assert.strictEqual(broker.register("trusted", metadata).ok, true);
    assert.strictEqual(broker.register("trusted", metadata).reason, "provider_id_taken");
    assert.strictEqual(broker.invalidate("other", metadata.id).reason, "provider_not_owned");
    const result = broker.query(metadata.id, ["1", "1", "bad", "2"]);
    assert.deepStrictEqual(commands[0].detail.threadIds, ["1", "2"]);
    const { requestId } = commands[0].detail;
    assert.strictEqual(broker.respond("untrusted", { providerId: metadata.id, requestId, markers: {} }).ok, false);
    assert.strictEqual(broker.respond("trusted", { providerId: "wrong", requestId, markers: {} }).ok, false);
    assert.strictEqual(broker.respond("trusted", { providerId: metadata.id, requestId, markers: {
      1: { label: "X".repeat(100), description: "D".repeat(300), tone: "script" },
      2: { label: "Saved", description: "In Library", tone: "info" },
      3: { label: "Unsolicited", description: "No", tone: "info" },
    } }).ok, true);
    assert.deepStrictEqual(await result, {
      1: { label: "X".repeat(MARKER_LIMITS.label), description: "D".repeat(MARKER_LIMITS.description), tone: "muted" },
      2: { label: "Saved", description: "In Library", tone: "info" },
    });
    assert.strictEqual(broker.respond("trusted", { providerId: metadata.id, requestId, markers: {} }).ok, false);
  });

  runTest("Latest marker broker drops disabled, aborted, stale and malformed replies", async () => {
    let isEnabled = false;
    const { broker, commands } = make({ enabled: () => isEnabled });
    broker.register("trusted", metadata);
    assert.deepStrictEqual(await broker.query(metadata.id, ["1"]), {});
    isEnabled = true;
    const controller = new AbortController();
    const aborted = broker.query(metadata.id, ["1"], { signal: controller.signal });
    controller.abort();
    assert.deepStrictEqual(await aborted, {});
    assert.strictEqual(broker.pendingCount(), 0);
    assert.strictEqual(broker.respond("trusted", { providerId: metadata.id, requestId: commands[0].detail.requestId, markers: {} }).ok, false);
    const cancelled = broker.query(metadata.id, ["2"]);
    broker.unregister("trusted", metadata.id);
    assert.deepStrictEqual(await cancelled, {});
    broker.register("trusted", metadata);
    assert.strictEqual(broker.respond("trusted", { providerId: metadata.id, requestId: commands[1].detail.requestId, markers: {} }).ok, false);
    const malformed = broker.query(metadata.id, ["3"]);
    const requestId = commands[2].detail.requestId;
    broker.respond("trusted", { providerId: metadata.id, requestId, markers: { 3: { label: "bad", description: "x".repeat(MARKER_LIMITS.bytes) } } });
    assert.deepStrictEqual(await malformed, {});
  });

  runTest("Latest marker preference schema bounds provider IDs and exports generic state", () => {
    const valid = validateConfig({ latestSettings: { latestMarkerProviders: { "library-status": { enabled: true } } } }, { mode: "strict", partial: true });
    assert.strictEqual(valid.valid, true);
    const invalid = validateConfig({ latestSettings: { latestMarkerProviders: { "bad.dot": { enabled: true } } } }, { mode: "strict", partial: true });
    assert.strictEqual(invalid.valid, false);
    const unsafe = validateConfig({ latestSettings: { latestMarkerProviders: JSON.parse('{"__proto__":{"enabled":true}}') } }, { mode: "strict", partial: true });
    assert.strictEqual(unsafe.valid, false);
  });

  runTest("Latest marker queries coalesce and time out without retaining requests", async () => {
    const { broker, commands } = make({ timeoutMs: 5 });
    broker.register("trusted", metadata);
    const first = broker.query(metadata.id, ["1", "2"]);
    const second = broker.query(metadata.id, ["1", "2"]);
    assert.strictEqual(commands.length, 1);
    assert.deepStrictEqual(await first, {});
    assert.deepStrictEqual(await second, {});
    assert.strictEqual(broker.pendingCount(), 0);
    assert.strictEqual(broker.respond("trusted", { providerId: metadata.id, requestId: commands[0].detail.requestId, markers: {} }).ok, false);
  });
};
