import { normalizeTagList } from "./recordModel.js";

const SORT_TO_INDEX = Object.freeze({
  updatedAt: "recordModifiedAt",
  title: "thread.titleNormalized",
  status: "personal.status",
  rating: "personal.rating",
});

export function supportsKeysetSort(sortBy = "updatedAt") {
  return String(sortBy || "").trim() === "updatedAt";
}

export function getSortConfig(sortBy = "updatedAt", sortDir = "desc") {
  const ascending = String(sortDir || "desc").toLowerCase() === "asc";
  const selectedSort = String(sortBy || "").trim();
  const index =
    selectedSort === "updatedAt"
      ? ascending
        ? "pinnedUpdatedAsc"
        : "pinnedUpdatedDesc"
      : SORT_TO_INDEX[selectedSort] || "recordModifiedAt";
  const direction = ascending ? "next" : "prev";
  return { index, direction };
}

export function sortLibraryRecords(records, sortBy = "updatedAt", sortDir = "desc") {
  const path = SORT_TO_INDEX[String(sortBy || "").trim()] || "recordModifiedAt";
  const direction = String(sortDir || "").toLowerCase() === "asc" ? 1 : -1;
  const read = (record) =>
    path.split(".").reduce((value, key) => value?.[key], record);
  return [...records].sort((left, right) => {
    const pinDifference =
      Number(Boolean(right?.personal?.pinned)) -
      Number(Boolean(left?.personal?.pinned));
    if (pinDifference) return pinDifference;
    const leftValue = read(left);
    const rightValue = read(right);
    if (typeof leftValue === "number" || typeof rightValue === "number") {
      return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    }
    return String(leftValue || "").localeCompare(String(rightValue || "")) * direction;
  });
}

export function matchesLibraryFilters(record, filters = {}) {
  const search = String(filters.search || "")
    .trim()
    .toLowerCase();
  const status = String(filters.status || "")
    .trim()
    .toLowerCase();
  const tag = String(filters.tag || "")
    .trim()
    .toLowerCase();
  const prefix = String(filters.prefix || "")
    .trim()
    .toLowerCase();

  if (status && status !== "all" && String(record?.personal?.status || "").toLowerCase() !== status) {
    return false;
  }

  if (tag && !normalizeTagList(record?.thread?.tags).includes(tag)) {
    return false;
  }

  if (
    prefix &&
    String(record?.thread?.prefixes?.[0]?.label || "")
      .trim()
      .toLowerCase() !== prefix
  ) {
    return false;
  }

  if (!search) return true;

  const haystack = [
    record?.thread?.title,
    record?.thread?.canonicalTitle,
    ...(Array.isArray(record?.thread?.prefixes)
      ? record.thread.prefixes.map((item) => item?.label)
      : []),
    record?.thread?.currentVersion,
    record?.thread?.developer,
    record?.thread?.threadRating,
    record?.thread?.url,
  ]
    .concat(Array.isArray(record?.thread?.tags) ? record.thread.tags : [])
    .concat([record?.threadId])
    .map((part) => String(part || "").toLowerCase())
    .join(" ");

  return haystack.includes(search);
}
