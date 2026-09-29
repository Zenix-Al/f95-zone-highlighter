import { runFrameBudgeted } from "../../core/frameBudget.js";
import { latestMarkerBroker, subscribeLatestMarkerProviders } from "../../services/addons/latestMarkerRuntime.js";
import { createMarkerLifecycle } from "./markerLifecycle.js";

export function clearLatestMarkers(tile) { tile.querySelector(".f95ue-latest-markers")?.remove(); }
export function paintLatestMarker(tile, provider, marker) {
  const thumb = tile.querySelector(".resource-tile_thumb-wrap");
  if (!thumb) return;
  let slot = thumb.querySelector(".f95ue-latest-markers");
  if (!slot) {
    slot = document.createElement("div");
    slot.className = "f95ue-latest-markers";
    thumb.append(slot);
  }
  let chip = [...slot.children].find((node) => node.dataset.providerId === provider.id);
  if (!chip) {
    chip = document.createElement("span");
    chip.dataset.providerId = provider.id;
    slot.append(chip);
  }
  chip.className = "f95ue-latest-marker";
  chip.dataset.tone = marker.tone;
  chip.dataset.priority = String(provider.priority);
  chip.textContent = marker.label;
  chip.title = marker.description;
  chip.setAttribute("aria-label", marker.description || marker.label);
  slot.querySelector(".f95ue-latest-marker-more")?.remove();
  const chips = [...slot.children].sort((a, b) => Number(a.dataset.priority) - Number(b.dataset.priority) || a.dataset.providerId.localeCompare(b.dataset.providerId));
  chips.forEach((child, index) => { child.hidden = index > 0; slot.append(child); });
  if (chips.length > 1) {
    const more = document.createElement("span");
    more.className = "f95ue-latest-marker-more";
    more.textContent = `+${chips.length - 1}`;
    more.setAttribute("aria-label", chips.slice(1).map((child) => child.getAttribute("aria-label")).join("; "));
    slot.append(more);
  }
}

export const latestMarkers = createMarkerLifecycle({
  broker: latestMarkerBroker,
  subscribe: subscribeLatestMarkerProviders,
  getTiles: () => [...document.querySelectorAll(".resource-tile")].filter((tile) => tile.getClientRects().length && !tile.hidden),
  paint: paintLatestMarker, clear: clearLatestMarkers,
  budgeted: (items, apply, shouldContinue) => runFrameBudgeted(items, apply, { budgetMs: 4, minChunk: 1, shouldContinue, startOnNextFrame: true }),
});

export function hasMarkerTileChanges(mutations) {
  return mutations.some((mutation) => [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])].some((node) => node.nodeType === 1 && (node.matches?.(".resource-tile") || node.querySelector?.(".resource-tile"))));
}
