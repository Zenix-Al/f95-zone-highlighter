"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest, Window }) => {
  runTest("SIGNATURE-COLLAPSE-01 discovers delayed signatures without duplicates and cleans up", () => {
    const window = new Window();
    const previousDocument = global.document;
    const previousHarness = global.__signatureObserverHarness;
    const callbacks = new Map();
    global.document = window.document;
    global.__signatureObserverHarness = {
      addObserverCallback: (id, callback) => callbacks.set(id, callback),
      removeObserverCallback: (id) => callbacks.delete(id),
    };
    const { signatureCollapseFeature: feature } = loadModule("src/features/signature-collapse/index.js", {
      loader: { ".css": "text" },
      sourceReplacements: {
        'import { createStyledFeature } from "../../core/createStyledFeature.js";': "const createStyledFeature = (_name, options) => options;",
        'import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";': "const { addObserverCallback, removeObserverCallback } = global.__signatureObserverHarness;",
      },
    });
    try {
      feature.enable();
      assert.strictEqual(callbacks.size, 1, "empty initial DOM still registers discovery");
      const container = window.document.createElement("div");
      container.innerHTML = '<aside class="message-signature"><div class="bbWrapper">Laugh and grow fat.</div></aside>';
      window.document.body.append(container);
      const deliver = (node) => callbacks.values().next().value([{ addedNodes: [node] }]);
      deliver(container);
      const signature = container.querySelector("aside");
      assert.strictEqual(signature.dataset.latestProcessed, "true");
      deliver(container);
      deliver(signature.nextElementSibling);
      assert.strictEqual(container.querySelectorAll("button").length, 1);
      signature.nextElementSibling.click();
      assert.strictEqual(signature.classList.contains("latest-signature-expanded"), true);
      assert.strictEqual(signature.nextElementSibling.textContent, "Hide signature");
      signature.nextElementSibling.remove();
      deliver(container);
      assert.strictEqual(container.querySelectorAll("button").length, 1, "stale processed marker can recover");
      const direct = window.document.createElement("aside");
      direct.className = "message-signature";
      window.document.body.append(direct);
      deliver(direct);
      assert.ok(direct.nextElementSibling.matches(".latest-signature-toggle"));
      feature.disable();
      assert.strictEqual(callbacks.size, 0);
      assert.strictEqual(window.document.querySelectorAll(".latest-signature-toggle").length, 0);
      assert.strictEqual(signature.hasAttribute("data-latest-processed"), false);
      assert.strictEqual(signature.classList.contains("latest-signature-expanded"), false);
      feature.enable();
      assert.strictEqual(window.document.querySelectorAll(".latest-signature-toggle").length, 2);
    } finally {
      feature.disable();
      global.document = previousDocument;
      global.__signatureObserverHarness = previousHarness;
      window.happyDOM.abort();
    }
    const css = fs.readFileSync(path.join(ROOT, "src/features/signature-collapse/style.css"), "utf8");
    assert.match(css, /aside\.message-signature\[data-latest-processed="true"\]/);
  });
};
