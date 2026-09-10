"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../..");

async function styleOf(page, selector, properties) {
  return page.locator(selector).first().evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style[name]]));
  }, properties);
}

test("core Settings provides the browser-rendered visual reference", async ({ page }, testInfo) => {
  const css = fs.readFileSync(path.join(ROOT, "src/ui/assets/css.css"), "utf8");
  await page.setContent(`<!doctype html><html lang="en"><body>
    <div id="tag-config-modal"><div class="modal-content"><div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-sidebar-title">Settings</div>
        <button class="settings-nav-item active">General</button>
        <button class="modal-btn settings-close-btn">Close</button>
      </aside>
      <section class="settings-main"><div class="settings-panel active">
        <div class="settings-wrapper-inner">
          <div class="addins-card">
            <div class="addins-card-name">Reference group</div>
            <div class="config-row"><label for="reference-input">Text value</label><input id="reference-input" value="Example"></div>
            <div class="config-row"><label for="reference-select">Select value</label><select id="reference-select"><option>Choice</option></select></div>
            <div class="config-row"><label for="reference-check">Enabled</label><input id="reference-check" type="checkbox" checked></div>
            <div class="addins-card-actions">
              <button class="addins-action-btn">Neutral</button>
              <button class="config-button">Primary</button>
            </div>
          </div>
        </div>
      </section></div>
    </div></div></div>
  </body></html>`);
  await page.addStyleTag({ content: `${css}
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #0f1114; }
    body { font-family: Arial, sans-serif; }
    #tag-config-modal { position: static; display: block; width: 100%; height: auto; padding: 12px; }
    #tag-config-modal .modal-content { margin: 0 auto; }
    .settings-sidebar .settings-close-btn { margin-top: auto; }
  ` });
  await page.mouse.move(0, 0);

  const reference = {
    modal: await styleOf(page, ".modal-content", ["backgroundColor"]),
    sidebar: await styleOf(page, ".settings-sidebar", ["backgroundColor", "borderRightColor"]),
    card: await styleOf(page, ".addins-card", ["backgroundColor", "borderTopColor"]),
    field: await styleOf(page, "#reference-select", ["backgroundColor", "borderTopColor", "color"]),
    neutral: await styleOf(page, ".addins-action-btn", ["backgroundColor", "borderTopColor", "color"]),
    primary: await styleOf(page, ".config-button", ["backgroundColor", "borderTopColor", "color"]),
  };
  expect(reference).toEqual({
    modal: { backgroundColor: "rgb(25, 27, 30)" },
    sidebar: { backgroundColor: "rgb(20, 22, 25)", borderRightColor: "rgb(43, 46, 51)" },
    card: { backgroundColor: "rgb(23, 25, 29)", borderTopColor: "rgb(49, 52, 58)" },
    field: { backgroundColor: "rgb(34, 34, 34)", borderTopColor: "rgb(85, 85, 85)", color: "rgb(255, 255, 255)" },
    neutral: { backgroundColor: "rgb(32, 36, 42)", borderTopColor: "rgb(67, 72, 80)", color: "rgb(237, 240, 243)" },
    primary: { backgroundColor: "rgb(137, 56, 57)", borderTopColor: "rgb(137, 56, 57)", color: "rgb(255, 255, 255)" },
  });
  await testInfo.attach("core-settings-reference.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("core-settings-computed.json", {
    body: Buffer.from(`${JSON.stringify(reference, null, 2)}\n`),
    contentType: "application/json",
  });
});
