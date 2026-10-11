// Local Chromium cleanup/discovery benchmark, not a live-site startup trace.
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

(async () => {
  const source = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "../src/features/latest-overlay/tilePatcher.js")],
    bundle: true, write: false, format: "iife", globalName: "wave3",
  }).outputFiles[0].text;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<main></main>");
    await page.addScriptTag({ content: source });
    const report = await page.evaluate(() => {
      const results = [];
      for (const count of [15, 60, 200]) {
        document.querySelector("main").innerHTML = Array.from({ length: count }, (_, i) =>
          `<article class="resource-tile" data-thread-id="${i + 1}"><div class="resource-tile_body"><div class="resource-tile_thumb-wrap"></div><span class="resource-tile_info-meta_rating">4</span><span class="resource-tile_info-meta_likes">20</span></div></article>`
        ).join("");
        const before = () => {
          wave3.clearAllOverlayStyles();
          return Array.from(document.getElementsByClassName("resource-tile"));
        };
        const after = () => {
          const tiles = Array.from(document.getElementsByClassName("resource-tile"));
          wave3.clearAllOverlayStyles(tiles);
          return tiles;
        };
        const measure = (operation) => {
          const start = performance.now();
          for (let i = 0; i < 150; i++) operation();
          return (performance.now() - start) / 150;
        };
        for (let i = 0; i < 30; i++) { before(); after(); }
        const oldRuns = [], newRuns = [];
        for (let i = 0; i < 7; i++) {
          if (i % 2) { newRuns.push(measure(after)); oldRuns.push(measure(before)); }
          else { oldRuns.push(measure(before)); newRuns.push(measure(after)); }
        }
        const median = (values) => [...values].sort((a, b) => a - b)[3];
        results.push({ tiles: count, previousMsPerPass: median(oldRuns), candidateMsPerPass: median(newRuns), oldRuns, newRuns });
      }
      return results;
    });
    console.log(JSON.stringify({ scope: "warm Chromium cleanup plus tile discovery; excludes evaluation, paint, layout and live-site startup", results: report }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
