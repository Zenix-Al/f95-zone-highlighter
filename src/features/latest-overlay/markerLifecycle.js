import { MARKER_LIMITS } from "../../services/addons/latestMarkerBroker.js";

// Provider requests never join the core overlay's initial paint promise.
export function createMarkerLifecycle({
  broker,
  subscribe,
  getTiles,
  paint,
  clear,
  budgeted = async (items, apply) => {
    items.forEach(apply);
  },
}) {
  let active = false;
  let queued = false;
  let generation = 0;
  let controller = null;
  let unsubscribe = null;
  let previousTiles = new Set();

  async function reconcile() {
    if (!active) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const current = ++generation;
    const tiles = getTiles();
    const ids = [
      ...new Set(
        tiles.map((tile) => tile.dataset.threadId).filter((id) => /^[1-9]\d{0,19}$/.test(id || "")),
      ),
    ];
    for (const tile of previousTiles) if (!tiles.includes(tile)) clear(tile);
    previousTiles = new Set(tiles);
    const providers = broker
      .list()
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    await budgeted(tiles, clear, () => active && current === generation);
    await Promise.all(
      providers.map(async (provider) => {
        for (let offset = 0; offset < ids.length && !signal.aborted; offset += MARKER_LIMITS.ids) {
          let markers;
          try {
            markers = await broker.query(
              provider.id,
              ids.slice(offset, offset + MARKER_LIMITS.ids),
              { signal },
            );
          } catch {
            markers = {};
          }
          if (!active || signal.aborted || current !== generation) return;
          await budgeted(
            tiles,
            (tile) => {
              if (tile.isConnected && markers[tile.dataset.threadId])
                paint(tile, provider, markers[tile.dataset.threadId]);
            },
            () => active && current === generation,
          );
        }
      }),
    );
  }
  function refresh() {
    if (!active || queued) return;
    controller?.abort();
    generation += 1;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (active) void reconcile();
    });
  }
  function enable() {
    if (active) return;
    active = true;
    unsubscribe = subscribe(refresh);
    refresh();
  }
  function disable() {
    active = false;
    generation += 1;
    controller?.abort();
    controller = null;
    unsubscribe?.();
    unsubscribe = null;
    for (const tile of previousTiles) clear(tile);
    previousTiles.clear();
  }
  return { enable, disable, refresh };
}
