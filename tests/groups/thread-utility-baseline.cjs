"use strict";

module.exports = function registerThreadUtilityBaseline(context) {
  const { ROOT, Window, assert, fs, path, runTest } = context;
  const referencePath = path.join(
    ROOT,
    "addons",
    "reference",
    "F95 Utility buttons.user.js",
  );
  const fixturePath = path.join(
    ROOT,
    "addons",
    "reference",
    "sample.html",
  );

  function readRequired(filePath, contract) {
    assert.ok(
      fs.existsSync(filePath),
      `THREAD-UTILITY-BASELINE-01 missing contract: ${contract}`,
    );
    const value = fs.readFileSync(filePath, "utf8");
    assert.ok(
      value.trim(),
      `THREAD-UTILITY-BASELINE-01 empty contract: ${contract}`,
    );
    return value;
  }

  function requireSelector(root, selector, contract) {
    const node = root.querySelector(selector);
    assert.ok(
      node,
      `THREAD-UTILITY-BASELINE-01 missing contract: ${contract} (${selector})`,
    );
    return node;
  }

  runTest(
    "THREAD-UTILITY-BASELINE-01 records reference defaults and settings behavior",
    () => {
      const source = readRequired(referencePath, "reference userscript");
      assert.match(source, /@author\s+GGD40727/);
      assert.match(source, /@license\s+MIT/);

      const defaultsMatch = source.match(
        /const DEFAULT_BUTTONS\s*=\s*(\[[\s\S]*?\]);/,
      );
      assert.ok(
        defaultsMatch,
        "THREAD-UTILITY-BASELINE-01 missing contract: DEFAULT_BUTTONS",
      );
      const defaults = Function(`"use strict"; return (${defaultsMatch[1]});`)();
      assert.deepStrictEqual(defaults, [
        { label: "Update", query: "Update", useTitle: true },
        { label: "New+Compressed", query: "Compressed", useTitle: true },
        { label: "Compressed", query: "Compressed", useTitle: false },
        { label: "Walkthrough", query: "Walkthrough", useTitle: true },
        { label: "Mod", query: "Mod", useTitle: false },
        { label: "Cheats", query: "Cheats", useTitle: true },
      ]);

      for (const [contract, pattern] of [
        ["new-tab preference", /GM_getValue\('openInNewTab',\s*true\)/],
        ["custom label", /f95-input-label/],
        ["custom query", /f95-input-query/],
        ["include-title toggle", /f95-input-title/],
        ["move up", /btn-up/],
        ["move down", /btn-down/],
        ["delete", /btn-del/],
        ["add button", /f95-add-row/],
      ]) {
        assert.match(
          source,
          pattern,
          `THREAD-UTILITY-BASELINE-01 missing contract: ${contract}`,
        );
      }
    },
  );

  runTest(
    "THREAD-UTILITY-BASELINE-01 fixture has one canonical starter and required roots",
    () => {
      const fixture = readRequired(fixturePath, "canonical thread fixture");
      const window = new Window();
      window.document.body.innerHTML = fixture;

      requireSelector(
        window.document,
        "h1.p-title-value",
        "thread header title",
      );
      requireSelector(
        window.document,
        ".js-tagList a.tagItem",
        "thread header tags",
      );
      requireSelector(
        window.document,
        'select[name="rating"][data-initial-rating]',
        "thread rating",
      );
      const starters = window.document.querySelectorAll(
        "article.message-threadStarterPost",
      );
      assert.strictEqual(
        starters.length,
        1,
        "THREAD-UTILITY-BASELINE-01 contract violation: expected exactly one starter-post marker",
      );
      requireSelector(
        starters[0],
        ".message-body .bbWrapper",
        "starter-post content root",
      );
      assert.ok(
        [...starters[0].querySelectorAll("a")].some(
          (anchor) => anchor.textContent.trim() === "#1",
        ),
        "THREAD-UTILITY-BASELINE-01 missing contract: #1 fallback verification",
      );
    },
  );

  runTest(
    "THREAD-UTILITY-BASELINE-01 fixture has direct and masked delegation examples",
    () => {
      const fixture = readRequired(fixturePath, "canonical thread fixture");
      const window = new Window();
      window.document.body.innerHTML = fixture;
      const starter = requireSelector(
        window.document,
        "article.message-threadStarterPost",
        "starter post",
      );
      const direct = requireSelector(
        starter,
        '.f95ue-addon-resolve-btn[data-addon-id="masked-direct-addon"][data-action-type="direct"][data-direct-href]',
        "Masked Direct direct-download button",
      );
      assert.match(direct.dataset.directHref, /^https:\/\/datanodes\.to\//);

      const maskedButtons = [
        ...starter.querySelectorAll(
          '.f95ue-addon-resolve-btn[data-addon-id="masked-direct-addon"][data-action-type="masked"][data-masked-href]',
        ),
      ];
      assert.strictEqual(
        maskedButtons.length,
        4,
        "THREAD-UTILITY-BASELINE-01 contract violation: expected four masked resolver examples",
      );
      assert.deepStrictEqual(
        maskedButtons.map((button) => {
          const url = new URL(button.dataset.maskedHref);
          return url.pathname.split("/").filter(Boolean)[1];
        }),
        ["gofile.io", "mega.nz", "pixeldrain.com", "workupload.com"],
      );
    },
  );
};
