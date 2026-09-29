module.exports = function ({ assert, loadModule, runTest }) {
  const { createLibraryLatestMarkerProvider } = loadModule("addons/library-addon/src/app/latestMarkerProvider.js");
  runTest("Library marker provider maps saved states and coalesces invalidation", async () => {
    const calls = [];
    const states = ["saved", "backlog", "playing", "paused", "completed", "dropped"];
    const provider = createLibraryLatestMarkerProvider({
      core: { invokeCoreAction: async (action, payload) => { calls.push({ action, payload }); return { ok: true }; } },
      getEntry: async (id) => states[Number(id) - 1] ? { personal: { status: states[Number(id) - 1] } } : null,
      isActive: () => true,
    });
    await provider.start();
    await provider.query({ providerId: "library-status", requestId: "r1", threadIds: ["1", "2", "3", "4", "5", "6", "7", "1"] });
    const response = calls.find((call) => call.action === "latest.markers.respond");
    assert.strictEqual(Object.keys(response.payload.markers).length, 6);
    assert.strictEqual(response.payload.markers[1].label, "Saved");
    assert.strictEqual(response.payload.markers[5].tone, "success");
    const previousInvalidations = calls.filter((call) => call.action === "latest.markers.invalidate").length;
    provider.changed(); provider.changed();
    await Promise.resolve();
    assert.strictEqual(calls.filter((call) => call.action === "latest.markers.invalidate").length, previousInvalidations + 1);
    await provider.stop();
    assert.strictEqual(calls.at(-1).action, "latest.markers.unregister");
  });
  runTest("Library marker provider suppresses old route replies and tolerates unsupported core", async () => {
    let resolve;
    const calls = [];
    const provider = createLibraryLatestMarkerProvider({
      core: { invokeCoreAction: async (action) => { calls.push(action); return { ok: true }; } },
      getEntry: () => new Promise((done) => { resolve = done; }), isActive: () => true,
    });
    await provider.start();
    const query = provider.query({ providerId: "library-status", requestId: "r", threadIds: ["1"] });
    provider.cancel();
    resolve({ personal: { status: "playing" } });
    await query;
    assert.strictEqual(calls.includes("latest.markers.respond"), false);
    const unsupported = createLibraryLatestMarkerProvider({ core: { invokeCoreAction: async () => ({ ok: false, reason: "unsupported_action" }) }, getEntry: () => { throw new Error("must not query"); }, isActive: () => true });
    await unsupported.start();
    await unsupported.query({ providerId: "library-status", requestId: "r", threadIds: ["1"] });
  });
};
