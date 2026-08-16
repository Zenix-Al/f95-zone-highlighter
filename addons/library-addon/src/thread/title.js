export function decodeHtmlText(value) {
  const named = {
    quot: '"',
    apos: "'",
    amp: "&",
    nbsp: " ",
    lt: "<",
    gt: ">",
  };
  let decoded = String(value || "");
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded.replace(
      /&(?:quot|apos|amp|nbsp|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi,
      (entity) => {
        if (entity.startsWith("&#")) {
          const hexadecimal = entity[2]?.toLowerCase() === "x";
          const digits = entity.slice(hexadecimal ? 3 : 2, -1);
          const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
          if (
            !Number.isInteger(codePoint) ||
            codePoint < 0 ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ) {
            return entity;
          }
          return codePoint === 160 ? " " : String.fromCodePoint(codePoint);
        }
        return named[entity.slice(1, -1).toLowerCase()] ?? entity;
      },
    );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function getPlainTitleTextFromTitleNode(titleNode) {
  if (!titleNode) return "";
  const textParts = [];
  titleNode.childNodes.forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = String(node.textContent || "").trim();
    if (text) textParts.push(text);
  });
  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

export function getPlainTitleTextFromHtml(html) {
  const titleHtml = String(html || "").match(
    /<h1\b[^>]*class=["'][^"']*p-title-value[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
  )?.[1];
  if (!titleHtml) return "";
  return decodeHtmlText(
    titleHtml
      .replace(
        /<a\b[^>]*class=["'][^"']*labelLink[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
        " ",
      )
      .replace(
        /<span\b[^>]*class=["'][^"']*label-append[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        " ",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseBracketSuffixParts(text, limit = 2) {
  const parts = [];
  let remaining = String(text || "").trim();
  while (parts.length < limit) {
    const match = remaining.match(/\[([^\]]+)\]\s*$/);
    if (!match?.[1]) break;
    parts.push(String(match[1]).trim());
    remaining = remaining.slice(0, match.index).trim();
  }
  return parts;
}

export function normalizeThreadTitleText(value) {
  const source = String(value || "")
    .replace(/\s*\|\s*F95zone.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const bracketParts = parseBracketSuffixParts(source);
  const developer = bracketParts[0] || "";
  const gameVersion = bracketParts[1] || "";
  const title = source
    .replace(/\s*\[(v[\d.]+\|?.*?)\]/gi, "")
    .replace(/\s*\[([^\]]+)\]\s*$/gi, "")
    .trim();
  return { source, title, gameVersion, developer };
}
