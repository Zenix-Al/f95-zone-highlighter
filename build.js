const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

// === Config ===
const VERSION_FILE = path.resolve(__dirname, "version.json");
const DEFAULT_VERSION = "1.0.0";
const BUMP_TYPE = process.argv[2] || "patch"; // major | minor | patch

// === Version logic ===
function readVersion() {
  if (fs.existsSync(VERSION_FILE)) {
    try {
      const { version } = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
      if (/^\d+\.\d+\.\d+$/.test(version)) return version;
    } catch (_) {}
  }
  return DEFAULT_VERSION;
}

function bumpVersion(version, type) {
  let [major, minor, patch] = version.split(".").map(Number);
  if (type === "major") {
    major++;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor++;
    patch = 0;
  } else {
    patch++;
  }
  return `${major}.${minor}.${patch}`;
}

function saveVersion(version) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version }, null, 2));
  return version;
}

// === Version bump ===
const oldVersion = readVersion();
const newVersion = bumpVersion(oldVersion, BUMP_TYPE);
saveVersion(newVersion);

const now = new Date().toISOString();
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
// @version      ${newVersion}
// @description  Highlight thread cards on the Latest Updates Page and adds colorful thread tags!
// ==/UserScript==
// ------------------------------------------------------------
${banner}
// ------------------------------------------------------------

`;

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
    const code = fs.readFileSync("dist/userscript.js", "utf8");
    fs.writeFileSync("dist/userscript.user.js", header + code);
    console.log(`✅ Build complete! Version bumped: ${oldVersion} → ${newVersion}`);
  })
  .catch((err) => {
    console.error("❌ Build failed:", err);
    process.exit(1);
  });
