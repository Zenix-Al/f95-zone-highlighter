const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { stripCssComments } = require("./build/stripCssComments");

// Config
const VERSION_FILE = path.join(__dirname, "version.json");
const HEADER_TEMPLATE_PATH = path.join(__dirname, "header.txt"); // Optional: move header to file

// Read current version or initialize
let currentVersion = { major: 3, minor: 0, patch: 0 };
if (fs.existsSync(VERSION_FILE)) {
  try {
    currentVersion = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
  } catch (e) {
    console.warn("version.json corrupted, resetting...");
  }
}

// Detect bump type from args: -- --major, --minor, --patch (default: patch)
const args = process.argv.slice(2);
const bumpType = args.find((a) => a.startsWith("--"))?.slice(2) || "patch";

let newVersion;
if (bumpType === "major") {
  newVersion = { major: currentVersion.major + 1, minor: 0, patch: 0 };
} else if (bumpType === "minor") {
  newVersion = { major: currentVersion.major, minor: currentVersion.minor + 1, patch: 0 };
} else {
  newVersion = { ...currentVersion, patch: currentVersion.patch + 1 };
}

const versionString = `${newVersion.major}.${newVersion.minor}.${newVersion.patch}`;
console.log(
  `Bumping version: ${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch} → ${versionString} (${bumpType})`
);

// Save new version
fs.writeFileSync(VERSION_FILE, JSON.stringify(newVersion, null, 2));

// Build time
const now = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
const banner = `// Built on ${now} — AUTO-GENERATED, edit from /src and rebuild`;

const header = `// ==UserScript==
// @name         F95Zone Ultimate Enhancer
// @version      ${versionString}
// @icon         https://external-content.duckduckgo.com/iu/?u=https://f95zone.to/data/avatars/l/1963/1963870.jpg?1744969685
// @namespace    https://f95zone.to/threads/f95zone-latest.250836/
// @homepage     https://f95zone.to/threads/f95zone-latest.250836/
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @supportURL   https://f95zone.to/threads/forum-latest.250836/
// @author       X Death (creator and maintainer)
// @author       Edexal (enhancements)
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @match        https://f95zone.to/masked/*
// @grant        GM.setValue
// @grant        GM.getValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @run-at       document-idle
// @license      GPL-3.0-or-later
// @downloadURL  https://update.greasyfork.org/scripts/546518/F95Zone%20Latest%20Highlighter.user.js
// @updateURL    https://update.greasyfork.org/scripts/546518/F95Zone%20Latest%20Highlighter.user.js
// @description  All-in-one powerhouse for F95Zone: Advanced thread highlighting & overlays, customizable tags/colors, wide layouts, auto latest refresh + notifications, seamless masked link skipping (direct on-click zap to hosts), image retry fixes, and more!
// ==/UserScript==
// ------------------------------------------------------------
${banner}
// ------------------------------------------------------------

`;

const headerUglified = `// ==UserScript==
// @name         F95Zone Ultimate Enhancer (Uglified)
// @version      ${versionString}
// @icon         https://external-content.duckduckgo.com/iu/?u=https://f95zone.to/data/avatars/l/1963/1963870.jpg?1744969685
// @namespace    https://f95zone.to/threads/f95zone-latest.250836/
// @homepage     https://f95zone.to/threads/f95zone-latest.250836/
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @supportURL   https://f95zone.to/threads/forum-latest.250836/
// @author       X Death (creator and maintainer)
// @author       Edexal (enhancements)
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @match        https://f95zone.to/masked/*
// @grant        GM.setValue
// @grant        GM.getValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @run-at       document-idle
// @license      GPL-3.0-or-later
// @description  All-in-one powerhouse for F95Zone: Advanced thread highlighting & overlays, customizable tags/colors, wide layouts, auto latest refresh + notifications, seamless masked link skipping (direct on-click zap to hosts), image retry fixes, and more!
// ==/UserScript==
// ------------------------------------------------------------
${banner}
// ------------------------------------------------------------

`;

// Build with esbuild
esbuild
  .build({
    entryPoints: ["src/main.js"],
    bundle: true,
    minify: false,
    outfile: "dist/userscript.js",
    format: "iife",
    legalComments: "none",
    loader: {
      ".html": "text",
      ".css": "text",
    },
    plugins: [stripCssComments],
  })
  .then(() => {
    const builtCode = fs.readFileSync("dist/userscript.js", "utf8");
    const finalOutput = header + builtCode;

    fs.writeFileSync("dist/f95zone-ultimate-enhancer.user.js", finalOutput);
    console.log(`Build complete! Version: ${versionString}`);
    console.log(`Output: dist/f95zone-ultimate-enhancer.user.js`);
  })
  .catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
esbuild
  .build({
    entryPoints: ["src/main.js"],
    bundle: true,
    minify: true,
    outfile: "dist/uglified.js",
    format: "iife",
    loader: {
      ".html": "text",
      ".css": "text",
    },
    plugins: [stripCssComments],
  })
  .then(() => {
    const builtCode = fs.readFileSync("dist/uglified.js", "utf8");
    const finalOutput = headerUglified + builtCode;

    fs.writeFileSync("dist/f95zone-ultimate-enhancer.uglified.user.js", finalOutput);
    console.log(`Uglify Build complete! Version: ${versionString}`);
    console.log(`Output: dist/f95zone-ultimate-enhancer.uglified.user.js`);
  })
  .catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
