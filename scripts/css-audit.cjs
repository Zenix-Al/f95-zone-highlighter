#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { Window } = require("happy-dom");
const { runCoreSmokeBuild } = require("./core-source-audit.cjs");

const CSS_FILE = "src/ui/assets/css.css";
const SOURCE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".html", ".css"]);
const EXCLUDED_SOURCE_PREFIXES = [
  "src/generated/",
  "dist/",
  "addons/",
  "tests/.tmp/",
];

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function walkFiles(rootDir, directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(rootDir, absolute, output);
    else if (entry.isFile()) {
      const relative = normalizePath(path.relative(rootDir, absolute));
      if (SOURCE_EXTENSIONS.has(path.extname(relative)) && !EXCLUDED_SOURCE_PREFIXES.some((prefix) => relative.startsWith(prefix)) && !relative.split("/").includes("test")) {
        output.push({ absolute, relative });
      }
    }
  }
  return output;
}

function lineAt(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function sourceLocation(source, needle, cursor = 0) {
  const index = source.indexOf(needle, cursor);
  return { index: index < 0 ? 0 : index, line: lineAt(source, index < 0 ? 0 : index) };
}

function declarationList(style) {
  return [...Array(style.length)].map((_, index) => {
    const property = style[index];
    return {
      property,
      value: style.getPropertyValue(property).trim(),
      priority: style.getPropertyPriority(property) || "",
    };
  });
}

function extractRuleBlock(css, startIndex) {
  const openIndex = css.indexOf("{", startIndex);
  if (openIndex < 0) return { body: "", raw: "" };
  let depth = 0;
  let quote = "";
  let comment = false;
  for (let index = openIndex; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];
    if (comment) {
      if (character === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "*") { comment = true; index += 1; continue; }
    if (character === "\"" || character === "'") { quote = character; continue; }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return { body: css.slice(openIndex + 1, index), raw: css.slice(startIndex, index + 1) };
  }
  return { body: css.slice(openIndex + 1), raw: css.slice(startIndex) };
}

function parseRawDeclarations(body) {
  const declarations = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let comment = false;
  const segments = [];
  for (let index = 0; index <= body.length; index += 1) {
    const character = body[index];
    const next = body[index + 1];
    if (comment) {
      if (character === "*" && next === "/") { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "*") { comment = true; index += 1; continue; }
    if (character === "\"" || character === "'") { quote = character; continue; }
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if ((character === ";" && depth === 0) || index === body.length) {
      segments.push(body.slice(start, index));
      start = index + 1;
    }
  }
  for (const segment of segments) {
    const cleaned = segment.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const separator = cleaned.indexOf(":");
    if (separator < 1) continue;
    const property = cleaned.slice(0, separator).trim();
    let value = cleaned.slice(separator + 1).trim();
    let priority = "";
    if (/\s*!important$/i.test(value)) { priority = "important"; value = value.replace(/\s*!important$/i, "").trim(); }
    declarations.push({ property, value, priority });
  }
  return declarations;
}

function parseRules(css) {
  const window = new Window();
  const style = window.document.createElement("style");
  style.textContent = css;
  window.document.head.appendChild(style);
  const rules = [];
  const customProperties = new Set();
  const animationNames = new Set();
  let selectorCount = 0;
  let declarationCount = 0;
  let mediaQueryCount = 0;
  let keyframeCount = 0;
  let ruleIndex = 0;

  function visit(ruleList, context = []) {
    for (const rule of ruleList || []) {
      if (rule.type === window.CSSRule.STYLE_RULE) {
        const previousSourceIndex = rules.length > 0 ? rules.at(-1).sourceEnd : 0;
        const location = sourceLocation(css, rule.selectorText, previousSourceIndex);
        const rawBlock = extractRuleBlock(css, location.index);
        const declarations = parseRawDeclarations(rawBlock.body);
        const parsedDeclarations = declarationList(rule.style);
        const selectors = rule.selectorText.split(",").map((selector) => selector.trim()).filter(Boolean);
        selectorCount += selectors.length;
        declarationCount += declarations.length;
        for (const declaration of declarations) {
          if (declaration.property.startsWith("--")) customProperties.add(declaration.property);
          if (declaration.property === "animation" || declaration.property === "animation-name") {
            for (const value of declaration.value.split(",")) {
              const name = value.trim().split(/\s+/)[0];
              if (name && name !== "none") animationNames.add(name);
            }
          }
        }
        rules.push({
          index: ruleIndex++,
          type: "style",
          atRules: context,
          selectors,
          selectorText: rule.selectorText,
          declarations,
          authoredBytes: Buffer.byteLength(rawBlock.raw || rule.cssText),
          sourceLine: location.line,
          sourceIndex: location.index,
          sourceEnd: location.index + Buffer.byteLength(rawBlock.raw || rule.cssText),
          parsedDeclarations,
        });
      } else if (rule.type === window.CSSRule.MEDIA_RULE) {
        mediaQueryCount += 1;
        visit(rule.cssRules, [...context, `@media ${rule.conditionText}`]);
      } else if (rule.type === window.CSSRule.KEYFRAMES_RULE || rule.type === window.CSSRule.WEBKIT_KEYFRAMES_RULE) {
        keyframeCount += 1;
        rules.push({
          index: ruleIndex++,
          type: "keyframes",
          atRules: context,
          name: rule.name,
          authoredBytes: Buffer.byteLength(rule.cssText),
          sourceLine: sourceLocation(css, `@${rule.type === window.CSSRule.WEBKIT_KEYFRAMES_RULE ? "-webkit-" : ""}keyframes ${rule.name}`).line,
        });
      } else if (rule.cssRules) {
        visit(rule.cssRules, [...context, rule.cssText.split("{")[0].trim()]);
      }
    }
  }

  visit(style.sheet.cssRules);
  window.close();
  const selectorRules = rules.filter((rule) => rule.type === "style");
  const duplicateSelectorBlocks = Object.entries(selectorRules.reduce((groups, rule) => {
    const key = `${rule.atRules.join("|")}::${rule.selectorText}`;
    (groups[key] ||= []).push(rule);
    return groups;
  }, {})).filter(([, group]) => group.length > 1).map(([key, group]) => ({
    key,
    occurrences: group.map(({ sourceLine, authoredBytes, declarations }) => ({ sourceLine, authoredBytes, declarations })),
  }));
  const duplicateDeclarationGroups = Object.entries(selectorRules.reduce((groups, rule) => {
    const key = rule.declarations.map(({ property, value, priority }) => `${property}:${value}!${priority}`).join(";");
    if (key) (groups[key] ||= []).push({ selectorText: rule.selectorText, sourceLine: rule.sourceLine });
    return groups;
  }, {})).filter(([, group]) => group.length > 1).map(([declarations, occurrences]) => ({ declarations, occurrences }));
  const repeatedDeclarations = selectorRules.flatMap((rule) => {
    const counts = rule.declarations.reduce((map, declaration) => {
      map[declaration.property] = (map[declaration.property] || 0) + 1;
      return map;
    }, {});
    return Object.entries(counts).filter(([, count]) => count > 1).map(([property, count]) => ({
      selectorText: rule.selectorText,
      sourceLine: rule.sourceLine,
      property,
      count,
    }));
  });
  const conflictingDeclarations = Object.entries(selectorRules.reduce((groups, rule) => {
    const key = `${rule.atRules.join("|")}::${rule.selectorText}`;
    (groups[key] ||= []).push(rule);
    return groups;
  }, {})).flatMap(([selector, group]) => {
    const conflicts = [];
    for (let laterIndex = 1; laterIndex < group.length; laterIndex += 1) {
      for (const later of group[laterIndex].declarations) {
        const earlier = group.slice(0, laterIndex).flatMap((rule) => rule.declarations).find((declaration) => declaration.property === later.property);
        if (earlier && `${earlier.value}!${earlier.priority}` !== `${later.value}!${later.priority}`) {
          conflicts.push({ selector, property: later.property, earlier: earlier.value, later: later.value, sourceLine: group[laterIndex].sourceLine });
        }
      }
    }
    return conflicts;
  });
  const emptyRules = selectorRules.filter((rule) => rule.declarations.length === 0).map((rule) => ({ selectorText: rule.selectorText, sourceLine: rule.sourceLine }));
  const vendorPrefixedRules = selectorRules.filter((rule) => rule.selectorText.includes("::-webkit-") || rule.declarations.some((declaration) => declaration.property.startsWith("-"))).map((rule) => ({ selectorText: rule.selectorText, sourceLine: rule.sourceLine }));
  const highSpecificitySelectors = selectorRules.flatMap((rule) => rule.selectors.map((selector) => {
    const ids = (selector.match(/#[\w-]+/g) || []).length;
    const classes = (selector.match(/[.:[\w-]+/g) || []).length;
    const elements = (selector.match(/(?:^|[ >+~])([a-z][\w-]*)/gi) || []).length;
    const specificity = ids * 100 + classes * 10 + elements;
    return specificity >= 30 ? { selector, specificity, sourceLine: rule.sourceLine } : null;
  }).filter(Boolean));
  const identicalMediaQueryBlocks = Object.entries(selectorRules.reduce((groups, rule) => {
    if (rule.atRules.length === 0) return groups;
    const key = `${rule.atRules.join("|")}::${rule.selectorText}::${rule.declarations.map((declaration) => `${declaration.property}:${declaration.value}!${declaration.priority}`).join(";")}`;
    (groups[key] ||= []).push(rule.sourceLine);
    return groups;
  }, {})).filter(([, sourceLines]) => sourceLines.length > 1).map(([key, sourceLines]) => ({ key, sourceLines }));
  const customPropertyReferences = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]))].sort();
  return {
    rules,
    selectorRules,
    selectorCount,
    declarationCount,
    mediaQueryCount,
    keyframeCount,
    customProperties: [...customProperties].sort(),
    customPropertyReferences,
    animationNames: [...animationNames].sort(),
    duplicateSelectorBlocks,
    duplicateDeclarationGroups,
    repeatedDeclarations,
    conflictingDeclarations,
    emptyRules,
    vendorPrefixedRules,
    highSpecificitySelectors,
    identicalMediaQueryBlocks,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTokenMatches(file, token) {
  const bare = escapeRegExp(token.slice(1));
  const patterns = token.startsWith(".")
    ? [
      new RegExp(`class(?:Name)?\\s*[:=]\\s*[^\\n;]*\\b${bare}\\b`, "g"),
      new RegExp(`classList\\.(?:add|remove|replace|toggle)\\([^\\n]*\\b${bare}\\b`, "g"),
      new RegExp(`setAttribute\\s*\\(\\s*["']class["'][^\\n]*\\b${bare}\\b`, "g"),
      new RegExp(`class\\s*=\\s*["'][^"']*\\b${bare}\\b`, "g"),
    ]
    : [
      new RegExp(`(?:id\\s*=\\s*["']|getElementById\\s*\\(\\s*["']|querySelector(?:All)?\\s*\\(\\s*["']#)${bare}\\b`, "g"),
      new RegExp(`(?:id|ID|[A-Z0-9_]+_ID)\\s*[:=]\\s*["']${bare}["']`, "g"),
    ];
  return patterns.flatMap((pattern) => [...file.source.matchAll(pattern)].map((match) => ({ file, index: match.index })));
}

function sourceEvidence(rootDir, css, parsed) {
  const sourceFiles = walkFiles(rootDir, path.join(rootDir, "src")).filter((file) => file.relative !== CSS_FILE);
  const testFiles = walkFiles(rootDir, path.join(rootDir, "tests")).filter((file) => !file.relative.startsWith("tests/.tmp/"));
  const contents = [...sourceFiles, ...testFiles].map((file) => ({ ...file, source: fs.readFileSync(file.absolute, "utf8") }));
  const tokens = new Set();
  for (const rule of parsed.selectorRules) {
    for (const match of rule.selectorText.matchAll(/([.#])([A-Za-z_][\w-]*)/g)) tokens.add(`${match[1]}${match[2]}`);
  }
  for (const rule of parsed.selectorRules) {
    for (const match of rule.selectorText.matchAll(/:is\(([^)]+)\)|:where\(([^)]+)\)/g)) {
      for (const token of (match[1] || match[2]).matchAll(/([.#])([A-Za-z_][\w-]*)/g)) tokens.add(`${token[1]}${token[2]}`);
    }
  }
  const evidence = [...tokens].sort().map((token) => {
    const bare = token.slice(1);
    const matches = contents
      .filter((file) => path.extname(file.relative) !== ".css")
      .flatMap((file) => findTokenMatches(file, token));
    const callSites = matches.slice(0, 8).map(({ file, index }) => {
      const line = lineAt(file.source, index);
      const start = file.source.lastIndexOf("\n", index) + 1;
      const end = file.source.indexOf("\n", index);
      return { file: file.relative, line, excerpt: file.source.slice(start, end < 0 ? file.source.length : end).trim() };
    });
    const dynamic = matches.some(({ file, index }) => {
      const context = file.source.slice(Math.max(0, index - 220), Math.min(file.source.length, index + bare.length + 220));
      return /className|classList\.(?:add|remove|replace|toggle)|setAttribute\s*\(\s*["']class|innerHTML|outerHTML|insertAdjacentHTML|dataset/.test(context);
    });
    const testOnly = matches.length > 0 && matches.every(({ file }) => file.relative.startsWith("tests/"));
    let category = "unresolved";
    if (testOnly) category = "test-only";
    else if (dynamic) category = "dynamic-reference";
    else if (matches.length > 0) category = "static-reference";
    else if (parsed.selectorRules.some((rule) => rule.selectorText.includes(token) && (rule.selectorText.includes(":") || rule.atRules.length > 0))) category = "pseudo-or-responsive-only";
    const protectedReason = matches.length === 0 ? "No repository creation/reference evidence; retain conservatively." : null;
    return { selector: token, category, callSites, protectedReason };
  });
  const dynamicEvidenceFiles = [...new Set(evidence.filter((item) => item.category === "dynamic-reference").flatMap((item) => item.callSites.map((site) => site.file)))].sort();
  return { evidence, dynamicEvidenceFiles };
}

async function auditCss({ rootDir = process.cwd(), includeBundle = true } = {}) {
  const absolute = path.join(rootDir, CSS_FILE);
  const css = fs.readFileSync(absolute, "utf8");
  const parsed = parseRules(css);
  const evidence = sourceEvidence(rootDir, css, parsed);
  const bundle = includeBundle ? await runCoreSmokeBuild({ rootDir }) : null;
  const selectors = parsed.selectorRules.flatMap((rule) => rule.selectors.map((selector) => ({ selector, sourceLine: rule.sourceLine, atRules: rule.atRules })));
  return {
    reportSchemaVersion: 1,
    tool: "css-audit",
    stylesheet: CSS_FILE,
    authoredBytes: Buffer.byteLength(css),
    bundle: bundle ? {
      readable: {
        fullBytes: bundle.readable.bytes,
        gzipBytes: bundle.readable.gzipBytes,
        contributionBytes: bundle.readable.coreContributors.find((entry) => entry.path === CSS_FILE)?.bytes || 0,
      },
      uglified: {
        fullBytes: bundle.uglified.bytes,
        gzipBytes: bundle.uglified.gzipBytes,
        contributionBytes: bundle.uglified.coreContributors.find((entry) => entry.path === CSS_FILE)?.bytes || 0,
      },
    } : null,
    ruleCount: parsed.rules.length,
    styleRuleCount: parsed.selectorRules.length,
    selectorCount: parsed.selectorCount,
    declarationCount: parsed.declarationCount,
    mediaQueryCount: parsed.mediaQueryCount,
    keyframeCount: parsed.keyframeCount,
    customProperties: parsed.customProperties,
    customPropertyReferences: parsed.customPropertyReferences,
    animationNames: parsed.animationNames,
    selectors,
    evidenceMap: evidence.evidence,
    dynamicEvidenceFiles: evidence.dynamicEvidenceFiles,
    externalPageSelectors: [],
    duplicateSelectorBlocks: parsed.duplicateSelectorBlocks,
    duplicateDeclarationGroups: parsed.duplicateDeclarationGroups,
    repeatedDeclarations: parsed.repeatedDeclarations,
    conflictingDeclarations: parsed.conflictingDeclarations,
    emptyRules: parsed.emptyRules,
    vendorPrefixedRules: parsed.vendorPrefixedRules,
    highSpecificitySelectors: parsed.highSpecificitySelectors,
    identicalMediaQueryBlocks: parsed.identicalMediaQueryBlocks,
    largestRuleGroups: parsed.rules.slice().sort((a, b) => b.authoredBytes - a.authoredBytes || a.sourceLine - b.sourceLine).slice(0, 20).map((rule) => ({
      type: rule.type,
      selectorText: rule.selectorText || rule.name || null,
      atRules: rule.atRules,
      authoredBytes: rule.authoredBytes,
      sourceLine: rule.sourceLine,
    })),
    removedSelectors: [],
    protectedDynamicSelectors: evidence.evidence.filter((item) => item.category === "dynamic-reference").map((item) => item.selector),
    protectedExternalSelectors: [],
    unresolvedSelectors: evidence.evidence.filter((item) => item.category === "unresolved").map((item) => item.selector),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), output: null, compare: null, check: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") options.rootDir = path.resolve(args[++index]);
    else if (args[index] === "--output") options.output = path.resolve(options.rootDir, args[++index]);
    else if (args[index] === "--compare") options.compare = path.resolve(options.rootDir, args[++index]);
    else if (args[index] === "--check") options.check = path.resolve(options.rootDir, args[++index]);
  }
  return options;
}

function withComparison(current, baseline) {
  if (!baseline) return current;
  return {
    ...current,
    comparison: {
      authoredBytes: { before: baseline.authoredBytes, after: current.authoredBytes, delta: current.authoredBytes - baseline.authoredBytes },
      readableBundleContributionBytes: { before: baseline.bundle.readable.contributionBytes, after: current.bundle.readable.contributionBytes, delta: current.bundle.readable.contributionBytes - baseline.bundle.readable.contributionBytes },
      readableBundleFullBytes: { before: baseline.bundle.readable.fullBytes, after: current.bundle.readable.fullBytes, delta: current.bundle.readable.fullBytes - baseline.bundle.readable.fullBytes },
      readableBundleGzipBytes: { before: baseline.bundle.readable.gzipBytes, after: current.bundle.readable.gzipBytes, delta: current.bundle.readable.gzipBytes - baseline.bundle.readable.gzipBytes },
      uglifiedBundleContributionBytes: { before: baseline.bundle.uglified.contributionBytes, after: current.bundle.uglified.contributionBytes, delta: current.bundle.uglified.contributionBytes - baseline.bundle.uglified.contributionBytes },
      uglifiedBundleFullBytes: { before: baseline.bundle.uglified.fullBytes, after: current.bundle.uglified.fullBytes, delta: current.bundle.uglified.fullBytes - baseline.bundle.uglified.fullBytes },
      uglifiedBundleGzipBytes: { before: baseline.bundle.uglified.gzipBytes, after: current.bundle.uglified.gzipBytes, delta: current.bundle.uglified.gzipBytes - baseline.bundle.uglified.gzipBytes },
      selectorCount: { before: baseline.selectorCount, after: current.selectorCount, delta: current.selectorCount - baseline.selectorCount },
      declarationCount: { before: baseline.declarationCount, after: current.declarationCount, delta: current.declarationCount - baseline.declarationCount },
      styleRuleCount: { before: baseline.styleRuleCount, after: current.styleRuleCount, delta: current.styleRuleCount - baseline.styleRuleCount },
      mediaQueryCount: { before: baseline.mediaQueryCount, after: current.mediaQueryCount, delta: current.mediaQueryCount - baseline.mediaQueryCount },
      duplicateSelectorBlocks: { before: baseline.duplicateSelectorBlocks.length, after: current.duplicateSelectorBlocks.length, delta: current.duplicateSelectorBlocks.length - baseline.duplicateSelectorBlocks.length },
      repeatedDeclarations: { before: baseline.repeatedDeclarations.length, after: current.repeatedDeclarations.length, delta: current.repeatedDeclarations.length - baseline.repeatedDeclarations.length },
      conflictingDeclarations: { before: baseline.conflictingDeclarations.length, after: current.conflictingDeclarations.length, delta: current.conflictingDeclarations.length - baseline.conflictingDeclarations.length },
      consolidatedRules: baseline.duplicateSelectorBlocks.filter((before) => !current.duplicateSelectorBlocks.some((after) => after.key === before.key)),
      removedSelectors: baseline.evidenceMap
        .filter((item) => !current.evidenceMap.some((candidate) => candidate.selector === item.selector))
        .map((item) => ({ selector: item.selector, evidence: item.callSites, reason: "Selector no longer appears in the parsed stylesheet." })),
    },
  };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const baseline = options.compare ? JSON.parse(fs.readFileSync(options.compare, "utf8")) : null;
  const report = withComparison(await auditCss({ rootDir: options.rootDir }), baseline);
  const output = stableJson(report);
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, output);
  } else process.stdout.write(output);
  if (options.check && fs.readFileSync(options.check, "utf8") !== output) throw new Error(`CSS audit differs from ${normalizePath(path.relative(options.rootDir, options.check))}.`);
}

if (require.main === module) {
  main().catch((error) => { console.error(`CSS audit failed: ${error.message}`); process.exitCode = 1; });
}

module.exports = { auditCss, extractRuleBlock, parseRawDeclarations, parseRules, stableJson, withComparison };
