"use strict";

const path = require("node:path");
const { buildSync } = require("esbuild");
const { test, expect } = require("@playwright/test");
const { record, updateEvents, activityEvents } = require("../fixtures/libraryFullEditMaxHistory.cjs");

const ROOT = path.resolve(__dirname, "../..");
const rendererBundle = buildSync({
  entryPoints: [path.join(ROOT, "addons/library-addon/src/ui/entryEditor/editorRenderer.js")],
  bundle: true,
  format: "iife",
  globalName: "FullEditRenderer",
  platform: "browser",
  write: false,
  loader: { ".css": "text" },
}).outputFiles[0].text;
const validationBundle = buildSync({
  entryPoints: [path.join(ROOT, "addons/library-addon/src/ui/entryEditor/editorValidation.js")],
  bundle: true,
  format: "iife",
  globalName: "FullEditValidation",
  platform: "browser",
  write: false,
}).outputFiles[0].text;
const bindingsBundle = buildSync({
  entryPoints: [path.join(ROOT, "addons/library-addon/src/ui/entryEditor/editorBindings.js")],
  bundle: true,
  format: "iife",
  globalName: "FullEditBindings",
  platform: "browser",
  write: false,
}).outputFiles[0].text;
const controllerBundle = buildSync({
  entryPoints: [path.join(ROOT, "addons/library-addon/src/ui/entryEditor/editorController.js")],
  bundle: true,
  format: "iife",
  globalName: "FullEditController",
  platform: "browser",
  write: false,
  loader: { ".css": "text" },
  define: { __F95UE_DEBUG__: "false" },
}).outputFiles[0].text;

async function attachScreenshot(page, testInfo, name, focusSelector = null) {
  if (focusSelector) await page.locator(focusSelector).evaluate((node) => node.scrollIntoView({ block: "start", inline: "nearest" }));
  else await page.locator(".f95ue-library-entry-editor").evaluate((node) => { node.scrollTop = 0; });
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

async function assertContainedAndReachable(page, viewport) {
  const geometry = await page.evaluate(() => {
    const editor = document.querySelector(".f95ue-library-entry-editor");
    const surface = document.querySelector(".core-surface");
    const summaries = [...document.querySelectorAll(".f95ue-library-editor-history summary")];
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      editorWidth: editor.scrollWidth,
      editorClientWidth: editor.clientWidth,
      editorBottom: editor.getBoundingClientRect().bottom,
      surfaceBottom: surface.getBoundingClientRect().bottom,
      summaries: summaries.map((summary) => ({
        width: summary.scrollWidth,
        clientWidth: summary.clientWidth,
      })),
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(viewport.width);
  expect(geometry.editorWidth).toBeLessThanOrEqual(geometry.editorClientWidth + 1);
  expect(geometry.editorBottom).toBeLessThanOrEqual(viewport.height);
  expect(geometry.surfaceBottom).toBeLessThanOrEqual(viewport.height);
  for (const summary of geometry.summaries) expect(summary.width).toBeLessThanOrEqual(summary.clientWidth + 1);
  for (const selector of [
    '[data-history="updates"] summary',
    '[data-history="activity"] summary',
    '[data-editor-action="save"]',
  ]) {
    const node = page.locator(selector);
    await node.scrollIntoViewIfNeeded();
    expect(await node.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === element || element.contains(hit);
    }), selector).toBe(true);
  }
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 720 },
]) {
  test(`Full Edit 20+20 history visual verification at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>
      <div class="core-overlay"><div class="core-surface"><div class="core-content"></div></div></div>
    </body></html>`);
    await page.addScriptTag({ content: rendererBundle });
    await page.addScriptTag({ content: validationBundle });
    await page.addScriptTag({ content: bindingsBundle });
    await page.addScriptTag({ content: controllerBundle });
    const css = await page.evaluate(() => window.FullEditRenderer.getEntryEditorStyleText());
    await page.addStyleTag({ content: `
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; background: #0f1114; color: #d8dbe0; font: 16px Arial, sans-serif; }
      .core-overlay { position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; background: rgba(7,9,13,.56); }
      .core-surface { width: min(1040px, calc(100vw - 24px)); max-height: calc(100vh - 48px); overflow: auto; border: 1px solid #454b55; border-radius: 10px; background: #1f2329; color: #d8dbe0; }
      .core-content { width: 100%; }
      ${css}
    ` });
    await page.evaluate(({ record: item, updateEvents: updates, activityEvents: activity }) => {
      const draft = window.FullEditValidation.createEditorDraft(item);
      document.querySelector(".core-content").innerHTML = window.FullEditRenderer.renderEntryEditor(item, draft, [], updates, activity);
    }, { record, updateEvents, activityEvents });

    await expect(page.locator(".f95ue-library-editor-history")).toHaveCount(2);
    await expect(page.locator(".f95ue-library-editor-history li")).toHaveCount(40);
    const updates = page.locator('[data-history="updates"]');
    const activity = page.locator('[data-history="activity"]');
    await expect(updates.locator("summary")).toHaveText("Recent updates (20)");
    await expect(activity.locator("summary")).toHaveText("Recent activity (20)");
    await expect(updates).not.toHaveAttribute("open", "");
    await expect(activity).not.toHaveAttribute("open", "");
    await expect(page.locator('[data-editor-action="acknowledge-update"]')).toBeEnabled();
    await expect(page.locator('[data-editor-action="played-version"]')).toBeEnabled();
    const pinnedSwitch = page.getByRole("switch", { name: "Pinned" });
    const autoUpdateSwitch = page.getByRole("switch", { name: "Auto update" });
    await expect(pinnedSwitch).not.toBeChecked();
    await expect(autoUpdateSwitch).toBeChecked();
    const played = page.locator('[data-editor-action="played-version"]');
    const acknowledge = page.locator('[data-editor-action="acknowledge-update"]');
    const buttonColors = async (locator) => locator.evaluate((button) => {
      const style = getComputedStyle(button);
      return { background: style.backgroundColor, border: style.borderTopColor, color: style.color };
    });
    expect(await buttonColors(played)).toEqual({
      background: "rgb(137, 56, 57)", border: "rgb(164, 71, 72)", color: "rgb(255, 255, 255)",
    });
    expect(await buttonColors(acknowledge)).toEqual({
      background: "rgb(41, 33, 36)", border: "rgb(164, 71, 72)", color: "rgb(246, 215, 215)",
    });
    const baseline = await page.evaluate(() => {
      const box = (selector) => {
        const element = typeof selector === "string" ? document.querySelector(selector) : selector;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          y: Math.round(rect.y), height: Math.round(rect.height), bottom: Math.round(rect.bottom),
          background: style.backgroundColor, color: style.color, border: style.borderTopColor,
          overflowY: style.overflowY, scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentScrollWidth: document.documentElement.scrollWidth,
        initialScrollTop: document.querySelector(".f95ue-library-entry-editor").scrollTop,
        order: [...document.querySelectorAll(".f95ue-library-editor-facts > *")].map((element) =>
          element.dataset.editorAction || element.querySelector("small")?.textContent || element.className),
        surface: box(".core-surface"), editor: box(".f95ue-library-entry-editor"),
        updates: box(document.querySelectorAll(".f95ue-library-editor-history")[0]),
        activity: box(document.querySelectorAll(".f95ue-library-editor-history")[1]),
        fields: box(".f95ue-library-editor-grid"),
        acknowledge: box('[data-editor-action="acknowledge-update"]'),
        played: box('[data-editor-action="played-version"]'),
        cancel: box('[data-editor-action="cancel"]'),
        save: box('[data-editor-action="save"]'),
        buttons: Object.fromEntries([...document.querySelectorAll("button")].map((button) => [
          button.dataset.editorAction,
          { disabled: button.disabled, background: getComputedStyle(button).backgroundColor,
            color: getComputedStyle(button).color, border: getComputedStyle(button).borderTopColor },
        ])),
      };
    });
    // Record the actual keyboard order, including controls below the fold.
    const focusSequence = [];
    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press("Tab");
      focusSequence.push(await page.evaluate(() =>
        document.activeElement?.dataset?.editorAction || document.activeElement?.getAttribute("name") || document.activeElement?.tagName));
    }
    baseline.focusSequence = focusSequence;
    expect(baseline.documentScrollWidth).toBeLessThanOrEqual(viewport.width);
    await testInfo.attach(`full-edit-${viewport.name}-geometry.json`, {
      body: Buffer.from(JSON.stringify(baseline, null, 2)), contentType: "application/json",
    });
    await assertContainedAndReachable(page, viewport);
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-collapsed`);
    await updates.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveAttribute("open", "");
    await expect(activity).not.toHaveAttribute("open", "");
    await assertContainedAndReachable(page, viewport);
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-updates-expanded`, '[data-history="updates"] summary');
    await activity.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveAttribute("open", "");
    await expect(activity).toHaveAttribute("open", "");
    await assertContainedAndReachable(page, viewport);
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-both-expanded-updates`, '[data-history="updates"] summary');
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-both-expanded-activity`, '[data-history="activity"] summary');
    await updates.locator("summary").click();
    await expect(updates).not.toHaveAttribute("open", "");
    await expect(activity).toHaveAttribute("open", "");
    await assertContainedAndReachable(page, viewport);
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-activity-expanded`, '[data-history="activity"] summary');
    await page.evaluate(() => {
      window.__acknowledgeCount = 0;
      window.__unbindEditor = window.FullEditBindings.bindEntryEditor(
        document.querySelector(".core-content"),
        {
          onSave: () => {}, onCancel: () => {},
          onAcknowledge: () => { window.__acknowledgeCount += 1; },
          onPlayedVersion: () => new Promise((resolve) => { window.__resolvePlayed = resolve; }),
        },
      );
    });
    await acknowledge.focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__acknowledgeCount)).toBe(1);
    await played.focus();
    expect(await played.evaluate((button) => getComputedStyle(button).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(played).toBeDisabled();
    expect(await buttonColors(played)).toEqual({
      background: "rgb(53, 56, 61)", border: "rgb(85, 91, 99)", color: "rgb(174, 180, 189)",
    });
    await attachScreenshot(page, testInfo, `full-edit-${viewport.name}-played-disabled`, '[data-editor-action="played-version"]');
    await page.evaluate(() => window.__resolvePlayed({ ok: false }));
    await expect(played).toBeEnabled();
    await played.hover();
    expect((await buttonColors(played)).background).toBe("rgb(164, 71, 72)");
    await page.evaluate(() => window.__unbindEditor());
    await page.getByText("Pinned", { exact: true }).click();
    await expect(pinnedSwitch).toBeChecked();
    await expect.poll(() => pinnedSwitch.evaluate((input) => getComputedStyle(input.nextElementSibling).backgroundColor))
      .toBe("rgb(137, 56, 57)");
    await page.getByText("Auto update", { exact: true }).click();
    await expect(autoUpdateSwitch).not.toBeChecked();
    await pinnedSwitch.focus();
    await page.keyboard.press("Space");
    await expect(pinnedSwitch).not.toBeChecked();
    expect(await page.evaluate(() => window.FullEditBindings.readEditorDraft(document.querySelector("form"))))
      .toMatchObject({ pinned: false, autoUpdateEnabled: false });

    await page.evaluate(async ({ record: fixtureRecord, updateEvents: fixtureUpdates, activityEvents: fixtureActivity }) => {
      const content = document.querySelector(".core-content");
      content.id = "full-edit-dialog-content";
      let current = structuredClone(fixtureRecord);
      let recentActivity = structuredClone(fixtureActivity);
      window.__fullEditWrites = { acknowledge: 0, played: 0 };
      const core = {
        async invokeCoreAction(action, payload) {
          if (action === "ui.dialog.open" || action === "ui.dialog.update") {
            content.innerHTML = payload.html;
            return { ok: true, value: { contentId: content.id } };
          }
          if (action === "ui.dialog.close") content.innerHTML = "";
          return { ok: true, value: {} };
        },
      };
      const library = {
        getEntry: async () => current,
        listUpdateEvents: async () => fixtureUpdates,
        listActivityEvents: async () => recentActivity,
        acknowledgeCurrentUpdate: async () => {
          window.__fullEditWrites.acknowledge += 1;
          current = { ...current, updateState: "acknowledged" };
          return { ok: true, value: current };
        },
        applyPersonalActivity: async (_threadId, _patch, options) => {
          if (options.playedCurrentVersion) {
            window.__fullEditWrites.played += 1;
            current = {
              ...current,
              personal: { ...current.personal, lastPlayedVersion: current.thread.currentVersion },
            };
            recentActivity = [{
              id: "activity:new-played", type: "played-version", version: current.thread.currentVersion,
              occurredAt: Date.UTC(2026, 8, 26),
            }, ...recentActivity].slice(0, 20);
          }
          return { ok: true, value: current };
        },
      };
      window.__fullEditController = window.FullEditController.createEntryEditorController({
        core, addonId: "library-visual", library,
      });
      await window.__fullEditController.open(fixtureRecord.threadId);
    }, { record, updateEvents, activityEvents });
    const controllerUpdates = page.locator('[data-history="updates"]');
    const controllerActivity = page.locator('[data-history="activity"]');
    await expect(controllerUpdates).not.toHaveAttribute("open", "");
    await expect(controllerActivity).not.toHaveAttribute("open", "");
    await controllerUpdates.locator("summary").click();
    await page.locator('[data-editor-action="acknowledge-update"]').click();
    await expect(page.locator('[data-editor-action="acknowledge-update"]')).toHaveCount(0);
    await expect(controllerUpdates).toHaveAttribute("open", "");
    await expect(controllerActivity).not.toHaveAttribute("open", "");
    await controllerActivity.locator("summary").click();
    await page.locator('[data-editor-action="played-version"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-editor-action="played-version"]')).toHaveCount(0);
    await expect(controllerUpdates).toHaveAttribute("open", "");
    await expect(controllerActivity).toHaveAttribute("open", "");
    await expect(page.locator(".f95ue-library-editor-history")).toHaveCount(2);
    await expect(page.locator(".f95ue-library-editor-history li")).toHaveCount(40);
    expect(await page.evaluate(() => window.__fullEditWrites)).toEqual({ acknowledge: 1, played: 1 });
    await assertContainedAndReachable(page, viewport);
    await page.evaluate(async () => {
      await window.__fullEditController.close("test-close");
      await window.__fullEditController.open("42000");
    });
    await expect(controllerUpdates).not.toHaveAttribute("open", "");
    await expect(controllerActivity).not.toHaveAttribute("open", "");
    await expect(page.locator(".f95ue-library-editor-history")).toHaveCount(2);
    await expect(page.locator(".f95ue-library-editor-history li")).toHaveCount(40);
  });
}
