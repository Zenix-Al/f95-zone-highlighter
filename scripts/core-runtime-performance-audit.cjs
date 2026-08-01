#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parseRules, stableJson } = require("./css-audit.cjs");

const FILES = Object.freeze({
  css: "src/ui/assets/css.css",
  startupCss: "src/ui/assets/startup.css",
  documentCss: "src/ui/assets/document.css",
  ui: "src/ui/index.js",
  cssInjector: "src/ui/helpers/cssInjector.js",
  modal: "src/ui/components/modal.js",
  settings: "src/ui/settings/index.js",
  modalLifecycle: "src/ui/settings/modalLifecycle.js",
  settingsService: "src/services/settingsService.js",
  configChange: "src/services/configChangeApplication.js",
  migration: "src/services/configMigrationService.js",
  tagsService: "src/services/tagsService.js",
  tagSearch: "src/ui/components/tag-search/index.js",
});

const STARTUP_SELECTOR_PATTERNS = Object.freeze([
  /^\*(?::|$)/,
  /#toast-container/,
  /\.toast(?:\b|\.)/,
  /#f95ue-page-dock/,
  /\.f95ue-page-dock-/,
  /#tag-config-button/,
]);

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function read(rootDir, relative) {
  return fs.readFileSync(path.join(rootDir, relative), "utf8");
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function lineOf(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Expected source marker was not found: ${needle}`);
  return source.slice(0, index).split(/\r?\n/).length;
}

function callSite(relative, source, needle, label) {
  return {
    path: normalizePath(relative),
    line: lineOf(source, needle),
    operation: label,
  };
}

function classifyCss(css) {
  const parsed = parseRules(css);
  const styleRules = parsed.rules.filter((rule) => rule.type === "style");
  const startupRules = styleRules.filter((rule) =>
    rule.selectors.some((selector) => STARTUP_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector))),
  );
  const startupIndexes = new Set(startupRules.map((rule) => rule.index));
  const modalCandidates = styleRules.filter((rule) => !startupIndexes.has(rule.index));
  const summarize = (rules) => ({
    styleRuleCount: rules.length,
    selectorCount: rules.reduce((total, rule) => total + rule.selectors.length, 0),
    ruleAuthoredBytes: rules.reduce((total, rule) => total + rule.authoredBytes, 0),
    selectors: rules.flatMap((rule) => rule.selectors).sort((a, b) => a.localeCompare(b)),
  });
  return {
    authoredBytes: byteLength(css),
    styleRuleCount: styleRules.length,
    selectorCount: parsed.selectorCount,
    mediaQueryCount: parsed.mediaQueryCount,
    ownership: {
      startupRequired: summarize(startupRules),
      modalOnlyCandidates: summarize(modalCandidates),
      rule: "Universal rules plus toast and page-dock selectors remain startup-owned; all other rules are deferred candidates pending the split package's focused tests.",
    },
  };
}

function buildCssLifecycle(rootDir) {
  const sources = Object.fromEntries(
    ["ui", "cssInjector", "modal", "settings", "modalLifecycle"]
      .map((key) => [key, read(rootDir, FILES[key])]),
  );
  const css = read(rootDir, FILES.css);
  const hasSplitCss = fs.existsSync(path.join(rootDir, FILES.startupCss));
  const startupCss = hasSplitCss ? read(rootDir, FILES.startupCss) : css;
  const documentCss = read(rootDir, FILES.documentCss);
  const combinedCss = hasSplitCss ? `${startupCss}\n${css}` : css;
  return {
    stylesheet: {
      path: hasSplitCss ? `${FILES.startupCss} + ${FILES.css}` : FILES.css,
      target: "shadow",
      ...classifyCss(combinedCss),
    },
    startupStylesheet: {
      path: hasSplitCss ? FILES.startupCss : FILES.css,
      target: "shadow",
      ...classifyCss(startupCss),
    },
    modalStylesheet: hasSplitCss ? {
      path: FILES.css,
      target: "shadow",
      ...classifyCss(css),
    } : null,
    documentStylesheet: {
      path: FILES.documentCss,
      target: "document",
      authoredBytes: byteLength(documentCss),
      styleRuleCount: parseRules(documentCss).rules.filter((rule) => rule.type === "style").length,
    },
    phases: {
      beforeFirstInteraction: {
        shadowStyleElements: 1,
        documentStyleElements: 1,
        shadowCssBytes: byteLength(startupCss),
        behavior: hasSplitCss
          ? "initUiPhaseIfApplicable creates the Shadow root, then injectCSS acquires startup CSS and document styles before injecting the settings dock button."
          : "initUiPhaseIfApplicable creates the Shadow root, then injectCSS acquires the complete base UI and document styles before injecting the settings dock button.",
      },
      firstOpenModal: {
        newShadowStyleElements: hasSplitCss ? 1 : 0,
        newDocumentStyleElements: 0,
        cssBytesInjected: hasSplitCss ? byteLength(css) : 0,
        behavior: hasSplitCss
          ? "openModal synchronously ensures the modal stylesheet before initModalUi constructs or exposes modal content."
          : "openModal awaits initModalUi, which injects/binds/refreshes modal UI; no stylesheet operation occurs.",
      },
      repeatOpenModal: {
        newShadowStyleElements: 0,
        newDocumentStyleElements: 0,
        cssBytesInjected: 0,
        behavior: "The existing base styles remain installed and repeated open performs no stylesheet operation.",
      },
    },
    ownershipEvidence: {
      startup: [
        callSite(FILES.ui, sources.ui, "injectCSS();", "complete CSS injection before dock creation"),
        callSite(FILES.cssInjector, sources.cssInjector, "acquireStyle(BASE_UI_STYLE_ID", "base Shadow stylesheet acquisition"),
        callSite(FILES.cssInjector, sources.cssInjector, "acquireStyle(BASE_DOCUMENT_STYLE_ID", "base document stylesheet acquisition"),
      ],
      modal: [
        callSite(FILES.modal, sources.modal, "await initModalUi();", "first/repeated modal initialization"),
        callSite(FILES.settings, sources.settings, "const shadowRoot = ensureModalSkeletonInjected();", "modal skeleton demand point"),
        callSite(FILES.modalLifecycle, sources.modalLifecycle, "ensureTagsPanelDataLoaded();", "modal dynamic refresh"),
      ],
    },
  };
}

function buildConfigCopyBaseline(rootDir) {
  const settings = read(rootDir, FILES.settingsService);
  const change = read(rootDir, FILES.configChange);
  const migration = read(rootDir, FILES.migration);
  const catalog = { tags: 400, prefixes: 40 };
  const optimized = settings.includes("preserveRuntimeCatalogs: true")
    && settings.includes("cloneRuntimeSnapshot(config)")
    && change.includes("cloneRuntimeSnapshot(nextConfig)")
    && migration.includes("tags: [],");
  if (optimized) {
    return {
      scenario: "updateConfig changes one unrelated scalar while runtime caches contain 400 tags and 40 prefixes",
      catalogFixture: catalog,
      explicitFullConfigClonePasses: 0,
      explicitCatalogItemsCopied: 0,
      additionalSchemaTraversal: false,
      note: "Runtime snapshots retain catalog references, canonical projection replaces catalogs before cloning, and unrelated strict validation uses empty cache placeholders.",
      passes: [],
      bypassEvidence: [
        callSite(FILES.settingsService, settings, "const draft = cloneRuntimeSnapshot(config);", "catalog-independent update draft"),
        callSite(FILES.settingsService, settings, "preserveRuntimeCatalogs: true", "unrelated commit validation bypass"),
        callSite(FILES.configChange, change, "const requestedNext = cloneRuntimeSnapshot(nextConfig);", "catalog-independent effect snapshot"),
        callSite(FILES.migration, migration, "tags: [],", "catalog-free canonical projection"),
      ],
    };
  }
  const passes = [
    callSite(FILES.settingsService, settings, "const previousConfig = cloneConfig(config);", "updateConfig previous snapshot"),
    callSite(FILES.settingsService, settings, "const draft = cloneConfig(config);", "updateConfig draft"),
    callSite(FILES.settingsService, settings, "const previousLiveConfig = cloneConfig(config);", "commit rollback snapshot"),
    callSite(FILES.migration, migration, "const canonical = clone(source) || {};", "canonical projection before caches are cleared"),
    callSite(FILES.configChange, change, "const previous = clone(config);", "effect previous snapshot"),
    callSite(FILES.configChange, change, "const requestedNext = clone(nextConfig);", "effect requested snapshot"),
    callSite(FILES.configChange, change, "config: clone(config),", "effect result snapshot"),
    callSite(FILES.settingsService, settings, "config: cloneConfig(applied.config),", "commit result snapshot"),
  ];
  return {
    scenario: "updateConfig changes one unrelated scalar while runtime caches contain 400 tags and 40 prefixes",
    catalogFixture: catalog,
    explicitFullConfigClonePasses: passes.length,
    explicitCatalogItemsCopied: (catalog.tags + catalog.prefixes) * passes.length,
    additionalSchemaTraversal: true,
    note: "The count covers explicit JSON clone passes only. Strict schema validation also reconstructs catalog arrays, so this is a conservative lower bound.",
    passes,
  };
}

function fixtureTags(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    name: `Tag ${String(index + 1).padStart(3, "0")}`,
  }));
}

function tagSearchScenario(tags, query, selectedIds) {
  const normalized = query.trim().toLowerCase();
  const candidates = normalized
    ? tags.filter((tag) => tag.name.toLowerCase().includes(normalized))
    : tags;
  const visible = candidates.filter((tag) => !selectedIds.has(tag.id));
  return {
    query,
    candidateTags: candidates.length,
    resultRows: visible.length,
    actionButtons: visible.length * 3,
    perResultActionListeners: visible.length * 3,
    containerActionListeners: 0,
  };
}

function buildTagSearchBaseline(rootDir) {
  const tagsService = read(rootDir, FILES.tagsService);
  const tagSearch = read(rootDir, FILES.tagSearch);
  const tags = fixtureTags(400);
  const selected = new Set([1, 2, 3, 101, 102, 201, 202, 301, 302]);
  const optimized = tagSearch.includes("TAG_SEARCH_RESULT_CHUNK_SIZE = 60")
    && tagSearch.includes("results.addEventListener(\"click\"")
    && !tagSearch.includes("btn.addEventListener(\"click\"");
  const scenarios = ["", "tag 0", "tag 00", "missing"]
    .map((query) => tagSearchScenario(tags, query, selected))
    .map((scenario) => optimized ? {
      ...scenario,
      totalReachableResults: scenario.resultRows,
      resultRows: Math.min(60, scenario.resultRows),
      actionButtons: Math.min(60, scenario.resultRows) * 3,
      perResultActionListeners: 0,
      containerActionListeners: 1,
      loadMoreButton: scenario.resultRows > 60 ? 1 : 0,
    } : scenario);
  return {
    fixture: {
      catalogSize: tags.length,
      selectedIds: [...selected],
      note: "The 400-tag catalog reflects the current expected user catalog scale; names and selected IDs are deterministic synthetic data.",
    },
    scenarios,
    behavior: {
      emptyFocusRendersFullCatalog: true,
      actionButtonsPerResult: 3,
      actionListenerOwnership: optimized
        ? "one delegated click listener on the result container"
        : "one click listener per action button",
      filtering: "ordered case-insensitive substring scan followed by three linear selected-membership checks per candidate",
      initialChunkSize: optimized ? 60 : null,
    },
    evidence: [
      callSite(FILES.tagsService, tagsService, "renderList(config.tags);", "empty focus renders full catalog"),
      callSite(
        FILES.tagSearch,
        tagSearch,
        optimized ? "visibleTags.slice(0, visibleCount).forEach((tag) =>" : "visibleTags.forEach((tag) =>",
        optimized ? "bounded visible rows created synchronously" : "all visible rows created synchronously",
      ),
      callSite(
        FILES.tagSearch,
        tagSearch,
        optimized ? "results.addEventListener(\"click\"" : "btn.addEventListener(\"click\"",
        optimized ? "delegated result-container click listener" : "per-action-button click listener",
      ),
      callSite(FILES.tagSearch, tagSearch, "!config.preferredTags.includes(tag.id)", "preferred membership scan per candidate"),
      callSite(FILES.tagSearch, tagSearch, "!config.excludedTags.includes(tag.id)", "excluded membership scan per candidate"),
      callSite(FILES.tagSearch, tagSearch, "!config.markedTags.includes(tag.id)", "marked membership scan per candidate"),
    ],
  };
}

function auditCoreRuntimePerformance(rootDir = process.cwd()) {
  const configCopy = buildConfigCopyBaseline(rootDir);
  const tagSearch = buildTagSearchBaseline(rootDir);
  const hasSplitCss = fs.existsSync(path.join(rootDir, FILES.startupCss));
  const allOptimizationsPresent = hasSplitCss
    && configCopy.explicitCatalogItemsCopied === 0
    && tagSearch.behavior.initialChunkSize > 0;
  const packageId = allOptimizationsPresent
    ? "MODAL-CSS-VERIFY-01"
    : tagSearch.behavior.initialChunkSize
      ? "TAG-SEARCH-BOUND-01"
    : configCopy.explicitCatalogItemsCopied === 0
      ? "CONFIG-CATALOG-COPY-01"
    : hasSplitCss
      ? "MODAL-CSS-SPLIT-01"
      : "MODAL-CSS-BASELINE-01";
  const report = {
    reportSchemaVersion: 1,
    package: packageId,
    productionChanged: packageId !== "MODAL-CSS-BASELINE-01",
    cssLifecycle: buildCssLifecycle(rootDir),
    configCopy,
    tagSearch,
    deterministic: {
      timestamps: false,
      absolutePaths: false,
      networkAccess: false,
      timingGates: false,
    },
  };
  const baselinePath = path.join(rootDir, "docs/architecture/core-runtime-performance-baseline.json");
  if (allOptimizationsPresent && fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    report.verification = {
      baseline: {
        startupCssBytes: baseline.cssLifecycle.phases.beforeFirstInteraction.shadowCssBytes,
        startupCssRules: baseline.cssLifecycle.stylesheet.styleRuleCount,
        startupShadowStyleElements: baseline.cssLifecycle.phases.beforeFirstInteraction.shadowStyleElements,
        firstOpenNewShadowStyleElements: baseline.cssLifecycle.phases.firstOpenModal.newShadowStyleElements,
        repeatOpenNewShadowStyleElements: baseline.cssLifecycle.phases.repeatOpenModal.newShadowStyleElements,
      },
      criticalStartupSelectors: ["#toast-container", "#f95ue-page-dock", "#tag-config-button"],
      modalDemandSelector: "#tag-config-modal",
    };
  }
  return report;
}

function renderMarkdown(report) {
  const css = report.cssLifecycle;
  const copy = report.configCopy;
  const empty = report.tagSearch.scenarios[0];
  const split = report.package !== "MODAL-CSS-BASELINE-01";
  const baseline = report.verification?.baseline;
  const comparison = baseline ? `
## Integrated before/after verification

| Measurement | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Startup CSS bytes | ${baseline.startupCssBytes} | ${css.phases.beforeFirstInteraction.shadowCssBytes} | ${css.phases.beforeFirstInteraction.shadowCssBytes - baseline.startupCssBytes} |
| Startup CSS rules | ${baseline.startupCssRules} | ${css.startupStylesheet.styleRuleCount} | ${css.startupStylesheet.styleRuleCount - baseline.startupCssRules} |
| Startup Shadow styles | ${baseline.startupShadowStyleElements} | ${css.phases.beforeFirstInteraction.shadowStyleElements} | ${css.phases.beforeFirstInteraction.shadowStyleElements - baseline.startupShadowStyleElements} |
| First-open new Shadow styles | ${baseline.firstOpenNewShadowStyleElements} | ${css.phases.firstOpenModal.newShadowStyleElements} | ${css.phases.firstOpenModal.newShadowStyleElements - baseline.firstOpenNewShadowStyleElements} |
| Repeated-open new Shadow styles | ${baseline.repeatOpenNewShadowStyleElements} | ${css.phases.repeatOpenModal.newShadowStyleElements} | ${css.phases.repeatOpenModal.newShadowStyleElements - baseline.repeatOpenNewShadowStyleElements} |

Critical startup selectors remain in the startup asset. Modal-only selectors are
absent before first open and acquired synchronously before modal construction.
` : "";
  return `# Core runtime performance ${split ? "current evidence" : "baseline"}

This deterministic report characterizes the current branch for
\`${report.package}\`.

## CSS lifecycle

| Phase | Shadow styles | New CSS bytes |
| --- | ---: | ---: |
| Before first interaction | ${css.phases.beforeFirstInteraction.shadowStyleElements} | ${css.phases.beforeFirstInteraction.shadowCssBytes} |
| First \`openModal()\` | ${css.phases.firstOpenModal.newShadowStyleElements} new | ${css.phases.firstOpenModal.cssBytesInjected} |
| Repeated \`openModal()\` | ${css.phases.repeatOpenModal.newShadowStyleElements} new | ${css.phases.repeatOpenModal.cssBytesInjected} |

The complete Shadow stylesheet contains ${css.stylesheet.authoredBytes} bytes,
${css.stylesheet.styleRuleCount} style rules, and ${css.stylesheet.selectorCount}
selectors. Characterization marks
${css.stylesheet.ownership.startupRequired.styleRuleCount} rules / ${css.stylesheet.ownership.startupRequired.ruleAuthoredBytes}
rule bytes as startup-required (universal, toast, and page-dock rules); the
remaining ${css.stylesheet.ownership.modalOnlyCandidates.styleRuleCount} rules
are modal-layer candidates pending focused split tests.
${comparison}

## Unrelated config update

An unrelated scalar \`updateConfig\` performs ${copy.explicitFullConfigClonePasses}
explicit full-config JSON clone passes. With the deterministic 400-tag / 40-prefix
fixture, that copies at least ${copy.explicitCatalogItemsCopied} catalog items;
strict schema reconstruction is additional work.

## Tag search

Empty focus against 400 tags with nine already selected creates
${empty.resultRows} result rows, ${empty.actionButtons} action buttons, and
${empty.perResultActionListeners} result-action listeners synchronously. The
other deterministic query counts are stored in the JSON report.

## Ownership

- Startup CSS is acquired by \`src/ui/helpers/cssInjector.js\` from
  \`src/ui/index.js\` before the page dock is injected.
- Core modal demand begins at \`src/ui/components/modal.js#openModal\` and
  synchronously acquires the modal stylesheet before constructing or exposing
  modal content; repeated opens reuse the registered style.
- Config cloning is owned by \`settingsService\`,
  \`configChangeApplication\`, and canonical projection in
  \`configMigrationService\`.
- Tag filtering and full-catalog focus are owned by \`tagsService\`; result DOM
  and per-button listeners are owned by \`ui/components/tag-search/index.js\`.
`;
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), output: null, markdown: null, check: null, checkMarkdown: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") options.rootDir = path.resolve(args[++index]);
    else if (argument === "--output") options.output = path.resolve(options.rootDir, args[++index]);
    else if (argument === "--markdown") options.markdown = path.resolve(options.rootDir, args[++index]);
    else if (argument === "--check") options.check = path.resolve(options.rootDir, args[++index]);
    else if (argument === "--check-markdown") options.checkMarkdown = path.resolve(options.rootDir, args[++index]);
  }
  return options;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const report = auditCoreRuntimePerformance(options.rootDir);
  const json = stableJson(report);
  const markdown = renderMarkdown(report);
  if (options.check && fs.readFileSync(options.check, "utf8") !== json) {
    throw new Error(`Performance audit differs from ${normalizePath(path.relative(options.rootDir, options.check))}.`);
  }
  if (options.checkMarkdown && fs.readFileSync(options.checkMarkdown, "utf8") !== markdown) {
    throw new Error(`Performance summary differs from ${normalizePath(path.relative(options.rootDir, options.checkMarkdown))}.`);
  }
  if (options.output) writeFile(options.output, json);
  else if (!options.check) process.stdout.write(json);
  if (options.markdown) writeFile(options.markdown, markdown);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`Core runtime performance audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  auditCoreRuntimePerformance,
  buildConfigCopyBaseline,
  buildTagSearchBaseline,
  classifyCss,
  fixtureTags,
  renderMarkdown,
};
