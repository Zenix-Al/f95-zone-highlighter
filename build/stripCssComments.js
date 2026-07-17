const fs = require("fs/promises");

function stripCssText(text) {
  const source = String(text || "");
  let output = "";
  let quote = "";
  let pendingSpace = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      output += char;
      if (char === "\\" && index + 1 < source.length) {
        output += source[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (pendingSpace && output && !output.endsWith(" ")) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      pendingSpace = true;
      continue;
    }

    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace && output && !output.endsWith(" ")) output += " ";
    pendingSpace = false;
    output += char;
  }

  return output.trim();
}

const stripCssComments = {
  name: "strip-css-comments",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => ({
      contents: stripCssText(await fs.readFile(args.path, "utf8")),
      loader: "text",
    }));
  },
};

module.exports = { stripCssComments, stripCssText };
