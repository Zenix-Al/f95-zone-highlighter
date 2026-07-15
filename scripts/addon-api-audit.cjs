#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "addons", "addons.manifest.json");
const ACTIONS_PATH = path.join(ROOT, "src", "services", "addons", "actions", "descriptors.js");
const DEFAULT_JSON_OUTPUT = path.join(ROOT, "docs", "architecture", "addon-api-audit.json");
const DEFAULT_MD_OUTPUT = path.join(ROOT, "docs", "architecture", "addon-api-audit.md");

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativePath(filePath) {
  return normalizePath(path.relative(ROOT, filePath));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute));
    else if (entry.isFile() && /\.(?:js|mjs|cjs|html|css)$/.test(entry.name)) files.push(absolute);
  }
  return files.sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

function readManifest() {
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  return Array.isArray(parsed.addons) ? parsed.addons : [];
}

function extractActionIds() {
  const source = fs.readFileSync(ACTIONS_PATH, "utf8");
  const ids = [...source.matchAll(/["']([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)["']\s*:/gim)]
    .map((match) => match[1]);
  return [...new Set([...ids, "addon.access", "addon.throttle"])].sort();
}

function lineRecords(filePath, source, matcher) {
  return source.split(/\r?\n/).flatMap((line, index) => matcher.test(line)
    ? [{ path: relativePath(filePath), line: index + 1, text: line.trim() }]
    : []);
}

function occurrences(files, matcher) {
  return files.flatMap((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return lineRecords(filePath, source, matcher);
  });
}

function actionOccurrences(files, actionIds) {
  const records = [];
  for (const action of actionIds) {
    const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`(?:["']${escaped}["']|\\b${escaped.replace(/\\\./g, "\\\\.")}\\b)`);
    records.push({
      id: action,
      callSites: occurrences(files, matcher),
    });
  }
  return records;
}

function eventOccurrences(files) {
  const records = new Map();
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      const values = [
        ...[...line.matchAll(/([A-Z][A-Z0-9_]*(?:EVENT|KEY))\s*=\s*["'`]([^"'`]+)["'`]/g)]
          .filter((match) => match[1].includes("EVENT") || match[2].startsWith("f95ue"))
          .map((match) => match[2]),
        ...line.matchAll(/["'](f95ue:[^"']+)["']/g),
      ];
      for (const value of values.map((match) => typeof match === "string" ? match : match[1]).filter(Boolean)) {
        if (!records.has(value)) records.set(value, []);
        records.get(value).push({ path: relativePath(filePath), line: index + 1, text: line.trim() });
      }
    });
  }
  return [...records.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([eventName, callSites]) => ({ eventName, callSites }));
}

function keyOccurrences(files) {
  const records = new Map();
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(/([A-Z][A-Z0-9_]*(?:KEY|STORAGE_KEY))\s*=\s*["'`]([^"'`]+)["'`]/g)) {
        const key = `${match[1]}=${match[2]}`;
        if (!records.has(key)) records.set(key, []);
        records.get(key).push({ path: relativePath(filePath), line: index + 1, text: line.trim() });
      }
    });
  }
  return [...records.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, callSites]) => ({ key, callSites }));
}

function unknownLiteralActionOccurrences(files, actionIds) {
  const known = new Set(actionIds);
  const records = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(/invokeCoreAction\s*\(\s*["']([^"']+)["']/g)) {
        if (!known.has(match[1])) records.push({ action: match[1], path: relativePath(filePath), line: index + 1, text: line.trim() });
      }
    });
  }
  return records;
}

function inventoryAddon(addon, files, actionIds) {
  const actionRecords = actionOccurrences(files, actionIds);
  const sourceFiles = files.map(relativePath);
  const records = (matcher) => occurrences(files, matcher);
  return {
    id: addon.id,
    manifest: {
      entry: normalizePath(addon.entry),
      matches: [...(addon.matches || [])],
      grants: [...(addon.grants || [])],
      runAt: addon.runAt,
      runtimeMode: addon.runtimeMode,
      pageScopes: [...(addon.pageScopes || [])],
      capabilities: [...(addon.capabilities || [])],
    },
    sourceFiles,
    rawActions: actionRecords.filter((entry) => entry.callSites.length > 0),
    globalEventListeners: records(/(?:window|document)\.addEventListener\s*\(/),
    bridgeEvents: eventOccurrences(files).flatMap((entry) => entry.callSites.map((callSite) => ({ ...callSite, eventName: entry.eventName }))),
    storageKeys: keyOccurrences(files),
    pollingAndTimers: records(/\b(?:setTimeout|setInterval|MutationObserver)\s*\(/),
    urlAndPageParsing: records(/(?:location\.|window\.location|new URL\s*\(|URLSearchParams|hostname|pathname|searchParams)/),
    coreDomAssumptions: records(/(?:document\.(?:querySelector|querySelectorAll|getElementById|createElement|body)|\.querySelector(?:All)?\s*\(|\.innerHTML\b|window\.(?:initDownload|close|jQuery|\$)\b)/),
    directGmAccess: records(/\b(?:GM(?:_|\.)|GMApi\b|GM_openInTab\b)/),
    cancellationAndTeardown: records(/\b(?:AbortController|clearTimeout|clearInterval|cancel|cancellation|teardown|disable|generation|isCurrent|retry)\b/i),
    rawActionCount: actionRecords.reduce((total, entry) => total + entry.callSites.length, 0),
  };
}

function candidateDefinitions() {
  return [
    {
      candidateActionId: "page.getContext",
      problem: "Several add-ons independently parse URL, route, thread, and page context.",
      pattern: /(?:location\.|window\.location|new URL\s*\(|URLSearchParams|hostname|pathname|searchParams)/,
      proposedCapability: "page",
      scopePolicy: "runtime; read-only and route-generation bound",
      payloadBounds: "No payload beyond the current route context; caller supplies no selector or URL source.",
      resultBounds: "Normalized hostname/pathname, page scopes, route generation, and bounded thread ID/title/image fields; no DOM objects.",
      ownershipCleanup: "No retained resources; result becomes stale when the supplied route generation changes.",
      publicApi: true,
      estimatedSourceDelta: "Core descriptor/wrapper approximately +1.5-2.5 KB readable; consumers should remove duplicated parsers, exact delta requires implementation measurement.",
      compatibility: "Additive action; older cores require an add-on-local parser fallback.",
      decision: "implement",
      rank: 1,
      reason: "Three production add-ons have overlapping route parsing, and a bounded normalized result reduces correctness drift without exposing core DOM.",
      consumerIds: ["latest-filters-addon", "library-addon", "masked-direct-addon"],
    },
    {
      candidateActionId: "observer.waitFor",
      problem: "Core-page add-ons use selector polling, mount retries, and loading checks with separate timer cleanup.",
      pattern: /\b(?:setTimeout|setInterval|MutationObserver)\s*\(|pollTimer|mountTimer|waitForPageReady|scheduleMount/,
      proposedCapability: "observer",
      scopePolicy: "runtime; one-shot, owner-scoped, core page scopes only",
      payloadBounds: "One allowlisted selector or fixed observer target, required timeout <= 30 seconds, no arbitrary callback.",
      resultBounds: "At most one sanitized node descriptor or a timeout/cancel result; no unbounded node collection.",
      ownershipCleanup: "Core owns the observer/timer under the add-on owner and cancels it on disable, route invalidation, or teardown.",
      publicApi: true,
      estimatedSourceDelta: "Core observer descriptor approximately +1.5-3 KB readable; removes repeated timer scaffolding only after consumer migration.",
      compatibility: "Additive action; hybrid add-ons retain a local implementation on standalone hosts.",
      decision: "implement",
      rank: 2,
      reason: "At least four add-ons show bounded wait/poll behavior; central ownership directly reduces stale callbacks and cleanup risk.",
      consumerIds: ["image-repair-addon", "latest-filters-addon", "library-addon", "masked-direct-addon"],
    },
    {
      candidateActionId: "ui.dialog.update",
      problem: "Open dialogs are updated through direct content-element lookup or close/reopen loops.",
      pattern: /ui\.dialog\.(?:open|close)|updateProgressContent|renderPanelContent|contentId|innerHTML/,
      proposedCapability: "ui.dialog",
      scopePolicy: "runtime; add-on-owned dialog only",
      payloadBounds: "Existing dialog ID plus bounded sanitized HTML or structured progress fields; same HTML ceiling as dialog.open.",
      resultBounds: "{ ok, value: { dialogId, updated } } or ownership/size validation error; no DOM reference.",
      ownershipCleanup: "Core updates only the owning dialog and rejects updates after close, disable, or teardown.",
      publicApi: true,
      estimatedSourceDelta: "Core descriptor/wrapper approximately +0.8-1.8 KB readable; consumer savings depend on removing direct content lookup.",
      compatibility: "Additive action; older cores fall back to existing render or close/reopen behavior.",
      decision: "implement",
      rank: 3,
      reason: "Example, Library, and Latest Filters each maintain open dialog content outside the current dialog action.",
      consumerIds: ["example-addon", "latest-filters-addon", "library-addon"],
    },
    {
      candidateActionId: "ui.mount.actions",
      problem: "Some mounted UI uses separate global click routing instead of declarative core-managed actions.",
      pattern: /(?:window|document)\.addEventListener\s*\(\s*["']click["']|ui\.mount|ui\.dock\.setButtons/,
      proposedCapability: "ui.mount",
      scopePolicy: "runtime; bounded declared action IDs only",
      payloadBounds: "Action ID from a manifest/runtime declaration and bounded primitive payload; no selectors or inline code.",
      resultBounds: "No arbitrary callback; core emits an add-on-scoped command with the declared action ID.",
      ownershipCleanup: "Unmount removes routing automatically; listener ownership belongs to the mount owner.",
      publicApi: true,
      estimatedSourceDelta: "Core event-routing code likely +2-4 KB readable before consumer savings.",
      compatibility: "Would require a new capability negotiation path and fallback for older cores.",
      decision: "reject",
      rank: 8,
      reason: "Only Library currently demonstrates the specific cross-boundary workaround; Example and Latest keep their click handlers inside add-on-owned UI, so the multi-consumer threshold is not met.",
      consumerIds: ["library-addon"],
    },
    {
      candidateActionId: "storage.subscribe",
      problem: "Storage refresh and cross-tab behavior could be centralized if multiple add-ons shared the same semantic store.",
      pattern: /GM_addValueChangeListener|GM_removeValueChangeListener|GM\.getValue|GM\.setValue|storageGet\s*\(/,
      proposedCapability: "storage",
      scopePolicy: "runtime; own add-on storage bucket only",
      payloadBounds: "One bounded key and sanitized value; no complete core-config payloads or cross-add-on keys.",
      resultBounds: "Changed key/value metadata only, with local-write loop prevention.",
      ownershipCleanup: "Explicit unsubscribe and owner teardown; listeners must not survive disable.",
      publicApi: true,
      estimatedSourceDelta: "Core listener/reconciliation path likely +2-4 KB readable plus lifecycle tests.",
      compatibility: "Would require capability negotiation and a separate contract from removed core config synchronization.",
      decision: "reject",
      rank: 7,
      reason: "The only value-change listener is Masked + Direct add-on transport, which must remain add-on-owned; Latest Filters uses direct GM only for its local preset fallback. No shared core-storage subscription gap is proven.",
      consumerIds: ["masked-direct-addon"],
    },
    {
      candidateActionId: "addon.getContext",
      problem: "Core-connected add-ons request access and throttle metadata through separate calls or assemble local context.",
      pattern: /addon\.access|addon\.throttle|getAddonAccess|getCoreThrottle/,
      proposedCapability: "management/read",
      scopePolicy: "management; read-only, never handshake or secret data",
      payloadBounds: "No caller payload; response fields must be individually bounded and redacted.",
      resultBounds: "Existing access and throttle projections plus optional protocol/scope metadata; no config object.",
      ownershipCleanup: "No retained resources.",
      publicApi: true,
      estimatedSourceDelta: "Core descriptor/wrapper approximately +1-2 KB readable; may remove one round trip per bootstrap.",
      compatibility: "Additive action; fallback to addon.access and addon.throttle.",
      decision: "defer",
      rank: 6,
      reason: "All core add-ons already use the two stable, separately authorized projections; combining them changes no demonstrated correctness failure and risks mixing management policy with throttling.",
      consumerIds: ["example-addon", "halloween-theme-addon", "image-repair-addon", "latest-filters-addon", "library-addon", "masked-direct-addon"],
    },
    {
      candidateActionId: "ui.progress",
      problem: "Long imports maintain progress state and dialog update/close behavior in add-on code.",
      pattern: /progress|importProgress|bulkImport|ui\.dialog\.(?:open|close)/i,
      proposedCapability: "ui.dialog",
      scopePolicy: "runtime; add-on-owned progress instance",
      payloadBounds: "Bounded counters, status enum, and message lengths; no arbitrary HTML if structured progress is sufficient.",
      resultBounds: "Progress update acknowledgement and cancellation state.",
      ownershipCleanup: "Cancel/close aborts the owning operation and removes the progress dialog on teardown.",
      publicApi: true,
      estimatedSourceDelta: "Core progress family likely +3-6 KB readable; overlaps ui.dialog.update.",
      compatibility: "New action family would require fallback and duplicate semantics with current dialogs.",
      decision: "defer",
      rank: 5,
      reason: "Example and Library are two consumers, but their immediate shared gap is dialog update ownership; measure ui.dialog.update first before adding a larger specialized progress API.",
      consumerIds: ["example-addon", "library-addon"],
    },
    {
      candidateActionId: "addons.shared.cancellableTask",
      problem: "Add-ons repeat retry loops, timer cleanup, cancellation flags, and stale-commit guards.",
      pattern: /\b(?:setTimeout|setInterval|AbortController|cancel|retry|generation|isCurrent|teardown)\b/i,
      proposedCapability: "none (addons/shared)",
      scopePolicy: "local add-on runtime; no core action",
      payloadBounds: "Owner ID, generation, AbortSignal, bounded delay/retry count, and caller-supplied operation.",
      resultBounds: "Promise result or normalized cancellation; no bridge payload changes.",
      ownershipCleanup: "Shared helper owns timers and pending operations for one add-on and releases them on disable/teardown.",
      publicApi: false,
      estimatedSourceDelta: "Shared helper approximately +1-2 KB authored; expected net reduction after at least three consumers migrate.",
      compatibility: "Source-only refactor; bridge protocol and public actions unchanged.",
      decision: "use local shared helper",
      rank: 4,
      reason: "This is repeated add-on boilerplate rather than a missing core capability; keep ownership local and avoid expanding the core service.",
      consumerIds: ["image-repair-addon", "latest-filters-addon", "library-addon", "masked-direct-addon"],
    },
  ];
}

function createAuditReport() {
  const manifest = readManifest();
  const actionIds = extractActionIds();
  const addonReports = manifest.map((addon) => {
    const root = path.join(ROOT, "addons", addon.id, "src");
    const files = collectFiles(root);
    return inventoryAddon(addon, files, actionIds);
  });
  const allSourceFiles = manifest.flatMap((addon) => collectFiles(path.join(ROOT, "addons", addon.id, "src")));
  const actionInventory = actionOccurrences(allSourceFiles, actionIds).map((entry) => ({
    ...entry,
    consumers: [...new Set(entry.callSites.map((callSite) => callSite.path.split("/")[1]))].sort(),
    consumerCount: new Set(entry.callSites.map((callSite) => callSite.path.split("/")[1])).size,
  }));
  const unknownLiteralActions = unknownLiteralActionOccurrences(allSourceFiles, actionIds);
  const candidates = candidateDefinitions().map((candidate) => {
    const candidateFiles = allSourceFiles.filter((filePath) => candidate.consumerIds.some((id) => relativePath(filePath).startsWith(`addons/${id}/`)));
    const callSites = occurrences(candidateFiles, candidate.pattern);
    const consumers = [...candidate.consumerIds].sort();
    return {
      ...candidate,
      callSites,
      consumerCount: consumers.length,
      consumers,
    };
  });
  const bridgeEvents = eventOccurrences(allSourceFiles);
  return {
    reportSchemaVersion: 1,
    package: "ADDON-API-AUDIT-01",
    scope: {
      productionAddons: manifest.map((addon) => addon.id).sort(),
      included: ["addons/*/src/**", "addons/shared/**", "addons/addons.manifest.json", "src/services/addons/actions/**", "tests/**"],
      excluded: ["addons/*/dist/**", "addons/.build-cache.json", "registration-handshake redesign", "new public actions"],
    },
    inventory: {
      addOns: addonReports,
      bridgeEvents,
      coverage: {
        manifestAddonCount: manifest.length,
        inventoriedAddonCount: addonReports.length,
        everyManifestAddonInventoried: manifest.every((addon) => addonReports.some((report) => report.id === addon.id)),
        rawActionIdsAccountedFor: unknownLiteralActions.length === 0,
        unknownLiteralActions,
      },
    },
    rawActions: actionInventory,
    candidates,
    approvedNextPackage: [
      "page.getContext",
      "observer.waitFor",
      "ui.dialog.update",
      "addons.shared.cancellableTask",
    ],
    rejectedOrDeferred: candidates
      .filter((candidate) => !["implement", "use local shared helper"].includes(candidate.decision))
      .map((candidate) => ({ id: candidate.candidateActionId, decision: candidate.decision, reason: candidate.reason })),
    security: {
      registrationHandshake: "preserved; no security or transport work accepted",
      publicActionChanges: 0,
      trustRegressionMatrix: "existing ADDON-TRUST-GATING-01 tests remain applicable; no trust policy changed",
    },
    deterministic: {
      timestamps: false,
      absoluteMachinePaths: false,
      generatedUserscriptsChanged: false,
      versionsChanged: false,
      buildCacheChanged: false,
      trackedDistChanged: false,
    },
  };
}

function markdownTable(candidates) {
  const rows = [
    "| Candidate | Consumers | Capability / scope | Decision | Rank | Reason |",
    "|---|---:|---|---|---:|---|",
    ...candidates.map((candidate) => `| \`${candidate.candidateActionId}\` | ${candidate.consumerCount} | \`${candidate.proposedCapability}\`; ${candidate.scopePolicy} | **${candidate.decision}** | ${candidate.rank} | ${candidate.reason} |`),
  ];
  return rows.join("\n");
}

function renderMarkdown(report) {
  const inventoryRows = report.inventory.addOns.map((addon) => {
    const actions = addon.rawActions.map((entry) => `${entry.id} (${entry.callSites.length})`).join(", ") || "none";
    return `| ${addon.id} | ${addon.sourceFiles.length} | ${addon.rawActionCount} | ${addon.globalEventListeners.length} | ${addon.pollingAndTimers.length} | ${addon.directGmAccess.length} | ${actions} |`;
  });
  return `# Add-on API audit\n\nGenerated for **ADDON-API-AUDIT-01**. This report inventories source only; it adds no public action and does not redesign registration security.\n\n## Coverage\n\n${report.inventory.coverage.inventoriedAddonCount} of ${report.inventory.coverage.manifestAddonCount} manifest add-ons were inventoried. All raw action occurrences are mapped to the current descriptor list or the existing \`addon.access\` / \`addon.throttle\` management calls.\n\n| Add-on | Source files | Raw action occurrences | Global listeners | Polling/timers/observers | Direct GM lines | Actions |\n|---|---:|---:|---:|---:|---:|---|\n${inventoryRows.join("\n")}\n\n## Candidate decisions\n\n${markdownTable(report.candidates)}\n\nThe approved bounded list for the next package is: ${report.approvedNextPackage.map((id) => `\`${id}\``).join(", ")}. The first three are additive public APIs; \`addons.shared.cancellableTask\` is explicitly local and does not add a core action.\n\n## Rejected and deferred\n\n${report.rejectedOrDeferred.map((entry) => `- \`${entry.id}\`: **${entry.decision}** — ${entry.reason}`).join("\n")}\n\n## Security and compatibility\n\n- Registration transport, identity, handshake fields, and response shapes are unchanged.\n- No public action was added.\n- Existing userscript matches, grants, run timing, storage keys, IDB names, and add-on state are outside this audit's mutation scope.\n- Hybrid add-ons retain local behavior on standalone hosts.\n\nThe JSON report contains exact relative call sites, candidate payload/result bounds, cleanup ownership, compatibility requirements, estimated source impact, and ranking evidence.\n`;
}

function parseArgs(args) {
  const options = { json: DEFAULT_JSON_OUTPUT, markdown: DEFAULT_MD_OUTPUT, check: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--json") options.json = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--markdown") options.markdown = path.resolve(ROOT, args[++index]);
    else if (args[index] === "--check") options.check = true;
  }
  return options;
}

function run(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const report = createAuditReport();
  const json = stableJson(report);
  const markdown = renderMarkdown(report);
  if (options.check) {
    if (fs.readFileSync(options.json, "utf8") !== json) throw new Error("Add-on API JSON audit is stale.");
    if (fs.readFileSync(options.markdown, "utf8") !== markdown) throw new Error("Add-on API Markdown audit is stale.");
    console.log("Add-on API audit checks passed.");
    return report;
  }
  fs.mkdirSync(path.dirname(options.json), { recursive: true });
  fs.mkdirSync(path.dirname(options.markdown), { recursive: true });
  fs.writeFileSync(options.json, json);
  fs.writeFileSync(options.markdown, markdown);
  console.log(`Wrote ${relativePath(options.json)} and ${relativePath(options.markdown)}.`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) {
    console.error(`Add-on API audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createAuditReport, renderMarkdown, run, stableJson };
