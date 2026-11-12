module.exports = ({
  assert,
  fs,
  path,
  ROOT,
  createDomSandbox,
  loadModule,
  runTest,
  getDefaultConfig,
  sanitizeConfig,
  validateConfig,
  getConfigPathMetadata,
}) => {
  runTest(
    "THREAD-SETTINGS-01 retired wide-thread state is dropped without changing active settings",
    () => {
      assert.strictEqual(Object.hasOwn(getDefaultConfig().threadSettings, "isWide"), false);
      assert.strictEqual(getConfigPathMetadata("threadSettings.isWide"), null);
      const old = { threadSettings: { isWide: true, collapseSignature: true, preferred: false } };
      const cleaned = sanitizeConfig(old).data;
      assert.strictEqual(Object.hasOwn(cleaned.threadSettings, "isWide"), false);
      assert.strictEqual(cleaned.threadSettings.collapseSignature, true);
      assert.strictEqual(cleaned.threadSettings.preferred, false);
      assert.strictEqual(validateConfig(old, { mode: "strict", partial: true }).valid, false);
      const manifest = fs.readFileSync(
        path.join(ROOT, "src/generated/features.generated.js"),
        "utf8",
      );
      assert.doesNotMatch(manifest, /wideForumFeature|features\/wideForum/);
      assert.match(manifest, /wideLatestPageFeature/);
    },
  );

  runTest(
    "THREAD-SETTINGS-02 overlay controls render inline under a header with one metadata owner",
    () => {
      const sandbox = createDomSandbox("https://f95zone.to/threads/settings.1/");
      const releases = [];
      try {
        const harness = loadModule("tests/fixtures/threadSettingsHarness.js");
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = '<div id="thread-settings-container"></div>';
        harness.stateManager.set("shadowRoot", root);
        const feature = harness.threadOverlayFeature;
        assert.strictEqual(feature.settingsUi.sectionId, "thread");
        for (const map of feature.settingsUi.metaMaps) {
          releases.push(harness.contributeToSection("thread", map, "feature:thread-overlay"));
        }
        harness.renderAllSettingsSections();
        const panel = root.querySelector("#thread-settings-container");
        assert.strictEqual(panel.firstElementChild.className, "config-header");
        assert.strictEqual(panel.firstElementChild.textContent, "Thread Overlay");
        assert.strictEqual(panel.querySelector("button"), null);
        assert.strictEqual(panel.querySelectorAll('input[type="checkbox"]').length, 6);
        for (const key of [
          "threadOverlayToggle",
          "marked",
          "preferred",
          "preferredShadow",
          "excluded",
          "excludedShadow",
        ]) {
          const entry = harness.getMetadataByConfigPath(`threadSettings.${key}`);
          assert.strictEqual(entry.sectionId, "thread");
          assert.strictEqual(typeof entry.effects.custom, "function");
          assert.strictEqual(
            panel.querySelector(`#setting-${key}`).checked,
            Boolean(harness.config.threadSettings[key]),
          );
        }
        assert.strictEqual(
          Object.keys(harness.getSettingsMetadataBySection("thread-overlay-dialog")).length,
          0,
        );
        for (const release of releases.splice(0)) release();
        assert.strictEqual(Object.keys(harness.getSettingsMetadataBySection("thread")).length, 0);
      } finally {
        for (const release of releases) release();
        sandbox.restore();
      }
    },
  );
};
