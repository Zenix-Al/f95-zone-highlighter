import { safeText } from "./formatters.js";

export function buildTagConfig({
  tags = [],
  preferredTags = [],
  excludedTags = [],
  markedTags = [],
  color = {},
} = {}) {
  const byNameLower = new Map();
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const id = Number(tag?.id);
    const name = safeText(tag?.name);
    if (!Number.isFinite(id) || !name) return;
    byNameLower.set(name.toLowerCase(), id);
  });

  const toIdSet = (value) =>
    new Set((Array.isArray(value) ? value : []).map((entry) => Number(entry)).filter(Number.isFinite));

  const preferred = toIdSet(preferredTags);
  const excluded = toIdSet(excludedTags);
  const marked = toIdSet(markedTags);

  const palette = color && typeof color === "object" ? color : {};
  return { byNameLower, preferred, excluded, marked, palette };
}

export function buildTagChipItems(tagNames, tagConfig) {
  const list = Array.isArray(tagNames) ? tagNames : [];
  const cfg = tagConfig && typeof tagConfig === "object" ? tagConfig : null;

  const items = list
    .map((nameRaw) => safeText(nameRaw))
    .filter(Boolean)
    .map((name) => {
      const key = name.toLowerCase();
      const id = cfg?.byNameLower?.get(key);

      let state = "";
      if (Number.isFinite(id)) {
        if (cfg.preferred?.has(id)) state = "preferred";
        else if (cfg.excluded?.has(id)) state = "excluded";
        else if (cfg.marked?.has(id)) state = "marked";
      }

      const palette = cfg?.palette || {};
      const bg =
        state === "preferred"
          ? safeText(palette.preferred)
          : state === "excluded"
            ? safeText(palette.excluded)
            : state === "marked"
              ? safeText(palette.marked)
              : "";
      const fg =
        state === "preferred"
          ? safeText(palette.preferredText)
          : state === "excluded"
            ? safeText(palette.excludedText)
            : state === "marked"
              ? safeText(palette.markedText)
              : "";

      return {
        label: name,
        state,
        bg,
        fg,
      };
    });

  const weight = (item) => {
    if (item.state === "preferred") return 0;
    if (item.state === "excluded") return 1;
    if (item.state === "marked") return 2;
    return 3;
  };

  items.sort((left, right) => {
    const leftWeight = weight(left);
    const rightWeight = weight(right);
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });

  return items;
}
