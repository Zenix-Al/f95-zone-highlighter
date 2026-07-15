const entriesBySection = new Map();
const entriesById = new Map();
const entriesByConfigPath = new Map();
const entryIdsByOwner = new Map();

function normalizeId(value) {
  return String(value || "").trim();
}

function readonlyEntry(entry) {
  return Object.freeze({ ...entry });
}

function getEntryIdsForOwner(ownerId) {
  const id = normalizeId(ownerId);
  if (!id) return [];
  return [...(entryIdsByOwner.get(id) || [])];
}

function removeEntry(entry) {
  const sectionEntries = entriesBySection.get(entry.sectionId);
  sectionEntries?.delete(entry.id);
  if (sectionEntries?.size === 0) entriesBySection.delete(entry.sectionId);

  entriesById.delete(entry.id);
  if (entry.config) entriesByConfigPath.delete(entry.config);

  const ownerEntries = entryIdsByOwner.get(entry.ownerId);
  ownerEntries?.delete(entry.id);
  if (ownerEntries?.size === 0) entryIdsByOwner.delete(entry.ownerId);
}

function validateRegistration(sectionId, metaMap, ownerId) {
  const incomingIds = new Set();
  const incomingPaths = new Set();
  const entries = [];

  for (const [rawId, meta] of Object.entries(metaMap)) {
    const id = normalizeId(rawId);
    if (!id) throw new Error(`Settings metadata in '${sectionId}' requires a metadata ID.`);
    if (!meta || typeof meta !== "object") {
      throw new Error(`Settings metadata '${id}' must be an object.`);
    }
    if (entriesById.has(id) || incomingIds.has(id)) {
      throw new Error(`Duplicate settings metadata ID '${id}'.`);
    }

    const config = normalizeId(meta.config);
    if (config && (entriesByConfigPath.has(config) || incomingPaths.has(config))) {
      throw new Error(`Duplicate settings metadata config path '${config}'.`);
    }

    incomingIds.add(id);
    if (config) incomingPaths.add(config);
    entries.push({
      ...meta,
      id,
      sectionId,
      ownerId,
      config,
    });
  }

  return entries;
}

/**
 * Register metadata owned by a base section, feature, or add-on. Metadata IDs
 * and config paths are global so effect replay always has one authoritative
 * descriptor. The returned cleanup function makes dynamic registrations
 * reversible when their owner unloads.
 */
export function registerSettingsMetadata(sectionId, metaMap, ownerId = "base") {
  const normalizedSectionId = normalizeId(sectionId);
  const normalizedOwnerId = normalizeId(ownerId) || "base";
  if (!normalizedSectionId) throw new Error("Settings metadata requires a section ID.");
  if (!metaMap || typeof metaMap !== "object" || Array.isArray(metaMap)) {
    throw new Error(`Settings metadata for '${normalizedSectionId}' must be an object map.`);
  }

  const entries = validateRegistration(normalizedSectionId, metaMap, normalizedOwnerId);
  const sectionEntries = entriesBySection.get(normalizedSectionId) || new Map();
  const ownerEntries = entryIdsByOwner.get(normalizedOwnerId) || new Set();

  for (const entry of entries) {
    const stored = Object.freeze(entry);
    sectionEntries.set(stored.id, stored);
    entriesById.set(stored.id, stored);
    if (stored.config) entriesByConfigPath.set(stored.config, stored);
    ownerEntries.add(stored.id);
  }

  if (entries.length > 0) {
    entriesBySection.set(normalizedSectionId, sectionEntries);
    entryIdsByOwner.set(normalizedOwnerId, ownerEntries);
  }

  let released = false;
  return () => {
    if (released) return 0;
    released = true;
    return unregisterSettingsMetadata(normalizedOwnerId, entries.map((entry) => entry.id));
  };
}

/** Remove selected metadata IDs, or every metadata entry owned by an owner. */
export function unregisterSettingsMetadata(ownerId, metadataIds = null) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) return 0;
  const allowedIds = new Set(getEntryIdsForOwner(normalizedOwnerId));
  const ids = metadataIds == null
    ? [...allowedIds]
    : (Array.isArray(metadataIds) ? metadataIds : [metadataIds])
      .map(normalizeId)
      .filter((id) => allowedIds.has(id));

  for (const id of ids) {
    const entry = entriesById.get(id);
    if (entry?.ownerId === normalizedOwnerId) removeEntry(entry);
  }
  return ids.length;
}

export function getSettingsMetadataBySection(sectionId) {
  const entries = entriesBySection.get(normalizeId(sectionId));
  return Object.freeze(Object.fromEntries(
    [...(entries?.entries() || [])].map(([id, entry]) => [id, readonlyEntry(entry)]),
  ));
}

export function getSettingsMetadataById(metadataId) {
  const entry = entriesById.get(normalizeId(metadataId));
  return entry ? readonlyEntry(entry) : null;
}

export function getMetadataByConfigPath(path) {
  let candidate = normalizeId(path);
  while (candidate) {
    const entry = entriesByConfigPath.get(candidate);
    if (entry) return readonlyEntry(entry);
    const bracketIndex = candidate.lastIndexOf("[");
    const dotIndex = candidate.lastIndexOf(".");
    if (bracketIndex > dotIndex) {
      candidate = candidate.slice(0, bracketIndex);
    } else if (dotIndex >= 0) {
      candidate = candidate.slice(0, dotIndex);
    } else {
      break;
    }
  }
  return null;
}

export function getSettingsMetadataByOwner(ownerId) {
  return Object.freeze(getEntryIdsForOwner(ownerId)
    .map((id) => entriesById.get(id))
    .filter(Boolean)
    .map(readonlyEntry));
}

export function getSettingsMetadataSnapshot() {
  return Object.freeze(Object.fromEntries(
    [...entriesBySection.keys()].map((sectionId) => [
      sectionId,
      getSettingsMetadataBySection(sectionId),
    ]),
  ));
}

export function resetSettingsMetadataForTests() {
  entriesBySection.clear();
  entriesById.clear();
  entriesByConfigPath.clear();
  entryIdsByOwner.clear();
}
