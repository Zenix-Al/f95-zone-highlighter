import { config } from "../../src/config.js";
import {
  addTagToList,
  moveTagAcrossLists,
  removeTagFromList,
  reorderTagInList,
} from "../../src/ui/components/tag-search/tagMutations.js";
import {
  loadConfig,
  saveConfigKeys,
  updateConfig,
  CONFIG_ENVELOPE_KEY,
  CONFIG_MIGRATION_VERSION_KEY,
  CONFIG_TAGS_CACHE_KEY,
  CONFIG_PREFIXES_CACHE_KEY,
} from "../../src/services/settingsService.js";
import { getDefaultConfig } from "../../src/config/schema.js";
import { latestOverlayFeature } from "../../src/features/latest-overlay/index.js";
import { stateManager } from "../../src/config.js";
import "../../src/ui/settings/tagsSettings.js";
import {
  getMetadataByConfigPath,
  registerSettingsMetadata,
} from "../../src/ui/settings/metaRegistry.js";
import { applyConfigChange } from "../../src/services/configChangeApplication.js";

export async function reproduceStaleTagRender() {
  await loadConfig();
  config.tags = [{ id: 7, name: "Regression Tag" }];
  config.preferredTags = [1];
  config.excludedTags = [];
  config.markedTags = [];

  const renderedLists = [];
  await addTagToList({
    listKey: "preferredTags",
    tag: config.tags[0],
    render: () => renderedLists.push([...config.preferredTags]),
  });

  return {
    renderedLists,
    immediateConfig: [...config.preferredTags],
  };
}

export async function runSerializedTagMutationSequence() {
  await loadConfig();
  config.tags = [
    { id: 1, name: "One" },
    { id: 2, name: "Two" },
    { id: 3, name: "Three" },
    { id: 7, name: "Seven" },
    { id: 8, name: "Eight" },
  ];
  config.preferredTags = [1, 2];
  config.excludedTags = [3];
  config.markedTags = [];

  const renders = [];
  const render = () => renders.push({
    preferred: [...config.preferredTags],
    excluded: [...config.excludedTags],
    marked: [...config.markedTags],
  });

  await Promise.all([
    addTagToList({ listKey: "preferredTags", tag: config.tags[3], render }),
    addTagToList({ listKey: "preferredTags", tag: config.tags[4], render }),
  ]);
  await reorderTagInList({ listKey: "preferredTags", fromIndex: 0, toIndex: 2, render });
  await moveTagAcrossLists({
    fromListKey: "preferredTags",
    toListKey: "markedTags",
    fromIndex: 1,
    toIndex: 0,
    renderPreferred: render,
    renderExcluded: render,
    renderMarked: render,
  });
  await removeTagFromList({ listKey: "excludedTags", tag: config.tags[2], index: 0, render });

  return {
    config: {
      preferredTags: [...config.preferredTags],
      excludedTags: [...config.excludedTags],
      markedTags: [...config.markedTags],
    },
    renders,
  };
}

export async function runLatestOverlayToggleSequence() {
  await loadConfig();
  stateManager.set("isLatest", true);
  config.latestSettings.latestOverlayToggle = true;
  await latestOverlayFeature.sync(true);

  await Promise.all([
    updateLatestOverlay(false),
    updateLatestOverlay(true),
  ]);

  const status = stateManager.get("latestOverlayStatus");
  await latestOverlayFeature.disable();
  return { status, finalToggle: config.latestSettings.latestOverlayToggle };
}

async function updateLatestOverlay(value) {
  return updateConfig((draft) => {
    draft.latestSettings.latestOverlayToggle = value;
  }, { origin: `latest-overlay:toggle:${value ? "on" : "off"}` });
}

export function getTagEffectMetadata() {
  return getMetadataByConfigPath("preferredTags[0]");
}

export async function runLoadEffectNotificationContract() {
  await loadConfig();
  let customCalls = 0;
  const release = registerSettingsMetadata("interaction-regression", {
    notificationProbe: {
      config: "interactionRegression.notificationProbe",
      effects: {
        custom: (_value, context) => {
          customCalls += 1;
          return { context };
        },
        toast: (value) => `Notification probe ${value ? "enabled" : "disabled"}`,
      },
    },
  }, "interaction-regression-notification");

  try {
    const loaded = applyConfigChange({
      ...config,
      interactionRegression: { notificationProbe: true },
    }, { origin: "load:canonical", notify: false });
    await loaded.effects;
    const loadToasts = [...document.querySelectorAll("#toast-container .toast")]
      .map((toast) => toast.textContent);

    const changed = applyConfigChange({
      ...config,
      interactionRegression: { notificationProbe: false },
    }, { origin: "settings:interactionRegression.notificationProbe" });
    await changed.effects;
    const interactiveToasts = [...document.querySelectorAll("#toast-container .toast")]
      .map((toast) => toast.textContent);

    return { customCalls, loadToasts, interactiveToasts };
  } finally {
    release();
  }
}

export async function runSettingsLoadNotificationContract() {
  const seeded = getDefaultConfig();
  seeded.latestSettings.latestOverlayToggle = false;
  await globalThis.GM.setValue(CONFIG_ENVELOPE_KEY, {
    schemaVersion: 1,
    revision: 1,
    writerId: "load-notification-fixture",
    updatedAt: 1,
    data: seeded,
  });
  await globalThis.GM.setValue(CONFIG_MIGRATION_VERSION_KEY, 1);
  await globalThis.GM.setValue(CONFIG_TAGS_CACHE_KEY, []);
  await globalThis.GM.setValue(CONFIG_PREFIXES_CACHE_KEY, { items: [], categories: {} });

  const loaded = await loadConfig();
  return {
    source: loaded.source,
    toggle: config.latestSettings.latestOverlayToggle,
    toasts: [...document.querySelectorAll("#toast-container .toast")]
      .map((toast) => toast.textContent),
  };
}

function makeTags(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Tag ${index + 1}`,
  }));
}

function makePrefixes(count) {
  const items = makeTags(count).map((tag) => ({ ...tag, class: "label--blue" }));
  return {
    items,
    categories: {
      games: [{ id: 1, name: "Games", prefixes: items.slice(0, Math.min(count, 50)), prefixIds: items.slice(0, Math.min(count, 50)).map((item) => item.id) }],
      tools: [{ id: 2, name: "Tools", prefixes: items.slice(50, Math.min(count, 100)), prefixIds: items.slice(50, Math.min(count, 100)).map((item) => item.id) }],
    },
  };
}

export async function measureCatalogPersistence() {
  await loadConfig();
  const measurements = [];
  config.preferredTags = [];
  const coreBefore = globalThis.GM.logs();
  const coreStartedAt = performance.now();
  const coreResult = await updateConfig((draft) => {
    draft.preferredTags.push(1);
  }, { origin: "interaction-regression:tag-list-measurement" });
  const coreElapsedMs = Number((performance.now() - coreStartedAt).toFixed(3));
  const coreAfter = globalThis.GM.logs();
  measurements.push({
    kind: "tag-list",
    count: 1,
    committed: coreResult.committed,
    canonicalBytes: JSON.stringify(globalThis.GM.snapshot()["f95ue:config"]).length,
    reads: coreAfter.reads.slice(coreBefore.reads.length),
    writes: coreAfter.writes.slice(coreBefore.writes.length),
    elapsedMs: coreElapsedMs,
  });

  for (const count of [10, 1000, 10000]) {
    const tags = makeTags(count);
    const before = globalThis.GM.logs();
    const startedAt = performance.now();
    const result = await saveConfigKeys({ tags }, { origin: "interaction-regression:tags-measurement" });
    const elapsedMs = Number((performance.now() - startedAt).toFixed(3));
    const after = globalThis.GM.logs();
    measurements.push({
      kind: "tags",
      count,
      committed: result.committed,
      payloadBytes: JSON.stringify(tags).length,
      canonicalBytes: JSON.stringify(globalThis.GM.snapshot()["f95ue:config"]).length,
      writes: after.writes.slice(before.writes.length),
      elapsedMs,
    });
  }

  for (const count of [10, 1000]) {
    const prefixes = makePrefixes(count);
    const before = globalThis.GM.logs();
    const startedAt = performance.now();
    const result = await saveConfigKeys({ prefixes }, { origin: "interaction-regression:prefix-measurement" });
    const elapsedMs = Number((performance.now() - startedAt).toFixed(3));
    const after = globalThis.GM.logs();
    measurements.push({
      kind: "prefixes",
      count,
      committed: result.committed,
      payloadBytes: JSON.stringify(prefixes).length,
      canonicalBytes: JSON.stringify(globalThis.GM.snapshot()["f95ue:config"]).length,
      writes: after.writes.slice(before.writes.length),
      elapsedMs,
    });
  }
  return measurements;
}
