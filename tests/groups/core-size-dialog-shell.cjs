module.exports = function registerGroup(context) {
  const { assert, Window, loadModule, runTest } = context;

  function createEnvironment() {
    const previous = {};
    const window = new Window({ url: "https://f95zone.to/threads/dialog-test.1/" });
    for (const key of ["window", "document", "Event", "KeyboardEvent", "Node"]) {
      previous[key] = global[key];
      global[key] = window[key];
    }
    const host = window.document.createElement("div");
    window.document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const harness = loadModule("tests/fixtures/dialogHarness.js");
    harness.setDialogRoot(shadow);
    return {
      window,
      shadow,
      harness,
      restore() {
        harness.setDialogRoot(null);
        for (const [key, value] of Object.entries(previous)) global[key] = value;
        window.close();
      },
    };
  }

  function key(window, target, value, init = {}) {
    target.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  }

  runTest("CORE-SIZE-DIALOG-SHELL-01 confirm preserves all resolution paths and focus", async () => {
    const env = createEnvironment();
    try {
      let promise = env.harness.openConfirmDialog();
      env.shadow.querySelector(".dialog-submit").click();
      assert.strictEqual(await promise, true);

      promise = env.harness.openConfirmDialog();
      env.shadow.querySelector(".dialog-cancel").click();
      assert.strictEqual(await promise, false);

      promise = env.harness.openConfirmDialog();
      key(env.window, env.shadow.getElementById("latest-config-dialog"), "Enter");
      assert.strictEqual(await promise, true);

      promise = env.harness.openConfirmDialog();
      key(env.window, env.shadow.getElementById("latest-config-dialog"), "Escape");
      assert.strictEqual(await promise, false);

      promise = env.harness.openConfirmDialog();
      env.shadow.getElementById("latest-config-dialog").click();
      assert.strictEqual(await promise, false);

      promise = env.harness.openConfirmDialog();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(env.shadow.activeElement, env.shadow.querySelector(".dialog-submit"));
      env.shadow.querySelector(".dialog-cancel").click();
      await promise;
    } finally {
      env.restore();
    }
  });

  runTest("CORE-SIZE-DIALOG-SHELL-01 prompt preserves validation, modes, keys, and cancellation", async () => {
    const env = createEnvironment();
    try {
      let promise = env.harness.openTextPrompt({
        defaultValue: "bad",
        validate: (value) => value === "bad" ? "Invalid value" : "",
      });
      let input = env.shadow.querySelector(".config-dialog-input");
      env.shadow.querySelector(".dialog-submit").click();
      assert.strictEqual(env.shadow.querySelector(".config-dialog-error").textContent, "Invalid value");
      input.value = "  good  ";
      key(env.window, input, "Enter");
      assert.strictEqual(await promise, "good");

      promise = env.harness.openTextPrompt({ defaultValue: "readonly", readOnly: true });
      input = env.shadow.querySelector(".config-dialog-input");
      assert.strictEqual(input.readOnly, true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(env.shadow.activeElement, input);
      assert.strictEqual(input.selectionStart, 0);
      assert.strictEqual(input.selectionEnd, input.value.length);
      key(env.window, input, "Escape");
      assert.strictEqual(await promise, null);

      promise = env.harness.openTextPrompt({ defaultValue: "multi", multiline: true });
      input = env.shadow.querySelector("textarea");
      key(env.window, input, "Enter");
      assert.ok(env.shadow.getElementById("latest-config-dialog"));
      key(env.window, input, "Enter", { ctrlKey: true });
      assert.strictEqual(await promise, "multi");

      promise = env.harness.openTextPrompt();
      env.shadow.getElementById("latest-config-dialog").click();
      assert.strictEqual(await promise, null);
    } finally {
      env.restore();
    }
  });

  runTest("CORE-SIZE-DIALOG-SHELL-01 reorder preserves boundaries, order, save, and cancel", async () => {
    const env = createEnvironment();
    const items = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C" },
    ];
    try {
      let promise = env.harness.openReorderDialog({ items });
      let buttons = [...env.shadow.querySelectorAll(".config-reorder-btn")];
      assert.strictEqual(buttons[0].disabled, true);
      assert.strictEqual(buttons.at(-1).disabled, true);
      buttons[3].click();
      env.shadow.querySelector(".dialog-submit").click();
      assert.deepStrictEqual(await promise, ["a", "c", "b"]);
      assert.deepStrictEqual(items.map((item) => item.key), ["a", "b", "c"]);

      promise = env.harness.openReorderDialog({ items });
      buttons = [...env.shadow.querySelectorAll(".config-reorder-btn")];
      buttons[2].click();
      env.shadow.querySelector(".dialog-cancel").click();
      assert.strictEqual(await promise, null);

      promise = env.harness.openReorderDialog({ items });
      key(env.window, env.shadow.getElementById("latest-config-dialog"), "Escape");
      assert.strictEqual(await promise, null);
    } finally {
      env.restore();
    }
  });

  runTest("CORE-SIZE-DIALOG-SHELL-01 settings closes once from every supported path", () => {
    const env = createEnvironment();
    try {
      let closes = 0;
      let dialog = env.harness.openSettingsDialog({ onClose: () => closes++ });
      assert.ok(dialog.backdrop && dialog.panel && dialog.content && dialog.close);
      env.shadow.querySelector(".dialog-cancel").click();
      dialog.close();
      assert.strictEqual(closes, 1);

      dialog = env.harness.openSettingsDialog({ onClose: () => closes++ });
      dialog.backdrop.click();
      assert.strictEqual(closes, 2);

      env.harness.openSettingsDialog({ onClose: () => closes++ });
      key(env.window, env.window.document, "Escape");
      assert.strictEqual(closes, 3);
    } finally {
      env.restore();
    }
  });

  runTest("CORE-SIZE-DIALOG-SHELL-01 returns safe values without a Shadow root", async () => {
    const env = createEnvironment();
    try {
      env.harness.setDialogRoot(null);
      assert.strictEqual(await env.harness.openConfirmDialog(), false);
      assert.strictEqual(await env.harness.openTextPrompt(), null);
      assert.strictEqual(await env.harness.openReorderDialog(), null);
      assert.strictEqual(env.harness.openSettingsDialog(), null);
    } finally {
      env.restore();
    }
  });
};
