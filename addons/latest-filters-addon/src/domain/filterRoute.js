function parseSegments(hash) {
  return String(hash || "")
    .replace(/^#\/?/, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((raw) => {
      const separator = raw.indexOf("=");
      return separator < 0
        ? { key: raw.toLowerCase(), value: "", raw }
        : {
            key: raw.slice(0, separator).trim().toLowerCase(),
            value: raw.slice(separator + 1).trim(),
            raw,
          };
    });
}

function renderSegments(segments) {
  const value = segments
    .map((segment) =>
      segment.value ? `${segment.key}=${segment.value}` : segment.key,
    )
    .join("/");
  return value ? `#/${value}` : "";
}

function normalizeIds(values) {
  return new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

function mutateLatestHash(rawUrl, transform, baseUrl) {
  let url;
  try {
    url = new URL(rawUrl, baseUrl || "https://f95zone.to/");
  } catch {
    return { changed: false, reason: "invalid_url", url: String(rawUrl || "") };
  }
  const before = parseSegments(url.hash);
  const transformed = transform(before);
  if (!transformed?.changed) {
    return { changed: false, url: url.href, segments: before };
  }
  const withoutPage = transformed.segments.filter(
    (segment) => segment.key !== "page",
  );
  url.hash = renderSegments(withoutPage);
  return { changed: true, url: url.href, segments: withoutPage };
}

export function resetTagFilter(rawUrl, filterKey, baseUrl) {
  const key = String(filterKey || "").trim().toLowerCase();
  if (key !== "tags" && key !== "notags") {
    return {
      changed: false,
      reason: "unsupported_filter",
      url: String(rawUrl || ""),
    };
  }
  return mutateLatestHash(
    rawUrl,
    (segments) => {
      const next = segments.filter((segment) => segment.key !== key);
      return { changed: next.length !== segments.length, segments: next };
    },
    baseUrl,
  );
}

export function resetPrefixGroup(rawUrl, prefixIds, baseUrl) {
  const removeIds = normalizeIds(prefixIds);
  if (removeIds.size === 0) {
    return {
      changed: false,
      reason: "prefix_ids_required",
      url: String(rawUrl || ""),
    };
  }
  return mutateLatestHash(
    rawUrl,
    (segments) => {
      let changed = false;
      const next = [];
      for (const segment of segments) {
        if (segment.key !== "prefixes" && segment.key !== "noprefixes") {
          next.push(segment);
          continue;
        }
        const values = String(segment.value || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const retained = values.filter((value) => !removeIds.has(value));
        if (retained.length === values.length) {
          next.push(segment);
          continue;
        }
        changed = true;
        if (retained.length > 0) {
          next.push({ ...segment, value: retained.join(",") });
        }
      }
      return { changed, segments: next };
    },
    baseUrl,
  );
}

export function applySurpriseTags(rawUrl, selectedTagIds, baseUrl) {
  const selected = [...normalizeIds(selectedTagIds)];
  if (selected.length === 0) {
    return {
      changed: false,
      reason: "tag_ids_required",
      url: String(rawUrl || ""),
    };
  }
  const selectedSet = new Set(selected);
  const selectedValue = selected.join(",");
  return mutateLatestHash(
    rawUrl,
    (segments) => {
      const next = [];
      let tagsInserted = false;
      let changed = segments.some((segment) => segment.key === "page");
      for (const segment of segments) {
        if (segment.key === "tags") {
          if (!tagsInserted) {
            if (segment.value !== selectedValue) changed = true;
            next.push({ ...segment, value: selectedValue });
            tagsInserted = true;
          } else {
            changed = true;
          }
          continue;
        }
        if (segment.key === "notags") {
          const values = String(segment.value || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          const retained = values.filter((value) => !selectedSet.has(value));
          if (retained.length !== values.length) changed = true;
          if (retained.length > 0) {
            next.push({ ...segment, value: retained.join(",") });
          }
          continue;
        }
        next.push(segment);
      }
      if (!tagsInserted) {
        next.push({ key: "tags", value: selectedValue, raw: "" });
        changed = true;
      }
      return { changed, segments: next };
    },
    baseUrl,
  );
}
