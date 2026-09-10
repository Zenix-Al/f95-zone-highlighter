"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../..");

async function loadProductionSettingsMarkup() {
  const moduleUrl = pathToFileURL(
    path.join(
      ROOT,
      "addons/thread-utility-addon/src/ui/settingsDialog.js",
    ),
  );
  const { renderSettingsDialog } = await import(moduleUrl.href);
  const quickSearches = Array.from({ length: 8 }, (_, index) => ({
    id: `visual-${index + 1}`,
    label: `Utility ${index + 1}`,
    query: `Query ${index + 1}`,
    includeTitle: index % 3 !== 0,
    enabled: true,
  }));
  return renderSettingsDialog({
    searchScope: "thread",
    excludedTagMode: "muted",
    quickSearches,
  });
}

async function loadProductionScopedCss() {
  const sanitizerUrl = pathToFileURL(
    path.join(ROOT, "src/services/addons/uiSanitizer.js"),
  );
  const { sanitizeAddonCss } = await import(sanitizerUrl.href);
  const source = fs.readFileSync(
    path.join(
      ROOT,
      "addons/thread-utility-addon/src/ui/threadUtility.css",
    ),
    "utf8",
  );
  const result = sanitizeAddonCss("thread-utility-addon", source);
  if (!result.ok) throw new Error(`Thread Utility CSS rejected: ${result.reason}`);
  return result.cssText;
}

async function mountSettings(page, markup, css) {
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Thread Utility visual fixture</title></head>
      <body>
        <main class="fixture-dialog" data-addon-id="thread-utility-addon">
          ${markup}
        </main>
      </body>
    </html>`);
  await page.addStyleTag({
    content: `
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #0f1114; }
      body { padding: 12px; font: 16px Arial, sans-serif; color: #f0f2f6; }
      .fixture-dialog { width: min(980px, calc(100vw - 24px)); margin: 0 auto; }
      ${css}
    `,
  });
}

async function styleOf(page, selector, properties) {
  return page.locator(selector).first().evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style[name]]));
  }, properties);
}

test("Thread Utility settings keep rows above the action footer", async ({
  page,
}, testInfo) => {
  const [markup, css] = await Promise.all([
    loadProductionSettingsMarkup(),
    loadProductionScopedCss(),
  ]);

  await mountSettings(page, markup, css);

  expect({
    shell: await styleOf(page, ".thread-utility-settings-window", ["backgroundColor", "borderTopColor"]),
    row: await styleOf(page, ".thread-utility-settings-row", ["backgroundColor", "borderTopColor"]),
    field: await styleOf(page, ".thread-utility-settings input[name=label]", ["backgroundColor", "borderTopColor", "color"]),
    neutral: await styleOf(page, '[data-settings-action="move-down"]', ["backgroundColor", "borderTopColor", "color"]),
    primary: await styleOf(page, '[data-settings-action="save"]', ["backgroundColor", "borderTopColor", "color"]),
    destructive: await styleOf(page, '[data-settings-action="delete"]', ["backgroundColor", "borderTopColor", "color"]),
  }).toEqual({
    shell: { backgroundColor: "rgb(25, 27, 30)", borderTopColor: "rgb(63, 64, 67)" },
    row: { backgroundColor: "rgb(23, 25, 29)", borderTopColor: "rgb(49, 52, 58)" },
    field: { backgroundColor: "rgb(34, 34, 34)", borderTopColor: "rgb(85, 85, 85)", color: "rgb(255, 255, 255)" },
    neutral: { backgroundColor: "rgb(32, 36, 42)", borderTopColor: "rgb(67, 72, 80)", color: "rgb(237, 240, 243)" },
    primary: { backgroundColor: "rgb(137, 56, 57)", borderTopColor: "rgb(137, 56, 57)", color: "rgb(255, 255, 255)" },
    destructive: { backgroundColor: "rgba(0, 0, 0, 0)", borderTopColor: "rgb(137, 56, 57)", color: "rgb(242, 195, 195)" },
  });

  await testInfo.attach("thread-utility-settings-top.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  const list = page.locator(".thread-utility-settings-list");
  const footer = page.locator(".thread-utility-settings-actions");
  await expect(list).toBeVisible();
  await expect(footer).toBeVisible();

  const firstRowBox = await page.locator(".thread-utility-settings-row").first().boundingBox();
  expect(firstRowBox.height).toBeLessThanOrEqual(142);

  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const [listBox, footerBox] = await Promise.all([
    list.boundingBox(),
    footer.boundingBox(),
  ]);
  expect(listBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(footerBox.y + 0.5);

  const footerOwnsItsCenter = await footer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return hit === element || element.contains(hit);
  });
  expect(footerOwnsItsCenter).toBe(true);

  await testInfo.attach("thread-utility-settings-bottom.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("Thread Utility settings remain bounded at narrow width", async ({ page }, testInfo) => {
  const [markup, css] = await Promise.all([
    loadProductionSettingsMarkup(),
    loadProductionScopedCss(),
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSettings(page, markup, css);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator(".thread-utility-settings-list").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const listBox = await page.locator(".thread-utility-settings-list").boundingBox();
  const footerBox = await page.locator(".thread-utility-settings-actions").boundingBox();
  const firstRowBox = await page.locator(".thread-utility-settings-row").first().boundingBox();
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(footerBox.y + 0.5);
  expect(firstRowBox.height).toBeLessThanOrEqual(150);
  await testInfo.attach("thread-utility-settings-narrow.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
