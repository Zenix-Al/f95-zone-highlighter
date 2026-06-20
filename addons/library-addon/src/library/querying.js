import { normalizeTagList } from "./recordModel.js";

const SORT_TO_INDEX = Object.freeze({
  updatedAt: "updatedAt",
  title: "titleNormalized",
  status: "userStatus",
});

export function getSortConfig(sortBy = "updatedAt", sortDir = "desc") {
  const index = SORT_TO_INDEX[String(sortBy || "").trim()] || "updatedAt";
  const direction = String(sortDir || "desc").toLowerCase() === "asc" ? "next" : "prev";
  return { index, direction };
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

  if (status && status !== "all" && String(record?.userStatus || "").toLowerCase() !== status) {
    return false;
  }

  if (tag && !normalizeTagList(record?.tags).includes(tag)) {
    return false;
  }

  if (
    prefix &&
    String(record?.prefix || "")
      .trim()
      .toLowerCase() !== prefix
  ) {
    return false;
  }

  if (!search) return true;

  const haystack = [
    record?.title,
    record?.canonicalTitle,
    record?.prefix,
    ...(Array.isArray(record?.prefixes) ? record.prefixes.map((item) => item?.label) : []),
    record?.gameVersion,
    record?.developer,
    record?.threadRating,
    record?.url,
  ]
    .concat(Array.isArray(record?.tags) ? record.tags : [])
    .concat([record?.threadId])
    .map((part) => String(part || "").toLowerCase())
    .join(" ");

  return haystack.includes(search);
}
