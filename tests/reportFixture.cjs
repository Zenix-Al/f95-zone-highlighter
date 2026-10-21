"use strict";

const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

function snapshotFiles(files) {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(file);
    hash.update("\0");
    if (fs.existsSync(file)) {
      hash.update("present\0");
      hash.update(fs.readFileSync(file));
    } else hash.update("missing\0");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function snapshotTrees(roots) {
  const files = [];
  function visit(file) {
    if (!fs.existsSync(file)) {
      files.push(file);
      return;
    }
    if (!fs.statSync(file).isDirectory()) {
      files.push(file);
      return;
    }
    for (const entry of fs.readdirSync(file, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        ["dist", "archive", "reference", "node_modules", ".tmp", ".git"].includes(entry.name)
      )
        continue;
      visit(path.join(file, entry.name));
    }
  }
  roots.forEach(visit);
  return snapshotFiles(files);
}

function createReportFixture({ create, getSignature }) {
  let cached = null;
  return async function getReport() {
    const signature = getSignature();
    if (!cached || signature !== cached.signature) {
      const item = { signature, pending: Promise.resolve().then(create) };
      cached = item;
      item.pending.catch(() => {
        if (cached === item) cached = null;
      });
    }
    return structuredClone(await cached.pending);
  };
}

module.exports = { createReportFixture, snapshotTrees };
