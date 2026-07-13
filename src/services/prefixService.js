import { config } from "../config.js";
import { saveConfigKeys } from "./settingsService.js";
import { runFrameBudgeted } from "../core/frameBudget.js";
import { ensurePageBridge, requestPageBridge } from "../core/pageBridge.js";
import { debugLog } from "../core/logger";

const LATEST_PREFIXES_BRIDGE_REQUEST_EVENT = "f95ue:latest-prefixes-request";
const LATEST_PREFIXES_BRIDGE_RESULT_EVENT = "f95ue:latest-prefixes-result";
const LATEST_PREFIXES_BRIDGE_MARKER = "f95ue_latest_prefixes_bridge_installed";

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizePrefixesFromLatestUpdates(rawPrefixes) {
  if (!rawPrefixes || typeof rawPrefixes !== "object") return { items: [], categories: {} };

  const prefixById = new Map();
  const categories = {};

  for (const [categoryRaw, groupsRaw] of Object.entries(rawPrefixes)) {
    const category = normalizeText(categoryRaw).toLowerCase();
    if (!category || !Array.isArray(groupsRaw)) continue;

    const groupByKey = new Map();
    for (const groupRaw of groupsRaw) {
      if (!groupRaw || typeof groupRaw !== "object" || !Array.isArray(groupRaw.prefixes)) continue;

      const groupId = Number(groupRaw.id);
      const groupName = normalizeText(groupRaw.name);
      const groupKey = `${Number.isFinite(groupId) ? groupId : ""}:${groupName}`;
      let group = groupByKey.get(groupKey);
      if (!group) {
        group = {
          id: Number.isFinite(groupId) ? groupId : null,
          name: groupName,
          prefixes: [],
          prefixIds: [],
        };
        groupByKey.set(groupKey, group);
      }

      for (const prefixRaw of groupRaw.prefixes) {
        const id = Number(prefixRaw?.id);
        const name = normalizeText(prefixRaw?.name);
        if (!Number.isFinite(id) || !name) continue;

        const prefix = { id, name, class: normalizeText(prefixRaw?.class) };
        if (!prefixById.has(id)) prefixById.set(id, prefix);
        if (!group.prefixes.some((item) => item.id === id)) group.prefixes.push(prefix);
        if (!group.prefixIds.includes(id)) group.prefixIds.push(id);
      }
    }
    const normalizedGroups = [...groupByKey.values()].filter((group) => group.prefixIds.length > 0);
    if (normalizedGroups.length > 0) categories[category] = normalizedGroups;
  }

  const items = [...prefixById.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
    return left.id - right.id;
  });

  return { items, categories };
}

async function normalizePrefixesFromLatestUpdatesBudgeted(rawPrefixes) {
  if (!rawPrefixes || typeof rawPrefixes !== "object") return { items: [], categories: {} };

  const prefixById = new Map();
  const categories = {};
  const prefixTasks = [];

  for (const [categoryRaw, groupsRaw] of Object.entries(rawPrefixes)) {
    const category = normalizeText(categoryRaw).toLowerCase();
    if (!category || !Array.isArray(groupsRaw)) continue;

    const groupByKey = new Map();
    for (const groupRaw of groupsRaw) {
      if (!groupRaw || typeof groupRaw !== "object" || !Array.isArray(groupRaw.prefixes)) continue;
      const groupId = Number(groupRaw.id);
      const groupName = normalizeText(groupRaw.name);
      const groupKey = `${Number.isFinite(groupId) ? groupId : ""}:${groupName}`;
      let group = groupByKey.get(groupKey);
      if (!group) {
        group = {
          id: Number.isFinite(groupId) ? groupId : null,
          name: groupName,
          prefixes: [],
          prefixIds: [],
        };
        groupByKey.set(groupKey, group);
      }
      groupRaw.prefixes.forEach((prefixRaw) => prefixTasks.push({ prefixRaw, group }));
    }
    const normalizedGroups = [...groupByKey.values()];
    if (normalizedGroups.length > 0) categories[category] = normalizedGroups;
  }

  await runFrameBudgeted(
    prefixTasks,
    ({ prefixRaw, group }) => {
      const id = Number(prefixRaw?.id);
      const name = normalizeText(prefixRaw?.name);
      if (!Number.isFinite(id) || !name) return;
      const prefix = { id, name, class: normalizeText(prefixRaw?.class) };
      if (!prefixById.has(id)) prefixById.set(id, prefix);
      if (!group.prefixes.some((item) => item.id === id)) group.prefixes.push(prefix);
      if (!group.prefixIds.includes(id)) group.prefixIds.push(id);
    },
    { budgetMs: 4, minChunk: 25 },
  );

  for (const [category, groups] of Object.entries(categories)) {
    const nonEmptyGroups = groups.filter((group) => group.prefixIds.length > 0);
    if (nonEmptyGroups.length > 0) categories[category] = nonEmptyGroups;
    else delete categories[category];
  }

  const items = [...prefixById.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
    return left.id - right.id;
  });
  return { items, categories };
}

function ensureLatestPrefixesPageBridge() {
  return ensurePageBridge({
    marker: LATEST_PREFIXES_BRIDGE_MARKER,
    scriptContent: `
    (() => {
      if (window.__f95ueLatestPrefixesBridgeInstalled) return;
      window.__f95ueLatestPrefixesBridgeInstalled = true;

      window.addEventListener("${LATEST_PREFIXES_BRIDGE_REQUEST_EVENT}", () => {
        let ok = false;
        let reason = "";
        let prefixes = null;

        try {
          const latest = window.latestUpdates;
          const latestPrefixes = latest && latest.prefixes;
          if (latestPrefixes) {
            prefixes = latestPrefixes;
            ok = true;
          } else {
            reason = "latest_updates_missing_prefixes";
          }
        } catch (error) {
          reason = error?.message ? String(error.message) : "latest_updates_read_throw";
        }

        try {
          window.dispatchEvent(
            new CustomEvent("${LATEST_PREFIXES_BRIDGE_RESULT_EVENT}", {
              detail: { ok, reason, prefixes },
            }),
          );
        } catch {}
      });
    })();
  `,
  });
}

async function readLatestPrefixesFromWindow() {
  const latest = typeof window !== "undefined" ? window.latestUpdates || null : null;
  const prefixes = await normalizePrefixesFromLatestUpdatesBudgeted(latest?.prefixes);
  return {
    ok: prefixes.items.length > 0,
    source: "window",
    reason: prefixes.items.length ? "" : "window_empty",
    prefixes,
  };
}

function readLatestPrefixesViaPageBridge(timeoutMs = 1200) {
  const bridgeReady = ensureLatestPrefixesPageBridge();
  if (!bridgeReady) {
    return Promise.resolve({
      ok: false,
      source: "pageBridge",
      reason: "bridge_inject_failed",
      prefixes: { items: [], categories: {} },
    });
  }

  return requestPageBridge({
    requestEvent: LATEST_PREFIXES_BRIDGE_REQUEST_EVENT,
    resultEvent: LATEST_PREFIXES_BRIDGE_RESULT_EVENT,
    timeoutMs,
  }).then(async (result) => {
    if (!result.received) {
      return {
        ok: false,
        source: "pageBridge",
        reason: result.reason || "bridge_timeout",
        prefixes: { items: [], categories: {} },
      };
    }

    const detail = result.detail || {};
    const prefixes = await normalizePrefixesFromLatestUpdatesBudgeted(detail.prefixes);
    return {
      ok: Boolean(detail.ok) && prefixes.items.length > 0,
      source: "pageBridge",
      reason: typeof detail.reason === "string" ? detail.reason : "",
      prefixes,
    };
  });
}

export async function updatePrefixes() {
  const directResult = await readLatestPrefixesFromWindow();
  const result = directResult.ok ? directResult : await readLatestPrefixesViaPageBridge();
  const newPrefixes = result.prefixes;

  if (newPrefixes.items.length === 0) {
    debugLog(
      "Prefix Update",
      `latestUpdates.prefixes unavailable/empty from ${result.source} (${result.reason || "unknown"}); keeping stored prefixes.`,
    );
    return { updated: false, count: Number(config.prefixes?.items?.length || 0) };
  }

  const previous = JSON.stringify(config.prefixes || { items: [], categories: {} });
  const next = JSON.stringify(newPrefixes);
  if (previous === next) return { updated: false, count: newPrefixes.items.length };

  const persisted = await saveConfigKeys({ prefixes: newPrefixes });
  if (!persisted.committed) return { updated: false, count: Number(config.prefixes?.items?.length || 0) };
  debugLog(
    "Prefix Update",
    `Prefixes updated from latestUpdates.prefixes (${result.source}): ${newPrefixes.items.length} unique prefixes stored.`,
  );
  return { updated: true, count: newPrefixes.items.length };
}
