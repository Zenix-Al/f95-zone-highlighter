"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../..");
const EVIDENCE = JSON.parse(fs.readFileSync(path.join(
  ROOT,
  "docs/architecture/thread-utility-style-baseline.json",
), "utf8"));

const WAVE_2_COMPUTED = {
  surface: { backgroundColor: "rgb(25, 27, 30)", borderTopColor: "rgb(63, 64, 67)", color: "rgb(197, 201, 208)" },
  summary: { backgroundColor: "rgb(25, 27, 30)", borderBottomColor: "rgb(43, 46, 51)" },
  footer: { backgroundColor: "rgb(20, 22, 25)", borderTopColor: "rgb(43, 46, 51)" },
  utility: { backgroundColor: "rgb(32, 36, 42)", color: "rgb(237, 240, 243)" },
  copyAction: { backgroundColor: "rgb(32, 36, 42)", borderTopColor: "rgb(67, 72, 80)" },
  disclosure: { backgroundColor: "rgba(0, 0, 0, 0)", color: "rgb(240, 242, 246)" },
  status: { backgroundColor: "rgb(30, 31, 33)", borderTopColor: "rgb(63, 64, 67)" },
  normalTag: { backgroundColor: "rgb(32, 36, 42)", borderTopColor: "rgb(67, 72, 80)", color: "rgb(199, 204, 212)" },
  markedTag: { backgroundColor: "rgb(74, 79, 85)", borderTopColor: "rgb(74, 79, 85)", color: "rgb(255, 255, 255)" },
  preferredTag: { backgroundColor: "rgb(123, 31, 162)", borderTopColor: "rgb(123, 31, 162)", color: "rgb(255, 255, 255)" },
  excludedTag: { backgroundColor: "rgb(183, 28, 28)", borderTopColor: "rgb(183, 28, 28)", color: "rgb(255, 255, 255)" },
  overflowButton: { backgroundColor: "rgb(32, 36, 42)", borderTopColor: "rgb(67, 72, 80)", color: "rgb(199, 204, 212)" },
  focusedUtility: { outlineColor: "rgb(193, 88, 88)", outlineStyle: "solid", outlineWidth: "2px" },
};

const WAVE_4_DISCLOSURES = {
  collapsed: ["Description", "Installation", "Downloads (3)"],
  descriptionOpen: "Description",
  installationOpen: "Installation",
  downloadsOpen: "Downloads (3)",
};

function section(id, text) {
  return {
    id,
    available: true,
    html: `<p>${text} content used by the browser baseline.</p>`,
    text,
    nodeCount: 1,
    truncated: false,
  };
}

function paletteState({ open = null, status = "ready" } = {}) {
  return {
    snapshot: {
      title: "Visual Baseline Game",
      version: "v1.2.3",
      developer: "Example Studio",
      rating: null,
      prefixes: ["Completed", "Ren'Py"],
    },
    displayTags: [
      { id: 1, label: "Normal tag", status: "normal" },
      { id: 2, label: "Marked tag", status: "marked" },
      { id: 3, label: "Preferred tag", status: "preferred" },
      { id: 4, label: "Excluded tag", status: "excluded" },
      { id: 5, label: "Overflow one", status: "normal" },
      { id: 6, label: "Overflow two", status: "normal" },
    ],
    utilities: [
      { id: "copy-title", family: "fixed", label: "Copy title" },
      { id: "copy-thread-link", family: "fixed", label: "Copy link" },
      { id: "refresh-fixed", family: "fixed", label: "Refresh metadata" },
      { id: "search-update", family: "quick-search", label: "Update" },
      { id: "search-compressed", family: "quick-search", label: "Compressed" },
    ],
    settings: { visibleTagLimit: 4, descriptionPreviewLines: 4 },
    content: {
      description: section("description", "Description"),
      installation: section("installation", "Installation"),
    },
    downloads: [
      { id: "download-1", label: "PixelDrain", platform: "Windows", maskedDirectToken: "", actionType: "" },
      { id: "download-2", label: "Datanodes", platform: "Windows", maskedDirectToken: "token", actionType: "direct" },
      { id: "download-3", label: "Workupload", platform: "Linux", maskedDirectToken: "token", actionType: "masked" },
    ],
    ui: {
      dialogOpen: true,
      dialogGeneration: 1,
      tagsExpanded: false,
      openContentSection: open,
      paletteStatus: status,
      paletteMessage: status === "ready" ? "" : `${status} baseline state`,
    },
  };
}

async function productionAssets() {
  const [{ renderPalette }, { sanitizeAddonCss }] = await Promise.all([
    import(pathToFileURL(path.join(
      ROOT,
      "addons/thread-utility-addon/src/ui/palette.js",
    )).href),
    import(pathToFileURL(path.join(
      ROOT,
      "src/services/addons/uiSanitizer.js",
    )).href),
  ]);
  const sourceCss = fs.readFileSync(path.join(
    ROOT,
    "addons/thread-utility-addon/src/ui/threadUtility.css",
  ), "utf8");
  const sanitized = sanitizeAddonCss("thread-utility-addon", sourceCss);
  if (!sanitized.ok) throw new Error(`Thread Utility CSS rejected: ${sanitized.reason}`);
  return { renderPalette, sourceCss, css: sanitized.cssText };
}

async function mountPalette(page, assets, state) {
  await page.setContent(`<!doctype html><html lang="en"><head>
    <meta charset="utf-8"><title>Thread Utility palette baseline</title>
    </head><body><main class="fixture-dialog" data-addon-id="thread-utility-addon">
      ${assets.renderPalette(state)}
    </main></body></html>`);
  await page.addStyleTag({ content: `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #0f1114; }
    body { padding: 12px; font: 16px Arial, sans-serif; color: #f0f2f6; }
    .fixture-dialog { width: min(1180px, calc(100vw - 24px)); margin: 0 auto; }
    ${assets.css}
  ` });
}

async function attachScreenshot(page, testInfo, name) {
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

async function styleOf(page, selector, properties) {
  return page.locator(selector).first().evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style[name]]));
  }, properties);
}

test("Thread Utility palette records desktop colors and disclosure labels", async ({ page }, testInfo) => {
  const assets = await productionAssets();
  await mountPalette(page, assets, paletteState());

  const result = {
    surface: await styleOf(page, ".thread-utility-palette", ["backgroundColor", "borderTopColor", "color"]),
    summary: await styleOf(page, ".thread-utility-summary", ["backgroundColor", "borderBottomColor"]),
    footer: await styleOf(page, ".thread-utility-footer", ["backgroundColor", "borderTopColor"]),
    utility: await styleOf(page, ".thread-utility-action--search", ["backgroundColor", "color"]),
    copyAction: await styleOf(page, ".thread-utility-title-actions button", ["backgroundColor", "borderTopColor"]),
    disclosure: await styleOf(page, ".thread-utility-content-disclosure", ["backgroundColor", "color"]),
    normalTag: await styleOf(page, ".thread-utility-tag--normal", ["backgroundColor", "borderTopColor", "color"]),
    markedTag: await styleOf(page, ".thread-utility-tag--marked", ["backgroundColor", "borderTopColor", "color"]),
    preferredTag: await styleOf(page, ".thread-utility-tag--preferred", ["backgroundColor", "borderTopColor", "color"]),
    excludedTag: await styleOf(page, ".thread-utility-tag--excluded", ["backgroundColor", "borderTopColor", "color"]),
    overflowButton: await styleOf(page, ".thread-utility-tag-toggle", ["backgroundColor", "borderTopColor", "color"]),
  };
  await page.locator(".thread-utility-action--search").first().focus();
  result.focusedUtility = await styleOf(page, ".thread-utility-action--search", ["outlineColor", "outlineStyle", "outlineWidth"]);

  const statusState = paletteState({ status: "partial" });
  await mountPalette(page, assets, statusState);
  result.status = await styleOf(page, ".thread-utility-status", ["backgroundColor", "borderTopColor"]);
  expect(result).toEqual(WAVE_2_COMPUTED);

  await mountPalette(page, assets, paletteState());
  const labels = await page.locator(".thread-utility-content-disclosure").allTextContents();
  expect(labels.map((label) => label.trim())).toEqual(WAVE_4_DISCLOSURES.collapsed);
  for (const name of WAVE_4_DISCLOSURES.collapsed) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
  }
  await testInfo.attach("thread-utility-computed-styles.json", {
    body: Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
    contentType: "application/json",
  });
  await attachScreenshot(page, testInfo, "thread-utility-palette-desktop");
});

test("Thread Utility palette captures open sections and runtime statuses", async ({ page }, testInfo) => {
  const assets = await productionAssets();
  for (const [sectionId, expected] of [
    ["description", WAVE_4_DISCLOSURES.descriptionOpen],
    ["installation", WAVE_4_DISCLOSURES.installationOpen],
    ["downloads", WAVE_4_DISCLOSURES.downloadsOpen],
  ]) {
    await mountPalette(page, assets, paletteState({ open: sectionId }));
    const openButton = page.locator('.thread-utility-content-disclosure[aria-expanded="true"]');
    await expect(openButton).toHaveText(expected);
    await attachScreenshot(page, testInfo, `thread-utility-${sectionId}-open`);
  }
  for (const status of ["loading", "partial", "empty", "failure"]) {
    await mountPalette(page, assets, paletteState({ status }));
    await expect(page.locator(".thread-utility-status")).toContainText(`${status} baseline state`);
  }
  await attachScreenshot(page, testInfo, "thread-utility-failure-state");
});

test("Thread Utility disclosure chevrons follow repeated state transitions", async ({ page }) => {
  const assets = await productionAssets();
  const sequence = [null, "description", null, "installation", "downloads", null];
  let closedTransform = "";
  let openTransform = "";
  for (const open of sequence) {
    await mountPalette(page, assets, paletteState({ open }));
    const disclosures = page.locator(".thread-utility-content-disclosure");
    const count = await disclosures.count();
    for (let index = 0; index < count; index += 1) {
      const button = disclosures.nth(index);
      const expanded = await button.getAttribute("aria-expanded");
      const pseudo = await button.evaluate((element) => {
        const style = getComputedStyle(element, "::after");
        return { content: style.content, transform: style.transform };
      });
      expect(pseudo.content).toBe('""');
      if (expanded === "true") openTransform ||= pseudo.transform;
      else closedTransform ||= pseudo.transform;
      expect(pseudo.transform).toBe(expanded === "true" ? openTransform : closedTransform);
    }
  }
  expect(openTransform).not.toBe("");
  expect(closedTransform).not.toBe("");
  expect(openTransform).not.toBe(closedTransform);
});

test("Thread Utility palette records narrow layout without horizontal overflow", async ({ page }, testInfo) => {
  const assets = await productionAssets();
  await page.setViewportSize({ width: 390, height: 844 });
  await mountPalette(page, assets, paletteState({ open: "downloads" }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await attachScreenshot(page, testInfo, "thread-utility-palette-narrow");
});

test("Thread Utility tags inherit user-configured core colors", async ({ page }) => {
  const assets = await productionAssets();
  await mountPalette(page, assets, paletteState());
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty("--marked-color", "#345678");
    root.setProperty("--marked-text-color", "#f1f2f3");
    root.setProperty("--preferred-color", "#654321");
    root.setProperty("--preferred-text-color", "#fafafa");
    root.setProperty("--excluded-color", "#123456");
    root.setProperty("--excluded-text-color", "#eeeeee");
  });
  expect(await styleOf(page, ".thread-utility-tag--marked", ["backgroundColor", "color"]))
    .toEqual({ backgroundColor: "rgb(52, 86, 120)", color: "rgb(241, 242, 243)" });
  expect(await styleOf(page, ".thread-utility-tag--preferred", ["backgroundColor", "color"]))
    .toEqual({ backgroundColor: "rgb(101, 67, 33)", color: "rgb(250, 250, 250)" });
  expect(await styleOf(page, ".thread-utility-tag--excluded", ["backgroundColor", "color"]))
    .toEqual({ backgroundColor: "rgb(18, 52, 86)", color: "rgb(238, 238, 238)" });
});

test("Thread Utility Wave 1 literal color inventory remains historical evidence", async () => {
  expect(EVIDENCE.packageId).toBe("THREAD-UTILITY-STYLE-BASELINE-01");
  expect(EVIDENCE.literalColors).toContainEqual({ value: "#1f2329", count: 1 });
  expect(EVIDENCE.literalColors).toContainEqual({ value: "#8ab4f8", count: 5 });
});
