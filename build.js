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

//header
function makeHeader(name, version, banner) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    f95zone-latest-highlighter
// @version      ${version}
// @description  All-in-one F95Zone beast: thread highlighting, custom tags & colors, wide layout, auto-refresh latest, masked-link bypass, image fix, notifs & more
// @author       X Death
// @contributor  Edexal (GM storage, change listener & summarize UI element)
// @match        *://f95zone.to/*
// @match        *://buzzheavier.com/*
// @match        *://trashbytes.net/dl/*
// @match        *://gofile.io/d/*
// @icon         https://f95zone.to/data/avatars/l/1963/1963870.jpg
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// @license      GPL-3.0-or-later
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @supportURL   https://f95zone.to/threads/f95zone-latest.250836/
// @source       https://github.com/Zenix-Al/f95-zone-highlighter
// @updateURL    https://update.greasyfork.org/scripts/546518/F95Zone%20Latest%20Highlighter.user.js
// @downloadURL  https://update.greasyfork.org/scripts/546518/F95Zone%20Latest%20Highlighter.user.js
// ==/UserScript==
// ------------------------------------------------------------
${banner}
// ------------------------------------------------------------
`;
}
const header = makeHeader("F95Zone Ultimate Enhancer", versionString, banner);

const headerUglified = makeHeader("F95Zone Ultimate Enhancer (Uglified)", versionString, banner);

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
