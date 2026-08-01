import { config } from "../config.js";
import { saveConfigKeys } from "./settingsService.js";
import { runFrameBudgeted } from "../core/frameBudget.js";
import { debugLog } from "../core/logger";

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

export async function normalizePrefixesFromLatestUpdatesBudgeted(rawPrefixes) {
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

export async function updatePrefixes(result) {
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
