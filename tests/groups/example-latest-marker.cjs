module.exports = function ({ assert, loadModule, runTest }) {
  const { createExampleMarkerProvider, EXAMPLE_MARKER_PROVIDER_ID } = loadModule("addons/example-addon/src/api/latestMarkers.js");

  runTest("Example marker provider demonstrates the bounded opt-in API", async () => {
    const calls = [];
    let active = true;
    const core = { invokeCoreAction: async (action, payload) => {
      calls.push({ action, payload });
      return { ok: true };
    } };
    const provider = createExampleMarkerProvider({ core, isActive: () => active });
    await provider.query({ providerId: EXAMPLE_MARKER_PROVIDER_ID, requestId: "before", threadIds: ["1"] });
    assert.strictEqual(calls.length, 0);
    await provider.register();
    await provider.register();
    assert.strictEqual(calls.filter(({ action }) => action === "latest.markers.register").length, 1);
    await provider.query({ providerId: EXAMPLE_MARKER_PROVIDER_ID, requestId: "r1", threadIds: ["bad", "2", "3"] });
    const response = calls.find(({ action }) => action === "latest.markers.respond");
    assert.deepStrictEqual(Object.keys(response.payload.markers), ["2"]);
    assert.strictEqual(response.payload.markers[2].label, "Example");
    await provider.invalidate();
    assert.ok(calls.some(({ action }) => action === "latest.markers.invalidate"));
    active = false;
    await provider.unregister();
    await provider.query({ providerId: EXAMPLE_MARKER_PROVIDER_ID, requestId: "late", threadIds: ["2"] });
    assert.strictEqual(calls.filter(({ action }) => action === "latest.markers.respond").length, 1);
    assert.strictEqual(calls.at(-1).action, "latest.markers.unregister");
  });

  runTest("Example marker provider unregisters a superseded registration", async () => {
    const calls = [];
    let resolveRegister;
    const core = { invokeCoreAction: (action, payload) => {
      calls.push({ action, payload });
      if (action === "latest.markers.register") return new Promise((resolve) => { resolveRegister = resolve; });
      return Promise.resolve({ ok: true });
    } };
    const provider = createExampleMarkerProvider({ core, isActive: () => true });
    const registering = provider.register();
    await provider.unregister();
    resolveRegister({ ok: true });
    assert.strictEqual((await registering).reason, "registration_superseded");
    assert.strictEqual(calls.at(-1).action, "latest.markers.unregister");
  });

  runTest("Example command binding forwards marker queries to the provider", async () => {
    const { createExampleCommandController } = loadModule("addons/example-addon/src/app/commands.js");
    let receive;
    const queries = [];
    const commandController = createExampleCommandController({
      core: { bindAddonCommands: (handler) => { receive = handler; return () => {}; } },
      state: { enabled: true }, getLifecycle: () => ({}), bulkImport: {},
      onDockAction: () => {}, onDialogClosed: () => {}, onObserverNodes: () => {},
      onMarkerQuery: async (detail) => { queries.push(detail); },
      onError: (action, error) => { throw new Error(`${action}: ${error}`); },
    });
    commandController.bind();
    receive({ command: "latest-markers.query", providerId: EXAMPLE_MARKER_PROVIDER_ID, requestId: "r" });
    await Promise.resolve();
    assert.deepStrictEqual(queries.map(({ requestId }) => requestId), ["r"]);
    commandController.unbind();
  });
};
