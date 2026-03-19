import { debugLog } from "../../../core/logger";

let activePointerDrag = null;
let pointerCleanupHooksInstalled = false;
let getShadowRootRef = () => null;
let cachedShadowRoot = null;
let cachedContainers = [];
const ENABLE_NATIVE_DESKTOP_DRAG = false;

const CONTAINERS = [
  { id: "preferred-tags-list", key: "preferredTags" },
  { id: "excluded-tags-list", key: "excludedTags" },
  { id: "marked-tags-list", key: "markedTags" },
];

function getContainerListKeyById(containerId) {
  const match = CONTAINERS.find((c) => c.id === containerId);
  return match ? match.key : null;
}

function parseDragData(raw) {
  const parts = String(raw || "").split(":");
  return {
    fromList: parts[0] || null,
    fromIndex: Number(parts[1]),
  };
}

function getContainers(sr) {
  if (!sr) return [];

  const cacheInvalid =
    cachedShadowRoot !== sr ||
    cachedContainers.length !== CONTAINERS.length ||
    cachedContainers.some((container) => !container?.isConnected);

  if (cacheInvalid) {
    cachedShadowRoot = sr;
    cachedContainers = CONTAINERS.map((meta) => sr.getElementById(meta.id)).filter(Boolean);
  }

  return cachedContainers;
}

function markPotentialDropTargets(fromListKey) {
  const sr = getShadowRootRef();
  if (!sr) return;
  const containers = getContainers(sr);
  containers.forEach((container) => {
    const key = getContainerListKeyById(container.id);
    if (!key || key === fromListKey) return;
    container.classList.add("drag-target");
  });
}

function clearPotentialDropTargets() {
  const sr = getShadowRootRef();
  if (!sr) return;
  const containers = getContainers(sr);
  containers.forEach((container) => {
    container.classList.remove("drag-target");
    container.classList.remove("drag-over");
  });
}

function clearHoveredItem() {
  if (activePointerDrag?.hoveredItem) {
    activePointerDrag.hoveredItem.classList.remove("drag-over");
    activePointerDrag.hoveredItem = null;
  }
}

function cleanupActivePointerDrag() {
  if (!activePointerDrag) return;

  clearHoveredItem();
  clearPotentialDropTargets();

  try {
    activePointerDrag.ghost?.remove();
  } catch {
    // ignore
  }

  if (activePointerDrag.onMove) window.removeEventListener("pointermove", activePointerDrag.onMove);
  if (activePointerDrag.onUp) window.removeEventListener("pointerup", activePointerDrag.onUp);
  if (activePointerDrag.rafId) cancelAnimationFrame(activePointerDrag.rafId);

  try {
    activePointerDrag.item?.classList?.remove("dragging");
  } catch {
    // ignore
  }

  activePointerDrag = null;
}

function copyChipStyleToGhost(item, ghost) {
  try {
    const cs = window.getComputedStyle(item);
    ghost.style.background = cs.backgroundColor;
    ghost.style.color = cs.color;
    ghost.style.borderRadius = cs.borderRadius;
    ghost.style.fontSize = cs.fontSize;
    ghost.style.fontWeight = cs.fontWeight;
    ghost.style.height = cs.height;
    ghost.style.lineHeight = cs.lineHeight;
    ghost.style.padding = cs.padding;
    ghost.style.display = cs.display;
    ghost.style.alignItems = cs.alignItems;
    ghost.style.minWidth = cs.minWidth;
  } catch {
    // ignore
  }
}

function updatePointerDragHighlights(x, y) {
  if (!activePointerDrag) return;

  const over = activePointerDrag.sr.elementFromPoint(x, y);
  if (!over) return;

  const containers = getContainers(activePointerDrag.sr);
  containers.forEach((c) => c.classList.remove("drag-over"));

  const container = over.closest ? over.closest(".tag-list-container") : null;
  if (container) {
    const toListKey = getContainerListKeyById(container.id);
    if (toListKey !== activePointerDrag.fromListKey) container.classList.add("drag-over");
  }

  const hoveredItem = over.closest ? over.closest(".tag-list-item") : null;
  if (activePointerDrag.hoveredItem && activePointerDrag.hoveredItem !== hoveredItem) {
    activePointerDrag.hoveredItem.classList.remove("drag-over");
    activePointerDrag.hoveredItem = null;
  }
  if (hoveredItem && hoveredItem !== activePointerDrag.item) {
    hoveredItem.classList.add("drag-over");
    activePointerDrag.hoveredItem = hoveredItem;
  }
}

function handlePointerDrop({ x, y, onDropOnItem, onDropOnContainer }) {
  if (!activePointerDrag) return;

  const over = activePointerDrag.sr.elementFromPoint(x, y);
  if (!over) return;

  const itemEl = over.closest ? over.closest(".tag-list-item") : null;
  const container = over.closest ? over.closest(".tag-list-container") : null;

  if (itemEl?.dataset?.index != null) {
    const toIndex = Number(itemEl.dataset.index);
    const toListKey =
      getContainerListKeyById(container?.id) ??
      CONTAINERS.find((c) => itemEl.closest(`#${c.id}`))?.key ??
      null;

    if (!toListKey) return;
    onDropOnItem({
      fromList: activePointerDrag.fromListKey,
      fromIndex: activePointerDrag.fromIndex,
      toListKey,
      toIndex,
    });
    return;
  }

  if (container) {
    onDropOnContainer({
      fromList: activePointerDrag.fromListKey,
      fromIndex: activePointerDrag.fromIndex,
      toListKey: getContainerListKeyById(container.id),
    });
  }
}

export function ensurePointerCleanupHooks(getShadowRoot) {
  getShadowRootRef = getShadowRoot;
  if (pointerCleanupHooksInstalled) return;

  window.addEventListener("pointercancel", cleanupActivePointerDrag);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cleanupActivePointerDrag();
  });

  pointerCleanupHooksInstalled = true;
}

export function ensureContainerDropHandlers({
  container,
  listKey,
  onDropOnContainer,
  onDropOnItem,
}) {
  if (!container || container.dataset.dropInit) return;
  container.dataset.dropInit = "1";

  // Ensure cache is primed early for drag hot paths.
  getContainers(getShadowRootRef());

  if (!ENABLE_NATIVE_DESKTOP_DRAG) return;

  debugLog("tagDrag:container", `init drop handlers for list: ${listKey}`, {
    data: { containerId: container.id },
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const { fromList } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (fromList && fromList !== listKey) container.classList.add("drag-over");
  });

  container.addEventListener("dragenter", (e) => {
    e.preventDefault();
    const { fromList } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (fromList && fromList !== listKey) container.classList.add("drag-over");
  });

  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-over");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
    const { fromList, fromIndex } = parseDragData(e.dataTransfer?.getData("text/plain"));
    debugLog("tagDrag:container", `drop on container ${listKey}`, {
      data: { fromList, fromIndex, raw: e.dataTransfer?.getData("text/plain") },
    });
    if (!fromList) return;

    const itemEl = e.target?.closest?.(".tag-list-item");
    if (itemEl?.dataset?.index != null && Number.isFinite(Number(itemEl.dataset.index))) {
      onDropOnItem({
        fromList,
        fromIndex,
        toListKey: listKey,
        toIndex: Number(itemEl.dataset.index),
      });
      return;
    }

    onDropOnContainer({ fromList, fromIndex, toListKey: listKey });
  });
}

export function createTagChipItem({
  tag,
  index,
  itemClass,
  removeBtnClass,
  listKey,
  onRemove,
  onDropOnItem,
  onDropOnContainer,
  getShadowRoot,
}) {
  debugLog("tagDrag:chip", `creating chip [${listKey}] "${tag.name}" index=${index}`, {
    data: { itemClass, listKey, index },
  });

  const item = document.createElement("div");
  item.className = `tag-list-item ${itemClass} tag-chip`;
  item.dataset.index = String(index);
  item.draggable = ENABLE_NATIVE_DESKTOP_DRAG;

  const text = document.createElement("span");
  text.textContent = tag.name;

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "X";
  removeBtn.className = `tag-remove-btn ${removeBtnClass}`;
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove(index, tag);
  });

  if (ENABLE_NATIVE_DESKTOP_DRAG) {
    item.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      const payload = `${String(listKey)}:${String(index)}`;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", payload);
      item.classList.add("dragging");
      markPotentialDropTargets(listKey);
      debugLog("tagDrag:chip", `dragstart [${listKey}] "${tag.name}" index=${index}`, {
        data: { payload, draggable: item.draggable },
      });
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      clearPotentialDropTargets();
      debugLog("tagDrag:chip", `dragend [${listKey}] "${tag.name}"`);
    });
  }

  item.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.isPrimary) return;
    if (e.target?.closest?.(".tag-remove-btn")) return;

    e.preventDefault();
    item.setPointerCapture?.(e.pointerId);

    const sr = getShadowRoot();
    if (!sr) return;

    const rect = item.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const ghost = item.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.left = `${e.clientX - offsetX}px`;
    ghost.style.top = `${e.clientY - offsetY}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = 12000;
    copyChipStyleToGhost(item, ghost);
    sr.appendChild(ghost);

    activePointerDrag = {
      ghost,
      fromListKey: listKey,
      fromIndex: index,
      offsetX,
      offsetY,
      sr,
      item,
      pointerId: e.pointerId,
      hoveredItem: null,
      onMove: null,
      onUp: null,
      rafId: null,
      latestX: e.clientX,
      latestY: e.clientY,
    };

    item.classList.add("dragging");
    markPotentialDropTargets(listKey);

    const onMove = (ev) => {
      if (!activePointerDrag) return;
      activePointerDrag.ghost.style.left = `${ev.clientX - activePointerDrag.offsetX}px`;
      activePointerDrag.ghost.style.top = `${ev.clientY - activePointerDrag.offsetY}px`;
      activePointerDrag.latestX = ev.clientX;
      activePointerDrag.latestY = ev.clientY;
      if (activePointerDrag.rafId) return;
      activePointerDrag.rafId = requestAnimationFrame(() => {
        if (!activePointerDrag) return;
        activePointerDrag.rafId = null;
        updatePointerDragHighlights(activePointerDrag.latestX, activePointerDrag.latestY);
      });
    };

    const onUp = (ev) => {
      if (!activePointerDrag) return;

      handlePointerDrop({
        x: ev.clientX,
        y: ev.clientY,
        onDropOnItem,
        onDropOnContainer,
      });

      try {
        item.releasePointerCapture?.(ev.pointerId);
      } catch {
        // ignore
      }

      cleanupActivePointerDrag();
    };

    activePointerDrag.onMove = onMove;
    activePointerDrag.onUp = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  item.appendChild(text);
  item.appendChild(removeBtn);
  return item;
}
