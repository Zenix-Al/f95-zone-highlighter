"use strict";

const observedAt = Date.UTC(2026, 8, 25, 12);

const record = {
  threadId: "42000",
  thread: {
    title: "Full Edit maximum history fixture",
    currentVersion: "v0.9.9",
    threadRating: 3.9,
  },
  personal: {
    status: "playing",
    rating: 4,
    note: "",
    progressNote: "",
    lastPlayedVersion: "v0.9.8",
    pinned: false,
    addedAt: observedAt,
    startedAt: null,
    lastPlayedAt: null,
    completedAt: null,
    droppedAt: null,
    lastActivityAt: null,
  },
  updateCheck: { enabled: true },
  updateState: "changed",
};

const updateEvents = Array.from({ length: 20 }, (_, index) => ({
  id: `update:${record.threadId}:${index}`,
  type: "version",
  threadId: record.threadId,
  previousVersion: `v0.9.${19 - index}`,
  version: `v0.9.${20 - index}`,
  observedAt: observedAt - index * 86400000,
}));

const activityEvents = Array.from({ length: 20 }, (_, index) => ({
  id: `activity:${record.threadId}:${index}`,
  type: "played-version",
  threadId: record.threadId,
  version: `v0.9.${19 - index}`,
  occurredAt: observedAt - index * 86400000,
}));

module.exports = { record, updateEvents, activityEvents };
