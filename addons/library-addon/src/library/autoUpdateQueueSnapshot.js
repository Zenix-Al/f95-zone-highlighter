import { normalizeRecord } from "./recordModel.js";

const DEFAULT_PAGE_SIZE = 200;

function bounded(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function defaultCycleId(timestamp) {
  return `library-update-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAutoUpdateQueueSnapshotBuilder({
  repository,
  queryRecordsPage,
  now = Date.now,
  createCycleId = defaultCycleId,
}) {
  async function cleanup(cycleId, reason, details = {}) {
    const discarded = await repository.discardCycle(cycleId);
    return {
      ok: false,
      reason,
      ...details,
      cleanupOk: Boolean(discarded?.ok),
      cleanupReason: discarded?.ok ? "" : discarded?.reason || "cleanup_failed",
    };
  }

  async function build({
    checksPerDay = 100,
    scheduledFor = 0,
    pageSize = DEFAULT_PAGE_SIZE,
    signal = null,
  } = {}) {
    const active = await repository.getCycle();
    if (active && !["preparing", "completed"].includes(active.status)) {
      return { ok: false, reason: "active_cycle_exists", cycle: active };
    }
    if (active) {
      const discarded = await repository.discardCycle(active.cycleId);
      if (!discarded?.ok) return { ok: false, reason: discarded?.reason || "cleanup_failed" };
    }

    const createdAt = now();
    const cycleId = String(createCycleId(createdAt) || "").trim().slice(0, 128);
    if (!cycleId) return { ok: false, reason: "cycle_identity_required" };
    const cycle = {
      id: "active",
      cycleId,
      status: "preparing",
      scheduledFor: Math.max(0, Number(scheduledFor) || 0),
      createdAt,
      updatedAt: createdAt,
      checksPerDay: bounded(checksPerDay, 100, 1, 100_000),
    };
    const begun = await repository.beginCyclePreparation(cycle);
    if (!begun?.ok) return begun;

    const modifiedAtCutoff = createdAt;
    const limit = bounded(pageSize, DEFAULT_PAGE_SIZE, 1, 500);
    let cursor = null;
    let scanned = 0;
    let queued = 0;
    let pages = 0;

    while (true) {
      if (signal?.aborted) {
        return cleanup(cycleId, "cancelled", { scanned, queued, pages });
      }
      const page = await queryRecordsPage({
        cursor,
        limit,
        modifiedAtCutoff,
      });
      if (!page?.ok) {
        return cleanup(cycleId, page?.reason || "snapshot_query_failed", {
          scanned,
          queued,
          pages,
        });
      }
      pages += 1;
      const items = Array.isArray(page.items) ? page.items : [];
      const eligible = [];
      for (const entry of items) {
        const record = normalizeRecord(entry?.value || entry, { now: createdAt });
        scanned += 1;
        if (record.updateCheck?.enabled !== false) {
          eligible.push({ threadId: record.threadId });
        }
      }
      if (signal?.aborted) {
        return cleanup(cycleId, "cancelled", { scanned, queued, pages });
      }
      if (eligible.length > 0) {
        const written = await repository.appendPreparedItems(
          cycleId,
          eligible,
          queued + 1,
          limit,
        );
        if (!written?.ok) {
          return cleanup(cycleId, written?.reason || "snapshot_write_failed", {
            scanned,
            queued,
            pages,
          });
        }
        queued += eligible.length;
      }
      if (!page.hasMore || items.length === 0) break;
      cursor = page.nextCursor || items.at(-1)?.cursor || null;
      if (!cursor) {
        return cleanup(cycleId, "snapshot_cursor_missing", { scanned, queued, pages });
      }
    }

    if (signal?.aborted) {
      return cleanup(cycleId, "cancelled", { scanned, queued, pages });
    }
    const published = await repository.finalizeCyclePreparation(cycle, queued);
    if (!published?.ok) {
      return cleanup(cycleId, published?.reason || "snapshot_publish_failed", {
        scanned,
        queued,
        pages,
      });
    }
    return {
      ok: true,
      cycle: published.value,
      scanned,
      queued,
      pages,
      modifiedAtCutoff,
    };
  }

  return { build };
}
