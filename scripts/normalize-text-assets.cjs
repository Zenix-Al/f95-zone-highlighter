const fs = require("fs");

function normalizeText(source) {
  return String(source || "").replace(/\r\n?/g, "\n");
}

const normalizedTextAssets = {
  name: "normalize-text-assets",
  setup(build) {
    build.onLoad({ filter: /\.(?:css|html)$/i }, async ({ path }) => ({
      contents: normalizeText(await fs.promises.readFile(path, "utf8")),
      loader: "text",
    }));
  },
};

module.exports = { normalizeText, normalizedTextAssets };
