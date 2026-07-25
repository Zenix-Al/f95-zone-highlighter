const path = require("path");
const fs = require("fs");
const assert = require("assert");
const childProcess = require("child_process");
const esbuild = require("esbuild");
const { Window } = require("happy-dom");
const { createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition } = require("./helpers.cjs");
const {
  generateFeatureManifest,
  checkFeatureManifest,
  renderFeatureManifest,
  validateFeatureManifestEntries,
} = require("../scripts/featureManifest.cjs");
const coreAudit = require("../scripts/core-source-audit.cjs");
const coreSizeGate = require("../scripts/core-size-gate.cjs");
const cssAudit = require("../scripts/css-audit.cjs");
const addonBaseline = require("../scripts/addon-baseline.cjs");
const addonApiAudit = require("../scripts/addon-api-audit.cjs");
const addonCatalog = require("../scripts/addon-catalog.cjs");
const addonBuildTools = require("../scripts/addon-build-tools.cjs");
const addonBuilder = require("../addons/build-addon.js");

const ROOT = path.join(__dirname, "..");
const TMP_DIR = path.join(__dirname, ".tmp");
const ADDON_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, "addons", "addons.manifest.json"), "utf8"),
);
const TRUSTED_ADDON_CATALOG_META = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "generated", "trusted-addon-catalog.meta.json"), "utf8"),
);
const TRUSTED_ADDON_CATALOG = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "generated", TRUSTED_ADDON_CATALOG_META.catalogFile), "utf8"),
).catalog;

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function loadModule(relativePath, options = {}) {
  const entry = path.join(ROOT, relativePath);
  const outFile = path.join(
    TMP_DIR,
    relativePath.replace(/[\\/]/g, "_") + ".cjs",
  );

  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    loader: options.loader,
    define: {
      __F95UE_DEBUG__: "false",
    },
    outfile: outFile,
    logLevel: "silent",
  });

  delete require.cache[require.resolve(outFile)];
  return require(outFile);
}

let passed = 0;
let failed = 0;
let testChain = Promise.resolve();

function runTest(name, testFn) {
  testChain = testChain.then(async () => {
    try {
      await testFn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(err);
    }
  });
}

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name === "dist") return [];
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(filePath);
    return entry.isFile() && filePath.endsWith(".js") ? [filePath] : [];
  });
}

async function seedReadyConfig(gm, settings, config) {
  const data = JSON.parse(JSON.stringify(config));
  const tags = data.tags || [];
  const prefixes = data.prefixes || { items: [], categories: {} };
  data.tags = [];
  data.prefixes = { items: [], categories: {} };
  await gm.setValue(settings.CONFIG_ENVELOPE_KEY, {
    schemaVersion: 1,
    revision: 1,
    writerId: "ready-fixture",
    updatedAt: 1,
    data,
  });
  await gm.setValue(settings.CONFIG_BACKUP_KEY, null);
  await gm.setValue(settings.CONFIG_MIGRATION_VERSION_KEY, 1);
  await gm.setValue(settings.CONFIG_TAGS_CACHE_KEY, tags);
  await gm.setValue(settings.CONFIG_PREFIXES_CACHE_KEY, prefixes);
}

const { createStateManager } = loadModule("src/core/StateManager.js");
const { pageDefinitions } = loadModule("src/config.js");
const { featureMatchesPageScopes } = loadModule("src/core/featureScope.js");
const {
  beginRoute,
  getRouteContext,
  normalizeRouteUrl,
  resetRouteStateForTests,
  setRoutePageFlags,
} = loadModule("src/core/routeState.js");
const { runBootstrapPipeline } = loadModule("src/core/bootstrap.js");
const {
  CONFIG_SCHEMA,
  getConfigPathMetadata,
  getDefaultConfig,
  getExportableConfigKeys,
  getPersistedConfigPaths,
  getSchemaPathIndex,
  mergeWithDefaults,
  sanitizeConfig,
  validateConfig,
  validateConfigSection,
} = loadModule("src/config/schema.js");
const {
  registerFeature,
  resetFeatureCatalogForTests,
  validateFeatureDescriptor,
} = loadModule("src/core/featureCatalog.js");
const {
  createFeature,
  normalizeFeatureBootstrapMode,
} = loadModule("src/core/featureFactory.js");
const {
  createResourceOwner,
  releaseOwner,
  getResourceSnapshot,
} = loadModule("src/core/resourceManager.js");
const { createTaskQueue } = loadModule("src/core/taskQueue.js");
const {
  clearHealthEventsForTests,
  getHealthDiagnostics,
  getHealthEvents,
  getAllFeatureStatuses,
  getRuntimeErrors,
  recordHealthEvent,
  registerDiagnosticsProvider,
  reportFeatureFailure,
  reportFeatureWarning,
  reportRuntimeError,
} = loadModule("src/core/featureHealth.js");
const { queryFirstBySelectors } = loadModule("src/utils/selectorQuery.js");
const {
  OVERLAY_COLOR_ORDER_KEYS,
  normalizeOverlayColorOrder,
  buildOrderedOverlayMatches,
} = loadModule("src/features/latest-overlay/overlayOrder.js");
const {
  enqueueFastCaptureProcessing,
  getFastCaptureData,
  getFastCaptureDiagnostics,
  getFastCaptureSnapshot,
  hasFastCaptureData,
  matchesFastCaptureUrl,
  processCompletedFastCapture,
  refreshFastCaptureFeatures,
  registerFastCaptureFeatures,
  resetFastCaptureAdapterForTests,
  resetFastCaptureStoreForTests,
  subscribeFastCapture,
} = loadModule("src/services/fastCapture/index.js");
const { normalizeFastCaptureConfig } = loadModule("src/services/fastCapture/rules.js");
const { FAST_CAPTURE_LIMITS } = loadModule("src/services/fastCapture/limits.js");
const {
  executeActionDescriptor,
  getActionSnapshot,
  registerAction,
} = loadModule("src/services/addons/actions/registry.js");
const {
  getRegisteredAddonActionSnapshot,
  invokeRegisteredAddonCoreAction,
  isAddonActionAllowed,
} = loadModule("src/services/addons/coreActions.js");
const { coerceSettingValue } = loadModule(
  "src/ui/renderers/coerceSettingValue.js",
);
const {
  getMetadataByConfigPath,
  getSettingsMetadataById,
  getSettingsMetadataByOwner,
  getSettingsMetadataBySection,
  getSettingsMetadataSnapshot,
  registerSettingsMetadata,
  resetSettingsMetadataForTests,
} = loadModule("src/ui/settings/metaRegistry.js");
const { renderSetting } = loadModule("src/ui/renderers/renderSetting.js");
const { createInput } = loadModule("src/ui/renderers/createInput.js");
const { setByPath } = loadModule("src/utils/objectPath.js");
const { flushQueuedToasts, showToast } = loadModule(
  "src/ui/components/toast.js",
);
const {
  isAddonOwnedObserverNode,
  normalizeObserverWaitSelector,
  unwatchAddonObserver,
  waitForAddonObserver,
} = loadModule(
  "src/services/addons/observer.js",
);
const {
  ADDON_UI_SLOT_POLICY,
  normalizeAddonMountSlot,
  sanitizeAddonCss,
  sanitizeAddonHtml,
} = loadModule("src/services/addons/uiSanitizer.js");
const { createAddonDockGroup } = loadModule(
  "src/ui/components/addons/addonDockGroup.js",
);
const { invokeOptionalCoreAction } = loadModule("addons/shared/apiFallback.js");
const { normalizePrefixesFromLatestUpdates } = loadModule(
  "src/services/prefixService.js",
);
const { buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord } =
  loadModule("src/features/latest-overlay/latestDataIndex.js");
const { buildPrefixStatusMap } = loadModule(
  "src/features/latest-overlay/overlayCache.js",
);
const { getRecordHighlightClasses } = loadModule(
  "src/features/latest-overlay/ratingEngagementHighlight.js",
);
const { matchesPageDefinition } = loadModule("src/core/pageDetection.js");
const { normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError } = loadModule(
  "addons/site-repair-addon/src/repairs/latestAjax/policy.js",
);
const { __downloadPageControllerTestInternals } = loadModule(
  "addons/masked-direct-addon/src/app/contexts/downloadPageController.js",
);
const { classifyMaskedDirectContext } = loadModule(
  "addons/masked-direct-addon/src/app/context.js",
);


function createFakeElement(tagName, doc) {
  const classes = new Set();
  const attrs = Object.create(null);
  const element = {
    tagName: String(tagName || "").toUpperCase(),
    ownerDocument: doc,
    children: [],
    style: {},
    textContent: "",
    parentNode: null,
    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      this.children.push(child);
      if (child.id) {
        doc.__nodesById[child.id] = child;
      }
      return child;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
      if (name === "id") {
        this.id = String(value);
        doc.__nodesById[this.id] = this;
      }
    },
    remove() {
      if (!this.parentNode) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) {
        this.parentNode.children.splice(index, 1);
      }
      if (this.id) {
        delete doc.__nodesById[this.id];
      }
      this.parentNode = null;
    },
    classList: {
      add(name) {
        classes.add(String(name));
      },
      remove(name) {
        classes.delete(String(name));
      },
      contains(name) {
        return classes.has(String(name));
      },
    },
  };

  Object.defineProperty(element, "firstElementChild", {
    get() {
      return this.children[0] || null;
    },
  });

  return element;
}

function createFakeDocument({ withBody = false } = {}) {
  const doc = {
    __nodesById: Object.create(null),
    body: null,
    documentElement: null,
    getElementById(id) {
      return this.__nodesById[String(id)] || null;
    },
    createElement(tagName) {
      return createFakeElement(tagName, doc);
    },
  };

  doc.documentElement = createFakeElement("html", doc);
  if (withBody) {
    doc.body = createFakeElement("body", doc);
  }

  return doc;
}

function resetFastCaptureHarness() {
  resetFastCaptureAdapterForTests();
  resetFastCaptureStoreForTests();
}


function finish() {
  return testChain.then(() => {
    console.log("\nTest results: " + passed + " passed, " + failed + " failed");
    if (failed > 0) process.exitCode = 1;
  });
}

module.exports = { path, fs, assert, childProcess, esbuild, Window, createAddonBridgeTransport, createDomSandbox, createFakeClock, createFakeGM, dispatchPageTransition, generateFeatureManifest, checkFeatureManifest, renderFeatureManifest, validateFeatureManifestEntries, coreAudit, coreSizeGate, cssAudit, addonBaseline, addonApiAudit, addonCatalog, addonBuildTools, addonBuilder, ROOT, TMP_DIR, ADDON_MANIFEST, TRUSTED_ADDON_CATALOG_META, TRUSTED_ADDON_CATALOG, loadModule, runTest, collectJavaScriptFiles, seedReadyConfig, createStateManager, pageDefinitions, featureMatchesPageScopes, beginRoute, getRouteContext, normalizeRouteUrl, resetRouteStateForTests, setRoutePageFlags, runBootstrapPipeline, CONFIG_SCHEMA, getConfigPathMetadata, getDefaultConfig, getExportableConfigKeys, getPersistedConfigPaths, getSchemaPathIndex, mergeWithDefaults, sanitizeConfig, validateConfig, validateConfigSection, registerFeature, resetFeatureCatalogForTests, validateFeatureDescriptor, createFeature, normalizeFeatureBootstrapMode, createResourceOwner, releaseOwner, getResourceSnapshot, createTaskQueue, clearHealthEventsForTests, getHealthDiagnostics, getHealthEvents, getAllFeatureStatuses, getRuntimeErrors, recordHealthEvent, registerDiagnosticsProvider, reportFeatureFailure, reportFeatureWarning, reportRuntimeError, queryFirstBySelectors, OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder, buildOrderedOverlayMatches, enqueueFastCaptureProcessing, getFastCaptureData, getFastCaptureDiagnostics, getFastCaptureSnapshot, hasFastCaptureData, matchesFastCaptureUrl, processCompletedFastCapture, refreshFastCaptureFeatures, registerFastCaptureFeatures, resetFastCaptureAdapterForTests, resetFastCaptureStoreForTests, subscribeFastCapture, normalizeFastCaptureConfig, FAST_CAPTURE_LIMITS, executeActionDescriptor, getActionSnapshot, registerAction, getRegisteredAddonActionSnapshot, invokeRegisteredAddonCoreAction, isAddonActionAllowed, coerceSettingValue, getMetadataByConfigPath, getSettingsMetadataById, getSettingsMetadataByOwner, getSettingsMetadataBySection, getSettingsMetadataSnapshot, registerSettingsMetadata, resetSettingsMetadataForTests, renderSetting, createInput, setByPath, flushQueuedToasts, showToast, isAddonOwnedObserverNode, normalizeObserverWaitSelector, unwatchAddonObserver, waitForAddonObserver, ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot, sanitizeAddonCss, sanitizeAddonHtml, createAddonDockGroup, invokeOptionalCoreAction, normalizePrefixesFromLatestUpdates, buildLatestRecordMap, calculateRecordAgeDays, normalizeLatestRecord, buildPrefixStatusMap, getRecordHighlightClasses, matchesPageDefinition, normalizeLatestAjaxErrorPayload, shouldRetryLatestAjaxError, __downloadPageControllerTestInternals, classifyMaskedDirectContext, createFakeElement, createFakeDocument, resetFastCaptureHarness , finish };
