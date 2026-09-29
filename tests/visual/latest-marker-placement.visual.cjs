const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const { test, expect } = require("@playwright/test");
const root = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "addons/reference/card.html"), "utf8");
const css = fs.readFileSync(path.join(root, "src/features/latest-overlay/style.css"), "utf8");
const bundle = buildSync({ entryPoints: [path.join(root, "src/features/latest-overlay/markers.js")], bundle: true, format: "iife", globalName: "MarkerRenderer", write: false, define: { __F95UE_DEBUG__: "false" } }).outputFiles[0].text;

for (const width of [380, 240]) {
  test(`Latest marker placement at card width ${width}`, async ({ page }, testInfo) => {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(`<style>body{background:#191b1e;font-family:Arial;color:#ddd}.resource-tile{width:${width}px}.resource-tile_link{color:inherit;text-decoration:none;display:block}.resource-tile_thumb-wrap{height:110px;background:linear-gradient(100deg,#6e3988,#bcbcbc)}.resource-tile_thumb{display:none}.resource-tile_body{background:#252525;padding:8px;box-sizing:border-box}.resource-tile_label-wrap{display:flex;justify-content:space-between}.resource-tile_info-header_title{font-size:18px;margin:8px 0}.resource-tile_info-meta{display:flex;gap:6px}.resource-tile_label-version{background:#555}.header_title-ver,.resource-tile_rating{display:none}${css}</style>${html}`);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => MarkerRenderer.paintLatestMarker(document.querySelector('.resource-tile'), {id:'library-status',priority:50}, {label:'Playing',description:'In your Library: Playing',tone:'info'}));
    const slot = page.locator('.f95ue-latest-markers');
    const score = page.locator('.tile-score-display');
    const scoreBox = await score.boundingBox();
    const slotBox = await slot.boundingBox();
    expect(slotBox.y).toBeGreaterThan(scoreBox.y + scoreBox.height);
    expect(Math.abs(slotBox.x + slotBox.width - scoreBox.x - scoreBox.width)).toBeLessThan(1);
    for (const selector of ['.custom-overlay-reason', '.tile-score-display', '.f95ue-latest-marker']) {
      expect(await page.locator(selector).evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0.45)');
    }
    await testInfo.attach('score-on.png', {body:await page.screenshot(),contentType:'image/png'});
    await score.evaluate((node) => node.remove());
    expect((await slot.boundingBox()).y).toBeCloseTo(scoreBox.y, 0);
    await testInfo.attach('score-off.png', {body:await page.screenshot(),contentType:'image/png'});
    await page.evaluate(() => MarkerRenderer.paintLatestMarker(document.querySelector('.resource-tile'), {id:'second',priority:90}, {label:'Long recommendation label for overflow testing',description:'Additional recommendation',tone:'success'}));
    await expect(page.locator('.f95ue-latest-marker:visible')).toHaveCount(1);
    await expect(page.locator('.f95ue-latest-marker-more')).toHaveText('+1');
    expect(await slot.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await testInfo.attach('multiple-providers.png', {body:await page.screenshot(),contentType:'image/png'});
    await page.evaluate(() => {
      const thumb = document.querySelector('.resource-tile_thumb');
      thumb.style.display = 'block';
      thumb.innerHTML = '<i class="far fa-eye watch-icon" style="position:absolute;top:4px;right:4px;z-index:12">eye</i>';
      const score = document.createElement('span');
      score.className = 'tile-score-display';
      score.textContent = '8.3';
      document.querySelector('.resource-tile_thumb-wrap').append(score);
    });
    await expect(page.locator('.watch-icon')).toBeVisible();
    expect(await page.locator('.tile-score-display').evaluate(node => getComputedStyle(node).top)).toBe('30px');
    await page.evaluate(() => document.documentElement.classList.add('f95ue-library-replaces-watch'));
    await expect(page.locator('.watch-icon')).toBeHidden();
    expect(await page.locator('.tile-score-display').evaluate(node => getComputedStyle(node).top)).toBe('4px');
    await page.evaluate(() => MarkerRenderer.latestMarkers.disable());
    await expect(page.locator('.watch-icon')).toBeVisible();
    expect(await page.locator('.tile-score-display').evaluate(node => getComputedStyle(node).top)).toBe('30px');
  });
}
