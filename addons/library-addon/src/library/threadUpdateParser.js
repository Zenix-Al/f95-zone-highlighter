import { debugLog } from "../../../shared/debugLog.js";

const MAX_HTML_CHARS = 1_000_000;
const MAX_TEXT_CHARS = 120_000;
const DEBUG_OWNER = "library-addon:auto-update";

function decode(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readableText(html) {
  return decode(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .slice(0, MAX_TEXT_CHARS);
}

function field(text, name) {
  const match = String(text).match(new RegExp(`\\b${name}\\s*:\\s*([^\\n\\r]+)`, "i"));
  return match ? match[1].replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

function bracketVersion(text) {
  const clean = String(text || "").replace(/\s+/g, " ");
  return (
    clean.match(/\[(v\d+[^\]]{0,50})\]/i)?.[1] ||
    clean.match(/\[(patch\s*\d+[^\]]{0,30})\]/i)?.[1] ||
    clean.match(/\[(\d{4}[._-]\d{1,2}[._-]\d{1,2}[^\]]{0,20})\]/i)?.[1] ||
    ""
  ).trim();
}

function meta(html, property) {
  const tag = String(html).match(
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${property}["'][^>]*>`, "i"),
  )?.[0];
  return decode(tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "").trim();
}

function isAuthenticationPage(source) {
  const pageText = readableText(source);
  return (
    /\bsorry,?\s+you\s+have\s+to\s+be\s+logged\s+in\s+to\s+access\s+this\s+page\b/i.test(
      pageText,
    ) ||
    /\byou\s+must\s+be\s+logged[\s-]*in\s+to\s+do\s+that\b/i.test(pageText)
  );
}

export function parseLibraryThreadHtml(html, { finalUrl = "", requestedUrl = "" } = {}) {
  const source = String(html || "").slice(0, MAX_HTML_CHARS);
  if (!source.trim() || !/<(?:html|title|article|meta)\b/i.test(source)) {
    debugLog(DEBUG_OWNER, "Thread HTML parsing failed.", {
      level: "warn",
      data: { reason: "malformed_html", sourceChars: source.length },
    });
    return { ok: false, reason: "malformed_html" };
  }
  if (isAuthenticationPage(source)) {
    debugLog(DEBUG_OWNER, "Thread HTML parsing failed.", {
      level: "warn",
      data: { reason: "authentication_required", sourceChars: source.length },
    });
    return { ok: false, reason: "authentication_required" };
  }
  if (/cf-chl-|challenge-platform|Just a moment|Attention Required/i.test(source)) {
    debugLog(DEBUG_OWNER, "Thread HTML parsing failed.", {
      level: "warn",
      data: { reason: "challenge_page", sourceChars: source.length },
    });
    return { ok: false, reason: "challenge_page" };
  }

  const title =
    meta(source, "og:title") ||
    decode(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
  const starterHtml =
    source.match(
      /<(?:article|div)\b[^>]*class=["'][^"']*message-threadStarterPost[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div)>/i,
    )?.[1] || "";
  const starterText = readableText(starterHtml);
  const bodyText = readableText(source);
  const version =
    field(starterText, "Version") ||
    bracketVersion(title) ||
    field(bodyText, "Version") ||
    bracketVersion(bodyText);
  const statusMatch = `${title}\n${starterText}`.match(
    /\b(Completed|On[\s-]?Hold|Abandoned|Active)\b/i,
  );
  const status = statusMatch
    ? statusMatch[1].toLowerCase().replace(/[\s-]+/g, "-")
    : "active";
  const canonicalUrl =
    meta(source, "og:url") ||
    decode(source.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]) ||
    finalUrl ||
    requestedUrl;

  if (!version) {
    debugLog(DEBUG_OWNER, "Thread HTML parsing failed.", {
      level: "warn",
      data: {
        reason: "version_missing",
        sourceChars: source.length,
        starterChars: starterText.length,
        title,
        status,
      },
    });
    return { ok: false, reason: "version_missing", title, status, url: canonicalUrl };
  }
  debugLog(DEBUG_OWNER, "Thread HTML parsed.", {
    data: {
      sourceChars: source.length,
      starterChars: starterText.length,
      title,
      version,
      status,
    },
  });
  return {
    ok: true,
    value: {
      title: title.replace(/\s*\|\s*F95zone.*$/i, "").trim(),
      currentVersion: version,
      status,
      url: canonicalUrl,
    },
  };
}
