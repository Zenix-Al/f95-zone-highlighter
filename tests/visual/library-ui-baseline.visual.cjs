"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const { test, expect } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../..");
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile-390", width: 390, height: 844 },
];

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function browserBundle(relativePath, globalName) {
  return buildSync({
    entryPoints: [path.join(ROOT, relativePath)],
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    write: false,
    loader: { ".css": "text" },
  }).outputFiles[0].text;
}

const managerMarkup = source("addons/library-addon/src/ui/assets/manager.html");
const managerCss = source("addons/library-addon/src/ui/assets/manager.css")
  .replaceAll("__ROOT__", ".f95ue-library-manager-root");
const managerRenderer = browserBundle(
  "addons/library-addon/src/ui/components/manager/tableRenderer.js",
  "LibraryManagerRenderer",
);
const managerEvents = browserBundle(
  "addons/library-addon/src/ui/controllers/bindManagerEvents.js",
  "LibraryManagerEvents",
);
const inboxRenderer = browserBundle(
  "addons/library-addon/src/ui/updateInbox/updateInboxRenderer.js",
  "LibraryInboxRenderer",
);
const autoRenderer = browserBundle(
  "addons/library-addon/src/ui/autoUpdate/autoUpdateRenderer.js",
  "LibraryAutoRenderer",
);

const rows = Array.from({ length: 12 }, (_, index) => ({
  threadId: String(41000 + index),
  recordModifiedAt: Date.UTC(2026, 8, 10 - (index % 6)),
  updateState: index % 3 === 0 ? "changed" : "current",
  thread: {
    title: index === 2
      ? "A deliberately long Library title demonstrating wrapping and narrow-screen pressure"
      : `Library baseline title ${index + 1}`,
    url: `https://f95zone.to/threads/example.${41000 + index}/`,
    currentVersion: `v0.${index + 1}.${index}`,
    developer: index === 2 ? "A Developer With A Very Long Studio Name" : `Studio ${index + 1}`,
    prefixes: [{ label: index % 2 ? "HTML" : "Ren'Py", state: "neutral" }],
    tags: Array.from({ length: 8 }, (__, tagIndex) => `tag ${tagIndex + 1}`),
  },
  personal: {
    status: index < 4 ? "playing" : "saved",
    rating: index % 4 ? null : 4,
    pinned: index < 3,
    note: index === 2 ? "A long note retained to expose truncation and hover-only detail behavior in the current table." : "",
  },
  updateCheck: { enabled: true, status: index % 3 === 0 ? "changed" : "current" },
}));

const inboxEntries = rows.slice(0, 8).map((entry, index) => ({
  record: {
    ...entry,
    lastThreadChangeAt: Date.UTC(2026, 8, 10, 10, index),
  },
  previousVersion: `v0.${index}.${index}`,
}));

const autoConfig = {
  enabled: true,
  checksPerDay: 50,
  runHour: 3,
  spacingMs: 5000,
  timeoutMs: 15000,
  retryLimit: 3,
};
const autoCycle = {
  cycleId: "library-baseline-cycle-with-a-long-identifier",
  status: "paused",
  total: 50,
  completed: 17,
  dailyAttempted: 20,
  checksPerDay: 50,
  dailyBonusAllowance: 0,
  retryPending: 2,
  failed: 1,
  current: 29,
  changed: 7,
  skipped: 3,
  networkRetries: 4,
  currentThreadId: "41007",
  currentPosition: 18,
  updatedAt: Date.UTC(2026, 8, 10, 12, 0),
  nextRunAt: Date.UTC(2026, 8, 11, 3, 0),
};

async function mountCoreDialog(page, { html, css, size = "default", addonScroll = false }) {
  const widths = {
    xl: "min(1320px, calc(100vw - 24px))",
    lg: "min(1040px, calc(100vw - 24px))",
    default: "min(720px, calc(100vw - 24px))",
  };
  const maxHeight = size === "xl" ? "calc(100vh - 32px)" : size === "lg"
    ? "calc(100vh - 48px)" : "calc(100vh - 96px)";
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>
    <div class="core-overlay"><div class="core-surface"><div class="core-content">${html}</div></div></div>
  </body></html>`);
  await page.addStyleTag({ content: `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; background: #0f1114; color: #d8dbe0; font: 16px Arial, sans-serif; }
    .core-overlay { position: fixed; inset: 0; display: flex; align-items: ${size === "lg" ? "flex-start" : "center"}; justify-content: center; padding: ${size === "lg" ? "40px 16px 16px" : "16px"}; background: rgba(7,9,13,.56); }
    .core-surface { width: ${widths[size]}; max-height: ${maxHeight}; overflow: ${addonScroll ? "hidden" : "auto"}; border: 1px solid #454b55; border-radius: 10px; background: #1f2329; color: #d8dbe0; box-shadow: 0 18px 48px rgba(0,0,0,.42); }
    .core-content { width: 100%; ${addonScroll ? "min-height:0;overflow:hidden" : ""}; }
    ${css}
  ` });
}

async function geometry(page, selectors) {
  return page.evaluate((requested) => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
        overflowX: style.overflowX, overflowY: style.overflowY,
        backgroundColor: style.backgroundColor, borderColor: style.borderTopColor,
        position: style.position,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: box("html"),
      body: box("body"),
      nodes: Object.fromEntries(requested.map((selector) => [selector, box(selector)])),
    };
  }, selectors);
}

async function computedStyle(page, selector, properties) {
  return page.locator(selector).first().evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, style[name]]));
  }, properties);
}

async function attachState(page, testInfo, name, selectors) {
  const measurements = await geometry(page, selectors);
  await testInfo.attach(`${name}.json`, {
    body: Buffer.from(JSON.stringify(measurements, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  return measurements;
}

for (const viewport of VIEWPORTS) {
  test(`Library Manager baseline at ${viewport.name}`, async ({ page }, testInfo) => {
    expect(fs.existsSync(path.join(ROOT, "docs/references/rendered-library.html"))).toBe(true);
    await page.setViewportSize(viewport);
    await mountCoreDialog(page, { html: managerMarkup, css: managerCss, size: "xl", addonScroll: true });
    await page.addScriptTag({ content: managerRenderer });
    await page.addScriptTag({ content: managerEvents });
    await page.evaluate((items) => {
      const state = {
        ratingCommittedById: new Map(), ratingDraftById: new Map(), noteDraftById: new Map(),
        openStatusMenuId: null, editingNoteId: null, openRowMenuId: null, liveThreadId: "41000",
      };
      window.LibraryManagerRenderer.renderRows(
        document.querySelector('[data-role="rows"]'), items, new Set(["41000"]), state,
      );
    }, rows);
    const populated = await attachState(page, testInfo, `manager-${viewport.name}-populated`, [
      ".core-surface", ".core-content", ".f95ue-library-manager-window",
      ".f95ue-library-toolbar", ".f95ue-library-actions", ".f95ue-library-table-wrap",
      ".f95ue-library-table-wrap table", ".f95ue-library-table-wrap tbody tr",
      '.f95ue-library-table-wrap td[data-cell="title"]', ".f95ue-table-link",
      ".f95ue-library-footer", '[data-action="check-selected-updates"]',
    ]);
    expect(populated.document.scrollWidth).toBeLessThanOrEqual(populated.document.clientWidth);
    expect(await computedStyle(page, ".f95ue-library-manager-window", ["backgroundColor", "color"]))
      .toEqual({ backgroundColor: "rgb(25, 27, 30)", color: "rgb(240, 242, 246)" });
    expect(await computedStyle(page, '[data-field="search"]', ["backgroundColor", "borderTopColor"]))
      .toEqual({ backgroundColor: "rgb(34, 34, 34)", borderTopColor: "rgb(85, 85, 85)" });
    if (viewport.name === "desktop") {
      const nodes = populated.nodes;
      expect(nodes[".core-surface"].overflowY).toBe("hidden");
      expect(nodes[".f95ue-library-manager-window"].overflowY).toBe("hidden");
      expect(nodes[".f95ue-library-table-wrap"].overflowY).toBe("auto");
      expect(nodes[".f95ue-library-toolbar"].height).toBeLessThanOrEqual(48);
      expect(nodes[".f95ue-library-actions"].height).toBeLessThanOrEqual(48);
      expect(nodes[".f95ue-library-table-wrap"].y + nodes[".f95ue-library-table-wrap"].height)
        .toBeLessThanOrEqual(nodes[".f95ue-library-footer"].y + 1);
      expect(nodes['[data-action="check-selected-updates"]'].width).toBeGreaterThanOrEqual(100);
    }
    if (viewport.width > 720 && viewport.width <= 768) {
      expect(populated.nodes[".f95ue-library-table-wrap table"].width).toBeGreaterThan(viewport.width);
      expect(populated.nodes[".f95ue-library-table-wrap"].scrollWidth)
        .toBeGreaterThan(populated.nodes[".f95ue-library-table-wrap"].clientWidth);
    }
    if (viewport.width <= 720) {
      const nodes = populated.nodes;
      expect(nodes[".f95ue-library-table-wrap"].scrollWidth)
        .toBeLessThanOrEqual(nodes[".f95ue-library-table-wrap"].clientWidth);
      expect(nodes[".f95ue-library-table-wrap table"].width)
        .toBeLessThanOrEqual(nodes[".f95ue-library-table-wrap"].clientWidth);
      expect(nodes[".f95ue-library-table-wrap tbody tr"].width)
        .toBeLessThanOrEqual(nodes[".f95ue-library-table-wrap"].clientWidth);
      expect(nodes['.f95ue-library-table-wrap td[data-cell="title"]'].width).toBeGreaterThan(0);
      expect(nodes[".f95ue-table-link"].height).toBeGreaterThan(0);
      await expect(page.locator('.f95ue-library-table-wrap td[data-cell="updated"]').first())
        .toHaveAttribute("data-label", "Updated");
      await expect(page.locator(".f95ue-library-filter-disclosure > summary")).toBeVisible();
      await page.locator(".f95ue-library-filter-disclosure > summary").click();
      await expect(page.locator('[data-field="status"]')).toBeVisible();
      await page.locator('[data-field="status"]').selectOption("playing");
      await page.locator('[data-field="sort"]').selectOption("title:asc");
      const filterSummary = await page.evaluate(() =>
        window.LibraryManagerEvents.updateFilterSummary(document));
      expect(filterSummary).toBe("playing · Title A-Z · 50/page");

      await page.locator(".f95ue-library-secondary-actions > summary").click();
      await page.locator(".f95ue-library-bulk-actions > summary").click();
      await expect(page.locator(".f95ue-library-secondary-actions")).toHaveAttribute("open", "");
      await expect(page.locator('[data-field="bulkAction"]')).toBeVisible();

      const menuBounds = await page.evaluate((items) => {
        const tbody = document.querySelector('[data-role="rows"]');
        const wrap = document.querySelector(".f95ue-library-table-wrap");
        wrap.scrollTop = 80;
        const state = {
          ratingCommittedById: new Map(), ratingDraftById: new Map(), noteDraftById: new Map(),
          openStatusMenuId: "41000", editingNoteId: null, openRowMenuId: null, liveThreadId: "41000",
        };
        window.LibraryManagerRenderer.renderRows(tbody, items, new Set(), state);
        const panel = document.querySelector(".f95ue-status-menu");
        const rect = panel.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewportWidth: innerWidth, scrollTop: wrap.scrollTop };
      }, rows);
      expect(menuBounds.left).toBeGreaterThanOrEqual(0);
      expect(menuBounds.right).toBeLessThanOrEqual(menuBounds.viewportWidth);
      expect(menuBounds.scrollTop).toBe(80);
    }
    await page.locator('[data-role="rows"]').evaluate((node) => { node.innerHTML = ""; });
    await attachState(page, testInfo, `manager-${viewport.name}-empty`, [
      ".core-surface", ".f95ue-library-manager-window", ".f95ue-library-table-wrap", ".f95ue-library-footer",
    ]);
  });

  test(`Library Updates Inbox baseline at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addScriptTag({ content: inboxRenderer });
    const rendered = await page.evaluate((entries) => ({
      html: window.LibraryInboxRenderer.renderUpdateInbox({ entries, count: entries.length, hasNext: true }),
      css: window.LibraryInboxRenderer.getUpdateInboxStyleText(),
    }), inboxEntries);
    await mountCoreDialog(page, { html: rendered.html, css: rendered.css, size: "lg", addonScroll: false });
    const populated = await attachState(page, testInfo, `inbox-${viewport.name}-populated`, [
      ".core-surface", ".core-content", ".f95ue-library-update-inbox",
      ".f95ue-library-inbox-list", ".f95ue-library-inbox-entry",
      ".f95ue-library-inbox-footer", '[data-inbox-action="acknowledge"]',
    ]);
    expect(populated.document.scrollWidth).toBeLessThanOrEqual(populated.document.clientWidth);
    expect(await computedStyle(page, ".f95ue-library-inbox-entry", ["backgroundColor", "borderTopColor"]))
      .toEqual({ backgroundColor: "rgb(23, 25, 29)", borderTopColor: "rgb(49, 52, 58)" });
    expect(await computedStyle(page, '[data-inbox-action="acknowledge"]', ["backgroundColor", "borderTopColor"]))
      .toEqual({ backgroundColor: "rgb(34, 34, 34)", borderTopColor: "rgb(85, 85, 85)" });
    const empty = await page.evaluate(() => ({
      html: window.LibraryInboxRenderer.renderUpdateInbox({ entries: [], count: 0 }),
      css: window.LibraryInboxRenderer.getUpdateInboxStyleText(),
    }));
    await mountCoreDialog(page, { html: empty.html, css: empty.css, size: "lg", addonScroll: false });
    await attachState(page, testInfo, `inbox-${viewport.name}-empty`, [
      ".core-surface", ".f95ue-library-update-inbox", ".f95ue-library-inbox-list", ".f95ue-library-inbox-footer",
    ]);
  });

  test(`Library Auto Update baseline at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addScriptTag({ content: autoRenderer });
    const rendered = await page.evaluate(({ config, cycle }) => ({
      html: window.LibraryAutoRenderer.renderAutoUpdateDialog(config, cycle),
      css: window.LibraryAutoRenderer.getAutoUpdateStyleText(),
    }), { config: autoConfig, cycle: autoCycle });
    await mountCoreDialog(page, { html: rendered.html, css: rendered.css, addonScroll: false });
    await page.locator("details").evaluateAll((details) => details.forEach((item) => { item.open = true; }));
    const populated = await attachState(page, testInfo, `auto-update-${viewport.name}-populated`, [
      ".core-surface", ".core-content", ".f95ue-library-auto-dialog",
      ".f95ue-library-auto-overview", ".f95ue-library-auto-grid",
      ".f95ue-library-auto-actions", '[data-role="primaryAction"]',
    ]);
    expect(populated.document.scrollWidth).toBeLessThanOrEqual(populated.document.clientWidth);
    expect(await computedStyle(page, ".f95ue-library-auto-dialog details", ["backgroundColor", "borderTopColor"]))
      .toEqual({ backgroundColor: "rgb(23, 25, 29)", borderTopColor: "rgb(49, 52, 58)" });
    expect(await computedStyle(page, '[data-auto-action="pause"]', ["backgroundColor", "borderTopColor"]))
      .toEqual({ backgroundColor: "rgb(34, 34, 34)", borderTopColor: "rgb(85, 85, 85)" });
    const empty = await page.evaluate(({ config }) => ({
      html: window.LibraryAutoRenderer.renderAutoUpdateDialog(config, null),
      css: window.LibraryAutoRenderer.getAutoUpdateStyleText(),
    }), { config: autoConfig });
    await mountCoreDialog(page, { html: empty.html, css: empty.css, addonScroll: false });
    await attachState(page, testInfo, `auto-update-${viewport.name}-empty`, [
      ".core-surface", ".f95ue-library-auto-dialog", ".f95ue-library-auto-actions",
    ]);
  });
}
