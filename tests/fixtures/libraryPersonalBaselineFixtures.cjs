"use strict";

const FIXED_TIME = 1704067200000;

function createRecord(index = 1) {
  const id = String(index);
  return {
    threadId: id,
    url: `https://f95zone.to/threads/baseline-${id}.${id}/`,
    title: `Baseline Game ${id} [v${index % 100}.${index % 10}] [Developer ${index % 25}]`,
    canonicalTitle: `Baseline Game ${id}`,
    titleNormalized: `baseline game ${id}`,
    prefix: index % 2 ? "Ren'Py" : "Unity",
    prefixes: [{ label: index % 2 ? "Ren'Py" : "Unity", color: "#123456" }],
    gameVersion: `v${index % 100}.${index % 10}`,
    developer: `Developer ${index % 25}`,
    threadRating: Number((3 + (index % 20) / 10).toFixed(1)),
    tags: [`tag-${index % 17}`, `tag-${index % 31}`],
    userStatus: ["saved", "playing", "completed", "dropped"][index % 4],
    note: `Deterministic personal note ${id}`,
    userScore: index % 11,
    pinned: index % 7 === 0,
    schemaVersion: 3,
    sourcePage: "thread",
    createdAt: FIXED_TIME + index,
    updatedAt: FIXED_TIME + 100000 + index,
  };
}

function createFixtures() {
  return {
    empty: {},
    legacy: {
      threadId: "41",
      title: "Legacy Game [v0.7] [Legacy Dev]",
      prefix: "Ren'Py",
      tags: ["legacy"],
      userStatus: "playing",
      note: "legacy note",
      userScore: 8,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME + 1,
    },
    version3: createRecord(42),
    malformed: {
      threadId: 43,
      title: null,
      prefixes: [null, "", { color: "red" }, { label: "Valid", color: "#fff" }],
      tags: [" Valid ", null, 7],
      threadRating: "not-a-rating",
      userScore: { invalid: true },
      createdAt: "invalid",
      updatedAt: 0,
      schemaVersion: "bad",
    },
  };
}

function createRecords(count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) =>
    createRecord(index + 1),
  );
}

module.exports = { FIXED_TIME, createFixtures, createRecord, createRecords };
