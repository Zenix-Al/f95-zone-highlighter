const fs = require("fs");

const CORE_MODAL_HTML_SUFFIX = "/src/ui/assets/ui.html";

function compactCoreModalHtml(source) {
  return String(source || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/>\s+</g, "> <")
    .trim();
}

function isCoreModalHtmlPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").endsWith(CORE_MODAL_HTML_SUFFIX);
}

const compactCoreModalHtmlAsset = {
  name: "compact-core-modal-html",
  setup(build) {
    build.onLoad({ filter: /\.html$/i }, async ({ path }) => {
      if (!isCoreModalHtmlPath(path)) return null;
      return {
        contents: compactCoreModalHtml(await fs.promises.readFile(path, "utf8")),
        loader: "text",
      };
    });
  },
};

module.exports = {
  compactCoreModalHtml,
  compactCoreModalHtmlAsset,
  isCoreModalHtmlPath,
};
