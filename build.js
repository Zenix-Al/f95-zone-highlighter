const esbuild = require("esbuild");
const fs = require("fs");

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
// @version      3.0.0
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
    // prepend userscript header
    const code = fs.readFileSync("dist/userscript.js", "utf8");
    fs.writeFileSync("dist/userscript.user.js", header + code);
    console.log("Userscript build complete!");
  });
