const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

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

// Detect bump type from args: --major, --minor, --patch (default: patch)
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
// @name         F95Zone Latest Highlighter
// @icon         https://external-content.duckduckgo.com/iu/?u=https://f95zone.to/data/avatars/l/1963/1963870.jpg?1744969685
// @namespace    https://f95zone.to/threads/f95zone-latest.250836/
// @homepage     https://f95zone.to/threads/f95zone-latest.250836/
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @author       X Death on F95zone
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @grant        GM.setValue
// @grant        GM.getValues
// @run-at       document-idle
// @version      ${versionString}
// @description  Highlight thread cards on the Latest Updates Page and adds colorful thread tags!
// ==/UserScript==
// ------------------------------------------------------------
${banner}
// ------------------------------------------------------------

`;
const headerUglified = `// ==UserScript==
// @name         F95Zone Latest Highlighter uglified
// @icon         https://external-content.duckduckgo.com/iu/?u=https://f95zone.to/data/avatars/l/1963/1963870.jpg?1744969685
// @namespace    https://f95zone.to/threads/f95zone-latest.250836/
// @homepage     https://f95zone.to/threads/f95zone-latest.250836/
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @author       X Death on F95zone
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @grant        GM.setValue
// @grant        GM.getValues
// @run-at       document-idle
// @version      ${versionString}
// @description  Highlight thread cards on the Latest Updates Page and adds colorful thread tags!
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
    loader: {
      ".html": "text",
      ".css": "text",
    },
  })
  .then(() => {
    const builtCode = fs.readFileSync("dist/userscript.js", "utf8");
    const finalOutput = header + builtCode;

    fs.writeFileSync("dist/f95zone-latest-highlighter.user.js", finalOutput);
    console.log(`Build complete! Version: ${versionString}`);
    console.log(`Output: dist/f95zone-latest-highlighter.user.js`);
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
  })
  .then(() => {
    const builtCode = fs.readFileSync("dist/uglified.js", "utf8");
    const finalOutput = headerUglified + builtCode;

    fs.writeFileSync("dist/f95zone-latest-highlighter.uglified.user.js", finalOutput);
    console.log(`Uglify Build complete! Version: ${versionString}`);
    console.log(`Output: dist/f95zone-latest-highlighter.uglified.user.js`);
  })
  .catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
