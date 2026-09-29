"use strict";

module.exports = function registerThreadUtilityBaseline(context) {
  const { ROOT, Window, assert, fs, path, runTest } = context;
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
